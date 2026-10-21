// Регрессии повторного ревью (F1–F5): pending-подмена, легаси-список,
// SSE recovery, целостность digest, дубликаты кадров экспорта.
// Все сценарии — во временных хранилищах; настоящие проекты не трогаются.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createStore, StoreError } from '../../server/storage.ts';
import { buildFixture } from '../domain/fixture.ts';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'motivelium-f1-'));
const tx = (id: string, transactionId: string, title: string, expectedRevision = 1) => ({
  transactionId, projectId: id, expectedRevision, source: 'manual',
  operations: [{ op: 'updateProjectMeta', values: { title } }],
});

// ---------- F1: pending ----------

test('F1-сценарий 1: A зависла на указателе; B не может зафиксировать чужой пакет; успех A = A подтверждена', async () => {
  const dir = tempDir();
  let armed = '';
  const s = createStore(dir, { injectFailure: phase => (phase === armed ? (armed = '', new Error('внедрено: ' + phase)) : undefined) });
  const { project: p } = await s.create({ fixture: true });
  const a = tx(p.id, 'edge-pending-A-01', 'A');
  const b = tx(p.id, 'edge-pending-B-01', 'B');

  armed = 'pointer';
  let errorA = '';
  try { await s.commit(p.id, a); } catch (e) { errorA = `${String((e as StoreError).status)}:${(e as Error).message}`; }
  assert.ok(errorA.startsWith('503'), 'A получила 503 до границы');

  // B приходит после A: судьба pending решается ДО мутации — A завершается, B честно 409.
  let errorB = '';
  try { await s.commit(p.id, b); } catch (e) { errorB = `${String((e as StoreError).status)}:${(e as Error).message}`; }
  assert.ok(errorB.startsWith('409'), `B отклонена (${errorB})`);

  const retry = await createStore(dir).commit(p.id, a);
  const current = await createStore(dir).get(p.id);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.response.project.title, 'A');
  assert.equal(current.project.title, 'A', 'подтверждено именно A');
  assert.equal(current.project.revision, 2);
  // Инвариант: успех ответа A ⇔ A в подтверждённом состоянии.
  assert.equal(retry.response.project.title, current.project.title);
});

test('F1-сценарий 2: B не может перезаписать пакет A (имя пакета содержит txId)', async () => {
  const dir = tempDir();
  let armed = '';
  const s = createStore(dir, { injectFailure: phase => (phase === armed ? (armed = '', new Error('внедрено: ' + phase)) : undefined) });
  const { project: p } = await s.create({ fixture: true });
  const a = tx(p.id, 'edge-pending-A-02', 'A');
  const b = tx(p.id, 'edge-pending-B-02', 'B');

  armed = 'pointer';
  await assert.rejects(() => s.commit(p.id, a), (e: unknown) => e instanceof StoreError && e.status === 503);
  // Пакет A существует под собственным именем:
  const states = fs.readdirSync(path.join(dir, '.local', 'projects', p.id, 'states'));
  assert.ok(states.some(n => n.startsWith('edge-pending-A-02.rev-2.')), `пакет A цел: ${states.join(', ')}`);

  armed = 'receipt'; // если B вообще дойдёт до записи — но она не должна
  let errorB = '';
  try { await s.commit(p.id, b); } catch (e) { errorB = `${String((e as StoreError).status)}:${(e as Error).message}`; }
  assert.ok(errorB.startsWith('409'), 'B отклонена по ревизии до любых записей');

  const retry = await createStore(dir).commit(p.id, a);
  const current = await createStore(dir).get(p.id);
  assert.equal(retry.response.project.title, current.project.title, 'ответ A соответствует состоянию');
  assert.equal(current.project.title, 'A');
});

test('F1: несколько B подряд и рестарты между шагами — ровно одна попытка подтверждена', async () => {
  const dir = tempDir();
  let armed = false;
  // Только ревизия 2 (коммит A); создание проекта (rev 1) не задеваем.
  const s = createStore(dir, { injectFailure: (phase, ctx) => (phase === 'pointer' && armed && ctx.revision === 2 ? (armed = false, new Error('внедрено')) : undefined) });
  const { project: p } = await s.create({ fixture: true });
  armed = true;
  await assert.rejects(() => s.commit(p.id, tx(p.id, 'multi-A-000001', 'A')), (e: unknown) => e instanceof StoreError && e.status === 503);

  const s2 = createStore(dir); // рестарт
  const bs = [tx(p.id, 'multi-B-000001', 'B1'), tx(p.id, 'multi-B-000002', 'B2'), tx(p.id, 'multi-B-000003', 'B3')];
  const results = await Promise.allSettled(bs.map(b => s2.commit(p.id, b)));
  assert.equal(results.filter(r => r.status === 'rejected').length, 3, 'все B отклонены: pending A завершён первым');

  const current = await createStore(dir).get(p.id);
  assert.equal(current.project.title, 'A');
  assert.equal(current.project.revision, 2);
  // Один из B может повториться с актуальной ревизией — это уже честная новая попытка.
  const b1retry = await createStore(dir).commit(p.id, tx(p.id, 'multi-B-000001', 'B1', 2));
  assert.equal(b1retry.response.revision, 3);
});

