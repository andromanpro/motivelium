// Регрессия P1-3: создание никогда не перезаписывает существующий проект.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createStore } from '../../server/storage.ts';

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motivelium-create-'));
  return { store: createStore(dir), dir };
}

test('повторное создание того же пресета даёт новый id и не трогает исходный', async () => {
  const { store, dir } = tempStore();
  const first = await store.create({ fixture: true });
  // Правим первый проект
  await store.commit(first.project.id, {
    transactionId: 'tx-cr1-000001', projectId: first.project.id, expectedRevision: 1, source: 'manual',
    operations: [{ op: 'updateProjectMeta', values: { title: 'Отредактированный' } }],
  });
  const second = await store.create({ fixture: true });
  assert.notEqual(first.project.id, second.project.id, 'новая копия — собственный id');

  // Исходная правка, история и квитанции сохраняются; состояние согласовано.
  const got = await store.get(first.project.id);
  assert.equal(got.project.title, 'Отредактированный');
  assert.equal(got.project.revision, 2);
  assert.ok(got.canUndo, 'история первого проекта цела');

  store._dropCache();
  const afterReload = await store.get(first.project.id);
  assert.equal(afterReload.project.title, 'Отредактированный', 'после сброса кеша правка на месте');
  assert.equal(afterReload.project.revision, 2);

  // На диске — два разных каталога проектов.
  const ids = fs.readdirSync(path.join(dir, '.local', 'projects'));
  assert.equal(ids.length, 2);
  assert.ok(ids.includes(first.project.id));
  assert.ok(ids.includes(second.project.id));
});

test('два конкурентных create не сталкиваются: разные id и каталоги', async () => {
  const { store, dir } = tempStore();
  const [a, b] = await Promise.all([store.create({ fixture: true }), store.create({ fixture: true })]);
  assert.notEqual(a.project.id, b.project.id);
  const ids = fs.readdirSync(path.join(dir, '.local', 'projects'));
  assert.equal(ids.length, 2);
  assert.equal((await store.get(a.project.id)).project.revision, 1);
  assert.equal((await store.get(b.project.id)).project.revision, 1);
});

test('демо-пресет уникален; реальный ассет копируется в собственный каталог (байты и хеш совпадают)', async () => {
  // Настоящий тестовый источник PNG 1×1, не fixture с похожим именем.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motivelium-create-demo-'));
  const sourcePng = path.join(dir, 'test-demo-asset.png');
  const pngBytes = Buffer.from(('89504e470d0a1a0a0000000d49484452000000010000000108060000' +
    '001f15c4890000000d4944415478da636460f8ff1f00050b0509d3b1d1d3000000004945' +
    '4e44ae426082'), 'hex');
  fs.writeFileSync(sourcePng, pngBytes);
  const store = createStore(dir, { demoAssetSource: sourcePng });

  const a = await store.create({ preset: 'm2-demo' });
  const b = await store.create({ preset: 'm2-demo' });
  assert.match(a.project.id, /^m2-demo-/);
  assert.match(b.project.id, /^m2-demo-/);
  assert.notEqual(a.project.id, b.project.id);

  // Копия ассета в собственном каталоге проекта: байты и sha256 совпадают с источником.
  const copied = fs.readFileSync(path.join(dir, '.local', 'projects', a.project.id, 'assets', 'monitor-frame.png'));
  assert.equal(copied.equals(pngBytes), true, 'байты ассета совпадают с тестовым источником');
  const crypto = await import('node:crypto');
  const sha = crypto.createHash('sha256').update(copied).digest('hex');
  const asset = a.project.assets.find(x => x.id === 'asset-monitor-frame')!;
  assert.ok(asset, 'AssetRef в документе');
  assert.equal(asset.sha256, sha, 'sha256 AssetRef совпадает с копией');
  assert.equal(asset.bytes, pngBytes.length);
  assert.equal(asset.width, 1);
  assert.equal(asset.height, 1);
});
