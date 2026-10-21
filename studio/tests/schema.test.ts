// Тесты схемы Project v2: строгая валидация, дубли ID, циклы, диапазоны.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProject, ValidationError } from '../domain/schema.ts';
import { buildFixture } from '../domain/fixture.ts';

function expectInvalid(project: unknown, fragment: string): void {
  try {
    validateProject(project);
    assert.fail(`ожидалась ошибка валидации с «${fragment}»`);
  } catch (e) {
    assert.ok(e instanceof ValidationError, 'должна быть ValidationError');
    assert.ok(e.details.some(d => d.includes(fragment)), `детали должны содержать «${fragment}», есть: ${e.details.join(' | ')}`);
  }
}

test('fixture M1 проходит полную валидацию', () => {
  const p = validateProject(buildFixture());
  assert.equal(p.nodes.length, 6);
  assert.equal(p.sequences.length, 2);
});

test('schemaVersion новее текущей отклоняется с понятной ошибкой', () => {
  const p = buildFixture() as unknown as Record<string, unknown>;
  p.schemaVersion = 3;
  expectInvalid(p, 'schemaVersion');
});

test('неизвестное поле верхнего уровня отклоняется', () => {
  const p = buildFixture() as unknown as Record<string, unknown>;
  p.surprise = true;
  expectInvalid(p, 'неизвестное поле "surprise"');
});

test('неизвестное поле узла отклоняется', () => {
  const p = buildFixture();
  (p.nodes[0] as unknown as Record<string, unknown>).mystery = 1;
  expectInvalid(p, 'неизвестное поле "mystery"');
});

test('дубль id узла отклоняется', () => {
  const p = buildFixture();
  const clone = structuredClone(p.nodes[1]!);
  clone.id = p.nodes[0]!.id;
  p.nodes.push(clone);
  expectInvalid(p, 'дубль id');
});

test('дубль id между узлом и последовательностью отклоняется', () => {
  const p = buildFixture();
  p.nodes[0]!.id = 'seq-opening';
  expectInvalid(p, 'дубль id "seq-opening"');
});

test('цикл вложенности отклоняется', () => {
  const p = buildFixture();
  p.nodes[0]!.parentId = 'card-left'; // группа становится ребёнком своей карточки
  expectInvalid(p, 'цикл вложенности');
});

test('узел-родитель не группа отклоняется', () => {
  const p = buildFixture();
  p.nodes[3]!.parentId = 'text-title';
  expectInvalid(p, 'не является группой');
});

test('интервал последовательности с toFrame <= fromFrame отклоняется', () => {
  const p = buildFixture();
  p.sequences[0]!.toFrame = 0;
  expectInvalid(p, 'fromFrame < toFrame');
});

test('интервал за пределами durationFrames отклоняется', () => {
  const p = buildFixture();
  p.sequences[1]!.toFrame = 999;
  expectInvalid(p, 'fromFrame < toFrame');
});

test('эффект с несуществующей целью отклоняется', () => {
  const p = buildFixture();
  p.effects.push({
    id: 'effect-x', definitionId: 'reveal-deal', definitionVersion: 1, targetId: 'no-such-node',
    fromFrame: 0, toFrame: 30, params: {}, enabled: true, order: 1,
  });
  expectInvalid(p, 'объект не найден');
});

test('цвет не в формате #rrggbb отклоняется', () => {
  const p = buildFixture();
  p.nodes[1]!.kind === 'shape' && ((p.nodes[1] as { fill?: string }).fill = 'red');
  expectInvalid(p, '#rrggbb');
});

test('opacity вне [0,1] отклоняется', () => {
  const p = buildFixture();
  p.nodes[0]!.transform.opacity = 1.5;
  expectInvalid(p, 'opacity');
});

test('изображение с несуществующим ассетом отклоняется', () => {
  const p = buildFixture();
  (p.nodes[4] as { assetId?: string }).assetId = 'asset-missing';
  expectInvalid(p, 'ассет не найден');
});
