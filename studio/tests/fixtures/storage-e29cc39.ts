// Хранилище проектов Motivelium: согласованная фиксация состояния, протокол v2.
//
// Ответ на F1 повторного ревью: пакет именуется транзакцией
// (states/<txId>.rev-<N>.json) и не может быть перезаписан другим письмом;
// подтверждение транзакции — идентичность pointer.transactionId === txId,
// а не сравнение номеров ревизий. Перед каждой мутацией resolvePending
// определяет судьбу незавершённых попыток (завершить или пометить superseded),
// поэтому две конкурирующие попытки на одном состоянии невозможны.
//
// Раскладка (.local/projects/<id>/):
//   states/<txId>.rev-<N>.json — иммутабемый пакет {project, history, meta}
//   transactions/<txId>.json   — квитанция {requestHash, request, response, stateFile, packageSha256, revision, status}
//   pointer.json               — {revision, transactionId, stateFile, sha256}; единственная точка фиксации
//   journal.jsonl              — журнал (best-effort)
//   project.json/history.json  — зеркало для совместимости (best-effort, не источник истины)
//   exports/job-*/             — выдачи кадров с неизменяемым manifest

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateProject, ValidationError, type Project } from '../../../studio/domain/schema.ts';
import type { History } from '../../../studio/domain/history.ts';
import { emptyHistory, pushCommit, undo as undoHistory, redo as redoHistory, canUndo, canRedo } from '../../../studio/domain/history.ts';
import { buildFixture } from '../../../studio/domain/fixture.ts';
import { buildDemo } from '../../../studio/domain/demo.ts';
import { newId } from '../../../studio/domain/ids.ts';
import { applyTransaction, RevisionConflictError } from '../../../studio/domain/transaction.ts';

export class StoreError extends Error {
  status: number;
  details?: string[];
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, details?: string[], extra?: Record<string, unknown>) {
    super(message);
    this.name = 'StoreError';
    this.status = status;
    this.details = details;
    this.extra = extra;
  }
}

type ProjectState = { project: Project; history: History };
type StatePackage = { project: Project; history: History; meta: { kind: 'init' | 'commit' | 'undo' | 'redo' | 'migrate'; revision: number; transactionId?: string; description?: string; at: string } };
type Pointer = { revision: number; transactionId: string; stateFile: string; sha256: string };
type Receipt = {
  transactionId: string;
  requestHash: string;
  request: unknown;
  response: Record<string, unknown>;
  stateFile: string;
  packageSha256: string;
  revision: number;
  status: 'prepared' | 'confirmed' | 'superseded';
};

export type HistoryRequest = { transactionId: string; expectedRevision: number };

export type CommitOutcome =
  | { duplicate: false; response: { applied: true; revision: number; project: Project } }
  | { duplicate: true; response: { applied: true; revision: number; project: Project; duplicate: true } };

export type HistoryOutcome =
  | { duplicate: false; response: { project: Project; canUndo: boolean; canRedo: boolean } }
  | { duplicate: true; response: { project: Project; canUndo: boolean; canRedo: boolean; duplicate: true } };

const HISTORY_CAP = 50;
const STATES_KEEP = 8;
const TX_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,80}$/;

/** Точки внедрения искусственных отказов в тестах (и только там). */
export type FailureInjector = (phase: string, ctx: Record<string, unknown>) => Error | undefined;

