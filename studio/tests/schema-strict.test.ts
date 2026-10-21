// Регрессия P2-4: строгая проверка обязательных массивов — отсутствие поля,
// неверный тип, элементы-примитивы дают ValidationError с путём, не TypeError.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProject, ValidationError } from '../domain/schema.ts';
import { buildFixture } from '../domain/fixture.ts';

const REQUIRED_ARRAYS = ['assets', 'sequences', 'nodes', 'effects', 'cameraTracks', 'audioTracks', 'cues'] as const;

test('отсутствие каждого обязательного массива даёт ValidationError с точным путём', () => {
  for (const field of REQUIRED_ARRAYS) {
    const p = buildFixture() as unknown as Record<string, unknown>;
    delete p[field];
    try {
      validateProject(p);
      assert.fail(`ожидалась ошибка для отсутствующего ${field}`);
    } catch (e) {
      assert.ok(e instanceof ValidationError, `${field}: ValidationError, а не ${e instanceof TypeError ? 'TypeError' : String(e)}`);
      assert.ok(e.details.some(d => d.includes(`project.${field}: обязательное поле-массив`)), `${field}: путь в деталях (${e.details.join('|')})`);
    }
  }
});

test('неверные типы коллекций отклоняются: null, строка, объект', () => {
  for (const field of REQUIRED_ARRAYS) {
    for (const bad of [null, 'nope', { a: 1 }]) {
      const p = buildFixture() as unknown as Record<string, unknown>;
      p[field] = bad;
      assert.throws(() => validateProject(p), ValidationError, `${field} = ${String(bad)}`);
    }
  }
});

test('элементы-примитивы/null внутри коллекций дают понятную ошибку с индексом', () => {
  for (const field of REQUIRED_ARRAYS) {
    for (const bad of [null, 42]) {
      const p = buildFixture() as unknown as Record<string, unknown>;
      (p[field] as unknown[]).push(bad);
      try {
        validateProject(p);
        assert.fail(`ожидалась ошибка для ${field} с элементом ${String(bad)}`);
      } catch (e) {
        assert.ok(e instanceof ValidationError);
        assert.ok(e.details.some(d => d.includes(`project.${field}[`)), `${field}: индекс в пути`);
      }
    }
  }
});

test('keys дорожки камеры — тоже массив объектов', () => {
  const p = buildFixture();
  (p.cameraTracks[0] as unknown as { keys: unknown }).keys = 'not-array';
  assert.throws(() => validateProject(p), ValidationError);
  const q = buildFixture();
  (q.cameraTracks[0] as unknown as { keys: unknown[] }).keys = [null];
  assert.throws(() => validateProject(q), ValidationError);
});

test('пустые разрешённые массивы проходят, отсутствующее поле — нет', () => {
  const p = buildFixture();
  p.effects = [];
  p.cues = [];
  validateProject(p); // пустой массив — валиден
  const q = buildFixture() as unknown as Record<string, unknown>;
  delete q.effects;
  assert.throws(() => validateProject(q), ValidationError);
});
