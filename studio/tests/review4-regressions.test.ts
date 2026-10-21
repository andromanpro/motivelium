// Регрессии H1–H2 проверки 77e9eaf:
// H1 — миграция не подтверждает старую неоднозначную квитанцию на той же ревизии;
// H2 — долговечное подтверждение переживает смену формата (e29cc39) и >256 команд.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createStore, StoreError } from '../../server/storage.ts';
import { createStore as createStoreA5 } from './fixtures/storage-a5fe321.ts';
import { createStore as createStoreE29 } from './fixtures/storage-e29cc39.ts';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'motivelium-h-'));
const tx = (id: string, transactionId: string, title: string, expectedRevision = 1) => ({
  transactionId, projectId: id, expectedRevision, source: 'manual',
  operations: [{ op: 'updateProjectMeta', values: { title } }],
});

// ---------- H1 ----------

test('H1: a5fe321 A-503 → B-200 на r2 → миграция: A не получает ложный успех, B доказан', async () => {
  const dir = tempDir();
  let armed = false;
  const prev = createStoreA5(dir, { injectFailure: phase => (phase === 'pointer' && armed ? (armed = false, new Error('сбой указателя a5')) : undefined) });
  const { project: p } = await prev.create({ fixture: true });
  const a = tx(p.id, 'h1-tx-A-0000001', 'A');
  const b = tx(p.id, 'h1-tx-B-0000001', 'B');

  armed = true;
  await assert.rejects(() => prev.commit(p.id, a), (e: unknown) => e instanceof Error);
  // Старый протокол допускал перезапись: B занимает ту же ревизию 2.
  const outB = await prev.commit(p.id, b);
  assert.equal(outB.response.revision, 2);

  // Новая версия: миграция доказывает только B; A — неоднозначна.
  const v2 = createStore(dir);
  const got = await v2.get(p.id);
  assert.equal(got.project.title, 'B');
  assert.equal(got.project.revision, 2);
  await assert.rejects(
    () => v2.commit(p.id, a),
    (e: unknown) => e instanceof StoreError && e.status === 409 && /не была подтверждена/.test(e.message),
    'A не получает ложный успех',
  );
  // Документ B и его история сохранены; B повторяется безопасно.
  const retryB = await v2.commit(p.id, b);
  assert.equal(retryB.duplicate, true);
  assert.equal(retryB.response.project.title, 'B');
  const after = await createStore(dir).get(p.id);
  assert.equal(after.project.title, 'B');
  assert.equal(after.canUndo, true);
  // Квитанция A сохранена (не удалена), помечена superseded.
  const receiptA = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', p.id, 'transactions', 'h1-tx-A-0000001.json'), 'utf8'));
  assert.equal(receiptA.status, 'superseded');
});

// ---------- H2 ----------

test('H2a: обновление с e29cc39 — успешные A→B сохраняют безопасный повтор', async () => {
  const dir = tempDir();
  const prev = createStoreE29(dir);
  const { project: p } = await prev.create({ fixture: true });
  const a = tx(p.id, 'h2a-tx-A-000001', 'A');
  await prev.commit(p.id, a);
  const b = tx(p.id, 'h2a-tx-B-000001', 'B', 2);
  await prev.commit(p.id, b);

  // Новая версия: e29-указатель без confirmedTx получает цепочку из доказательств.
  const v2 = createStore(dir);
  const got = await v2.get(p.id);
  assert.equal(got.project.revision, 3);
  const retryA = await v2.commit(p.id, a);
  assert.equal(retryA.duplicate, true, 'A была подтверждена — повтор прежний успех');
  assert.equal(retryA.response.revision, 2);
  assert.equal(retryA.response.project.title, 'A');
  const retryB = await v2.commit(p.id, b);
  assert.equal(retryB.duplicate, true);
  assert.equal(retryB.response.revision, 3);
  await assert.rejects(
    () => v2.commit(p.id, tx(p.id, 'h2a-tx-A-000001', 'Другой payload')),
    (e: unknown) => e instanceof StoreError && e.status === 409,
    'иной payload с занятым ID — 409',
  );
  // Без второго применения и без смены состояния.
  const current = await createStore(dir).get(p.id);
  assert.equal(current.project.revision, 3);
});

test('H2b: 257 успешных команд — повтор первой всё ещё прежний успех (границы 255/256/257)', async () => {
  const dir = tempDir();
  const s = createStore(dir);
  const { project: p } = await s.create({ fixture: true });
  const first = tx(p.id, 'h2b-first-000001', 'Первая');
  await s.commit(p.id, first);
  // 257 дополнительных команд: любая граница вытеснения на 255/256/256+1 нарушит повтор.
  for (let i = 0; i < 257; i++) {
    await s.commit(p.id, tx(p.id, `h2b-more-${String(i).padStart(6, '0')}`, `Правка ${String(i)}`, 2 + i));
  }
  const fresh = createStore(dir);
  const retry = await fresh.commit(p.id, first);
  assert.equal(retry.duplicate, true, 'цепочка не ограничена — подтверждение не вытесняется');
  assert.equal(retry.response.project.title, 'Первая');
  const current = await fresh.get(p.id);
  assert.equal(current.project.revision, 259, 'состояние не сдвинулось повтором');
});

test('H2: e29-pending выше указателя при обновлении решается общим механизмом', async () => {
  const dir = tempDir();
  let armed = false;
  const prev = createStoreE29(dir, { injectFailure: phase => (phase === 'pointer' && armed ? (armed = false, new Error('сбой')) : undefined) });
  const { project: p } = await prev.create({ fixture: true });
  const a = tx(p.id, 'h2p-tx-A-0000001', 'A');
  armed = true;
  await assert.rejects(() => prev.commit(p.id, a), (e: unknown) => e instanceof Error);
  // В e29 B после A: resolvePending завершает A, B честно 409.
  await assert.rejects(() => prev.commit(p.id, tx(p.id, 'h2p-tx-B-0000001', 'B')), (e: unknown) => e instanceof Error);

  const v2 = createStore(dir);
  const got = await v2.get(p.id);
  assert.equal(got.project.title, 'A', 'завершённая A авторитетна');
  const retryA = await v2.commit(p.id, a);
  assert.equal(retryA.duplicate, true);
  assert.equal(retryA.response.project.title, 'A');
});