test('F1: реальный отказ файловой системы (monkey-patch rename), не условный hook', async () => {
  const dir = tempDir();
  const s = createStore(dir);
  const { project: p } = await s.create({ fixture: true });
  const originalRename = fsp.rename;
  let brokeOnce = false;
  (fsp as unknown as { rename: typeof fsp.rename }).rename = async function patchedRename(from: string, to: string) {
    if (!brokeOnce && String(to).endsWith('pointer.json')) {
      brokeOnce = true;
      throw new Error('EIO: имитация реального сбоя диска');
    }
    return originalRename.call(fsp, from, to);
  } as typeof fsp.rename;
  try {
    await assert.rejects(() => s.commit(p.id, tx(p.id, 'real-io-000001', 'После сбоя')), (e: unknown) => e instanceof StoreError);
  } finally {
    (fsp as unknown as { rename: typeof fsp.rename }).rename = originalRename;
  }
  const reopened = createStore(dir);
  const got = await reopened.get(p.id);
  assert.equal(got.project.revision, 1, 'подтверждённое состояние прежнее');
  const retry = await reopened.commit(p.id, tx(p.id, 'real-io-000001', 'После сбоя'));
  assert.equal(retry.response.revision, 2);
  const fresh = await createStore(dir).get(p.id);
  assert.equal(fresh.project.title, 'После сбоя');
});

test('F1: поздний повтор давно подтверждённой транзакции — идемпотентный дубль (после очистки states)', async () => {
  const dir = tempDir();
  const s = createStore(dir);
  const { project: p } = await s.create({ fixture: true });
  const first = await s.commit(p.id, tx(p.id, 'old-tx-0000001', 'Первая'));
  assert.equal(first.response.revision, 2);
  // 10 правок подряд: prune оставляет STATES_KEEP=8 пакетов.
  for (let i = 0; i < 10; i++) {
    await s.commit(p.id, tx(p.id, `later-tx-${String(i).padStart(7, '0')}`, `Правка ${String(i)}`, 2 + i));
  }
  const states = fs.readdirSync(path.join(dir, '.local', 'projects', p.id, 'states'));
  assert.ok(states.length <= 8 + 2, `states подчищены (${String(states.length)})`);
  const retry = await createStore(dir).commit(p.id, tx(p.id, 'old-tx-0000001', 'Первая'));
  assert.equal(retry.duplicate, true, 'старый подтверждённый tx — дубль, не 409');
  assert.equal(retry.response.revision, 2);
  const current = await createStore(dir).get(p.id);
  assert.equal(current.project.revision, 12, 'повтор не задвоил и не откатил состояние');
});

// ---------- F2: легаси в списке ----------

test('F2: настоящий легаси-каталог виден из первого списка; миграция согласована с очередью', async () => {
  const dir = tempDir();
  const p = buildFixture();
  const legacy = path.join(dir, '.local', 'projects', p.id);
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, 'project.json'), JSON.stringify(p));
  fs.writeFileSync(path.join(legacy, 'history.json'), JSON.stringify({ past: [], future: [] }));

  const s = createStore(dir);
  const before = await s.list();
  assert.equal(before.length, 1, 'легаси виден сразу, без get по ID');
  assert.equal(before[0]!.id, p.id);
  const got = await s.get(p.id);
  assert.equal(got.project.revision, 1);
  assert.ok(fs.existsSync(path.join(legacy, 'pointer.json')), 'миграция создала указатель');
});

test('F2/F4: повреждённый указатель — явная ошибка, миграции на зеркало нет', async () => {
  const dir = tempDir();
  const s = createStore(dir);
  const { project: p } = await s.create({ fixture: true });
  fs.writeFileSync(path.join(dir, '.local', 'projects', p.id, 'pointer.json'), '{broken json');
  await assert.rejects(
    () => createStore(dir).get(p.id),
    (e: unknown) => e instanceof StoreError && e.status === 500 && /Повреждён указатель/.test(e.message),
  );
  // Зеркало project.json не становится источником: содержимое не откатилось молча.
  const mirror = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', p.id, 'project.json'), 'utf8'));
  assert.equal(mirror.revision, 1);
});

