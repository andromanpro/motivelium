// Хранилище проектов Motivelium: согласованная фиксация состояния.
//
// Протокол (после ревью 14.10, дефект partial-persist):
//   states/rev-<N>.json        — иммутабельный пакет {project, history, meta}
//   transactions/<txId>.json   — квитанция идемпотентности {requestHash, request, response, stateFile}
//   pointer.json               — ЕДИНСТВЕННАЯ точка фиксации (атомарный tmp+rename)
//   journal.jsonl              — журнал для человека (best-effort)
//   project.json/history.json  — зеркало для совместимости (best-effort, не источник истины)
//
// Граница фиксации: правка подтверждена ⇔ pointer.json указывает на её пакет.
// До flip: прежнее подтверждённое состояние; повтор запроса до-применяет или
// завершает фиксацию по квитанции. После flip: ошибки зеркала/журнала не меняют
// результат. Кэш публикуется только после границы.

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
type Pointer = { revision: number; stateFile: string; sha256: string };
type Receipt = { requestHash: string; request: unknown; response: Record<string, unknown>; stateFile: string; revision: number };

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

/** Точки для внедрения искусственных отказов в тестах (и только там). */
export type FailureInjector = (phase: string, ctx: Record<string, unknown>) => Error | undefined;

export function createStore(rootDir: string, opts: { injectFailure?: FailureInjector } = {}) {
  const inject = opts.injectFailure ?? (() => undefined);
  const projectsRoot = path.join(rootDir, '.local', 'projects');
  fs.mkdirSync(projectsRoot, { recursive: true });
  const queues = new Map<string, Promise<unknown>>();
  const caches = new Map<string, ProjectState>();

  const dirOf = (id: string) => path.join(projectsRoot, id);
  const statesDir = (id: string) => path.join(dirOf(id), 'states');
  const txDir = (id: string) => path.join(dirOf(id), 'transactions');
  const pointerFile = (id: string) => path.join(dirOf(id), 'pointer.json');
  const stateFile = (id: string, rev: number) => path.join(statesDir(id), `rev-${String(rev)}.json`);
  const journalFile = (id: string) => path.join(dirOf(id), 'journal.jsonl');

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

  function sha256Of(value: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  // ---------- чтение подтверждённого состояния ----------

  async function readPointer(id: string): Promise<Pointer | null> {
    try {
      const p = JSON.parse(await fsp.readFile(pointerFile(id), 'utf8')) as Pointer;
      if (typeof p.revision === 'number' && typeof p.stateFile === 'string' && typeof p.sha256 === 'string') return p;
      return null;
    } catch {
      return null;
    }
  }

  async function readStatePackage(id: string, file: string): Promise<StatePackage | null> {
    try {
      return JSON.parse(await fsp.readFile(path.join(dirOf(id), file), 'utf8')) as StatePackage;
    } catch {
      return null;
    }
  }

  /** Загрузка подтверждённого состояния; при необходимости — миграция старой раскладки. */
  async function load(id: string): Promise<ProjectState> {
    const cached = caches.get(id);
    if (cached) return cached;
    let pointer = await readPointer(id);
    if (!pointer) {
      const legacy = await migrateLegacy(id);
      if (!legacy) throw new StoreError(404, `Проект "${id}" не найден`);
      pointer = legacy;
    }
    const pkg = await readStatePackage(id, pointer.stateFile);
    if (!pkg || pkg.project.revision !== pointer.revision) {
      throw new StoreError(500, `Повреждено подтверждённое состояние проекта "${id}" (rev ${String(pointer.revision)})`);
    }
    const state: ProjectState = {
      project: validateProject(pkg.project),
      history: Array.isArray(pkg.history?.past) && Array.isArray(pkg.history?.future) ? pkg.history : emptyHistory(),
    };
    caches.set(id, state);
    return state;
  }

  /** Явная миграция project.json+history.json → states/rev-N + pointer. */
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
    const pkg: StatePackage = { project: valid, history, meta: { kind: 'migrate', revision: valid.revision, description: 'миграция старой раскладки', at: new Date().toISOString() } };
    await fsp.mkdir(statesDir(id), { recursive: true });
    const rel = `states/rev-${String(valid.revision)}.json`;
    maybeFail('state', { phase: 'migrate', id });
    await atomicWrite(path.join(dirOf(id), rel), pkg);
    const pointer: Pointer = { revision: valid.revision, stateFile: rel, sha256: sha256Of(pkg) };
    maybeFail('pointer', { phase: 'migrate', id });
    await atomicWrite(pointerFile(id), pointer);
    return pointer;
  }

  // ---------- публикация нового состояния (единый протокол для commit/undo/redo) ----------

  /**
   * Зафиксировать новое состояние по протоколу: пакет → квитанция → указатель.
   * Возвращает пару {state, pkg} подтверждённого результата.
   */
  async function publish(
    id: string,
    pkg: StatePackage,
    receipt: { transactionId: string; request: unknown; response: Record<string, unknown> },
  ): Promise<ProjectState> {
    const rel = `states/rev-${String(pkg.project.revision)}.json`;
    maybeFail('state', { id, revision: pkg.project.revision });
    await fsp.mkdir(statesDir(id), { recursive: true });
    await fsp.mkdir(txDir(id), { recursive: true });
    await atomicWrite(path.join(dirOf(id), rel), pkg);

    const full: Receipt = {
      requestHash: sha256Of(receipt.request),
      request: receipt.request,
      response: structuredClone(receipt.response),
      stateFile: rel,
      revision: pkg.project.revision,
    };
    maybeFail('receipt', { id, revision: pkg.project.revision, transactionId: receipt.transactionId });
    await atomicWrite(path.join(txDir(id), `${receipt.transactionId}.json`), full);

    const pointer: Pointer = { revision: pkg.project.revision, stateFile: rel, sha256: sha256Of(pkg) };
    maybeFail('pointer', { id, revision: pkg.project.revision });
    await atomicWrite(pointerFile(id), pointer);
    // ————— ГРАНИЦА ФИКСАЦИИ: всё ниже не влияет на подтверждённость —————

    const state: ProjectState = { project: pkg.project, history: pkg.history };
    caches.set(id, state);

    try {
      await fsp.appendFile(journalFile(id), JSON.stringify({ at: new Date().toISOString(), kind: pkg.meta.kind, revision: pkg.project.revision, transactionId: pkg.meta.transactionId, description: pkg.meta.description }) + '\n', 'utf8');
    } catch { /* журнал — best-effort */ }
    try {
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
    const revs = names
      .map(n => /^rev-(\d+)\.json$/.exec(n))
      .filter((m): m is RegExpExecArray => !!m)
      .map(m => Number(m[1]))
      .sort((a, b) => b - a);
    for (const rev of revs.slice(STATES_KEEP)) {
      if (rev === keepRevision) continue;
      await fsp.unlink(stateFile(id, rev)).catch(() => {});
    }
  }

  async function findReceipt(id: string, transactionId: string): Promise<Receipt | null> {
    try {
      return JSON.parse(await fsp.readFile(path.join(txDir(id), `${transactionId}.json`), 'utf8')) as Receipt;
    } catch {
      return null;
    }
  }

  /** Согласованный повтор/добавление по transactionId. */
  async function replayOrConflict(id: string, transactionId: string, request: unknown): Promise<{ response: Record<string, unknown> } | { conflict: StoreError } | null> {
    const prior = await findReceipt(id, transactionId);
    if (!prior) return null;
    if (prior.requestHash !== sha256Of(request)) {
      return { conflict: new StoreError(409, `transactionId "${transactionId}" уже использован другим запросом`) };
    }
    const pointer = await readPointer(id);
    if (pointer && pointer.revision >= prior.revision) {
      return { response: structuredClone(prior.response) };
    }
    // Квитанция есть, указатель отстаёт: фиксация была прервана после квитанции — завершаем её.
    const pkg = await readStatePackage(id, prior.stateFile);
    if (pkg && pkg.project.revision === prior.revision) {
      const newPointer: Pointer = { revision: prior.revision, stateFile: prior.stateFile, sha256: sha256Of(pkg) };
      maybeFail('pointer', { id, revision: prior.revision, phase: 'recovery' });
      await atomicWrite(pointerFile(id), newPointer);
      caches.set(id, { project: pkg.project, history: pkg.history });
      return { response: structuredClone(prior.response) };
    }
    // Пакет потерян — считаем незавершённой, обычный путь применит заново.
    return null;
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
    if (e instanceof Error && /^фиксация/.test(e.message)) return new StoreError(503, e.message + '. Состояние не подтверждено — повтор запроса безопасен.');
    return new StoreError(400, (e as Error).message);
  }

  // ---------- пустой проект / демо ----------

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

  /** Демо M2: копирует постановочный кадр журнала в ассеты проекта. */
  async function buildDemoProject(): Promise<Project> {
    const source = path.join(rootDir, 'www', 'projects', 'iikona', 'assets', 'monitoring-journal-historical.png');
    let raw: Buffer;
    try {
      raw = await fsp.readFile(source);
    } catch {
      throw new StoreError(500, `Источник демо-ассета не найден: ${source}`);
    }
    const size = pngSize(raw);
    const project = buildDemo({ sha256: crypto.createHash('sha256').update(raw).digest('hex'), bytes: raw.length, width: size.width, height: size.height });
    return project;
  }

  async function copyDemoAsset(project: Project): Promise<void> {
    const source = path.join(rootDir, 'www', 'projects', 'iikona', 'assets', 'monitoring-journal-historical.png');
    const raw = await fsp.readFile(source);
    const assetsDir = path.join(dirOf(project.id), 'assets');
    await fsp.mkdir(assetsDir, { recursive: true });
    await fsp.writeFile(path.join(assetsDir, 'monitor-frame.png'), raw);
  }

  // ---------- публичный интерфейс ----------

  return {
    root: projectsRoot,

    async list(): Promise<Array<{ id: string; title: string; revision: number; updatedAt: string | null }>> {
      const out: Array<{ id: string; title: string; revision: number; updatedAt: string | null }> = [];
      const names = await fsp.readdir(projectsRoot).catch(() => [] as string[]);
      for (const name of names) {
        try {
          const pointer = await readPointer(name);
          if (!pointer) continue;
          const pkg = await readStatePackage(name, pointer.stateFile);
          if (!pkg) continue;
          out.push({ id: pkg.project.id, title: pkg.project.title, revision: pkg.project.revision, updatedAt: null });
        } catch { /* неполный каталог пропускаем */ }
      }
      return out;
    },

    /** Создание всегда даёт НОВЫЙ проект с уникальным id (перезаписи нет). */
    async create(options: { fixture?: boolean; preset?: string; title?: string; durationFrames?: number } = {}): Promise<{ project: Project }> {
      let project: Project;
      if (options.preset === 'm2-demo') {
        project = await buildDemoProject();
      } else if (options.fixture) {
        project = buildFixture();
      } else {
        const duration = Number.isInteger(options.durationFrames) && (options.durationFrames as number) > 0 ? (options.durationFrames as number) : 300;
        const title = typeof options.title === 'string' && options.title.trim() ? options.title.trim().slice(0, 300) : 'Новый проект';
        project = emptyProject(title, duration);
      }
      // Каждая копия получает собственный уникальный id (префикс — от пресета).
      project = { ...project, id: newId(project.id), revision: 1 };
      if (typeof options.title === 'string' && options.title.trim()) project.title = options.title.trim().slice(0, 300);
      validateProject(project);
      const id = project.id;
      if (fs.existsSync(dirOf(id))) throw new StoreError(500, `Коллизия id проекта "${id}"`);
      if (options.preset === 'm2-demo') await copyDemoAsset(project);
      const response = { applied: true as const, revision: project.revision, project: structuredClone(project) };
      await publish(id, { project, history: emptyHistory(), meta: { kind: 'init', revision: project.revision, description: 'создан проект', at: new Date().toISOString() } },
        { transactionId: `init-${crypto.randomUUID()}`, request: { op: 'init', projectId: id }, response: response as unknown as Record<string, unknown> });
      return { project: structuredClone(project) };
    },

    async get(id: string): Promise<{ project: Project; canUndo: boolean; canRedo: boolean }> {
      const state = await load(id);
      return { project: structuredClone(state.project), canUndo: canUndo(state.history), canRedo: canRedo(state.history) };
    },

    /** Коммит транзакции: идемпотентный повтор по transactionId возвращает прежний результат. */
    async commit(id: string, tx: unknown): Promise<CommitOutcome> {
      return serializeQueue(id, async () => {
        const txId = (tx as { transactionId?: string })?.transactionId ?? '';
        const replay = await replayOrConflict(id, txId, tx);
        if (replay) {
          if ('conflict' in replay) throw replay.conflict;
          return { duplicate: true, response: { ...(replay.response as { applied: true; revision: number; project: Project }), duplicate: true } };
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
        const replay = await replayOrConflict(id, req.transactionId, { op: 'undo', projectId: id, ...req });
        if (replay) {
          if ('conflict' in replay) throw replay.conflict;
          return { duplicate: true, response: { ...(replay.response as { project: Project; canUndo: boolean; canRedo: boolean }), duplicate: true } };
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
        const replay = await replayOrConflict(id, req.transactionId, { op: 'redo', projectId: id, ...req });
        if (replay) {
          if ('conflict' in replay) throw replay.conflict;
          return { duplicate: true, response: { ...(replay.response as { project: Project; canUndo: boolean; canRedo: boolean }), duplicate: true } };
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
     * Экспорт кадров: expectedRevision обязателен, конфликт отклоняется ДО записи.
     * Каждый экспорт — отдельная job-директория; manifest с status:'ready'
     * записывается последним и атомарно. Пиксели рисует клиент — сервер этого
     * не проверяет и в manifest это указано.
     */
    async saveExport(id: string, options: { expectedRevision: number; frames: Array<{ frame: number; image: string }> }): Promise<{ jobDir: string; revision: number; snapshotHash: string; manifest: Record<string, unknown> }> {
      const state = await load(id);
      if (options.expectedRevision !== state.project.revision) {
        throw new StoreError(409, 'Проект изменился с начала экспорта; кадры не сохранены', undefined, { currentRevision: state.project.revision });
      }
      if (!Array.isArray(options.frames) || options.frames.length === 0 || options.frames.length > 12) {
        throw new StoreError(400, 'Короткий экспорт: 1–12 кадров');
      }
      const snapshotHash = sha256Of(state.project);
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
      manifest.status = 'ready'; // записывается последним атомарной заменой
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
      return readPointer(id);
    },
  };
}

export type Store = ReturnType<typeof createStore>;
