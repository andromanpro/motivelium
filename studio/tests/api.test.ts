// Тесты HTTP API /api/v1/: токен, конфликт 409, дубликат транзакции, undo/redo
// с контрактом {transactionId, expectedRevision}, история, Host-проверка.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { studioAPIFactory } from '../../server/api.ts';

async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motivelium-api-'));
  const { createStore } = await import('../../server/storage.ts');
  const store = createStore(dir, { energyAudioSource: fileURLToPath(new URL('../../www/energy/assets/razryad-180.wav', import.meta.url)) });
  const api = studioAPIFactory(store);
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    return api(req, res, u);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

type Json = Record<string, unknown>;

async function call(baseUrl: string, method: string, route: string, body?: unknown, token?: string): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['x-motivelium-token'] = token;
  if(!token&&method==='POST'&&route==='/api/v1/projects')headers['x-motivelium-token']=(await(await fetch(baseUrl+'/api/v1/project-packages')).json()).mutationToken;
  const res = await fetch(baseUrl + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json()) as Json;
  return { status: res.status, json };
}

test('API: полный путь — создать, прочитать, применить, конфликт, дубликат, undo, история', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const health = await call(baseUrl, 'GET', '/api/v1/health');
    assert.equal(health.status, 200);

    const created = await call(baseUrl, 'POST', '/api/v1/projects', { fixture: true });
    assert.equal(created.status, 201);
    const id = (created.json.project as Json).id as string;
    assert.match(id, /^m1-fixture-/);

    const list = await call(baseUrl, 'GET', '/api/v1/projects');
    assert.equal((list.json.projects as Json[]).length, 1);

    const got = await call(baseUrl, 'GET', `/api/v1/projects/${id}`);
    assert.equal(got.status, 200);
    const token = got.json.mutationToken as string;
    assert.ok(typeof token === 'string' && token.length >= 24);

    // Мутация без токена запрещена
    const noToken = await call(baseUrl, 'POST', `/api/v1/projects/${id}/transactions`, {
      transactionId: 'tx-api-00001', projectId: id, expectedRevision: 1, source: 'manual', operations: [],
    });
    assert.equal(noToken.status, 403);

    const badBody = await call(baseUrl, 'POST', `/api/v1/projects/${id}/transactions`, {
      transactionId: 'tx-api-00002', projectId: id, expectedRevision: 1, source: 'manual',
      operations: [{ op: 'updateNode', targetId: 'ghost', values: { name: 'x' } }],
    }, token);
    assert.equal(badBody.status, 400);

    const ok = await call(baseUrl, 'POST', `/api/v1/projects/${id}/transactions`, {
      transactionId: 'tx-api-00003', projectId: id, expectedRevision: 1, source: 'manual',
      description: 'переименовать карточку',
      operations: [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Через API' } }],
    }, token);
    assert.equal(ok.status, 200);
    assert.equal((ok.json as { revision: number }).revision, 2);

    // Дубликат той же транзакции — успех без повторного применения (запрос идентичен)
    const dup = await call(baseUrl, 'POST', `/api/v1/projects/${id}/transactions`, {
      transactionId: 'tx-api-00003', projectId: id, expectedRevision: 1, source: 'manual',
      description: 'переименовать карточку',
      operations: [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Через API' } }],
    }, token);
    assert.equal(dup.status, 200);
    assert.equal((dup.json as { revision: number }).revision, 2);
    assert.equal((dup.json as { duplicate?: boolean }).duplicate, true);

    // Повтор transactionId с отличающимся телом — 409, тихой подмены нет
    const dupOther = await call(baseUrl, 'POST', `/api/v1/projects/${id}/transactions`, {
      transactionId: 'tx-api-00003', projectId: id, expectedRevision: 1, source: 'manual',
      operations: [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Другое тело' } }],
    }, token);
    assert.equal(dupOther.status, 409);

    // Устаревшая ревизия → 409
    const stale = await call(baseUrl, 'POST', `/api/v1/projects/${id}/transactions`, {
      transactionId: 'tx-api-00004', projectId: id, expectedRevision: 1, source: 'manual',
      operations: [{ op: 'updateNode', targetId: 'card-left', values: { name: 'Просрочено' } }],
    }, token);
    assert.equal(stale.status, 409);

    // Undo с контрактом
    const undone = await call(baseUrl, 'POST', `/api/v1/projects/${id}/undo`, {
      transactionId: 'undo-api-00001', expectedRevision: 2,
    }, token);
    assert.equal(undone.status, 200);
    assert.equal((undone.json.project as Json).revision, 3);
    const afterUndo = await call(baseUrl, 'GET', `/api/v1/projects/${id}`);
    const nodes = (afterUndo.json.project as { nodes: Array<{ id: string; name: string }> }).nodes;
    assert.equal(nodes.find(n => n.id === 'card-left')!.name, 'Карточка слева');

    // Undo с устаревшей ревизией → 409 без SSE и без сдвига истории
    const staleUndo = await call(baseUrl, 'POST', `/api/v1/projects/${id}/undo`, {
      transactionId: 'undo-api-00002', expectedRevision: 2,
    }, token);
    assert.equal(staleUndo.status, 409);

    const redone = await call(baseUrl, 'POST', `/api/v1/projects/${id}/redo`, {
      transactionId: 'redo-api-00001', expectedRevision: 3,
    }, token);
    assert.equal((redone.json.project as Json).revision, 4);

    const journal = await call(baseUrl, 'GET', `/api/v1/projects/${id}/history`);
    assert.deepEqual((journal.json.journal as Array<{ kind: string }>).map(e => e.kind), ['init', 'commit', 'undo', 'redo']);

    const missing = await call(baseUrl, 'GET', '/api/v1/projects/nope');
    assert.equal(missing.status, 404);
  } finally {
    await close();
  }
});

test('API: Host-проверка отклоняет посторонний хост', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const port = new URL(baseUrl).port;
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: Number(port), path: '/api/v1/health', method: 'GET', headers: { Host: `evil.example:${port}` } },
        res => { res.resume(); resolve(res.statusCode ?? 0); },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 403);
  } finally {
    await close();
  }
});

test('API: audio assets advertise finite length and support media byte-range seeking', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const created = await call(baseUrl, 'POST', '/api/v1/projects', { preset: 'energy-v1' });
    assert.equal(created.status, 201);
    const project = created.json.project as { id: string; assets: Array<{ id: string; bytes: number }> };
    const asset = project.assets[0]!;
    const url = `${baseUrl}/api/v1/projects/${project.id}/assets/${asset.id}`;
    const full = await fetch(url);
    assert.equal(full.status, 200);assert.equal(full.headers.get('content-length'), String(asset.bytes));
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    const bytes = Buffer.from(await full.arrayBuffer());
    for (const [range, start, end] of [['bytes=0-43', 0, 43], ['bytes=100-', 100, bytes.length - 1], ['bytes=-17', bytes.length - 17, bytes.length - 1]] as const) {
      const response = await fetch(url, { headers: { Range: range } });
      assert.equal(response.status, 206);assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
    }
    for (const range of ['bytes=99999999-', 'bytes=-0', 'bytes=30-20', 'bytes=-', 'bytes=0-4,10-14']) {
      const response = await fetch(url, { headers: { Range: range } });
      assert.equal(response.status, 416);assert.equal(response.headers.get('content-range'), `bytes */${bytes.length}`);
    }
  } finally { await close(); }
});
