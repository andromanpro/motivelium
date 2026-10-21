// Тесты транзакций и истории: ревизии, конфликт, undo/redo, сброс redo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTransaction, RevisionConflictError } from '../domain/transaction.ts';
import { emptyHistory, pushCommit, undo, redo, canUndo, canRedo } from '../domain/history.ts';
import { buildFixture } from '../domain/fixture.ts';
import type { Transaction } from '../domain/transaction.ts';

function tx(p: { revision: number }, operations: unknown, overrides: Partial<Transaction> = {}): Transaction {
  return {
    transactionId: 'tx-test-0001',
    projectId: 'm1-fixture',
    expectedRevision: p.revision,
    source: 'manual',
    description: 'тест',
    operations: operations as Transaction['operations'],
    ...overrides,
  };
}

test('успешная транзакция поднимает ревизию на 1', () => {
  const p = buildFixture();
  const result = applyTransaction(p, tx(p, [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Слева' } }]));
  assert.equal(result.revision, p.revision + 1);
  assert.equal(result.project.nodes.find(n => n.id === 'card-left')!.name, 'Слева');
  assert.equal(p.revision, 1, 'исходная ревизия не меняется');
});

test('устаревшая ревизия отклоняется конфликтом', () => {
  const p = buildFixture();
  const first = applyTransaction(p, tx(p, [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Раз' } }]));
  assert.throws(() => applyTransaction(first.project, tx(p, [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Два' } }])), RevisionConflictError);
  assert.equal(first.project.nodes.find(n => n.id === 'card-left')!.name, 'Раз', 'первая правка не потеряна');
});

test('чужой projectId отклоняется', () => {
  const p = buildFixture();
  assert.throws(() => applyTransaction(p, tx(p, [], { projectId: 'other' })), /projectId/);
});

test('плохой transactionId отклоняется', () => {
  const p = buildFixture();
  assert.throws(() => applyTransaction(p, tx(p, [], { transactionId: 'x' })), /transactionId/);
});

test('source только manual|agent', () => {
  const p = buildFixture();
  assert.throws(() => applyTransaction(p, tx(p, [], { source: 'robot' as never })), /source/);
});

test('undo/redo: содержимое возвращается, redo сбрасывается новой правкой', () => {
  const p0 = buildFixture();
  let history = emptyHistory();

  const c1 = applyTransaction(p0, tx(p0, [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Правка A' } }], { transactionId: 'tx-hist-0001' }));
  history = pushCommit(history, p0, { description: 'A', source: 'manual', at: 't1' });

  const c2 = applyTransaction(c1.project, tx(c1.project, [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Правка B' } }], { transactionId: 'tx-hist-0002' }));
  history = pushCommit(history, c1.project, { description: 'B', source: 'manual', at: 't2' });
  assert.ok(canUndo(history) && !canRedo(history));

  // undo: вернуться к A
  const u1 = undo(history, c2.project);
  assert.ok(u1);
  let current = structuredClone(u1.restore);
  current.revision = c2.project.revision + 1;
  history = u1.history;
  assert.equal(current.nodes.find(n => n.id === 'card-left')!.name, 'Правка A');
  assert.ok(canRedo(history));

  // redo: снова B
  const r1 = redo(history, current);
  assert.ok(r1);
  current = structuredClone(r1.restore);
  current.revision += 1;
  history = r1.history;
  assert.equal(current.nodes.find(n => n.id === 'card-left')!.name, 'Правка B');
  assert.ok(!canRedo(history));

  // undo, затем новая правка — redo сбрасывается
  const u2 = undo(history, current);
  assert.ok(u2);
  current = structuredClone(u2.restore);
  current.revision += 1;
  history = u2.history;
  assert.ok(canRedo(history));
  const c3 = applyTransaction(current, tx(current, [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Правка C' } }], { transactionId: 'tx-hist-0003' }));
  history = pushCommit(history, current, { description: 'C', source: 'manual', at: 't3' });
  assert.ok(!canRedo(history), 'новая правка после undo сбросила redo');
  assert.equal(c3.project.nodes.find(n => n.id === 'card-left')!.name, 'Правка C');
  assert.ok(c3.revision > current.revision, 'ревизии монотонно растут');
});

test('undo на пустой истории невозможен', () => {
  assert.equal(undo(emptyHistory(), buildFixture()), null);
  assert.equal(redo(emptyHistory(), buildFixture()), null);
});
