// Тесты операций: атомарность пакета, разрешённые поля, циклы reparent, ключи камеры.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOperations } from '../domain/operations.ts';
import { buildFixture } from '../domain/fixture.ts';

test('пакет применяется целиком: createNode + updateNode', () => {
  const p = buildFixture();
  const next = applyOperations(p, [
    { op: 'createNode', node: { ...structuredClone(p.nodes[1]!), id: 'card-extra', name: 'Лишняя карточка', parentId: 'group-cards' } },
    { op: 'updateNode', targetId: 'card-extra', values: { name: 'Третья карточка' } },
  ]);
  assert.equal(next.nodes.find(n => n.id === 'card-extra')?.name, 'Третья карточка');
  assert.equal(p.nodes.length, 6, 'исходник не меняется');
  assert.equal(next.nodes.length, 7);
});

test('некорректная вторая операция не применяет первую (атомарность)', () => {
  const p = buildFixture();
  const before = structuredClone(p);
  assert.throws(() => applyOperations(p, [
    { op: 'updateNode', targetId: 'card-left', values: { name: 'Изменённая' } },
    { op: 'updateNode', targetId: 'no-such-target', values: { name: 'Сломает пакет' } },
  ]), /объект не найден/);
  assert.deepEqual(p, before, 'проект остался нетронутым');
});

test('updateNode с неразрешённым свойством отклоняется', () => {
  const p = buildFixture();
  assert.throws(() => applyOperations(p, [
    { op: 'updateNode', targetId: 'card-left', values: { id: 'hacked-id' } as never },
  ]), /не разрешено/);
  assert.throws(() => applyOperations(p, [
    { op: 'updateNode', targetId: 'card-left', values: { sequenceId: 'seq-detail' } as never },
  ]), /не разрешено/);
});

test('неизвестная операция отклоняется', () => {
  assert.throws(() => applyOperations(buildFixture(), [{ op: 'explodeEverything' } as never]), /неизвестная операция/);
});

test('пустой пакет отклоняется', () => {
  assert.throws(() => applyOperations(buildFixture(), []), /пустой пакет/);
});

test('reparent образует цикл — отклоняется, дерево цело', () => {
  const p = buildFixture();
  const outer: typeof p.nodes[number] = {
    id: 'group-outer', name: 'Внешняя группа', kind: 'group', parentId: null, sequenceId: 'seq-opening',
    transform: structuredClone(p.nodes[0]!.transform), geometry: { width: 800, height: 500 }, visible: true, locked: false,
  };
  assert.throws(() => applyOperations(p, [
    { op: 'createNode', node: outer },
    { op: 'reparentNode', targetId: 'group-cards', parentId: 'group-outer' },
    { op: 'reparentNode', targetId: 'group-outer', parentId: 'group-cards' }, // цикл: outer → cards → outer
  ]), /цикл/);
  assert.equal(p.nodes[0]!.parentId, null, 'исходное дерево не изменилось');
});

test('reparent в группу другой последовательности отклоняется', () => {
  const p = buildFixture();
  const outer: typeof p.nodes[number] = {
    id: 'group-detail', name: 'Группа деталей', kind: 'group', parentId: null, sequenceId: 'seq-detail',
    transform: structuredClone(p.nodes[0]!.transform), geometry: { width: 800, height: 500 }, visible: true, locked: false,
  };
  assert.throws(() => applyOperations(p, [
    { op: 'createNode', node: outer },
    { op: 'reparentNode', targetId: 'card-left', parentId: 'group-detail' },
  ]), /последовательность/);
});

test('reparent в группу работает', () => {
  const next = applyOperations(buildFixture(), [
    { op: 'reparentNode', targetId: 'text-title', parentId: 'group-cards' },
  ]);
  assert.equal(next.nodes.find(n => n.id === 'text-title')!.parentId, 'group-cards');
});

test('deleteNode без recursive при наличии детей отклоняется; с recursive удаляет поддерево и его эффекты', () => {
  const base = applyOperations(buildFixture(), [
    { op: 'addEffect', effect: { id: 'fx-card', definitionId: 'reveal-deal', definitionVersion: 1, targetId: 'card-right', fromFrame: 0, toFrame: 30, params: {}, enabled: true, order: 1 } },
  ]);
  assert.throws(() => applyOperations(base, [{ op: 'deleteNode', targetId: 'group-cards' }]), /recursive/);
  const next = applyOperations(base, [{ op: 'deleteNode', targetId: 'group-cards', recursive: true }]);
  assert.equal(next.nodes.some(n => n.id === 'card-left'), false);
  assert.equal(next.nodes.some(n => n.id === 'card-right'), false);
  assert.equal(next.effects.some(e => e.id === 'fx-card'), false, 'эффекты удалённого поддерева убраны');
});

test('setCameraKey обновляет существующий кадр и вставляет новый по порядку', () => {
  const next = applyOperations(buildFixture(), [
    { op: 'setCameraKey', trackId: 'cam-main', key: { frame: 0, cx: 100, cy: 200, zoom: 1, rotation: 0 } },
    { op: 'setCameraKey', trackId: 'cam-main', key: { frame: 90, cx: 960, cy: 540, zoom: 1.2, rotation: 0 } },
  ]);
  const keys = next.cameraTracks[0]!.keys;
  assert.equal(keys.length, 4);
  assert.deepEqual(keys.map(k => k.frame), [0, 90, 180, 329]);
  assert.equal(keys[0]!.cx, 100);
});

test('removeAsset с используемым ассетом отклоняется', () => {
  assert.throws(() => applyOperations(buildFixture(), [
    { op: 'removeAsset', targetId: 'asset-card-photo' },
  ]), /используется/);
});

test('deleteSequence с узлами отклоняется', () => {
  assert.throws(() => applyOperations(buildFixture(), [
    { op: 'deleteSequence', targetId: 'seq-opening' },
  ]), /есть узлы/);
});

test('updateProjectMeta может менять длительность, но не в ущерб валидности', () => {
  assert.throws(() => applyOperations(buildFixture(), [
    { op: 'updateProjectMeta', values: { durationFrames: 100 } },
  ]), /fromFrame < toFrame/);
  const ok = applyOperations(buildFixture(), [
    { op: 'updateProjectMeta', values: { durationFrames: 400, title: 'Длиннее' } },
  ]);
  assert.equal(ok.durationFrames, 400);
});

test('создание узла с дублирующимся id отклоняется', () => {
  const p = buildFixture();
  assert.throws(() => applyOperations(p, [
    { op: 'createNode', node: { ...structuredClone(p.nodes[1]!), id: 'card-left' } },
  ]), /уже занят/);
});
