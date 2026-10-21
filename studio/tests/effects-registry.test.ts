// Регрессия P2-4 (эффекты): соответствие реестру проверяется единым контрактом
// при загрузке проекта и в операциях addEffect/updateEffect. Неизвестный эффект
// не принимается и не пропускается молча.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProject, ValidationError } from '../domain/schema.ts';
import { applyOperations } from '../domain/operations.ts';
import { buildFixture } from '../domain/fixture.ts';
import { REGISTRY, revealDeal } from '../effects/registry.ts';

function effect(over: Record<string, unknown> = {}) {
  return {
    id: 'fx-check-0001', definitionId: 'reveal-deal', definitionVersion: 1, targetId: 'card-left',
    fromFrame: 0, toFrame: 30, params: { distance: 100, angle: -5 }, enabled: true, order: 1, ...over,
  };
}

test('эффект с корректными параметрами проходит валидацию', () => {
  const p = buildFixture();
  p.effects.push(effect());
  validateProject(p);
});

test('неизвестный definitionId отклоняется при загрузке и в addEffect', () => {
  const p = buildFixture();
  p.effects.push(effect({ definitionId: 'does-not-exist' }));
  assert.throws(() => validateProject(p), (e: unknown) => e instanceof ValidationError && e.details.some(d => d.includes('неизвестный эффект реестра')));
  assert.throws(() => applyOperations(buildFixture(), [
    { op: 'addEffect', effect: effect({ id: 'fx-new-000001', definitionId: 'ghost-fx' }) },
  ]), /неизвестный эффект реестра|Ghost/);
});

test('неподдерживаемая версия определения отклоняется', () => {
  const p = buildFixture();
  p.effects.push(effect({ definitionVersion: 99 }));
  assert.throws(() => validateProject(p), (e: unknown) => e instanceof ValidationError && e.details.some(d => d.includes('реестр поддерживает 1')));
});

test('несовместимый тип цели отклоняется', () => {
  // scene3d не входит в targets эффекта reveal-deal
  const p = buildFixture();
  p.effects.push(effect({ targetId: 'scene3d-block' }));
  assert.throws(() => validateProject(p), (e: unknown) => e instanceof ValidationError && e.details.some(d => d.includes('тип цели scene3d не поддерживается')));
});

test('параметры: неизвестное имя, вне диапазона, неверный тип, не-число отклоняются', () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ['неизвестный параметр', { nope: 1 }, /параметра нет у эффекта/],
    ['вне диапазона', { distance: 99999 }, /вне \[0, 600\]/],
    ['неверный тип', { distance: 'близко' }, /ожидается конечное число/],
    ['NaN', { distance: Number.NaN }, /ожидается конечное число/],
    ['angle вне диапазона', { angle: 90 }, /вне \[-30, 30\]/],
  ];
  for (const [name, params, re] of cases) {
    const p = buildFixture();
    p.effects.push(effect({ params: { distance: 100, angle: -5, ...(params as Record<string, unknown>) } }));
    assert.throws(() => validateProject(p), re, name);
  }
});

test('updateEffect с поломкой параметров тоже отклоняется пакетно', () => {
  const base = applyOperations(buildFixture(), [{ op: 'addEffect', effect: effect({ id: 'fx-live-00001' }) }]);
  assert.throws(() => applyOperations(base, [
    { op: 'updateEffect', targetId: 'fx-live-00001', values: { params: { distance: 'далеко' } } },
  ]), /ожидается конечное число/);
});

test('реестр доступен без DOM: определение содержит схему параметров', () => {
  const def = REGISTRY.get(revealDeal.id)!;
  assert.equal(def.targets.includes('shape'), true);
  assert.ok(def.params.every(p => typeof p.name === 'string' && (p.type === 'number' || p.type === 'boolean' || p.type === 'string')));
});
