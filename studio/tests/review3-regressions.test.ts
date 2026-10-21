// Регрессии G1–G3 проверки e29cc39 (Поставки/2026-10-14_проверка-e29cc39):
// G1 — ошибка чтения указателя не означает отсутствия (никакого отката к зеркалу);
// G2 — явная миграция с настоящего формата a5fe321;
// G3 — доказательство подтверждения переживает переход указателя дальше.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createStore, StoreError } from '../../server/storage.ts';
import { createStore as createStorePrev } from './fixtures/storage-a5fe321.ts';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'motivelium-g-'));
const tx = (id: string, transactionId: string, title: string, expectedRevision = 1) => ({
  transactionId, projectId: id, expectedRevision, source: 'manual',
  operations: [{ op: 'updateProjectMeta', values: { title } }],
});

// ---------- G1: отказ чтения ≠ отсутствие ----------

test('G1: EACCES на чтении pointer — явная ошибка, указатель/пакет и история не тронуты', async () => {
  const dir = tempDir();
  // Зеркало r1 создаётся успешно, отказ зеркала включается только для коммита r2.
  let mirrorBroken = false;
  const s = createStore(dir, { injectFailure: phase => (phase === 'mirror' && mirrorBroken ? new Error('зеркало недоступно') : undefined) });
  const { project: p } = await s.create({ fixture: true });
  const mirror1 = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', p.id, 'project.json'), 'utf8'));
  assert.equal(mirror1.revision, 1, 'зеркало r1 существует');
  mirrorBroken = true;
  const committed = await s.commit(p.id, tx(p.id, 'g1-tx-0000001', 'Подтверждено r2'));
  assert.equal(committed.response.revision, 2);
  const mirror = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', p.id, 'project.json'), 'utf8'));
  assert.equal(mirror.revision, 1, 'зеркало устарело (r1) — и не источник истины');

  // Отказ чтения pointer на время этого окна: GET и list видят явную проблему.
  const originalReadFile = fsp.readFile;
  (fsp as unknown as { readFile: typeof fsp.readFile }).readFile = async function patchedReadFile(file: string | Buffer | URL, ...rest: unknown[]) {
    if (String(file).endsWith('pointer.json')) {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }) as NodeJS.ErrnoException;
    }
    return (originalReadFile as (...a: unknown[]) => Promise<unknown>).call(fsp, file, ...rest);
  } as typeof fsp.readFile;
  try {
    const fresh = createStore(dir);
    await assert.rejects(() => fresh.get(p.id), (e: unknown) => e instanceof StoreError && e.status === 500 && /не читается/.test(e.message));
    const listed = await fresh.list();
    assert.equal(listed.length, 0, 'list: диагностика без лечения зеркалом');
  } finally {
    (fsp as unknown as { readFile: typeof fsp.readFile }).readFile = originalReadFile;
  }

  // Указатель и авторитетный пакет остались r2; после снятия отказа — r2 и история.
  const pointer = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', p.id, 'pointer.json'), 'utf8'));
  assert.equal(pointer.revision, 2, 'указатель не откатился');
  const ok = await createStore(dir).get(p.id);
  assert.equal(ok.project.revision, 2);
  assert.equal(ok.project.title, 'Подтверждено r2');
  assert.equal(ok.canUndo, true, 'история пережила');
});

test('G1: путь мутации при нечитаемом указателе — явный отказ без миграции', async () => {
  const dir = tempDir();
  const s = createStore(dir);
  const { project: p } = await s.create({ fixture: true });
  const originalReadFile = fsp.readFile;
  (fsp as unknown as { readFile: typeof fsp.readFile }).readFile = async function patched(file: string | Buffer | URL, ...rest: unknown[]) {
    if (String(file).endsWith('pointer.json')) throw Object.assign(new Error('EACCES'), { code: 'EACCES' }) as NodeJS.ErrnoException;
    return (originalReadFile as (...a: unknown[]) => Promise<unknown>).call(fsp, file, ...rest);
  } as typeof fsp.readFile;
  try {
    await assert.rejects(
      () => createStore(dir).commit(p.id, tx(p.id, 'g1b-tx-0000001', 'Не должно пройти')),
      (e: unknown) => e instanceof StoreError && e.status === 500 && /не читается/.test(e.message),
    );
  } finally {
    (fsp as unknown as { readFile: typeof fsp.readFile }).readFile = originalReadFile;
  }
  const pointer = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', p.id, 'pointer.json'), 'utf8'));
  assert.equal(pointer.revision, 1, 'ничего не перезаписано');
});

// ---------- G2: миграция с a5fe321 ----------

