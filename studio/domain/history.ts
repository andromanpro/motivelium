// История правок Project v2: undo/redo снимками содержимого, ревизия монотонная.
// Новая правка после undo сбрасывает redo. Стеки сериализуются и переживают reload.

import type { Project } from './schema.ts';

export const HISTORY_CAP = 50;

export type Snapshot = { project: Project; description: string; source: 'manual' | 'agent' | 'init'; at: string; transactionId?: string };

export type History = { past: Snapshot[]; future: Snapshot[] };

export function emptyHistory(): History {
  return { past: [], future: [] };
}

/** Снимок текущего состояния перед коммитом; future очищается (redo сброшен). */
export function pushCommit(history: History, current: Project, meta: Omit<Snapshot, 'project'>): History {
  const past = [...history.past, { ...meta, project: structuredClone(current) }].slice(-HISTORY_CAP);
  return { past, future: [] };
}

export function canUndo(history: History): boolean { return history.past.length > 0; }
export function canRedo(history: History): boolean { return history.future.length > 0; }

/** Undo: вернуть прошлое состояние; текущее уходит в future. Ревизию поднимает вызывающий. */
export function undo(history: History, current: Project): { history: History; restore: Project } | null {
  if (!history.past.length) return null;
  const past = [...history.past];
  const restoreSnap = past.pop()!;
  const outgoing: Snapshot = { project: structuredClone(current), description: 'до undo', source: 'manual', at: new Date().toISOString() };
  const future = [outgoing, ...history.future].slice(0, HISTORY_CAP);
  return { history: { past, future }, restore: structuredClone(restoreSnap.project) };
}

/** Redo: вернуть состояние из future; текущее уходит в past. */
export function redo(history: History, current: Project): { history: History; restore: Project } | null {
  if (!history.future.length) return null;
  const future = [...history.future];
  const restoreSnap = future.shift()!;
  const outgoing: Snapshot = { project: structuredClone(current), description: 'до redo', source: 'manual', at: new Date().toISOString() };
  const past = [...history.past, outgoing].slice(-HISTORY_CAP);
  return { history: { past, future }, restore: structuredClone(restoreSnap.project) };
}
