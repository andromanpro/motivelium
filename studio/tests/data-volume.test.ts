import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {createStore} from '../../server/storage.ts';import {createProjectActions} from '../../server/projectActions.ts';import {createArtifactMaintenance} from '../../server/artifacts.ts';
import {createProjectPackageService} from '../../server/projectPackage.ts';

test('project creation stages in the authoritative store when application and data roots differ',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-volume-'));
 try{
  const app=path.join(root,'program'),data=path.join(root,'user-data');await fs.mkdir(app);
  const store=createStore(app,{dataRoot:data}),input={requestId:'different-volume-001',title:'Data volume',durationFrames:90};
  const first=await createProjectActions(store,app).create(input);
  await fs.access(path.join(data,'project-actions',input.requestId,'request.json'));
  await assert.rejects(()=>fs.access(path.join(app,'.local','project-actions')));
  assert.equal((await createProjectActions(createStore(app,{dataRoot:data}),app).create(input)).id,first.id);
  const copy=await createProjectActions(store,app).copy(first.id,{requestId:'different-volume-copy',expectedRevision:1});assert.notEqual(copy.id,first.id);assert.equal((await store.list()).length,2);
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('motivelium-volume-'));await fs.rm(root,{recursive:true,force:true})}
});

test('ZIP export and activation stage beside the selected store when program root differs',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-zip-volume-'));
 try{
  const app=path.join(root,'program'),data=path.join(root,'user-data');await fs.mkdir(app);const store=createStore(app,{dataRoot:data});
  const original=await createProjectActions(store,app).create({requestId:'zip-volume-create-001',title:'ZIP on the data volume',durationFrames:60});
  const packages=createProjectPackageService(store,app),exported=await packages.exportProject(original.id,original.revision),file=await packages.exportedFile(exported.id);await fs.access(path.join(data,'project-packages','exports',exported.id,'receipt.json'));
  const bytes=await fs.readFile(file.file);async function* stream(){yield bytes}const preview=await packages.stage(stream(),bytes.length),imported=await packages.apply(preview.id);
  assert.notEqual(imported.project.id,original.id);assert.deepEqual(imported.project.nodes,original.nodes);await fs.access(path.join(data,'project-packages','incoming',preview.id,'activation.json'));await assert.rejects(()=>fs.access(path.join(app,'.local','project-packages')));
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('motivelium-zip-volume-'));await fs.rm(root,{recursive:true,force:true})}
});

test('cleanup canonicalizes a selected storage alias but preserves completed files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-alias-'));
 try{
  const actual=path.join(root,'actual'),alias=path.join(root,'alias'),job=path.join(actual,'.local','video-exports','project-a','mp4-old');await fs.mkdir(path.join(job,'assets'),{recursive:true});
  await fs.writeFile(path.join(job,'assets','derived.bin'),Buffer.alloc(64));await fs.writeFile(path.join(job,'result.mp4'),'keep');await fs.writeFile(path.join(job,'job.json'),JSON.stringify({status:'ready',updatedAt:'2020-01-01'}));await fs.symlink(actual,alias,'junction');
  const svc=createArtifactMaintenance(alias);assert.equal((await svc.info()).reclaimableBytes,64);assert.equal((await svc.clean()).reclaimedBytes,64);assert.equal(await fs.readFile(path.join(job,'result.mp4'),'utf8'),'keep');
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('motivelium-alias-'));await fs.rm(root,{recursive:true,force:true})}
});

test('cleanup uses the explicit data store and refuses an exports link outside it',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-clean-volume-'));
 try{
  const app=path.join(root,'app'),data=path.join(root,'data'),outside=path.join(root,'outside'),job=path.join(outside,'project-a','mp4-old');await fs.mkdir(data);await fs.mkdir(path.join(job,'assets'),{recursive:true});await fs.writeFile(path.join(job,'assets','keep.bin'),Buffer.alloc(32));await fs.writeFile(path.join(job,'job.json'),JSON.stringify({status:'ready',updatedAt:'2020-01-01'}));await fs.symlink(outside,path.join(data,'video-exports'),'junction');
  const svc=createArtifactMaintenance(app,{dataRoot:data});assert.equal((await svc.info()).reclaimableBytes,0);assert.equal((await svc.clean()).reclaimedBytes,0);assert.equal((await fs.stat(path.join(job,'assets','keep.bin'))).size,32);
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('motivelium-clean-volume-'));await fs.rm(root,{recursive:true,force:true})}
});
