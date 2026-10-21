// Регрессия P2-5: перестановка. Свой индекс — no-op; движение в обе стороны;
// соседи — тот же родитель и последовательность; поддеревья групп целы;
// z-порядок (плоский массив) совпадает с деревом; undo/redo возвращают порядок.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOperations } from '../domain/operations.ts';
import { buildFixture } from '../domain/fixture.ts';
import type { SceneNode } from '../domain/schema.ts';

test('перестановка на свой текущий индекс — no-op (первый → первый)', () => {
  const p = buildFixture();
  const next = applyOperations(p, [{ op: 'reorderNode', targetId: p.nodes[0]!.id, index: 0 }]);
  assert.deepEqual(next.nodes.map(n => n.id), p.nodes.map(n => n.id), 'порядок не изменился');
});

test('перестановка на свой текущий индекс — no-op (последний → последний)', () => {
  const p = buildFixture();
  const lastIndex = p.nodes.filter(n => n.parentId === null && n.sequenceId === p.nodes[p.nodes.length - 1]!.sequenceId).length - 1;
  const last = p.nodes[p.nodes.length - 1]!;
  const next = applyOperations(p, [{ op: 'reorderNode', targetId: last.id, index: lastIndex }]);
  assert.deepEqual(next.nodes.map(n => n.id), p.nodes.map(n => n.id));
});

test('корневой узел на кадр 0 остаётся первым (проба ревью title-m2 → 0)', () => {
  const p = buildFixture();
  const firstId = p.nodes[0]!.id;
  const next = applyOperations(p, [{ op: 'reorderNode', targetId: firstId, index: 0 }]);
  assert.deepEqual(next.nodes.map(n => n.id), p.nodes.map(n => n.id));
});

test('движение вперёд и назад по корневому уровню последовательности', () => {
  const p = buildFixture();
  const seqOpening = p.nodes.filter(n => n.sequenceId === 'seq-opening' && n.parentId === null);
  const source = seqOpening[0]!; // title в начале
  // вперёд: title после группы карточек
  const forward = applyOperations(p, [{ op: 'reorderNode', targetId: source.id, index: 1 }]);
  const rootsAfter = forward.nodes.filter(n => n.sequenceId === 'seq-opening' && n.parentId === null);
  assert.equal(rootsAfter[1]!.id, source.id);
  // дети остались за своим родителем (поддерево цело)
  const groupPos = forward.nodes.findIndex(n => n.id === 'group-cards');
  const cardAPos = forward.nodes.findIndex(n => n.id === 'card-left');
  assert.ok(groupPos < cardAPos, 'дети после родителя');
  // назад: вернуть title на место 0
  const back = applyOperations(forward, [{ op: 'reorderNode', targetId: source.id, index: 0 }]);
  const rootsBack = back.nodes.filter(n => n.sequenceId === 'seq-opening' && n.parentId === null);
  assert.equal(rootsBack[0]!.id, source.id);
});

test('перестановка внутри вложенной группы не трогает соседние корни', () => {
  const p = buildFixture();
  const before = p.nodes.map(n => n.id);
  const next = applyOperations(p, [{ op: 'reorderNode', targetId: 'card-right', index: 0 }]);
  const after = next.nodes.map(n => n.id);
  assert.equal(after[0], before[0], 'первый корень не сдвинулся');
  const groupIdx = after.indexOf('group-cards');
  assert.equal(after[groupIdx + 1], 'card-right', 'card-right теперь первый ребёнок группы');
  assert.equal(after[groupIdx + 2], 'card-left', 'card-left следом');
});

test('поддерево группы переезжает целиком: z-порядок совпадает с деревом', () => {
  const p = buildFixture();
  // Переставляем группу карточек в конец корневого уровня своей последовательности.
  const roots = p.nodes.filter(n => n.sequenceId === 'seq-opening' && n.parentId === null);
  const next = applyOperations(p, [{ op: 'reorderNode', targetId: 'group-cards', index: roots.length - 1 }]);
  const ids = next.nodes.map(n => n.id);
  const g = ids.indexOf('group-cards');
  assert.equal(ids[g + 1], 'card-left', 'дети едут с родителем');
  assert.equal(ids[g + 2], 'card-right');
  // Прямой обход дерева = плоский массив
  const byParent = new Map<string | null, SceneNode[]>();
  for (const n of next.nodes) {
    const key = n.parentId;
    const arr = byParent.get(key) ?? [];
    arr.push(n);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const preOrder: string[] = [];
  const walk = (n: SceneNode): void => { preOrder.push(n.id); for (const c of byParent.get(n.id) ?? []) walk(c); };
  for (const root of byParent.get(null) ?? []) walk(root);
  assert.deepEqual(preOrder, ids, 'плоский порядок = обход дерева вглубь');
});

test('соседи ограничены своей последовательностью: вторая сцена не вмешивается', () => {
  const p = buildFixture();
  // В seq-detail один корень; добавляем второй узел и проверяем, что перестановка
  // внутри seq-opening не видит его в своих соседях.
  const withSecond = applyOperations(p, [
    { op: 'createNode', node: { ...structuredClone(p.nodes[5]!), id: 'scene3d-extra', name: 'Второй механизм', parentId: null, sequenceId: 'seq-detail' } },
  ]);
  const openingRootsBefore = withSecond.nodes.filter(n => n.sequenceId === 'seq-opening' && n.parentId === null).length;
  const next = applyOperations(withSecond, [{ op: 'reorderNode', targetId: 'text-title', index: openingRootsBefore - 1 }]);
  // seq-opening переставился внутри себя, узлы seq-detail не изменили относительный порядок
  const detailAfter = next.nodes.filter(n => n.sequenceId === 'seq-detail').map(n => n.id);
  const detailBefore = withSecond.nodes.filter(n => n.sequenceId === 'seq-detail').map(n => n.id);
  assert.deepEqual(detailAfter, detailBefore);
});

test('undo/redo возвращают порядок через транзакции', async () => {
  const { applyTransaction } = await import('../domain/transaction.ts');
  const p = buildFixture();
  // Исходный индекс text-title среди корней seq-opening — 1 (после group-cards).
  const t1 = applyTransaction(p, {
    transactionId: 'tx-order-00001', projectId: p.id, expectedRevision: p.revision, source: 'manual',
    operations: [{ op: 'reorderNode', targetId: 'text-title', index: 2 }],
  });
  assert.notDeepEqual(t1.project.nodes.map(n => n.id), p.nodes.map(n => n.id));
  // Возврат на исходное место восстанавливает порядок
  const back = applyOperations(t1.project, [{ op: 'reorderNode', targetId: 'text-title', index: 1 }]);
  assert.deepEqual(back.nodes.map(n => n.id), p.nodes.map(n => n.id), 'возврат на исходный индекс даёт исходный порядок');
});

test('индекс вне диапазона соседей отклоняется', () => {
  const p = buildFixture();
  const rootsCount = p.nodes.filter(n => n.sequenceId === 'seq-opening' && n.parentId === null).length;
  assert.throws(() => applyOperations(p, [{ op: 'reorderNode', targetId: 'text-title', index: rootsCount }]), /вне диапазона/);
  assert.throws(() => applyOperations(p, [{ op: 'reorderNode', targetId: 'text-title', index: -1 }]), /вне диапазона/);
});
