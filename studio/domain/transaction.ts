// Транзакция Project v2: expectedRevision, атомарность, монотонная ревизия.
// Идемпотентность по transactionId живёт в хранилище (journal), здесь чистая логика коммита.

import { applyOperations, type Operation } from './operations.ts';
import type { Project } from './schema.ts';
import type { EffectDefinition } from '../effects/registry.ts';
import { REGISTRY } from '../effects/registry.ts';

export type TransactionSource = 'manual' | 'agent';

export type Transaction = {
  transactionId: string;
  projectId: string;
  expectedRevision: number;
  source: TransactionSource;
  description?: string;
  operations: Operation[];
};

export class RevisionConflictError extends Error {
  currentRevision: number;
  constructor(currentRevision: number) {
    super(`Проект изменился: текущая ревизия ${currentRevision}. Перечитайте проект и повторите.`);
    this.name = 'RevisionConflictError';
    this.currentRevision = currentRevision;
  }
}

export type CommitResult = { project: Project; revision: number };

const TX_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,80}$/;

/** Применить транзакцию: проверка проекта/ревизии → пакет на копии → ревизия +1. */
export function applyTransaction(project: Project, tx: unknown, registry: ReadonlyMap<string, EffectDefinition> = REGISTRY): CommitResult {
  if (typeof tx !== 'object' || tx === null) throw new Error('Транзакция: ожидается объект');
  const t = tx as Partial<Transaction>;
  if (typeof t.transactionId !== 'string' || !TX_ID.test(t.transactionId))
    throw new Error('Транзакция: transactionId обязателен (8–81 символ: буквы, цифры, -_)');
  if (t.projectId !== project.id) throw new Error(`Транзакция: projectId "${String(t.projectId)}" не совпадает с "${project.id}"`);
  if (t.source !== 'manual' && t.source !== 'agent') throw new Error('Транзакция: source: manual|agent');
  if (t.expectedRevision !== project.revision) throw new RevisionConflictError(project.revision);
  const next = applyOperations(project, t.operations, registry);
  next.revision = project.revision + 1;
  return { project: next, revision: next.revision };
}
