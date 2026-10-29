import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {glyphPose,type GlyphMotion} from '../effects/glyphMotion.ts';
import {buildLetterShow} from '../domain/letterShow.ts';import {validateProject} from '../domain/schema.ts';import {evaluateFrame} from '../render/evaluate.ts';
import {applyOperations} from '../domain/operations.ts';import {addEffectOperation} from '../effects/catalog.ts';import {createExamples} from '../../server/examples.ts';import {createStore} from '../../server/storage.ts';
import {packageFeatures} from '../domain/projectPackage.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const motion:GlyphMotion={mode:'wave',progress:.25,amplitude:40,cycles:2,stagger:.4,rotation:15,colorize:false,hue:160};
test('Glyph choreography: neighbouring signs move independently; reverse seek is pure; assembly settles',()=>{
 assert.notDeepEqual(glyphPose(motion,0,8),glyphPose(motion,1,8));const before=glyphPose(motion,2,8);glyphPose({...motion,progress:.8},2,8);assert.deepEqual(glyphPose(motion,2,8),before);
 for(let i=0;i<8;i++){const p=glyphPose({...motion,mode:'assemble',progress:1},i,8);assert.equal(Math.abs(p.x)+Math.abs(p.y)+Math.abs(p.rotation),0);assert.equal(p.scale,1);assert.equal(p.opacity,1)}
});
test('New text show validates, preserves its four faces, and produces glyph + material deltas',()=>{
 const p=buildLetterShow({sha256:'a'.repeat(64),bytes:123});validateProject(p);assert.equal(new Set(p.nodes.filter(n=>n.kind==='text').map(n=>n.kind==='text'&&n.fontFamily)).size,4);
 const item=evaluateFrame(p,400).items.find(n=>n.node.id==='ink-title')!;assert(item.deltas.glyphMotion);assert(item.deltas.fluid);assert.equal(item.deltas.echoes,2);
 assert.throws(()=>applyOperations(p,[addEffectOperation(p,'hero','glyph-motion',{},0,160,'duplicate')]),/не должны пересекаться/);
 const q=applyOperations(p,[{op:'updateNode',targetId:'hero',values:{fontFamily:'Literata Italic',fontWeight:600}}]);assert.equal(q.nodes.find(n=>n.id==='hero')!.kind,'text');assert.equal(evaluateFrame(q,60).items.find(n=>n.node.id==='hero')!.deltas.glyphMotion!.amplitude,48);assert.deepEqual(packageFeatures(q),['kinetic-type-v1']);
});
test('Gallery preview equals its created editable copy; v1 documents stay unchanged',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-type-'));try{
  const store=createStore(root,{dataRoot:temp}),examples=createExamples(root);for(const e of await examples.list()){
   const a=(await examples.load(e.id)).project,b=(await store.create({preset:e.preset})).project;validateProject(a);validateProject(b);assert.deepEqual(b.nodes,a.nodes);assert.deepEqual(b.effects,a.effects);assert.deepEqual(b.assets,a.assets);
  }
  const v1=(await store.create({preset:'energy-v1'})).project;assert(v1.nodes.some(n=>n.kind==='text'&&n.fontFamily==='Arial Black'));assert(!v1.effects.some(e=>e.definitionId==='glyph-motion'));
 }finally{assert(path.basename(temp).startsWith('motivelium-type-'));await fs.rm(temp,{recursive:true,force:true})}
});
