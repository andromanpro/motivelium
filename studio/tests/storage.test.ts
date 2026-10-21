// Тесты хранилища: уникальные id при создании, идемпотентность, конкуренция,
// undo/redo с контрактом {transactionId, expectedRevision}, reload с диска.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createStore, StoreError } from '../../server/storage.ts';

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motivelium-store-'));
  return { store: createStore(dir), dir };
}

function tx(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transactionId: 'tx-store-0001',
    projectId: 'PLACEHOLDER',
    expectedRevision: 1,
    source: 'manual',
    description: 'тест хранения',
    operations: [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Из хранилища' } }],
    ...over,
  };
}

test('создание fixture и коммит: подтверждённая ревизия растёт, зеркало на диске совпадает', async () => {
  const { store, dir } = tempStore();
  const created = await store.create({ fixture: true });
  const id = created.project.id;
  assert.match(id, /^m1-fixture-/);
  assert.equal(created.project.revision, 1);
  const out = await store.commit(id, tx({ projectId: id }));
  assert.equal(out.duplicate, false);
  assert.equal(out.response.revision, 2);
  const got = await store.get(id);
  assert.equal(got.project.revision, 2);
  const mirror = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', id, 'project.json'), 'utf8'));
  assert.equal(mirror.revision, 2, 'зеркало project.json соответствует подтверждённому состоянию');
});

test('повтор transactionId не дублирует правку и возвращает прежний результат', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  const first = await store.commit(project.id, tx({ projectId: project.id }));
  const second = await store.commit(project.id, tx({ projectId: project.id }));
  assert.equal(second.duplicate, true);
  assert.equal(second.response.revision, first.response.revision);
  const got = await store.get(project.id);
  assert.equal(got.project.revision, 2, 'ревизия не сдвинулась дважды');
});

test('тот же transactionId с другим телом — конфликт, тихой подмены нет', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  await store.commit(project.id, tx({ projectId: project.id }));
  await assert.rejects(
    () => store.commit(project.id, tx({ projectId: project.id, description: 'другой запрос' })),
    (e: unknown) => e instanceof StoreError && e.status === 409 && /уже использован/.test(e.message),
  );
});

test('некорректный пакет не создаёт ревизию; подтверждённое состояние прежнее', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  await assert.rejects(
    () => store.commit(project.id, tx({
      projectId: project.id,
      operations: [
        { op: 'updateNode', targetId: 'card-left', values: { name: 'Успеет' } },
        { op: 'updateNode', targetId: 'ghost', values: { name: 'Сломается' } },
      ],
    })),
    (e: unknown) => e instanceof StoreError && e.status === 400,
  );
  const got = await store.get(project.id);
  assert.equal(got.project.revision, 1, 'частичной записи нет');
});

test('конкурентные правки: одна применяется, вторая получает конфликт', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  const results = await Promise.allSettled([
    store.commit(project.id, tx({ projectId: project.id, transactionId: 'tx-race-0001' })),
    store.commit(project.id, tx({ projectId: project.id, transactionId: 'tx-race-0002', operations: [{ op: 'updateNode', targetId: 'card-right', values: { name: 'Вторая' } }] })),
  ]);
  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const reason = (rejected[0] as PromiseRejectedResult).reason as StoreError;
  assert.equal(reason.status, 409);
  const got = await store.get(project.id);
  assert.equal(got.project.revision, 2);
});

test('undo с контрактом: ревизия растёт, содержимое возвращается; переживает reload', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  await store.commit(project.id, tx({ projectId: project.id }));
  const undone = await store.undo(project.id, { transactionId: 'undo-00000001', expectedRevision: 2 });
  assert.equal(undone.response.project.revision, 3, 'ревизия растёт даже при undo');
  assert.equal(undone.response.project.nodes.find(n => n.id === 'card-left')!.name, 'Карточка слева');

  store._dropCache(); // имитация перезапуска
  const after = await store.get(project.id);
  assert.equal(after.project.revision, 3);
  assert.equal(after.canRedo, true);
  const redone = await store.redo(project.id, { transactionId: 'redo-00000001', expectedRevision: 3 });
  assert.equal(redone.response.project.revision, 4);
  assert.equal(redone.response.project.nodes.find(n => n.id === 'card-left')!.name, 'Из хранилища');
});