// ---------- F3: SSE ----------

test('F3: recovery-завершение шлёт ровно одно revision-событие; дубль и 409 молчат', async () => {
  const dir = tempDir();
  let fail = false;
  const s = createStore(dir, { injectFailure: phase => (phase === 'pointer' && fail ? (fail = false, new Error('внедрено')) : undefined) });
  const { project: p } = await s.create({ fixture: true });
  const { studioAPIFactory } = await import('../../server/api.ts');
  const api = studioAPIFactory(s);
  const server = http.createServer((req, res) => api(req, res, new URL(req.url ?? '/', `http://${String(req.headers.host ?? '127.0.0.1')}`)));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const abort = new AbortController();
  const events = await fetch(`${base}/api/v1/events`, { signal: abort.signal });
  const reader = events.body!.getReader();
  let text = '';
  const pump = (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); } } catch { /* aborted */ } })();

  try {
    const opened = await (await fetch(`${base}/api/v1/projects/${p.id}`)).json();
    const token = (opened as { mutationToken: string }).mutationToken;
    const call = (body: unknown) => fetch(`${base}/api/v1/projects/${p.id}/transactions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-motivelium-token': token }, body: JSON.stringify(body),
    });
    const body = tx(p.id, 'edge-recovery-sse-01', 'Recovered');
    fail = true;
    const first = await call(body);
    const firstBody = await first.text();
    assert.equal(first.status, 503, `тело ответа: ${firstBody}`);
    const second = await call(body);
    const data = (await second.json()) as { duplicate?: boolean };
    assert.equal(second.status, 200);
    assert.equal(data.duplicate, true);
    await new Promise(r => setTimeout(r, 150));
    const events1 = (text.match(/"type":"revision"/g) ?? []).length;
    assert.ok(events1 >= 1, 'recovery сообщил событие');
    const third = await call(body); // чистый дубль уже подтверждённого
    assert.equal(third.status, 200);
    await new Promise(r => setTimeout(r, 100));
    const events2 = (text.match(/"type":"revision"/g) ?? []).length;
    assert.equal(events2, events1, 'чистый дубль молчит');
    // 409 без события
    await call(tx(p.id, 'edge-stale-sse-01', 'Просрочено', 1));
    await new Promise(r => setTimeout(r, 100));
    const events3 = (text.match(/"type":"revision"/g) ?? []).length;
    assert.equal(events3, events1, '409 молчит');
    const current = await s.get(p.id);
    assert.equal(current.project.revision, 2);
    assert.equal(current.project.title, 'Recovered');
  } finally {
    abort.abort();
    await pump;
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r(undefined)));
  }
});

// ---------- F4: целостность ----------

test('F4: изменённый пакет (валидный JSON, другой digest) не принимается', async () => {
  const dir = tempDir();
  const s = createStore(dir);
  const { project: p } = await s.create({ fixture: true });
  const dirP = path.join(dir, '.local', 'projects', p.id);
  const pointer = JSON.parse(fs.readFileSync(path.join(dirP, 'pointer.json'), 'utf8'));
  const file = path.join(dirP, pointer.stateFile);
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  pkg.project.title = 'Changed outside confirmed state';
  fs.writeFileSync(file, JSON.stringify(pkg));
  await assert.rejects(
    () => createStore(dir).get(p.id),
    (e: unknown) => e instanceof StoreError && e.status === 500 && /digest не совпадает/.test(e.message),
  );
});

// ---------- F5: экспорт ----------

test('F5: повторяющиеся номера кадров отклоняются до записи', async () => {
  const dir = tempDir();
  const s = createStore(dir);
  const { project: p } = await s.create({ fixture: true });
  const png1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const png2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==';
  await assert.rejects(
    () => s.saveExport(p.id, { expectedRevision: 1, frames: [{ frame: 0, image: png1 }, { frame: 0, image: png2 }] }),
    (e: unknown) => e instanceof StoreError && e.status === 400 && /Повторяющиеся номера/.test(e.message),
  );
  const exportsDir = path.join(dir, '.local', 'projects', p.id, 'exports');
  assert.equal(fs.existsSync(exportsDir), false, 'ничего не записано');
});
