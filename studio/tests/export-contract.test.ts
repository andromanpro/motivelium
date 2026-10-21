// Регрессия P2-6: экспортный контракт. expectedRevision обязателен; конфликт
// отклоняется ДО записи; каждая выдача — отдельная job-директория с неизменяемым
// manifest; неполная запись не выглядит готовой; прежние выдачи не перезаписываются.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createStore, StoreError } from '../../server/storage.ts';

const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==';

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motivelium-export-'));
  return { store: createStore(dir), dir };
}

function exportsDir(dir: string, id: string): string {
  return path.join(dir, '.local', 'projects', id, 'exports');
}

test('экспорт требует expectedRevision; конфликт отклоняется до записи', async () => {
  const { store, dir } = tempStore();
  const { project } = await store.create({ fixture: true });
  await store.commit(project.id, { transactionId: 'tx-exp-000001', projectId: project.id, expectedRevision: 1, source: 'manual', operations: [{ op: 'updateProjectMeta', values: { title: 'Новее' } }] });
  await assert.rejects(
    () => store.saveExport(project.id, { expectedRevision: 1, frames: [{ frame: 0, image: PNG1 }] }),
    (e: unknown) => e instanceof StoreError && e.status === 409,
  );
  assert.equal(fs.existsSync(exportsDir(dir, project.id)), false, 'ничего не записано при конфликте');
});

test('успешный экспорт: job-директория, manifest ready с ревизией, snapshotHash и хешами кадров', async () => {
  const { store, dir } = tempStore();
  const { project } = await store.create({ fixture: true });
  const out = await store.saveExport(project.id, { expectedRevision: 1, frames: [{ frame: 0, image: PNG1 }, { frame: 150, image: PNG2 }] });
  assert.equal(out.revision, 1);
  assert.match(out.snapshotHash, /^[0-9a-f]{64}$/);
  const jobAbs = path.join(dir, '.local', 'projects', project.id, 'exports', path.basename(out.jobDir));
  const manifest = JSON.parse(fs.readFileSync(path.join(jobAbs, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'ready');
  assert.equal(manifest.revision, 1);
  assert.equal(manifest.snapshotHash, out.snapshotHash);
  assert.equal(manifest.renderer, 'client-canvas renderFrame; сервер пиксели не проверял');
  assert.equal(manifest.frames.length, 2);
  assert.ok(manifest.frames.every((f: { sha256?: string }) => typeof f.sha256 === 'string' && f.sha256.length === 64));
  assert.ok(fs.existsSync(path.join(jobAbs, 'frame-0000.png')));
});

test('два экспорта — отдельные job, прежний manifest не перезаписывается', async () => {
  const { store, dir } = tempStore();
  const { project } = await store.create({ fixture: true });
  const first = await store.saveExport(project.id, { expectedRevision: 1, frames: [{ frame: 0, image: PNG1 }] });
  await store.commit(project.id, { transactionId: 'tx-exp-000002', projectId: project.id, expectedRevision: 1, source: 'manual', operations: [{ op: 'updateProjectMeta', values: { title: 'Изменён' } }] });
  const second = await store.saveExport(project.id, { expectedRevision: 2, frames: [{ frame: 0, image: PNG2 }] });
  assert.notEqual(first.jobDir, second.jobDir);
  const jobs = fs.readdirSync(exportsDir(dir, project.id));
  assert.equal(jobs.length, 2);
  const firstManifest = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', project.id, 'exports', path.basename(first.jobDir), 'manifest.json'), 'utf8'));
  assert.equal(firstManifest.revision, 1, 'первый manifest не переподписан новой ревизией');
  const secondManifest = JSON.parse(fs.readFileSync(path.join(dir, '.local', 'projects', project.id, 'exports', path.basename(second.jobDir), 'manifest.json'), 'utf8'));
  assert.equal(secondManifest.revision, 2);
  assert.notEqual(firstManifest.snapshotHash, secondManifest.snapshotHash, 'каждый manifest связан со своим снимком');
});

test('отказ посередине записи: manifest incomplete, готовой выдачи нет', async () => {
  const { store, dir } = tempStore();
  const { project } = await store.create({ fixture: true });
  await assert.rejects(
    () => store.saveExport(project.id, {
      expectedRevision: 1,
      frames: [{ frame: 0, image: PNG1 }, { frame: 5, image: 'data:image/png;base64,NOTAPNG' }],
    }),
    /PNG/,
  );
  const jobs = fs.readdirSync(exportsDir(dir, project.id));
  assert.equal(jobs.length, 1, 'job-директория одна');
  const jobAbs = path.join(exportsDir(dir, project.id), jobs[0]!);
  const manifest = JSON.parse(fs.readFileSync(path.join(jobAbs, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'incomplete', 'неполная запись не выглядит готовой');
  assert.ok(typeof manifest.error === 'string');
  assert.ok(!fs.existsSync(path.join(jobAbs, 'manifest-ready.json')));
});

test('параллельные экспорты одной ревизии: обе job независимы', async () => {
  const { store, dir } = tempStore();
  const { project } = await store.create({ fixture: true });
  const [a, b] = await Promise.all([
    store.saveExport(project.id, { expectedRevision: 1, frames: [{ frame: 0, image: PNG1 }] }),
    store.saveExport(project.id, { expectedRevision: 1, frames: [{ frame: 299, image: PNG2 }] }),
  ]);
  assert.notEqual(a.jobDir, b.jobDir);
  assert.equal(fs.readdirSync(exportsDir(dir, project.id)).length, 2);
});

test('кадр вне диапазона и не-PNG отклоняются', async () => {
  const { store } = tempStore();
  const { project } = await store.create({ fixture: true });
  await assert.rejects(() => store.saveExport(project.id, { expectedRevision: 1, frames: [{ frame: 99999, image: PNG1 }] }), /вне \[/);
  await assert.rejects(() => store.saveExport(project.id, { expectedRevision: 1, frames: [] }), /1–12 кадров/);
});
