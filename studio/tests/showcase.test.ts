import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildShowcase,SHOWCASE_ASSET_ID} from '../domain/showcase.ts';
import {validateProject} from '../domain/schema.ts';
import {evaluateFrame} from '../render/evaluate.ts';
import {applyMatrix} from '../domain/matrix.ts';
import {SHOWCASE_EFFECTS,defaultParams} from '../effects/registry.ts';
import {createStore} from '../../server/storage.ts';
const make=()=>buildShowcase({sha256:'a'.repeat(64),bytes:100,width:1536,height:1024});

test('showcase is a valid editable document with six contiguous chapters and image/3D layers',()=>{
 const p=validateProject(make());assert.equal(p.durationFrames,720);assert.equal(p.sequences.length,6);
 p.sequences.forEach((s,i)=>assert.equal(s.fromFrame,i?p.sequences[i-1]!.toFrame:0));
 assert.equal(p.sequences.at(-1)!.toFrame,p.durationFrames);
 assert.ok(p.nodes.some(n=>n.kind==='image'&&n.assetId===SHOWCASE_ASSET_ID));
 assert.ok(p.nodes.some(n=>n.kind==='scene3d'&&n.preset==='logo-monolith'));
 assert.ok(new Set(p.effects.map(e=>e.definitionId)).size>=7);
 const first=evaluateFrame(p,0);assert.ok(first.items.some(i=>i.node.id==='spark-title'));assert.ok(first.items.some(i=>i.node.id==='spark-sculpture'));
});
test('all 720 frames are finite; arbitrary seek is deterministic and never mutates the document',()=>{
 const p=make(),before=JSON.stringify(p),expected=evaluateFrame(p,280);
 for(let f=0;f<p.durationFrames;f++){
  const state=evaluateFrame(p,f);assert.ok(state.sequence);
  for(const item of state.items)assert.ok(Object.values(item.screen).every(Number.isFinite));
 }
 for(const f of [719,0,497,216,99,600,280])evaluateFrame(p,f);
 assert.deepEqual(evaluateFrame(p,280),expected);assert.equal(JSON.stringify(p),before);
});
test('showcase effects have finite deterministic endpoints; reveal/entry settle at identity',()=>{
 for(const effect of SHOWCASE_EFFECTS){const params=defaultParams(effect);for(const p of [0,.01,.2,.5,.9,1]){
  const delta=effect.evaluate(p,120,params);assert.ok(Object.values(delta).every(Number.isFinite),effect.id);assert.ok(delta.opacity>=0&&delta.opacity<=1);assert.ok(delta.scale>0);assert.deepEqual(delta,effect.evaluate(p,120,params));
 }}
 for(const effect of SHOWCASE_EFFECTS.filter(e=>['fade-slide','spring-pop','mask-wipe'].includes(e.id))){const d=effect.evaluate(1,720,defaultParams(effect));assert.equal(d.opacity,1);assert.equal(d.reveal,1);assert.equal(d.scale,1);assert.equal(d.x,0);assert.equal(d.y,0)}
});
test('wide camera reveals all three real artboards together',()=>{
 const p=make(),state=evaluateFrame(p,480);assert.ok(state.camera.zoom<.5);
 for(const id of ['canvas-a','canvas-b','canvas-c']){
  const item=state.items.find(i=>i.node.id===id)!;assert.ok(item);
  const center=applyMatrix(item.screen,item.bounds.width/2,item.bounds.height/2);
  assert.ok(center.x>0&&center.x<p.size.width&&center.y>0&&center.y<p.size.height,id);
 }
});
test('rotating accents keep their intended world center during overshoot',()=>{
 const p=make();
 for(const [id,frames,x,y] of [['collage-star',[240,265,300,320],814,402],['final-star',[640,680,719],295,350]] as const){
  for(const frame of frames){const item=evaluateFrame(p,frame).items.find(i=>i.node.id===id)!;assert.ok(item);const center=applyMatrix(item.world,item.bounds.width/2,item.bounds.height/2);assert.ok(Math.abs(center.x-x)<1e-6&&Math.abs(center.y-y)<1e-6,JSON.stringify({id,frame,center,x,y}))}
 }
});
test('showcase stores its own asset; effect edits survive reload and undo/redo',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'motivelium-showcase-'));
 const source=fileURLToPath(new URL('../../www/showcase/assets/kinetic-sculpture.png',import.meta.url));
 try {
  const store=createStore(root,{showcaseAssetSource:source});const {project:p}=await store.create({preset:'showcase-v1'});
  const asset=await store.assetFile(p.id,SHOWCASE_ASSET_ID);assert.equal(fs.statSync(asset.file).size,p.assets[0]!.bytes);
  const e=p.effects.find(e=>e.definitionId==='orbit-motion')!;
  await store.commit(p.id,{transactionId:'showcase-edit-00001',projectId:p.id,expectedRevision:1,source:'manual',operations:[{op:'updateEffect',targetId:e.id,values:{params:{...e.params,radiusX:210}}}]});
  assert.equal((await createStore(root).get(p.id)).project.effects.find(x=>x.id===e.id)!.params.radiusX,210);
  await store.undo(p.id,{transactionId:'showcase-undo-00001',expectedRevision:2});assert.equal((await store.get(p.id)).project.effects.find(x=>x.id===e.id)!.params.radiusX,e.params.radiusX);
  await store.redo(p.id,{transactionId:'showcase-redo-00001',expectedRevision:3});assert.equal((await store.get(p.id)).project.effects.find(x=>x.id===e.id)!.params.radiusX,210);
 } finally {fs.rmSync(root,{recursive:true,force:true})}
});
test('missing showcase artwork refuses creation without a partial project',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'motivelium-showcase-missing-'));
 try {const store=createStore(root);await assert.rejects(()=>store.create({preset:'showcase-v1'}),/Не найдено изображение/);assert.deepEqual(await store.list(),[])}finally{fs.rmSync(root,{recursive:true,force:true})}
});