test('G2: настоящий a5fe321 → v2: документ/ревизия/история/квитанции/идемпотентность сохраняются', async () => {
  const dir = tempDir();
  const prev = createStorePrev(dir);
  const { project: p } = await prev.create({ fixture: true });
  const txA = tx(p.id, 'g2-tx-0000001', 'Saved by a5fe321');
  const committed = await prev.commit(p.id, txA);
  assert.equal(committed.response.revision, 2);
  const undone = await prev.undo(p.id, { transactionId: 'g2-undo-0000001', expectedRevision: 2 });
  assert.equal(undone.response.project.revision, 3);

  // Новый store v2: список сразу видит проект, миграция проходит явно.
  const v2 = createStore(dir);
  const listed = await v2.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.id, p.id);
  const got = await v2.get(p.id);
  assert.equal(got.project.revision, 3, 'авторитетная ревизия сохранена');
  assert.equal(got.canRedo, true, 'история undo/redo сохранена');
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', p.id, 'pointer.json'), 'utf8'));
  assert.equal(typeof onDisk.transactionId, 'string', 'указатель переведён в v2-формат');
  assert.ok(Array.isArray(onDisk.confirmedTx) && onDisk.confirmedTx.length >= 2, 'цепочка подтверждённых посеяна');

  // Идемпотентность прежних транзакций: повтор txA — прежний успех; иной payload — 409.
  const retry = await v2.commit(p.id, txA);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.response.revision, 2);
  assert.equal(retry.response.project.title, 'Saved by a5fe321');
  await assert.rejects(
    () => v2.commit(p.id, tx(p.id, 'g2-tx-0000001', 'Другой payload')),
    (e: unknown) => e instanceof StoreError && e.status === 409,
  );

  // Повторная миграция идемпотентна: следующий store видит то же состояние.
  const again = await createStore(dir).get(p.id);
  assert.equal(again.project.revision, 3);
});

test('G2: init-проект a5fe321 без meta.transactionId мигрирует с синтетическим id', async () => {
  const dir = tempDir();
  const prev = createStorePrev(dir);
  const { project } = await prev.create({ fixture: true });
  // Только создание: указатель r1, у init-пакета meta.transactionId нет.
  const v2 = createStore(dir);
  const listed = await v2.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.revision, 1);
  const got = await v2.get(project.id);
  assert.equal(got.project.revision, 1);
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', project.id, 'pointer.json'), 'utf8'));
  assert.match(onDisk.transactionId, /^upgraded-r1-[0-9a-f]{8}$/);
});

test('G2: отказ посередине миграции не откатывает авторитетную ревизию', async () => {
  const dir = tempDir();
  const prev = createStorePrev(dir);
  const { project: p } = await prev.create({ fixture: true });
  await prev.commit(p.id, tx(p.id, 'g2c-tx-00000001', 'Авторитет'));
  let armed = true;
  const failing = createStore(dir, { injectFailure: phase => (phase === 'pointer' && armed && (armed = false, true) ? new Error('сбой миграции') : undefined) });
  await assert.rejects(() => failing.get(p.id), (e: unknown) => e instanceof Error);
  // Старый указатель a5fe321 на месте, авторитет не изменён.
  const oldPointer = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', p.id, 'pointer.json'), 'utf8'));
  assert.equal(oldPointer.revision, 2);
  assert.equal(oldPointer.transactionId, undefined, 'формат прежний — миграция не дошла до указателя');
  // Повтор успешно доигрывает миграцию.
  const ok = await createStore(dir).get(p.id);
  assert.equal(ok.project.title, 'Авторитет');
});

test('G2: старая неоднозначная prepared-квитанция — явный отказ, не ложное подтверждение', async () => {
  const dir = tempDir();
  const prev = createStorePrev(dir);
  const { project: p } = await prev.create({ fixture: true });
  await prev.commit(p.id, tx(p.id, 'g2d-live-000001', 'Подтверждённая'));
  // Руками кладём старую prepared-квитанцию с ревизией выше указателя (a5fe321-формат).
  const pendingRequest = tx(p.id, 'g2d-ghost-000001', 'Призрак', 2);
  const crypto = await import('node:crypto');
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(pendingRequest)).digest('hex');
  fs.writeFileSync(path.join(dir, '.local', 'projects', p.id, 'transactions', 'g2d-ghost-000001.json'), JSON.stringify({
    requestHash, request: pendingRequest, response: { applied: true, revision: 3 }, stateFile: 'states/rev-3.json',
  }));
  const v2 = createStore(dir);
  const got = await v2.get(p.id);
  assert.equal(got.project.revision, 2, 'авторитетная ревизия не изменилась');
  await assert.rejects(
    () => v2.commit(p.id, pendingRequest),
    (e: unknown) => e instanceof StoreError && e.status === 409 && /не была подтверждена/.test(e.message),
    'повтор призрака — честный 409, не молчаливый успех',
  );
  const receiptFile = path.join(dir, '.local', 'projects', p.id, 'transactions', 'g2d-ghost-000001.json');
  assert.ok(fs.existsSync(receiptFile), 'данные квитанции сохранены');
});

// ---------- G3: подтверждение переживает переход указателя ----------

