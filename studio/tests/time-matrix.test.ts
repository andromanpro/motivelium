// Тесты времени и матриц: границы кадров, pivot-преобразования, инверсия.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validFps, secondsToFrame, frameToSeconds, clampFrame, frameInRange } from '../domain/time.ts';
import { localMatrix, compose, applyMatrix, invert, toLocal, IDENTITY } from '../domain/matrix.ts';

test('fps: валидные и недопустимые значения', () => {
  assert.deepEqual(validFps({ num: 30, den: 1 }), { num: 30, den: 1 });
  assert.deepEqual(validFps({ num: 30000, den: 1001 }), { num: 30000, den: 1001 });
  assert.throws(() => validFps({ num: 0, den: 1 }));
  assert.throws(() => validFps({ num: -30, den: 1 }));
  assert.throws(() => validFps(30));
});

test('секунды ↔ кадры идемпотентны на целом fps', () => {
  const fps = validFps({ num: 30, den: 1 });
  assert.equal(secondsToFrame(3.5, fps), 105);
  assert.equal(frameToSeconds(105, fps), 3.5);
  assert.equal(secondsToFrame(frameToSeconds(217, fps), fps), 217);
});

test('clampFrame держит [0, durationFrames-1]', () => {
  assert.equal(clampFrame(-5, 300), 0);
  assert.equal(clampFrame(999, 300), 299);
  assert.equal(clampFrame(150.7, 300), 150);
});

test('интервалы: from включительно, to исключительно', () => {
  assert.equal(frameInRange(0, 0, 10), true);
  assert.equal(frameInRange(9, 0, 10), true);
  assert.equal(frameInRange(10, 0, 10), false);
});

test('локальная матрица: чистый перенос', () => {
  const m = localMatrix({ x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 });
  const p = applyMatrix(m, 10, 20);
  assert.equal(p.x, 110);
  assert.equal(p.y, 70);
});

test('pivot: вращение вокруг центра объекта', () => {
  // объект 100×100, pivot в центре, поворот 90°: точка (0,0) угла уходит в (100,0) относительно центра
  const m = localMatrix({ x: 0, y: 0, rotation: Math.PI / 2, scaleX: 1, scaleY: 1, pivotX: 50, pivotY: 50 });
  const corner = applyMatrix(m, 0, 0);
  assert.ok(Math.abs(corner.x - 100) < 1e-9, `x=${corner.x}`);
  assert.ok(Math.abs(corner.y - 0) < 1e-9, `y=${corner.y}`);
  const center = applyMatrix(m, 50, 50);
  assert.ok(Math.abs(center.x - 50) < 1e-9 && Math.abs(center.y - 50) < 1e-9, 'центр на месте');
});

test('toLocal инвертирует мировую матрицу', () => {
  const local = localMatrix({ x: 320, y: 240, rotation: 0.3, scaleX: 1.5, scaleY: 0.8, pivotX: 60, pivotY: 40 });
  const world = compose(local, IDENTITY);
  const screen = applyMatrix(world, 123, 45);
  const back = toLocal(world, screen.x, screen.y);
  assert.ok(Math.abs(back.x - 123) < 1e-6 && Math.abs(back.y - 45) < 1e-6);
});

test('compose ассоциативен для цепочки родитель→ребёнок', () => {
  const parent = localMatrix({ x: 500, y: 400, rotation: 0.2, scaleX: 2, scaleY: 2, pivotX: 10, pivotY: 10 });
  const child = localMatrix({ x: 30, y: 40, rotation: Math.PI, scaleX: 1, scaleY: 1, pivotX: 5, pivotY: 5 });
  const direct = applyMatrix(compose(parent, child), 7, 9);
  const viaPoint = applyMatrix(parent, applyMatrix(child, 7, 9).x, applyMatrix(child, 7, 9).y);
  assert.ok(Math.abs(direct.x - viaPoint.x) < 1e-9 && Math.abs(direct.y - viaPoint.y) < 1e-9);
});

test('invert вырожденной матрицы даёт понятную ошибку', () => {
  assert.throws(() => invert({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }), /Вырожденная/);
});