test('undo с устаревшей ревизией отклоняется, история не двигается', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  await store.commit(project.id, tx({ projectId: project.id }));
  await store.commit(project.id, tx({ projectId: project.id, transactionId: 'tx-store-0002', expectedRevision: 2, operations: [{ op: 'updateProjectMeta', values: { title: 'Третья' } }] }));
  await assert.rejects(
    () => store.undo(project.id, { transactionId: 'undo-stale-01', expectedRevision: 2 }),
    (e: unknown) => e instanceof StoreError && e.status === 409,
  );
  const got = await store.get(project.id);
  assert.equal(got.project.revision, 3, 'ревизия не сдвинулась');
  assert.equal(got.project.title, 'Третья', 'правка другого клиента не отменена');
});

test('повтор успешного undo не отменяет второй шаг (идемпотентность)', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  await store.commit(project.id, tx({ projectId: project.id }));
  await store.commit(project.id, tx({ projectId: project.id, transactionId: 'tx-two-00001', expectedRevision: 2, operations: [{ op: 'updateProjectMeta', values: { title: 'Вторая правка' } }] }));
  const first = await store.undo(project.id, { transactionId: 'undo-once-001', expectedRevision: 3 });
  const repeat = await store.undo(project.id, { transactionId: 'undo-once-001', expectedRevision: 3 });
  assert.equal(repeat.duplicate, true, 'повтор — дубликат');
  assert.equal(repeat.response.project.revision, first.response.project.revision);
  const got = await store.get(project.id);
  assert.equal(got.project.revision, 4, 'второй шаг не отменён повтором');
  assert.equal(got.project.title, 'M1 fixture — карточки, текст, кадр, 3D', 'отменена только первая правка');
});

test('две одновременные отмены с одной ревизией: одна выполняется, другая 409', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  await store.commit(project.id, tx({ projectId: project.id }));
  const results = await Promise.allSettled([
    store.undo(project.id, { transactionId: 'undo-race-001', expectedRevision: 2 }),
    store.undo(project.id, { transactionId: 'undo-race-002', expectedRevision: 2 }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  const got = await store.get(project.id);
  assert.equal(got.project.revision, 3, 'отменён ровно один шаг');
});

test('новая правка после undo сбрасывает redo-стек', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  await store.commit(project.id, tx({ projectId: project.id }));
  await store.undo(project.id, { transactionId: 'undo-nu-00001', expectedRevision: 2 });
  const next = await store.commit(project.id, tx({
    projectId: project.id,
    transactionId: 'tx-after-undo1',
    expectedRevision: 3,
    operations: [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Новая правка' } }],
  }));
  assert.equal(next.response.revision, 4);
  const got = await store.get(project.id);
  assert.equal(got.canRedo, false, 'redo сброшен новой правкой');
});

test('журнал фиксирует init/commit/undo/redo', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  await store.commit(project.id, tx({ projectId: project.id }));
  await store.undo(project.id, { transactionId: 'undo-jr-00001', expectedRevision: 2 });
  await store.redo(project.id, { transactionId: 'redo-jr-00001', expectedRevision: 3 });
  const journal = await store.journal(project.id);
  assert.deepEqual(journal.map(e => e.kind), ['init', 'commit', 'undo', 'redo']);
});

test('несуществующий проект даёт 404', async () => {
  const { store } = tempStore();
  await assert.rejects(() => store.get('nope'), (e: unknown) => e instanceof StoreError && e.status === 404);
});

test('undo/redo без тела или с битым телом дают 400', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  await assert.rejects(() => store.undo(project.id, undefined), (e: unknown) => e instanceof StoreError && e.status === 400);
  await assert.rejects(() => store.undo(project.id, { transactionId: 'x' }), (e: unknown) => e instanceof StoreError && e.status === 400);
  await assert.rejects(() => store.redo(project.id, { transactionId: 'undo-jr-00002', expectedRevision: 'два' }), (e: unknown) => e instanceof StoreError && e.status === 400);
});