test('G3: два реальных отказа записи confirmed для A — повтор A после B всё равно дубль-успех', async () => {
  const dir = tempDir();
  const s = createStore(dir);
  const { project: p } = await s.create({ fixture: true });
  const a = tx(p.id, 'g3-tx-A-0000001', 'A');
  const b = tx(p.id, 'g3-tx-B-0000001', 'B', 2);

  // Два однократных отказа rename только для ПОДТВЕРЖДАЮЩЕЙ перезаписи квитанции A
  // (первая запись prepared до границы обязана пройти — пропускаем её).
  // Пути на Windows — с бэкслешами, поэтому нормализуем разделители.
  let hits = 0;
  let failuresLeft = 2;
  const originalRename = fsp.rename;
  (fsp as unknown as { rename: typeof fsp.rename }).rename = async function patchedRename(from: string, to: string) {
    if (String(to).replace(/\\/g, '/').endsWith('transactions/g3-tx-A-0000001.json')) {
      hits++;
      if (hits >= 2 && failuresLeft > 0) {
        failuresLeft--;
        throw new Error('EIO: подтверждение квитанции не записано');
      }
    }
    return originalRename.call(fsp, from, to);
  } as typeof fsp.rename;
  let hitsAfter = 0;
  try {
    const outA = await s.commit(p.id, a); // подтверждена указателем; запись статуса отказала
    assert.equal(outA.response.revision, 2);
    // resolvePending перед B тоже пытается дописать статус — второй отказ проглатывается,
    // но доказательство уже в цепочке указателя.
    const outB = await s.commit(p.id, b);
    assert.equal(outB.response.revision, 3);
    assert.equal(outB.response.project.title, 'B', 'содержимое B на месте');
    hitsAfter = hits;
  } finally {
    (fsp as unknown as { rename: typeof fsp.rename }).rename = originalRename;
  }
  assert.equal(failuresLeft, 0, `оба отказа пришлись на запись confirmed (hits=${String(hitsAfter)})`);

  // Рестарт: повтор A — прежний успех (цепочка в указателе), иной payload — 409.
  const fresh = createStore(dir);
  const retry = await fresh.commit(p.id, a);
  assert.equal(retry.duplicate, true, 'A подтверждена — успех не переименован');
  assert.equal(retry.response.revision, 2);
  assert.equal(retry.response.project.title, 'A');
  await assert.rejects(
    () => fresh.commit(p.id, tx(p.id, 'g3-tx-A-0000001', 'Другой payload')),
    (e: unknown) => e instanceof StoreError && e.status === 409,
  );
  const current = await fresh.get(p.id);
  assert.equal(current.project.revision, 3, 'состояние B не потеряно');
});

test('G3: очистка states не лишает подтверждённую транзакцию идемпотентности', async () => {
  const dir = tempDir();
  const s = createStore(dir);
  const { project: p } = await s.create({ fixture: true });
  const a = tx(p.id, 'g3-prune-000001', 'Ранняя');
  await s.commit(p.id, a);
  for (let i = 0; i < 10; i++) {
    await s.commit(p.id, tx(p.id, `g3-late-${String(i).padStart(6, '0')}`, `Правка ${String(i)}`, 2 + i));
  }
  const states = fs.readdirSync(path.join(dir, '.local', 'projects', p.id, 'states'));
  assert.ok(states.length <= 10, `states подчищены (${String(states.length)})`);
  const retry = await createStore(dir).commit(p.id, a);
  assert.equal(retry.duplicate, true, 'цепочка подтверждённых живёт в указателе, не в states');
  assert.equal(retry.response.project.title, 'Ранняя');
});

test('G3: параллельно для undo — цепочка подтверждает отмену после отказа записи статуса', async () => {
  const dir = tempDir();
  const s = createStore(dir);
  const { project: p } = await s.create({ fixture: true });
  await s.commit(p.id, tx(p.id, 'g3u-commit-0001', 'Правка'));
  // Отказ записи confirmed только для undo-квитанции (нормализуем разделители Windows).
  let failed = false;
  let undoHits = 0;
  const originalRename = fsp.rename;
  (fsp as unknown as { rename: typeof fsp.rename }).rename = async function patchedRename(from: string, to: string) {
    if (!failed && String(to).replace(/\\/g, '/').endsWith('transactions/g3u-undo-0001.json') && String(from).replace(/\\/g, '/').includes('.tmp')) {
      undoHits++;
      if (undoHits >= 2) {
        failed = true;
        throw new Error('EIO');
      }
    }
    return originalRename.call(fsp, from, to);
  } as typeof fsp.rename;
  try {
    const out = await s.undo(p.id, { transactionId: 'g3u-undo-0001', expectedRevision: 2 });
    assert.equal(out.response.project.revision, 3);
  } finally {
    (fsp as unknown as { rename: typeof fsp.rename }).rename = originalRename;
  }
  assert.ok(failed, 'отказ действительно случился на подтверждении undo-квитанции');
  const fresh = createStore(dir);
  const retry = await fresh.undo(p.id, { transactionId: 'g3u-undo-0001', expectedRevision: 2 });
  assert.equal(retry.duplicate, true, 'undo подтверждён цепочкой, не статусом квитанции');
  assert.equal(retry.response.project.revision, 3);
  const current = await fresh.get(p.id);
  assert.equal(current.project.revision, 3, 'повтор не отменил второй шаг');
});
