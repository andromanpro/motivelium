import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {CATALOG,addEffectOperation,compatibilityReason,effectRange,effectStack,filterCatalog,moveEffectOperations,readEffectIds} from '../effects/catalog.ts';
import {REGISTRY} from '../effects/registry.ts';import {buildEffectFixture,galleryDefaultParams} from '../effects/fixtures.ts';
import {buildFixture} from '../domain/fixture.ts';import {validateProject} from '../domain/schema.ts';import {applyOperations} from '../domain/operations.ts';import {evaluateFrame} from '../render/evaluate.ts';import {createStore} from '../../server/storage.ts';

test('all catalog cards have real validated fixtures and replay the same frame after jumps',()=>{
 assert.equal(CATALOG.length,34);assert.deepEqual([...CATALOG.map(c=>c.id)].sort(),[...REGISTRY.keys()].filter(id=>id!=='shader-filter').sort());assert.ok(REGISTRY.has('shader-filter'),'GPU filters have their own native shader library');
 for(const c of CATALOG){const p=validateProject(buildEffectFixture(c.id)),before=JSON.stringify(p),frame=evaluateFrame(p,42);[0,119,95,4].forEach(f=>evaluateFrame(p,f));assert.deepEqual(evaluateFrame(p,42),frame);assert.equal(JSON.stringify(p),before);for(const item of frame.items)assert.ok(Object.values(item.screen).every(Number.isFinite))}
});
test('a gallery try-on affects only its target and interval without committing a revision',()=>{
 const p=buildFixture(),original=JSON.stringify(p),node=p.nodes.find(n=>n.id==='card-left')!,range=effectRange(p,node);
 const op=addEffectOperation(p,node.id,'chromatic-split',{amount:25},range.fromFrame+10,range.toFrame-10,'gallery-test-one'),trial=applyOperations(p,[op]);
 assert.equal(JSON.stringify(p),original);assert.equal(trial.revision,p.revision);assert.deepEqual(trial.nodes,p.nodes);assert.deepEqual(trial.cameraTracks,p.cameraTracks);assert.equal(trial.effects.length,p.effects.length+1);assert.equal(trial.effects.at(-1)!.targetId,node.id);
 const frame=range.fromFrame+45,a=evaluateFrame(p,frame),b=evaluateFrame(trial,frame);assert.notDeepEqual(b.items.find(i=>i.node.id===node.id)!.deltas,a.items.find(i=>i.node.id===node.id)!.deltas);
 assert.deepEqual(b.items.find(i=>i.node.id==='card-right'),a.items.find(i=>i.node.id==='card-right'));assert.deepEqual(evaluateFrame(trial,range.fromFrame),evaluateFrame(p,range.fromFrame));
});
test('gallery rejects incompatible groups, locked parents and ranges outside the scene',()=>{
 const p=buildFixture(),node=p.nodes.find(n=>n.id==='card-left')!,range=effectRange(p,node),before=JSON.stringify(p);
 assert.throws(()=>addEffectOperation(p,'group-cards','prism-fold',{},range.fromFrame,range.toFrame,'invalid-group'),/группы/);
 assert.throws(()=>addEffectOperation(p,node.id,'fade-slide',{},range.fromFrame-1,range.toFrame,'invalid-time'),/внутри сцены/);
 assert.throws(()=>addEffectOperation(p,node.id,'fade-slide',{span:0},range.fromFrame,range.toFrame,'invalid-param'),/вне/);
 assert.equal(JSON.stringify(p),before);p.nodes.find(n=>n.id==='group-cards')!.locked=true;
 assert.match(compatibilityReason(p,node,'fade-slide')!,/заблокированы/);
});
test('search handles intent words, categories, shortlist and malformed persisted preferences',()=>{
 assert.ok(filterCatalog('цвет','Все').some(c=>c.id==='chromatic-split'));assert.equal(filterCatalog('','Частицы').length,2);assert.deepEqual(filterCatalog('','Все',['prism-fold']).map(c=>c.id),['prism-fold']);
 assert.deepEqual(readEffectIds('{broken'),[]);assert.deepEqual(readEffectIds('["prism-fold","prism-fold","unknown",1]'),['prism-fold']);
});
test('stack reordering handles equal orders without modifying neighbors or parameters',()=>{
 let p=buildFixture(),range=effectRange(p,p.nodes.find(n=>n.id==='card-left')!);
 for(const [id,def] of [['added-a','chromatic-split'],['added-b','echo-trail']] as const)p=applyOperations(p,[addEffectOperation(p,'card-left',def,galleryDefaultParams(def),range.fromFrame,range.toFrame,id)]);
 p.effects.find(e=>e.id==='added-a')!.order=p.effects.find(e=>e.id==='added-b')!.order;
 const other=p.effects.filter(e=>e.targetId!=='card-left'),sorted=effectStack(p,'card-left'),last=sorted.at(-1)!,moved=applyOperations(p,moveEffectOperations(p,last.id,-1));
 assert.equal(effectStack(moved,'card-left').at(-2)!.id,last.id);assert.deepEqual(moved.effects.filter(e=>e.targetId!=='card-left'),other);assert.deepEqual(moved.effects.find(e=>e.id===last.id)!.params,last.params);
});
test('gallery add, reorder and remove use persisted transactions and undo restores the project',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gallery-store-'));try{
  const store=createStore(root),{project:p}=await store.create({fixture:true}),range=effectRange(p,p.nodes.find(n=>n.id==='card-left')!),op=addEffectOperation(p,'card-left','echo-trail',galleryDefaultParams('echo-trail'),range.fromFrame,range.toFrame,'new-gallery-fx');
  await store.commit(p.id,{transactionId:'gallery-add-00001',projectId:p.id,expectedRevision:1,source:'manual',operations:[op]});const q=(await store.get(p.id)).project;assert.equal(q.revision,2);assert.equal(q.effects.at(-1)!.id,'new-gallery-fx');
  await store.commit(p.id,{transactionId:'gallery-remove-00001',projectId:p.id,expectedRevision:2,source:'manual',operations:[{op:'removeEffect',targetId:'new-gallery-fx'}]});await store.undo(p.id,{transactionId:'gallery-undo-00001',expectedRevision:3});assert.ok((await store.get(p.id)).project.effects.some(e=>e.id==='new-gallery-fx'));
  await store.undo(p.id,{transactionId:'gallery-undo-00002',expectedRevision:4});const restored=(await store.get(p.id)).project;assert.deepEqual(restored.nodes,p.nodes);assert.deepEqual(restored.effects,p.effects);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
