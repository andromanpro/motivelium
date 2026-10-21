import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {buildEnergy,ENERGY_AUDIO_ID} from '../domain/energy.ts';import {buildFixture} from '../domain/fixture.ts';import {validateProject} from '../domain/schema.ts';import {evaluateFrame} from '../render/evaluate.ts';import {ENERGY_EFFECTS,combineDeltas,defaultParams,NEUTRAL_DELTAS} from '../effects/registry.ts';import {applyOperations} from '../domain/operations.ts';import {createStore} from '../../server/storage.ts';
const make=()=>buildEnergy({sha256:'b'.repeat(64),bytes:100});
test('energy demo is a valid six-scene document with music and all eight new effects',()=>{
 const p=validateProject(make());assert.equal(p.durationFrames,640);assert.equal(p.sequences.length,6);assert.equal(p.audioTracks[0]!.assetId,ENERGY_AUDIO_ID);
 for(const d of ENERGY_EFFECTS)assert.ok(p.effects.some(e=>e.definitionId===d.id),d.id);
 assert.equal(p.cues.filter(c=>c.kind==='beat').length,64);for(const seq of p.sequences)assert.equal(seq.fromFrame%10,0);
});
test('every energy frame is finite and replay is independent of frame order',()=>{
 const p=make(),before=JSON.stringify(p),expected=[115,245,375,500].map(f=>evaluateFrame(p,f));
 for(let frame=0;frame<640;frame++){const state=evaluateFrame(p,frame);assert.ok(state.sequence);for(const item of state.items){assert.ok(Object.values(item.screen).every(Number.isFinite));assert.ok(Object.values(item.deltas).every(Number.isFinite))}}
 [500,0,639,245,10].forEach(f=>evaluateFrame(p,f));assert.deepEqual([115,245,375,500].map(f=>evaluateFrame(p,f)),expected);assert.equal(JSON.stringify(p),before);
});
test('all new definitions stay finite, positive and deterministic across their progress',()=>{
 for(const d of ENERGY_EFFECTS)for(const p of [0,.01,.15,.5,.9,1]){const v=d.evaluate(p,123,defaultParams(d));assert.ok(Object.values(v).every(Number.isFinite),d.id);assert.ok(v.opacity>=0&&v.opacity<=1);assert.ok(v.scale>0);assert.ok((v.stretchX??1)>0&&(v.stretchY??1)>0);assert.deepEqual(v,d.evaluate(p,123,defaultParams(d)))}
});
test('optional compositor deltas preserve legacy neutral shape and compose stretch multiplicatively',()=>{
 assert.deepEqual(combineDeltas([{...NEUTRAL_DELTAS}]),NEUTRAL_DELTAS);
 const d=combineDeltas([{...NEUTRAL_DELTAS,stretchX:2,stretchY:.5,chromatic:3},{...NEUTRAL_DELTAS,stretchX:.75,stretchY:1.25,chromatic:9}]);assert.equal(d.stretchX,1.5);assert.equal(d.stretchY,.625);assert.equal(d.chromatic,9);
});
test('outline fill opacity is validated and remains separate from stroke opacity',()=>{
 const p=buildFixture();const updated=applyOperations(p,[{op:'updateNode',targetId:'card-left',values:{fillOpacity:0} as never}]);assert.equal((updated.nodes.find(n=>n.id==='card-left') as {fillOpacity?:number}).fillOpacity,0);assert.equal(updated.nodes.find(n=>n.id==='card-left')!.transform.opacity,1);
 for(const value of [-1,2,'zero',NaN])assert.throws(()=>applyOperations(p,[{op:'updateNode',targetId:'card-left',values:{fillOpacity:value} as never}]),/fillOpacity/);
});
test('elastic deformation reaches the actual world matrix while preserving its pivot',()=>{
 const p=make(),n=p.nodes.find(n=>n.id==='jelly-letter-1')!,frame=evaluateFrame(p,474).items.find(i=>i.node.id===n.id)!;assert.notEqual(frame.deltas.stretchX,1);assert.ok(frame.screen.a!==1);assert.ok(frame.bounds.width===n.geometry.width);
});
test('synthesized soundtrack duration exactly matches 640 frames, and asset is copied per project',async()=>{
 const source=fileURLToPath(new URL('../../www/energy/assets/razryad-180.wav',import.meta.url)),wav=fs.readFileSync(source);assert.equal(wav.subarray(0,4).toString(),'RIFF');assert.equal(wav.subarray(8,12).toString(),'WAVE');assert.equal(wav.readUInt32LE(24),48000);assert.equal((wav.length-44)/(48000*2*2),640/30);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'energy-test-'));
 try{const store=createStore(root,{energyAudioSource:source});const {project:a}=await store.create({preset:'energy-v1'}),{project:b}=await store.create({preset:'energy-v1'});assert.notEqual(a.id,b.id);const asset=await store.assetFile(a.id,ENERGY_AUDIO_ID);assert.deepEqual(fs.readFileSync(asset.file),wav);const effect=a.effects.find(e=>e.definitionId==='prism-fold')!;
 await store.commit(a.id,{transactionId:'energy-effect-00001',projectId:a.id,expectedRevision:1,source:'manual',operations:[{op:'updateEffect',targetId:effect.id,values:{params:{copies:5}}}]});await store.undo(a.id,{transactionId:'energy-undo-000001',expectedRevision:2});assert.equal((await store.get(a.id)).project.effects.find(e=>e.id===effect.id)!.params.copies,8);assert.equal((await store.get(b.id)).project.revision,1);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
