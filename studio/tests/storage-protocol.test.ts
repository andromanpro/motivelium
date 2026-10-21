// Регрессия P1-1: согласованная фиксация при искусственных отказах на каждом
// шаге протокола (пакет состояния / квитанция / указатель) с «перезапуском
// процесса» (новый createStore на том же каталоге) между шагами.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createStore, StoreError } from '../../server/storage.ts';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'motivelium-proto-'));
}

function txBody(id: string, transactionId: string, title: string, expectedRevision: number): Record<string, unknown> {
  return {
    transactionId, projectId: id, expectedRevision, source: 'manual', description: 'правка ' + title,
    operations: [{ op: 'updateProjectMeta', values: { title } }],
  };
}

async function confirmedRevision(dir: string, id: string): Promise<number> {
  // Чтение подтверждённой ревизии с диска «после перезапуска»: новый store без кеша.
  const store = createStore(dir);
  const got = await store.get(id);
  return got.project.revision;
}

test('отказ записи пакета состояния: 503, подтверждённое состояние прежнее, повтор применяет один раз', async () => {
  const dir = tempDir();
  let failOnce = true;
  // Отказ только для ревизии 2 (коммит), создание проекта не задеваем.
  const store = createStore(dir, { injectFailure: (phase, ctx) => (phase === 'state' && failOnce && ctx.revision === 2 ? new Error('injected: state') : undefined) });
  const { project } = await store.create({ fixture: true });
  await assert.rejects(() => store.commit(project.id, txBody(project.id, 'tx-fstate-001', 'Правка A', 1)), (e: unknown) => e instanceof StoreError && e.status === 503);
  assert.equal(await confirmedRevision(dir, project.id), 1, 'до фиксации — прежнее состояние');
  failOnce = false;
  const retry = await store.commit(project.id, txBody(project.id, 'tx-fstate-001', 'Правка A', 1));
  assert.equal(retry.response.revision, 2, 'повтор применил правку один раз');
  const fresh = createStore(dir);
  assert.equal((await fresh.get(project.id)).project.title, 'Правка A');
});

test('отказ записи квитанции: указатель не двигается; повтор того же запроса завершает фиксацию', async () => {
  const dir = tempDir();
  let failOnce = true;
  const store = createStore(dir, { injectFailure: (phase, ctx) => (phase === 'receipt' && failOnce && ctx.revision === 2 ? new Error('injected: receipt') : undefined) });
  const { project } = await store.create({ fixture: true });
  await assert.rejects(() => store.commit(project.id, txBody(project.id, 'tx-frecpt-001', 'Правка B', 1)), (e: unknown) => e instanceof StoreError && e.status === 503);
  assert.equal(await confirmedRevision(dir, project.id), 1, 'указатель не подтверждает новую ревизию');
  failOnce = false;
  // «Перезапуск» и повтор идентичного запроса: квитанция+пакет уже на диске — фиксация завершается.
  const reopened = createStore(dir);
  const retry = await reopened.commit(project.id, txBody(project.id, 'tx-frecpt-001', 'Правка B', 1));
  assert.ok(retry.duplicate === false || retry.duplicate === true);
  assert.equal(retry.response.revision, 2, 'правка применена ровно один раз');
  const fresh = createStore(dir);
  const got = await fresh.get(project.id);
  assert.equal(got.project.title, 'Правка B');
  assert.equal(got.project.revision, 2);
});

test('отказ записи указателя: 503; повтор после перезапуска завершает фиксацию без второго применения', async () => {
  const dir = tempDir();
  let failOnce = true;
  const store = createStore(dir, { injectFailure: (phase, ctx) => (phase === 'pointer' && failOnce && ctx.revision === 2 ? new Error('injected: pointer') : undefined) });
  const { project } = await store.create({ fixture: true });
  await assert.rejects(() => store.commit(project.id, txBody(project.id, 'tx-fptr-0001', 'Правка C', 1)), (e: unknown) => e instanceof StoreError && e.status === 503);
  assert.equal(await confirmedRevision(dir, project.id), 1);
  failOnce = false;
  const reopened = createStore(dir);
  const retry = await reopened.commit(project.id, txBody(project.id, 'tx-fptr-0001', 'Правка C', 1));
  assert.equal(retry.response.revision, 2);
  const fresh = createStore(dir);
  const got = await fresh.get(project.id);
  assert.equal(got.project.title, 'Правка C');
  assert.equal(got.project.revision, 2, 'после восстановления ревизия не задвоена');
});

test('регрессия undo: отказ указателя → 503; повтор того же transactionId отменяет ровно один шаг', async () => {
  const dir = tempDir();
  const store = createStore(dir);
  const { project } = await store.create({ fixture: true });
  await store.commit(project.id, txBody(project.id, 'tx-undo-reg-01', 'Первая', 1));
  await store.commit(project.id, txBody(project.id, 'tx-undo-reg-02', 'Вторая', 2));

  let failOnce = true;
  const failing = createStore(dir, { injectFailure: (phase, ctx) => (phase === 'pointer' && failOnce && (ctx as { revision?: number }).revision === 4 ? new Error('injected: pointer') : undefined) });
  await assert.rejects(() => failing.undo(project.id, { transactionId: 'undo-reg-0001', expectedRevision: 3 }), (e: unknown) => e instanceof StoreError && e.status === 503);
  assert.equal(await confirmedRevision(dir, project.id), 3, 'undo не подтверждён');

  failOnce = false;
  const reopened = createStore(dir);
  const retry = await reopened.undo(project.id, { transactionId: 'undo-reg-0001', expectedRevision: 3 });
  assert.equal(retry.response.project.revision, 4);
  const fresh = createStore(dir);
  const got = await fresh.get(project.id);
  assert.equal(got.project.title, 'Первая', 'отменён один шаг (Вторая)');
  assert.equal(got.project.revision, 4);
});

test('после границы фиксации отказ журнала/зеркала не меняет подтверждённый результат', async () => {
  const dir = tempDir();
  // Отказ внедряется в фазы journal/mirror — они ПОСЛЕ указателя и проглатываются.
  const store = createStore(dir, { injectFailure: phase => (phase === 'journal' || phase === 'mirror' ? new Error('внедрено после границы: ' + phase) : undefined) });
  const { project } = await store.create({ fixture: true });
  const out = await store.commit(project.id, txBody(project.id, 'tx-after-0001', 'После границы', 1));
  assert.equal(out.response.revision, 2);
  assert.equal((await store.get(project.id)).project.title, 'После границы');
  // «Перезапуск»: подтверждённое состояние пережило отказы после границы.
  const fresh = createStore(dir);
  const got = await fresh.get(project.id);
  assert.equal(got.project.title, 'После границы');
  assert.equal(got.project.revision, 2);
});

test('миграция старой раскладки project.json+history.json проходит явно', async () => {
  const dir = tempDir();
  const seed = createStore(dir);
  const { project } = await seed.create({ fixture: true });
  await seed.commit(project.id, txBody(project.id, 'tx-migr-0001', 'До миграции', 1));
  // Старая раскладка: pointer удаляем, остаётся project.json (зеркало) и states/.
  fs.rmSync(path.join(dir, '.local', 'projects', project.id, 'pointer.json'));
  const reopened = createStore(dir);
  const got = await reopened.get(project.id);
  assert.equal(got.project.title, 'До миграции', 'миграция восстановила подтверждённое состояние');
  assert.equal(got.project.revision, 2);
  assert.ok(fs.existsSync(path.join(dir, '.local', 'projects', project.id, 'pointer.json')), 'pointer создан миграцией');
});
