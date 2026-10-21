import {localDataDir} from './dataPaths.ts';
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
import { validateProject, ValidationError, type Project } from '../studio/domain/schema.ts';
import type { History } from '../studio/domain/history.ts';
import { emptyHistory, pushCommit, undo as undoHistory, redo as redoHistory, canUndo, canRedo } from '../studio/domain/history.ts';
import { buildFixture } from '../studio/domain/fixture.ts';
import { buildDemo } from '../studio/domain/demo.ts';
import { buildShowcase } from '../studio/domain/showcase.ts';
import {buildMatter} from '../studio/domain/matter.ts';
import { buildEnergy } from '../studio/domain/energy.ts';
import { newId } from '../studio/domain/ids.ts';
import {inspectGltf,MAX_MODEL_BYTES} from '../studio/domain/gltf.ts';
import { applyTransaction, RevisionConflictError } from '../studio/domain/transaction.ts';

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
/** Указатель v2: подтверждение транзакции — идентичность transactionId ИЛИ членство в confirmedTx (G3). */
type Pointer = { revision: number; transactionId: string; stateFile: string; sha256: string; confirmedTx?: Array<{ transactionId: string; revision: number }> };
/** Указатель предыдущего протокола a5fe321 (G2). */
type PreviousPointer = { revision: number; stateFile: string; sha256: string };
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