export function createStore(rootDir: string, opts: { injectFailure?: FailureInjector; demoAssetSource?: string } = {}) {
  const inject = opts.injectFailure ?? (() => undefined);
  const demoAssetSource = opts.demoAssetSource ?? path.join(rootDir, 'www', 'projects', 'iikona', 'assets', 'monitoring-journal-historical.png');
  const projectsRoot = path.join(rootDir, '.local', 'projects');
  fs.mkdirSync(projectsRoot, { recursive: true });
  const queues = new Map<string, Promise<unknown>>();
  const caches = new Map<string, ProjectState>();
  /** Слушатель фактического изменения подтверждённой ревизии (SSE подключает API). */
  let onConfirmedChange: ((projectId: string, revision: number) => void) | null = null;

  const dirOf = (id: string) => path.join(projectsRoot, id);
  const statesDir = (id: string) => path.join(dirOf(id), 'states');
  const txDir = (id: string) => path.join(dirOf(id), 'transactions');
  const pointerFile = (id: string) => path.join(dirOf(id), 'pointer.json');
  const journalFile = (id: string) => path.join(dirOf(id), 'journal.jsonl');
  const packageRel = (transactionId: string, revision: number) => `states/${transactionId}.rev-${String(revision)}.json`;

  let tmpCounter = 0;
  async function atomicWrite(file: string, value: unknown): Promise<void> {
    const tmp = `${file}.${process.pid}-${Date.now()}-${tmpCounter++}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fsp.rename(tmp, file);
  }

  function maybeFail(phase: string, ctx: Record<string, unknown>): void {
    const err = inject(phase, ctx);
    if (err) throw new StoreError(503, `фиксация не завершена (${phase}): ${err.message}. Состояние не подтверждено — повтор запроса безопасен.`);
  }

  function digestOf(value: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  // ---------- чтение подтверждённого состояния ----------

  /** Указатель: 'ok' | 'absent' (легаси/нет) | 'corrupt' (мигрировать молча нельзя). */
  async function readPointerStatus(id: string): Promise<{ kind: 'ok'; pointer: Pointer } | { kind: 'absent' } | { kind: 'corrupt' }> {
    let raw: string;
    try {
      raw = await fsp.readFile(pointerFile(id), 'utf8');
    } catch {
      return { kind: 'absent' };
    }
    try {
      const p = JSON.parse(raw) as Pointer;
      if (typeof p.revision === 'number' && typeof p.transactionId === 'string' && typeof p.stateFile === 'string' && typeof p.sha256 === 'string') {
        return { kind: 'ok', pointer: p };
      }
      return { kind: 'corrupt' };
    } catch {
      return { kind: 'corrupt' };
    }
  }

  /** Пакет с проверкой целостности: digest против ожидаемого и принадлежность проекту (F4). */
  async function readVerifiedPackage(id: string, stateFile: string, expectedSha: string): Promise<StatePackage> {
    let pkg: StatePackage;
    try {
      pkg = JSON.parse(await fsp.readFile(path.join(dirOf(id), stateFile), 'utf8')) as StatePackage;
    } catch {
      throw new StoreError(500, `Подтверждённый пакет состояния проекта "${id}" не читается (${stateFile})`);
    }
    const actual = digestOf(pkg);
    if (actual !== expectedSha) {
      throw new StoreError(500, `Повреждён пакет состояния проекта "${id}": digest не совпадает с указателем (${stateFile})`);
    }
    if (pkg.project?.id !== id) {
      throw new StoreError(500, `Пакет состояния ${stateFile} не принадлежит проекту "${id}"`);
    }
    return pkg;
  }

  async function migrateLegacy(id: string): Promise<Pointer | null> {
    let project: unknown;
    try {
      project = JSON.parse(await fsp.readFile(path.join(dirOf(id), 'project.json'), 'utf8'));
    } catch {
      return null;
    }
    const valid = validateProject(project);
    let history: History = emptyHistory();
    try {
      const h = JSON.parse(await fsp.readFile(path.join(dirOf(id), 'history.json'), 'utf8')) as History;
      if (Array.isArray(h?.past) && Array.isArray(h?.future)) history = h;
    } catch { /* истории может не быть */ }
    const txId = 'legacy-migrate-' + newId('id');
    const pkg: StatePackage = { project: valid, history, meta: { kind: 'migrate', revision: valid.revision, transactionId: txId, description: 'миграция старой раскладки', at: new Date().toISOString() } };
    await fsp.mkdir(statesDir(id), { recursive: true });
    const rel = packageRel(txId, valid.revision);
    maybeFail('state', { phase: 'migrate', id, revision: valid.revision });
    await atomicWrite(path.join(dirOf(id), rel), pkg);
    const pointer: Pointer = { revision: valid.revision, transactionId: txId, stateFile: rel, sha256: digestOf(pkg) };
    maybeFail('pointer', { phase: 'migrate', id, revision: valid.revision });
    await atomicWrite(pointerFile(id), pointer);
    caches.set(id, { project: valid, history });
    return pointer;
  }

  /** Загрузка подтверждённого состояния. Повреждение указателя/пакета — явная ошибка. */
  async function load(id: string): Promise<ProjectState> {
    const cached = caches.get(id);
    if (cached) return cached;
    const status = await readPointerStatus(id);
    let pointer: Pointer | null = null;
    if (status.kind === 'ok') pointer = status.pointer;
    else if (status.kind === 'corrupt') throw new StoreError(500, `Повреждён указатель подтверждённой ревизии проекта "${id}"; миграция на зеркало не выполняется`);
    else pointer = await migrateLegacy(id);
    if (!pointer) throw new StoreError(404, `Проект "${id}" не найден`);
    const pkg = await readVerifiedPackage(id, pointer.stateFile, pointer.sha256);
    if (pkg.project.revision !== pointer.revision) {
      throw new StoreError(500, `Указатель и пакет проекта "${id}" расходятся (rev ${String(pointer.revision)} против ${String(pkg.project.revision)})`);
    }
    const state: ProjectState = {
      project: validateProject(pkg.project),
      history: Array.isArray(pkg.history?.past) && Array.isArray(pkg.history?.future) ? pkg.history : emptyHistory(),
    };
    caches.set(id, state);
    return state;
  }

  // ---------- публикация (init/commit/undo/redo) ----------

  async function publish(
    id: string,
    pkg: StatePackage,
    receipt: { transactionId: string; request: unknown; response: Record<string, unknown> },
  ): Promise<ProjectState> {
    const rel = packageRel(receipt.transactionId, pkg.project.revision);
    const full: Receipt = {
      transactionId: receipt.transactionId,
      requestHash: digestOf(receipt.request),
      request: receipt.request,
      response: structuredClone(receipt.response),
      stateFile: rel,
      packageSha256: digestOf(pkg),
      revision: pkg.project.revision,
      status: 'prepared',
    };
    const pointer: Pointer = { revision: pkg.project.revision, transactionId: receipt.transactionId, stateFile: rel, sha256: full.packageSha256 };
    try {
      maybeFail('state', { id, revision: pkg.project.revision, transactionId: receipt.transactionId });
      await fsp.mkdir(statesDir(id), { recursive: true });
      await fsp.mkdir(txDir(id), { recursive: true });
      // Пакет иммутабелен и именован транзакцией: чужая попытка его не перезапишет.
      await atomicWrite(path.join(dirOf(id), rel), pkg);

      maybeFail('receipt', { id, revision: pkg.project.revision, transactionId: receipt.transactionId });
      await atomicWrite(path.join(txDir(id), `${receipt.transactionId}.json`), full);

      maybeFail('pointer', { id, revision: pkg.project.revision, transactionId: receipt.transactionId });
      await atomicWrite(pointerFile(id), pointer);
    } catch (e) {
      if (e instanceof StoreError) throw e;
      // Реальный сбой ввода-вывода до границы фиксации: состояние не подтверждено.
      throw new StoreError(503, `фиксация не завершена (ввод-вывод): ${(e as Error).message}. Состояние не подтверждено — повтор запроса безопасен.`);
    }
    // ————— ГРАНИЦА ФИКСАЦИИ: всё ниже не влияет на подтверждённость —————

    const state: ProjectState = { project: pkg.project, history: pkg.history };
    caches.set(id, state);
    if (onConfirmedChange) onConfirmedChange(id, pkg.project.revision);

    // Квитанция «confirmed» — после границы; истина всегда в указателе.
    full.status = 'confirmed';
    await atomicWrite(path.join(txDir(id), `${receipt.transactionId}.json`), full).catch(() => {});

    try {
      maybeFail('journal', { id, revision: pkg.project.revision });
      await fsp.appendFile(journalFile(id), JSON.stringify({ at: new Date().toISOString(), kind: pkg.meta.kind, revision: pkg.project.revision, transactionId: pkg.meta.transactionId, description: pkg.meta.description }) + '\n', 'utf8');
    } catch { /* журнал — best-effort */ }
    try {
      maybeFail('mirror', { id, revision: pkg.project.revision });
      await atomicWrite(path.join(dirOf(id), 'project.json'), pkg.project);
      await atomicWrite(path.join(dirOf(id), 'history.json'), pkg.history);
    } catch { /* зеркало — best-effort */ }
    try {
      await pruneStates(id, pointer.revision);
    } catch { /* чистка — best-effort */ }
    return state;
  }

  async function pruneStates(id: string, keepRevision: number): Promise<void> {
    const names = await fsp.readdir(statesDir(id));
    const parsed = names
      .map(n => /^(.+)\.rev-(\d+)\.json$/.exec(n))
      .filter((m): m is RegExpExecArray => !!m)
      .map(m => ({ name: m[0] as string, rev: Number(m[2]) }))
      .sort((a, b) => b.rev - a.rev);
    for (const p of parsed.slice(STATES_KEEP)) {
      if (p.rev === keepRevision) continue;
      await fsp.unlink(path.join(statesDir(id), p.name)).catch(() => {});
    }
  }

  async function findReceipt(id: string, transactionId: string): Promise<Receipt | null> {
    try {
      return JSON.parse(await fsp.readFile(path.join(txDir(id), `${transactionId}.json`), 'utf8')) as Receipt;
    } catch {
      return null;
    }
  }

  async function markReceipt(id: string, receipt: Receipt, status: Receipt['status']): Promise<void> {
    receipt.status = status;
    await atomicWrite(path.join(txDir(id), `${receipt.transactionId}.json`), receipt).catch(() => {});
  }

  async function appendJournal(id: string, entry: Record<string, unknown>): Promise<void> {
    await fsp.appendFile(journalFile(id), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf8').catch(() => {});
  }

  /**
   * Судьба pending до новой мутации (F1.3): квитанции с revision выше указателя
   * либо завершаются (пакет цел → указатель переводится, событие о смене
   * подтверждённой ревизии), либо помечаются superseded (пакет потерян).
   * Возвращает true, если подтверждённая ревизия изменилась.
   */
  async function resolvePending(id: string): Promise<boolean> {
    const status = await readPointerStatus(id);
    if (status.kind !== 'ok') return false;
    const pointer = status.pointer;
    let names: string[] = [];
    try {
      names = await fsp.readdir(txDir(id));
    } catch {
      return false;
    }
    const receipts: Receipt[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const receipt = await findReceipt(id, name.slice(0, -5));
      if (receipt) receipts.push(receipt);
    }
    const pendings = receipts.filter(r => r.status === 'prepared' && r.revision > pointer.revision).sort((a, b) => a.revision - b.revision);
    // Косметика: закрыть квитанции, чья судьба уже решена указателем.
    for (const r of receipts) {
      if (r.status !== 'prepared') continue;
      if (pointer.transactionId === r.transactionId) await markReceipt(id, r, 'confirmed');
      else if (r.revision < pointer.revision) await markReceipt(id, r, 'superseded');
    }
    let changed = false;
    let currentRevision = pointer.revision;
    for (const receipt of pendings) {
      if (receipt.revision <= currentRevision) continue;
      let pkg: StatePackage | null = null;
      try {
        pkg = await readVerifiedPackage(id, receipt.stateFile, receipt.packageSha256);
      } catch {
        pkg = null;
      }
      if (pkg && pkg.project.revision === receipt.revision && pkg.project.id === id) {
        const newPointer: Pointer = { revision: receipt.revision, transactionId: receipt.transactionId, stateFile: receipt.stateFile, sha256: receipt.packageSha256 };
        await atomicWrite(pointerFile(id), newPointer);
        caches.set(id, { project: pkg.project, history: pkg.history });
        await markReceipt(id, receipt, 'confirmed');
        await appendJournal(id, { kind: 'recovered', revision: receipt.revision, transactionId: receipt.transactionId });
        if (onConfirmedChange) onConfirmedChange(id, receipt.revision);
        changed = true;
        currentRevision = receipt.revision;
      } else {
        await markReceipt(id, receipt, 'superseded');
        await appendJournal(id, { kind: 'abandoned', revision: receipt.revision, transactionId: receipt.transactionId });
      }
    }
    return changed;
  }

  /**
   * Повтор по transactionId (F1.2/F1.4/F3):
   * 'confirmed' — правка подтверждена (статус квитанции или идентичность
   *   указателя): идемпотентный дубль сохранённого ответа, без события;
   * 'recovered' — первое завершение незавершённой фиксации: одно событие;
   * 'superseded' — попытка не была подтверждена и уже не может: честный 409;
   * 'conflict' — txId занят другим запросом; null — новая транзакция.
   */
  async function replayOutcome(id: string, transactionId: string, request: unknown): Promise<'confirmed' | 'recovered' | 'superseded' | 'conflict' | null> {
    const prior = await findReceipt(id, transactionId);
    if (!prior) return null;
    if (prior.requestHash !== digestOf(request)) return 'conflict';
    const status = await readPointerStatus(id);
    const pointerTx = status.kind === 'ok' ? status.pointer.transactionId : '';
    if (prior.status === 'confirmed' || pointerTx === transactionId) {
      // Окно сбоя: указатель уже на этой транзакции, а квитанция ещё prepared — добиваем статус.
      if (prior.status !== 'confirmed' && status.kind === 'ok') await markReceipt(id, prior, 'confirmed').catch(() => {});
      return 'confirmed';
    }
    // Подтверждения не было. Указатель отстаёт и пакет цел → завершаем фиксацию сейчас.
    if (status.kind === 'ok' && status.pointer.revision < prior.revision) {
      let pkg: StatePackage | null = null;
      try {
        pkg = await readVerifiedPackage(id, prior.stateFile, prior.packageSha256);
      } catch {
        pkg = null;
      }
      if (pkg && pkg.project.revision === prior.revision && pkg.project.id === id) {
        const newPointer: Pointer = { revision: prior.revision, transactionId: prior.transactionId, stateFile: prior.stateFile, sha256: prior.packageSha256 };
        await atomicWrite(pointerFile(id), newPointer);
        caches.set(id, { project: pkg.project, history: pkg.history });
        await markReceipt(id, prior, 'confirmed');
        await appendJournal(id, { kind: 'recovered', revision: prior.revision, transactionId: prior.transactionId });
        if (onConfirmedChange) onConfirmedChange(id, prior.revision);
        return 'recovered';
      }
    }
    return 'superseded';
  }

  function serializeQueue<T>(id: string, task: () => Promise<T>): Promise<T> {
    const prev = queues.get(id) ?? Promise.resolve();
    const next = prev.then(task, task);
    queues.set(id, next.catch(() => {}));
    return next;
  }

  function requireHistoryRequest(body: unknown): HistoryRequest {
    const b = body as { transactionId?: unknown; expectedRevision?: unknown } | null;
    if (!b || typeof b !== 'object') throw new StoreError(400, 'undo/redo: нужно тело {transactionId, expectedRevision}');
    if (typeof b.transactionId !== 'string' || !TX_ID.test(b.transactionId)) throw new StoreError(400, 'undo/redo: некорректный transactionId');
    if (typeof b.expectedRevision !== 'number' || !Number.isInteger(b.expectedRevision)) throw new StoreError(400, 'undo/redo: expectedRevision обязателен');
    return { transactionId: b.transactionId, expectedRevision: b.expectedRevision };
  }

  function toStoreError(e: unknown): StoreError {
    if (e instanceof StoreError) return e;
    if (e instanceof RevisionConflictError) return new StoreError(409, e.message, undefined, { currentRevision: e.currentRevision });
    if (e instanceof ValidationError) return new StoreError(400, e.message, e.details);
    if (e instanceof Error && e.name === 'OpError') return new StoreError(400, e.message);
    return new StoreError(400, (e as Error).message);
  }

  // ---------- проекты ----------

  function emptyProject(title: string, durationFrames: number): Project {
    return {
      schemaVersion: 2,
      id: newId('project'),
      revision: 1,
      title,
      size: { width: 1920, height: 1080 },
      fps: { num: 30, den: 1 },
      durationFrames,
      seed: crypto.randomInt(0, 1_000_000_000),
      assets: [],
      sequences: [{ id: 'seq-main', name: 'Главная', fromFrame: 0, toFrame: durationFrames }],
      nodes: [],
      effects: [],
      cameraTracks: [{ id: 'cam-main', name: 'Основная камера', keys: [{ frame: 0, cx: 960, cy: 540, zoom: 1, rotation: 0 }] }],
      audioTracks: [],
      cues: [],
    };
  }

  function pngSize(buf: Buffer): { width: number; height: number } {
    if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new StoreError(400, 'Файл не является PNG');
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  async function readDemoAsset(): Promise<Buffer> {
    try {
      return await fsp.readFile(demoAssetSource);
    } catch {
      throw new StoreError(500, `Источник демо-ассета не найден: ${demoAssetSource}`);
    }
  }

  // ---------- публичный интерфейс ----------

  return {
    root: projectsRoot,

    /** SSE-слушатель фактического изменения подтверждённой ревизии (ровно одно событие на изменение). */
    setOnConfirmedChange(fn: ((projectId: string, revision: number) => void) | null): void {
      onConfirmedChange = fn;
    },

    async list(): Promise<Array<{ id: string; title: string; revision: number; updatedAt: string | null }>> {
      const out: Array<{ id: string; title: string; revision: number; updatedAt: string | null }> = [];
      const names = await fsp.readdir(projectsRoot).catch(() => [] as string[]);
      for (const name of names) {
        // Легаси-каталог виден из первого списка (F2): явная миграция через очередь проекта.
        const status = await readPointerStatus(name);
        if (status.kind === 'absent') {
          if (!fs.existsSync(path.join(dirOf(name), 'project.json'))) continue;
          await serializeQueue(name, async () => {
            const again = await readPointerStatus(name);
            if (again.kind === 'absent') await migrateLegacy(name);
          }).catch(e => console.warn(`list: миграция "${name}" не выполнена:`, (e as Error).message));
        } else if (status.kind === 'corrupt') {
          console.warn(`list: указатель проекта "${name}" повреждён — пропущен без миграции`);
          continue;
        }
        try {
          const fresh = await readPointerStatus(name);
          if (fresh.kind !== 'ok') continue;
          const pkg = await readVerifiedPackage(name, fresh.pointer.stateFile, fresh.pointer.sha256);
          out.push({ id: pkg.project.id, title: pkg.project.title, revision: pkg.project.revision, updatedAt: null });
        } catch (e) {
          console.warn(`list: проект "${name}" пропущен:`, (e as Error).message);
        }
      }
      return out;
    },

    /** Создание всегда даёт НОВЫЙ проект с уникальным id (перезаписи нет). */
    async create(options: { fixture?: boolean; preset?: string; title?: string; durationFrames?: number } = {}): Promise<{ project: Project }> {
      let project: Project;
      let demoAsset: Buffer | null = null;
      if (options.preset === 'm2-demo') {
        demoAsset = await readDemoAsset();
        const size = pngSize(demoAsset);
        project = buildDemo({ sha256: crypto.createHash('sha256').update(demoAsset).digest('hex'), bytes: demoAsset.length, width: size.width, height: size.height });
      } else if (options.fixture) {
        project = buildFixture();
      } else {
        const duration = Number.isInteger(options.durationFrames) && (options.durationFrames as number) > 0 ? (options.durationFrames as number) : 300;
        const title = typeof options.title === 'string' && options.title.trim() ? options.title.trim().slice(0, 300) : 'Новый проект';
        project = emptyProject(title, duration);
      }
      project = { ...project, id: newId(project.id), revision: 1 };
      if (typeof options.title === 'string' && options.title.trim()) project.title = options.title.trim().slice(0, 300);
      validateProject(project);
      const id = project.id;
      if (fs.existsSync(dirOf(id))) throw new StoreError(500, `Коллизия id проекта "${id}"`);
      if (demoAsset) {
        const assetsDir = path.join(dirOf(id), 'assets');
        await fsp.mkdir(assetsDir, { recursive: true });
        await fsp.writeFile(path.join(assetsDir, 'monitor-frame.png'), demoAsset);
      }
      const response = { applied: true as const, revision: project.revision, project: structuredClone(project) };
      await publish(id, { project, history: emptyHistory(), meta: { kind: 'init', revision: project.revision, description: 'создан проект', at: new Date().toISOString() } },
        { transactionId: `init-${crypto.randomUUID()}`, request: { op: 'init', projectId: id }, response: response as unknown as Record<string, unknown> });
      return { project: structuredClone(project) };
    },

    async get(id: string): Promise<{ project: Project; canUndo: boolean; canRedo: boolean }> {
      const state = await load(id);
      return { project: structuredClone(state.project), canUndo: canUndo(state.history), canRedo: canRedo(state.history) };
    },

    /** Коммит: успех ответа ⇔ именно эта правка подтверждена; повтор идемпотентен. */
    async commit(id: string, tx: unknown): Promise<CommitOutcome> {
      return serializeQueue(id, async () => {
        const txId = (tx as { transactionId?: string })?.transactionId ?? '';
        await resolvePending(id);
        const replay = await replayOutcome(id, txId, tx);
        if (replay === 'conflict') throw new StoreError(409, `transactionId "${txId}" уже использован другим запросом`);
        if (replay === 'superseded') {
          const cur = await load(id);
          throw new StoreError(409, 'Транзакция не была подтверждена: состояние ушло вперёд.', undefined, { currentRevision: cur.project.revision });
        }
        if (replay === 'confirmed' || replay === 'recovered') {
          const prior = (await findReceipt(id, txId))!;
          return { duplicate: true, response: { ...(prior.response as { applied: true; revision: number; project: Project }), duplicate: true } };
        }
        const state = await load(id);
        try {
          const result = applyTransaction(state.project, tx);
          const t = tx as { description?: string; source?: 'manual' | 'agent'; transactionId: string };
          const nextHistory = pushCommit(state.history, state.project, {
            description: t.description ?? 'правка',
            source: t.source === 'agent' ? 'agent' : 'manual',
            at: new Date().toISOString(),
            transactionId: t.transactionId,
          });
          const response = { applied: true as const, revision: result.revision, project: structuredClone(result.project) };
          await publish(id, { project: result.project, history: nextHistory, meta: { kind: 'commit' as const, revision: result.revision, transactionId: t.transactionId, description: t.description ?? 'правка', at: new Date().toISOString() } },
            { transactionId: t.transactionId, request: tx, response: response as unknown as Record<string, unknown> });
          return { duplicate: false, response };
        } catch (e) {
          throw toStoreError(e);
        }
      });
    },

    /** Undo с контрактом {transactionId, expectedRevision} и идемпотентностью. */
    async undo(id: string, body: unknown): Promise<HistoryOutcome> {
      return serializeQueue(id, async () => {
        const req = requireHistoryRequest(body);
        await resolvePending(id);
        const replay = await replayOutcome(id, req.transactionId, { op: 'undo', projectId: id, ...req });
        if (replay === 'conflict') throw new StoreError(409, `transactionId "${req.transactionId}" уже использован другим запросом`);
        if (replay === 'superseded') {
          const cur = await load(id);
          throw new StoreError(409, 'Отмена не была подтверждена: состояние ушло вперёд.', undefined, { currentRevision: cur.project.revision });
        }
        if (replay === 'confirmed' || replay === 'recovered') {
          const prior = (await findReceipt(id, req.transactionId))!;
          return { duplicate: true, response: { ...(prior.response as { project: Project; canUndo: boolean; canRedo: boolean }), duplicate: true } };
        }
        const state = await load(id);
        if (req.expectedRevision !== state.project.revision) {
          throw new StoreError(409, 'Проект изменился. Обновите состояние и повторите.', undefined, { currentRevision: state.project.revision });
        }
        const step = undoHistory(state.history, state.project);
        if (!step) throw new StoreError(400, 'История пуста: нечего отменять');
        const restore = structuredClone(step.restore);
        restore.revision = state.project.revision + 1;
        const response = { project: structuredClone(restore), canUndo: canUndo(step.history), canRedo: canRedo(step.history) };
        await publish(id, { project: restore, history: step.history, meta: { kind: 'undo' as const, revision: restore.revision, transactionId: req.transactionId, at: new Date().toISOString() } },
          { transactionId: req.transactionId, request: { op: 'undo', projectId: id, ...req }, response: response as unknown as Record<string, unknown> });
        return { duplicate: false, response };
      });
    },

    /** Redo с контрактом {transactionId, expectedRevision} и идемпотентностью. */
    async redo(id: string, body: unknown): Promise<HistoryOutcome> {
      return serializeQueue(id, async () => {
        const req = requireHistoryRequest(body);
        await resolvePending(id);
        const replay = await replayOutcome(id, req.transactionId, { op: 'redo', projectId: id, ...req });
        if (replay === 'conflict') throw new StoreError(409, `transactionId "${req.transactionId}" уже использован другим запросом`);
        if (replay === 'superseded') {
          const cur = await load(id);
          throw new StoreError(409, 'Повтор не был подтверждён: состояние ушло вперёд.', undefined, { currentRevision: cur.project.revision });
        }
        if (replay === 'confirmed' || replay === 'recovered') {
          const prior = (await findReceipt(id, req.transactionId))!;
          return { duplicate: true, response: { ...(prior.response as { project: Project; canUndo: boolean; canRedo: boolean }), duplicate: true } };
        }
        const state = await load(id);
        if (req.expectedRevision !== state.project.revision) {
          throw new StoreError(409, 'Проект изменился. Обновите состояние и повторите.', undefined, { currentRevision: state.project.revision });
        }
        const step = redoHistory(state.history, state.project);
        if (!step) throw new StoreError(400, 'Нечего повторять');
        const restore = structuredClone(step.restore);
        restore.revision = state.project.revision + 1;
        const response = { project: structuredClone(restore), canUndo: canUndo(step.history), canRedo: canRedo(step.history) };
        await publish(id, { project: restore, history: step.history, meta: { kind: 'redo' as const, revision: restore.revision, transactionId: req.transactionId, at: new Date().toISOString() } },
          { transactionId: req.transactionId, request: { op: 'redo', projectId: id, ...req }, response: response as unknown as Record<string, unknown> });
        return { duplicate: false, response };
      });
    },

    async journal(id: string): Promise<Array<Record<string, unknown>>> {
      await load(id);
      try {
        const raw = await fsp.readFile(journalFile(id), 'utf8');
        return raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
      } catch {
        return [];
      }
    },

    async assetFile(id: string, assetId: string): Promise<{ file: string; mime: string }> {
      const state = await load(id);
      const asset = state.project.assets.find(a => a.id === assetId);
      if (!asset) throw new StoreError(404, `Ассет "${assetId}" не найден`);
      const file = path.join(dirOf(id), asset.path);
      const rel = path.relative(dirOf(id), file);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new StoreError(403, 'Недопустимый путь ассета');
      return { file, mime: asset.mime };
    },

    /**
     * Экспорт кадров: expectedRevision обязателен; конфликт и дубликаты номеров
     * кадров отклоняются ДО записи (F5); каждая выдача — отдельная job-директория;
     * manifest со status:'ready' пишется последним и атомарно.
     */
    async saveExport(id: string, options: { expectedRevision: number; frames: Array<{ frame: number; image: string }> }): Promise<{ jobDir: string; revision: number; snapshotHash: string; manifest: Record<string, unknown> }> {
      const state = await load(id);
      if (options.expectedRevision !== state.project.revision) {
        throw new StoreError(409, 'Проект изменился с начала экспорта; кадры не сохранены', undefined, { currentRevision: state.project.revision });
      }
      if (!Array.isArray(options.frames) || options.frames.length === 0 || options.frames.length > 12) {
        throw new StoreError(400, 'Короткий экспорт: 1–12 кадров');
      }
      const frameNumbers = options.frames.map(f => f.frame);
      if (new Set(frameNumbers).size !== frameNumbers.length) {
        throw new StoreError(400, 'Повторяющиеся номера кадров в одном экспорте не допускаются');
      }
      const snapshotHash = digestOf(state.project);
      const job = `job-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
      const jobAbs = path.join(dirOf(id), 'exports', job);
      await fsp.mkdir(jobAbs, { recursive: true });
      const manifest: Record<string, unknown> = {
        jobId: job,
        projectId: id,
        revision: state.project.revision,
        snapshotHash,
        size: state.project.size,
        fps: state.project.fps,
        durationFrames: state.project.durationFrames,
        renderer: 'client-canvas renderFrame; сервер пиксели не проверял',
        createdAt: new Date().toISOString(),
        status: 'incomplete',
      };
      const frameEntries: Array<Record<string, unknown>> = [];
      try {
        for (const f of options.frames) {
          if (!Number.isInteger(f.frame) || f.frame < 0 || f.frame >= state.project.durationFrames) throw new StoreError(400, `Кадр ${String(f.frame)} вне [0, ${String(state.project.durationFrames - 1)}]`);
          if (typeof f.image !== 'string' || !f.image.startsWith('data:image/png;base64,')) throw new StoreError(400, 'Ожидаются PNG data-URL кадры');
          const raw = Buffer.from(f.image.slice('data:image/png;base64,'.length), 'base64');
          if (raw.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new StoreError(400, 'Неверный PNG в кадре');
          const name = `frame-${String(f.frame).padStart(4, '0')}.png`;
          await fsp.writeFile(path.join(jobAbs, name), raw);
          frameEntries.push({ frame: f.frame, file: name, bytes: raw.length, sha256: crypto.createHash('sha256').update(raw).digest('hex') });
        }
      } catch (e) {
        manifest.status = 'incomplete';
        manifest.error = (e as Error).message;
        manifest.frames = frameEntries;
        await atomicWrite(path.join(jobAbs, 'manifest.json'), manifest);
        throw e;
      }
      manifest.frames = frameEntries;
      manifest.status = 'ready';
      await atomicWrite(path.join(jobAbs, 'manifest.json'), manifest);
      return { jobDir: `.local/projects/${id}/exports/${job}`, revision: state.project.revision, snapshotHash, manifest };
    },

    /** Тестовый хук: сброс кеша (имитация перезапуска процесса). */
    _dropCache(id?: string): void {
      if (id) caches.delete(id);
      else caches.clear();
    },

    /** Тестовый хук: чтение указателя подтверждённой ревизии. */
    async _pointer(id: string): Promise<Pointer | null> {
      const status = await readPointerStatus(id);
      return status.kind === 'ok' ? status.pointer : null;
    },
  };
}

export type Store = ReturnType<typeof createStore>;
