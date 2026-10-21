// Тесты расчёта кадра: детерминизм, камера, вложенные группы, эффекты, выбор.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFrame, cameraAtFrame, cameraMatrix } from '../render/evaluate.ts';
import { hitTest } from '../render/hitTest.ts';
import { buildDemo } from '../domain/demo.ts';
import { applyOperations } from '../domain/operations.ts';
import { REGISTRY } from '../effects/registry.ts';
import type { Project } from '../domain/schema.ts';

const demo: Project = buildDemo({ sha256: 'a'.repeat(64), bytes: 1, width: 4, height: 4 });

test('демо-проект валидно и содержит требуемый состав M2', () => {
  // валидация через попытку применить пустую правку невозможна; проверяем структуру напрямую
  assert.equal(demo.durationFrames, 300);
  assert.equal(demo.sequences.length, 2);
  const kinds = demo.nodes.map(n => n.kind).sort();
  assert.deepEqual(kinds, ['group', 'image', 'scene3d', 'shape', 'shape', 'text', 'text']);
  assert.equal(demo.nodes.find(n => n.id === 'card-a')!.parentId, 'cards-m2', 'вложенная группа');
  assert.equal(demo.effects.length, 2, 'два настоящих эффекта');
  for (const e of demo.effects) assert.ok(REGISTRY.has(e.definitionId), 'эффект есть в реестре');
});

test('детерминизм: тот же кадр → то же состояние, без истории проигрывания', () => {
  const a = evaluateFrame(demo, 42);
  const b = evaluateFrame(demo, 42);
  assert.deepEqual(a, b);
  // «Проигрывание» до 42 не влияет
  for (let f = 0; f < 42; f++) evaluateFrame(demo, f);
  const c = evaluateFrame(demo, 42);
  assert.deepEqual(a, c);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(c)));
});

test('обратный seek 0 → 150 → 30 → 150 даёт одинаковые состояния', () => {
  const s150a = evaluateFrame(demo, 150);
  evaluateFrame(demo, 30);
  const s150b = evaluateFrame(demo, 150);
  assert.deepEqual(s150a, s150b);
  const s0 = evaluateFrame(demo, 0);
  const s0again = evaluateFrame(demo, 0);
  assert.deepEqual(s0, s0again);
});

test('последовательности переключаются по кадру; скрытые узлы не попадают в items', () => {
  const opening = evaluateFrame(demo, 100);
  assert.equal(opening.sequence?.id, 'seq-opening');
  assert.ok(opening.items.some(i => i.node.id === 'card-a'));
  assert.ok(!opening.items.some(i => i.node.id === 'mech-m2'));
  assert.ok(opening.hiddenNodeIds.includes('mech-m2'));

  const detail = evaluateFrame(demo, 200);
  assert.equal(detail.sequence?.id, 'seq-detail');
  assert.ok(detail.items.some(i => i.node.id === 'mech-m2'));
  assert.ok(detail.hiddenNodeIds.includes('card-a'));
});

test('камера: интерполяция ключей и матрица центра при zoom=1 — тождественна', () => {
  const cam = cameraAtFrame(demo.cameraTracks[0]!.keys, 110);
  assert.ok(cam.zoom > 1 && cam.zoom < 1.12, 'между ключами 1 и 1.12');
  const centerCam = { cx: 960, cy: 540, zoom: 1, rotation: 0 };
  const m = cameraMatrix(centerCam, { width: 1920, height: 1080 });
  // точка (960,540) остаётся в центре экрана
  const pt = { x: m.a * 960 + m.c * 540 + m.e, y: m.b * 960 + m.d * 540 + m.f };
  assert.ok(Math.abs(pt.x - 960) < 1e-9 && Math.abs(pt.y - 540) < 1e-9);
});

test('zoom камеры приближает объект: расстояние до центра растёт в 1.12 раза', () => {
  // кадр 0: zoom=1, кадр 75: zoom=1.12, cx/cy=960/540 в обоих случаях
  const f0 = evaluateFrame(demo, 0);
  const f75 = evaluateFrame(demo, 75);
  const item0 = f0.items.find(i => i.node.id === 'card-a')!;
  const item75 = f75.items.find(i => i.node.id === 'card-a')!;
  const pt = (it: typeof item0) => {
    const s = it.screen;
    return { x: s.a * 150 + s.c * 90 + s.e, y: s.b * 150 + s.d * 90 + s.f };
  };
  const p0 = pt(item0), p75 = pt(item75);
  const d0 = Math.hypot(p0.x - 960, p0.y - 540);
  const d75 = Math.hypot(p75.x - 960, p75.y - 540);
  assert.ok(Math.abs(d75 / d0 - 1.12) < 1e-6, `отношение расстояний ${String((d75 / d0).toFixed(6))} вместо 1.12`);
});