export function createStore(rootDir: string, opts: { dataRoot?:string; injectFailure?: FailureInjector; demoAssetSource?: string; showcaseAssetSource?: string; energyAudioSource?: string; matterAudioSource?:string } = {}) {
  const inject = opts.injectFailure ?? (() => undefined);
  const demoAssetSource = opts.demoAssetSource ?? path.join(rootDir, 'www', 'projects', 'iikona', 'assets', 'monitoring-journal-historical.png');
  const showcaseAssetSource = opts.showcaseAssetSource ?? path.join(rootDir,'www','showcase','assets','kinetic-sculpture.png');
  const matterAudioSource=opts.matterAudioSource??path.join(rootDir,'www','matter','assets','matter-150.wav');
  const energyAudioSource = opts.energyAudioSource ?? path.join(rootDir,'www','energy','assets','razryad-180.wav');
  const projectsRoot = path.join(opts.dataRoot??localDataDir(rootDir), 'projects');
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

  /**
   * Указатель: 'ok' | 'previous' (валидный формат a5fe321, мигрируется явно) |
   * 'absent' (только ENOENT — легаси/нет) | 'ioerror' (отказ чтения — НЕ отсутствие,
   * никакого отката/миграции) | 'corrupt' (повреждён, мигрировать молча нельзя).
   */
  async function readPointerStatus(id: string): Promise<{ kind: 'ok'; pointer: Pointer } | { kind: 'previous'; pointer: PreviousPointer } | { kind: 'absent' } | { kind: 'ioerror' } | { kind: 'corrupt' }> {
    let raw: string;
    try {
      raw = await fsp.readFile(pointerFile(id), 'utf8');
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (code === 'ENOENT') return { kind: 'absent' };
      // EACCES/EPERM/EIO и прочее — явный отказ: файл существует, но не читается.
      return { kind: 'ioerror' };
    }
    try {
      const p = JSON.parse(raw) as Partial<Pointer> & Partial<PreviousPointer>;
      const v2 = typeof p.revision === 'number' && typeof p.transactionId === 'string' && typeof p.stateFile === 'string' && typeof p.sha256 === 'string';
      if (v2) return { kind: 'ok', pointer: { ...(p as Pointer), confirmedTx: Array.isArray((p as Pointer).confirmedTx) ? (p as Pointer).confirmedTx : [] } };
      // Формат предыдущего протокола a5fe321: {revision, stateFile, sha256} без transactionId.
      const v1 = typeof p.revision === 'number' && typeof p.stateFile === 'string' && typeof p.sha256 === 'string';
      if (v1) return { kind: 'previous', pointer: p as PreviousPointer };
      return { kind: 'corrupt' };
    } catch {
      return { kind: 'corrupt' };
    }
  }

  /** Подтверждена ли транзакция: идентичность указателя или цепочка подтверждённых (G3). */
  function txConfirmedBy(pointer: Pointer, transactionId: string): boolean {
    return pointer.transactionId === transactionId || (pointer.confirmedTx ?? []).some(e => e.transactionId === transactionId);
  }

  /**
   * Единый критерий подтверждения старых квитанций (H1/H2) — по авторитетным
   * доказательствам, а не по номеру ревизии:
   *  - v2-квитанция (есть packageSha256) со статусом confirmed — статус v2
   *    пишется только после проверенной идентификации;
   *  - v2-квитанция prepared на ревизии ≤ указателя с целым по digest пакетом
   *    (в e29cc39 целый пакет переживался только завершёнными попытками);
   *  - transactionId в meta авторитетного пакета или в метках переходов
   *    history.past (реально применённые коммиты a5fe321);
   *  - init-квитанция rev 1 существующего проекта.
   * Остальное неоднозначно: superseded с сохранением данных, без ложного успеха.
   */
  async function collectOldReceiptProofs(id: string, pkg: StatePackage, pointerRevision: number): Promise<{ proven: Array<{ transactionId: string; revision: number }>; ambiguous: Array<{ receipt: Receipt; transactionId: string; revision: number }> }> {
    const proven: Array<{ transactionId: string; revision: number }> = [];
    const ambiguous: Array<{ receipt: Receipt; transactionId: string; revision: number }> = [];
    const metaTxIds = new Set<string>();
    if (typeof pkg.meta?.transactionId === 'string') metaTxIds.add(pkg.meta.transactionId);
    for (const snap of pkg.history?.past ?? []) if (typeof (snap as { transactionId?: unknown })?.transactionId === 'string') metaTxIds.add((snap as { transactionId: string }).transactionId);
    let names: string[] = [];
    try {
      names = await fsp.readdir(txDir(id));
    } catch {
      return { proven, ambiguous };
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const fileTxId = name.slice(0, -5);
      const receipt = await findReceipt(id, fileTxId);
      if (!receipt || typeof receipt.requestHash !== 'string') continue;
      const rev = typeof receipt.revision === 'number' ? receipt.revision : Number((receipt.response as { revision?: unknown } | undefined)?.revision ?? NaN);
      if (!Number.isInteger(rev) || rev < 1) continue;
      const isV2Receipt = typeof receipt.packageSha256 === 'string';
      if (isV2Receipt && receipt.status === 'confirmed') { proven.push({ transactionId: fileTxId, revision: rev }); continue; }
      if (metaTxIds.has(fileTxId)) { proven.push({ transactionId: fileTxId, revision: rev }); continue; }
      if (/^init-/.test(fileTxId) && rev === 1 && pointerRevision >= 1) { proven.push({ transactionId: fileTxId, revision: 1 }); continue; }
      if (!isV2Receipt) {
        // a5fe321: выживший пакет этой ревизии с meta.transactionId === txId —
        // авторитетное доказательство (пакеты могли перезаписываться, но meta
        // выжившего файла называет именно ту транзакцию, чьё содержимое стало состоянием).
        const survivor = await readPackageRaw(id, `states/rev-${String(rev)}.json`);
        if (survivor && typeof survivor.meta?.transactionId === 'string' && survivor.meta.transactionId === fileTxId) {
          proven.push({ transactionId: fileTxId, revision: rev });
          continue;
        }
      }
      if (isV2Receipt && rev <= pointerRevision) {
        // Целый пакет v2 на ревизии не выше указателя: попытка была завершена
        // (незавершённые либо восстановлены, либо пакет бы не выжил согласованно).
        let intact = false;
        try {
          const p2 = await readVerifiedPackage(id, receipt.stateFile, receipt.packageSha256 as string);
          intact = p2.project.revision === rev && p2.project.id === id;
        } catch { intact = false; }
        if (intact) { proven.push({ transactionId: fileTxId, revision: rev }); continue; }
      }
      ambiguous.push({ receipt, transactionId: fileTxId, revision: rev });
    }
    return { proven, ambiguous };
  }

  /** Сырое чтение пакета без digest-проверки (для поиска доказательств). */
  async function readPackageRaw(id: string, rel: string): Promise<StatePackage | null> {
    try {
      return JSON.parse(await fsp.readFile(path.join(dirOf(id), rel), 'utf8')) as StatePackage;
    } catch {
      return null;
    }
  }

  /**
   * G2: явная миграция указателя формата a5fe321 → v2: проверяется digest и
   * принадлежность авторитетного пакета (НЕ зеркало project.json). Квитанции
   * подтверждаются только по авторитетным доказательствам (collectOldReceiptProofs);
   * неоднозначные помечаются superseded с сохранением данных.
   */
  async function migratePointerFromPrevious(id: string, old: PreviousPointer): Promise<Pointer> {
    const pkg = await readVerifiedPackage(id, old.stateFile, old.sha256);
    if (pkg.project.revision !== old.revision) {
      throw new StoreError(500, `Указатель a5fe321 и пакет проекта "${id}" расходятся (rev ${String(old.revision)} против ${String(pkg.project.revision)}); миграция прервана`);
    }
    const metaTx = typeof pkg.meta?.transactionId === 'string' && TX_ID.test(pkg.meta.transactionId) ? pkg.meta.transactionId : '';
    const transactionId = metaTx || `upgraded-r${String(old.revision)}-${digestOf(pkg).slice(0, 8)}`;
    const { proven, ambiguous } = await collectOldReceiptProofs(id, pkg, old.revision);
    for (const a of ambiguous) {
      await markReceipt(id, a.receipt, 'superseded');
      await appendJournal(id, { kind: 'abandoned-legacy', revision: a.revision, transactionId: a.transactionId });
    }
    const confirmedTx = [{ transactionId, revision: old.revision }, ...proven]
      .filter((e, i, arr) => arr.findIndex(x => x.transactionId === e.transactionId) === i)
      .sort((a, b) => a.revision - b.revision);
    const pointer: Pointer = { revision: old.revision, transactionId, stateFile: old.stateFile, sha256: old.sha256, confirmedTx };
    maybeFail('pointer', { phase: 'migrate-a5fe321', id, revision: old.revision });
    await atomicWrite(pointerFile(id), pointer);
    caches.set(id, { project: pkg.project, history: Array.isArray(pkg.history?.past) && Array.isArray(pkg.history?.future) ? pkg.history : emptyHistory() });
    await appendJournal(id, { kind: 'migrate-a5fe321', revision: old.revision, transactionId });
    // e29-подобные pending выше указателя (если есть) решаются общим механизмом.
    await resolvePending(id);
    return pointer;
  }

  /**
   * H2a: указатель v2 без confirmedTx (формат e29cc39) получает цепочку,
   * посеянную из доказанных квитанций; pending выше указателя решает
   * resolvePending. Выполняется один раз и.persistится.
   */
  async function seedChainIfMissing(id: string, pointer: Pointer, pkg: StatePackage): Promise<Pointer> {
    if (Array.isArray(pointer.confirmedTx) && pointer.confirmedTx.length > 0) return pointer;
    const { proven, ambiguous } = await collectOldReceiptProofs(id, pkg, pointer.revision);
    for (const a of ambiguous) {
      if (a.revision > pointer.revision) continue; // судьбу pending решит resolvePending
      await markReceipt(id, a.receipt, 'superseded');
      await appendJournal(id, { kind: 'abandoned-legacy', revision: a.revision, transactionId: a.transactionId });
    }
    const confirmedTx = [{ transactionId: pointer.transactionId, revision: pointer.revision }, ...proven]
      .filter((e, i, arr) => arr.findIndex(x => x.transactionId === e.transactionId) === i)
      .sort((a, b) => a.revision - b.revision);
    const seeded: Pointer = { ...pointer, confirmedTx };
    try {
      await atomicWrite(pointerFile(id), seeded);
    } catch (e) {
      throw new StoreError(503, `перенос цепочки подтверждений не завершен (ввод-вывод): ${(e as Error).message}. Повтор открытия безопасен.`);
    }
    await appendJournal(id, { kind: 'seed-confirmed-chain', revision: pointer.revision, transactionId: pointer.transactionId });
    await resolvePending(id);
    return seeded;
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

  /** Загрузка подтверждённого состояния. Повреждение/отказ чтения — явная ошибка. */
  async function load(id: string): Promise<ProjectState> {
    const cached = caches.get(id);
    if (cached) return cached;
    const status = await readPointerStatus(id);
    let pointer: Pointer | null = null;
    if (status.kind === 'ok') pointer = status.pointer;
    else if (status.kind === 'ioerror') throw new StoreError(500, `Указатель подтверждённой ревизии проекта "${id}" не читается (отказ ввода-вывода/доступа); откат и миграция не выполняются`);
    else if (status.kind === 'corrupt') throw new StoreError(500, `Повреждён указатель подтверждённой ревизии проекта "${id}"; миграция на зеркало не выполняется`);
    else if (status.kind === 'previous') pointer = await migratePointerFromPrevious(id, status.pointer);
    else pointer = await migrateLegacy(id);
    if (!pointer) throw new StoreError(404, `Проект "${id}" не найден`);
    const pkg = await readVerifiedPackage(id, pointer.stateFile, pointer.sha256);
    if (pkg.project.revision !== pointer.revision) {
      throw new StoreError(500, `Указатель и пакет проекта "${id}" расходятся (rev ${String(pointer.revision)} против ${String(pkg.project.revision)})`);
    }
    // H2a: указатель раннего v2 без confirmedTx получает цепочку из доказанных квитанций.
    if (status.kind === 'ok' && (!Array.isArray(status.pointer.confirmedTx) || status.pointer.confirmedTx.length === 0)) {
      pointer = await seedChainIfMissing(id, pointer, pkg);
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
    // G3/H2: доказательство подтверждения живёт в самом указателе — неограниченная
    // цепочка подтверждённых транзакций переживает отказ записи статуса квитанции,
    // переход указателя дальше, рестарт и очистку states.
    let chain: Array<{ transactionId: string; revision: number }> = [];
    try {
      const prev = await readPointerStatus(id);
      if (prev.kind === 'ok') chain = [...(prev.pointer.confirmedTx ?? [])];
    } catch { /* цепочка предыдущего указателя недоступна — начинаем с чистой */ }
    const entry = { transactionId: receipt.transactionId, revision: pkg.project.revision };
    chain = [...chain.filter(e => e.transactionId !== entry.transactionId), entry];
    const pointer: Pointer = { revision: pkg.project.revision, transactionId: receipt.transactionId, stateFile: rel, sha256: full.packageSha256, confirmedTx: chain };
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
      const parsed = JSON.parse(await fsp.readFile(path.join(txDir(id), `${transactionId}.json`), 'utf8')) as Receipt;
      // Квитанции a5fe321 не содержат transactionId в теле — он в имени файла.
      if (!parsed.transactionId) parsed.transactionId = transactionId;
      return parsed;
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
    // G3: подтверждение определяется указателем и его цепочкой, статус квитанции — косметика.
    const pendings = receipts.filter(r => r.revision > pointer.revision && !txConfirmedBy(pointer, r.transactionId)).sort((a, b) => a.revision - b.revision);
    // Косметика: закрыть квитанции, чья судьба уже решена указателем.
    for (const r of receipts) {
      if (r.status !== 'prepared') continue;
      if (txConfirmedBy(pointer, r.transactionId)) await markReceipt(id, r, 'confirmed');
      else if (r.revision < pointer.revision) await markReceipt(id, r, 'superseded');
    }
    let changed = false;
    let currentRevision = pointer.revision;
    let chain = [...(pointer.confirmedTx ?? [])];
    for (const receipt of pendings) {
      if (receipt.revision <= currentRevision) continue;
      let pkg: StatePackage | null = null;
      try {
        pkg = await readVerifiedPackage(id, receipt.stateFile, receipt.packageSha256);
      } catch {
        pkg = null;
      }
      if (pkg && pkg.project.revision === receipt.revision && pkg.project.id === id) {
        chain = [...chain.filter(e => e.transactionId !== receipt.transactionId), { transactionId: receipt.transactionId, revision: receipt.revision }];
        const newPointer: Pointer = { revision: receipt.revision, transactionId: receipt.transactionId, stateFile: receipt.stateFile, sha256: receipt.packageSha256, confirmedTx: chain };
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
   * Повтор по transactionId (F1/G3/H2):
   * 'confirmed' — транзакция в указателе, его цепочке (без лимита) или имеет
   *   долговременное доказательство: v2-квитанция со статусом confirmed
   *   (этот статус пишется только после проверенной идентификации);
   * 'recovered' — первое завершение незавершённой фиксации: одно событие;
   * 'superseded' — попытка не была подтверждена и уже не может: честный 409;
   * 'conflict' — txId занят другим запросом; null — новая транзакция.
   */
  async function replayOutcome(id: string, transactionId: string, request: unknown): Promise<'confirmed' | 'recovered' | 'superseded' | 'conflict' | null> {
    const prior = await findReceipt(id, transactionId);
    if (!prior) return null;
    if (prior.requestHash !== digestOf(request)) return 'conflict';
    const status = await readPointerStatus(id);
    // H2: доказательство за пределами цепочки — сохранённый v2-статус confirmed.
    const v2ConfirmedStatus = typeof prior.packageSha256 === 'string' && prior.status === 'confirmed';
    if ((status.kind === 'ok' && txConfirmedBy(status.pointer, transactionId)) || v2ConfirmedStatus) {
      // Статус квитанции — косметика; добиваем его при возможности.
      if (prior.status !== 'confirmed') await markReceipt(id, prior, 'confirmed').catch(() => {});
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
        const chain = [...(status.pointer.confirmedTx ?? []).filter(e => e.transactionId !== prior.transactionId), { transactionId: prior.transactionId, revision: prior.revision }];
        const newPointer: Pointer = { revision: prior.revision, transactionId: prior.transactionId, stateFile: prior.stateFile, sha256: prior.packageSha256, confirmedTx: chain };
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
        // G2: формат a5fe321 тоже мигрируется явно; G1: отказ чтения — диагностика, без лечения зеркалом.
        const status = await readPointerStatus(name);
        if (status.kind === 'absent') {
          if (!fs.existsSync(path.join(dirOf(name), 'project.json'))) continue;
          await serializeQueue(name, async () => {
            const again = await readPointerStatus(name);
            if (again.kind === 'absent') await migrateLegacy(name);
            else if (again.kind === 'previous') await migratePointerFromPrevious(name, again.pointer);
          }).catch(e => console.warn(`list: миграция "${name}" не выполнена:`, (e as Error).message));
        } else if (status.kind === 'previous') {
          await serializeQueue(name, async () => {
            const again = await readPointerStatus(name);
            if (again.kind === 'previous') await migratePointerFromPrevious(name, again.pointer);
          }).catch(e => console.warn(`list: миграция a5fe321 "${name}" не выполнена:`, (e as Error).message));
        } else if (status.kind === 'ioerror') {
          console.warn(`list: указатель проекта "${name}" не читается (ввод-вывод/доступ) — пропущен без миграции`);
          continue;
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
      let showcaseAsset: Buffer | null = null;
      let energyAudio: Buffer | null = null;let matterAudio:Buffer|null=null;
      if(options.preset==='matter-v1'){try{matterAudio=await fsp.readFile(matterAudioSource)}catch{throw new StoreError(500,'Не найдена музыка демонстрационного проекта Материя')}project=buildMatter({sha256:crypto.createHash('sha256').update(matterAudio).digest('hex'),bytes:matterAudio.length});
      }else if(options.preset === 'energy-v1'){
        try {energyAudio=await fsp.readFile(energyAudioSource)}
        catch {throw new StoreError(500,'Не найдена музыка демонстрационного проекта Разряд')}
        project=buildEnergy({sha256:crypto.createHash('sha256').update(energyAudio).digest('hex'),bytes:energyAudio.length});
      } else if (options.preset === 'showcase-v1') {
        try { showcaseAsset=await fsp.readFile(showcaseAssetSource); }
        catch { throw new StoreError(500,'Не найдено изображение демонстрационного проекта Motivelium'); }
        const size=pngSize(showcaseAsset);
        project=buildShowcase({sha256:crypto.createHash('sha256').update(showcaseAsset).digest('hex'),bytes:showcaseAsset.length,width:size.width,height:size.height});
      } else if (options.preset === 'm2-demo') {
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
      if(showcaseAsset){
        await fsp.mkdir(path.join(dirOf(id),'assets'),{recursive:true});
        await fsp.writeFile(path.join(dirOf(id),'assets','kinetic-sculpture.png'),showcaseAsset);
      }
      if(matterAudio){await fsp.mkdir(path.join(dirOf(id),'assets'),{recursive:true});await fsp.writeFile(path.join(dirOf(id),'assets','matter-150.wav'),matterAudio)}
      if(energyAudio){await fsp.mkdir(path.join(dirOf(id),'assets'),{recursive:true});await fsp.writeFile(path.join(dirOf(id),'assets','razryad-180.wav'),energyAudio)}
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

    // Staging stores immutable bytes only. Project membership is a normal undoable transaction.
    async stageModel(id:string,input:Record<string,unknown>){
      const state=await load(id);if(input.expectedRevision!==state.project.revision)throw new StoreError(409,'Проект изменился перед импортом.');
      if(typeof input.base64!=='string'||input.base64.length%4||input.base64.length>Math.ceil(MAX_MODEL_BYTES/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))throw new StoreError(400,'Неверные данные модели.');
      const bytes=Buffer.from(input.base64,'base64');let inspection;try{inspection=inspectGltf(bytes)}catch(e){throw new StoreError(400,(e as Error).message)}
      const hash=crypto.createHash('sha256').update(bytes).digest('hex'),ext=inspection.binary?'glb':'gltf',rel=`assets/models/${hash}.${ext}`,file=path.join(dirOf(id),rel);await fsp.mkdir(path.dirname(file),{recursive:true});
      try{await fsp.writeFile(file,bytes,{flag:'wx'})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;if(crypto.createHash('sha256').update(await fsp.readFile(file)).digest('hex')!==hash)throw new StoreError(409,'Повреждён сохранённый ресурс модели.');}
      const title=typeof input.name==='string'?path.basename(input.name).replace(/[\u0000-\u001f]/g,'').slice(0,120)||'Модель':'Модель';
      return{asset:{id:'model-'+hash.slice(0,20),path:rel,mime:inspection.binary?'model/gltf-binary':'model/gltf+json',bytes:bytes.length,sha256:hash,origin:'staged' as const,title},parts:inspection.parts};
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