test('эффект reveal-deal сдвигает карточку Б в начале и возвращает к месту в конце', () => {
  const early = evaluateFrame(demo, 1);
  const late = evaluateFrame(demo, 60);
  const earlyItem = early.items.find(i => i.node.id === 'card-b')!;
  const lateItem = late.items.find(i => i.node.id === 'card-b')!;
  assert.ok(Math.abs(earlyItem.deltas.x) > 100, `дельта x на старте (${earlyItem.deltas.x.toFixed(0)} px)`);
  assert.ok(earlyItem.opacity < 1, 'проявление в начале');
  assert.deepEqual(lateItem.deltas, { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, blur: 0, reveal: 1, glow: 0 }, 'после эффекта дельты нейтральны');
});

test('hitTest: вложенная карточка выбирается после движения камеры', () => {
  // Кадр 100: камера zoom≈1.09 между ключами; карточка А — левая нижняя в группе.
  const state = evaluateFrame(demo, 100);
  const item = state.items.find(i => i.node.id === 'card-a')!;
  const s = item.screen;
  const local = { x: 150, y: 90 }; // центр карточки А
  const screen = { x: s.a * local.x + s.c * local.y + s.e, y: s.b * local.x + s.d * local.y + s.f };
  const picked = hitTest(state, screen.x, screen.y);
  assert.ok(picked, 'клик в центр карточки А попадает');
  assert.equal(picked!.nodeId, 'card-a', 'выбрана именно карточка А, не сосед и не группа');
});

test('hitTest: сосед не перехватывает клик', () => {
  const state = evaluateFrame(demo, 100);
  const itemB = state.items.find(i => i.node.id === 'card-b')!;
  const s = itemB.screen;
  const screen = { x: s.a * 150 + s.c * 90 + s.e, y: s.b * 150 + s.d * 90 + s.f };
  const picked = hitTest(state, screen.x, screen.y);
  assert.equal(picked?.nodeId, 'card-b');
});

test('hitTest учитывает эффектовый сдвиг: карточка Б выбирается там, где видна', () => {
  const early = evaluateFrame(demo, 2); // card-b ещё «летит» из стопки
  const itemB = early.items.find(i => i.node.id === 'card-b')!;
  assert.ok(Math.abs(itemB.deltas.x) > 100, 'эффект активен');
  const s = itemB.screen;
  const screen = { x: s.a * 150 + s.c * 90 + s.e, y: s.b * 150 + s.d * 90 + s.f };
  const picked = hitTest(early, screen.x, screen.y);
  // В точке геометрического центра отрисованному (сдвинутому) объекту — выбирается он
  assert.equal(picked?.nodeId, 'card-b', 'матрица выбора включает дельты эффекта');
});

test('эффект на группе двигает детей согласованными матрицами', () => {
  // Применим soft-lift к группе и проверим, что обе карточки сместились одинаково.
  const withGroupLift = applyOperations(demo, [
    { op: 'addEffect', effect: { id: 'fx-lift-group', definitionId: 'soft-lift', definitionVersion: 1, targetId: 'cards-m2', fromFrame: 0, toFrame: 60, params: { height: 120 }, enabled: true, order: 2 } },
  ]);
  const frame20 = evaluateFrame(withGroupLift, 20);
  const a = frame20.items.find(i => i.node.id === 'card-a')!;
  const b = frame20.items.find(i => i.node.id === 'card-b')!;
  const liftA = a.screen.f - evaluateFrame(demo, 20).items.find(i => i.node.id === 'card-a')!.screen.f;
  const liftB = b.screen.f - evaluateFrame(demo, 20).items.find(i => i.node.id === 'card-b')!.screen.f;
  // soft-lift содержит масштаб группы: дети смещаются согласованно (вверх),
  // небольшая разница допустима из-за масштабирования смещения card-b от pivot.
  assert.ok(liftA < -5 && liftB < -5, `оба ребёнка подняты (A ${liftA.toFixed(1)}, B ${liftB.toFixed(1)})`);
  assert.ok(Math.abs(liftA - liftB) < 8, `подъём согласован (Δ ${String((liftA - liftB).toFixed(2))} px)`);
  // локальные свойства детей не переписаны
  assert.equal(a.node.transform.x, 0);
  assert.equal(a.node.transform.y, 0);
});

test('невидимый узел не выбирается', () => {
  const hidden = applyOperations(demo, [{ op: 'updateNode', targetId: 'card-a', values: { visible: false } }]);
  const state = evaluateFrame(hidden, 100);
  assert.ok(!state.items.some(i => i.node.id === 'card-a'));
  assert.equal(hitTest(state, 361, 491), null, 'клик в место скрытой карточки не выбирает её');
});

test('конец без повтора: последний допустимый кадр считается корректно', () => {
  const last = evaluateFrame(demo, 299);
  assert.equal(last.frame, 299);
  const clamped = evaluateFrame(demo, 99999);
  assert.equal(clamped.frame, 299, 'выход за duration зажимается последним кадром');
});
