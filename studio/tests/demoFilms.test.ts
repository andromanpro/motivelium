import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {loadExampleFilm,FILM_PRESETS} from '../../server/exampleContent.ts';import {evaluateFrame} from '../render/evaluate.ts';import {audioPlan} from '../domain/audio.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('Three preserved v3 films have distinct native staging, editable animation and complete mixed audio',async()=>{
 const docs=await Promise.all(['energy-v3','matter-v3','showcase-v3'].map(async id=>(await loadExampleFilm(root,id)).project)),[energy,matter,atelier]=docs;
 assert(energy!.effects.some(e=>e.definitionId==='motion-memory'));assert(energy!.nodes.some(n=>n.kind==='shape'&&n.generator?.shaderId==='radiant-event-horizon'));assert(energy!.sequences.every((s,i)=>i===0||s.transition));
 const models=matter!.nodes.filter(n=>n.kind==='scene3d');assert.equal(models.length,4);assert(models.some(n=>n.kind==='scene3d'&&n.parts3d?.some(p=>p.keys?.length)));assert(models.every(n=>n.kind==='scene3d'&&n.camera3dKeys!.length>=2));assert(matter!.assets.some(a=>a.mime==='model/gltf-binary'));assert(matter!.assets.some(a=>a.mime==='text/markdown'));
 assert.equal(atelier!.sequences.length,1);const cameras=atelier!.cameraTracks[0]!.keys;assert(Math.max(...cameras.map(k=>k.zoom))/Math.min(...cameras.map(k=>k.zoom))>7);assert(Math.max(...cameras.map(k=>k.cx))-Math.min(...cameras.map(k=>k.cx))>4000);assert.equal(atelier!.assets.filter(a=>a.mime==='image/png').length,3);
 for(const p of docs){const saved=JSON.stringify(p);assert(p.audioTracks.some(t=>t.synth));assert(audioPlan(p).tracks.length>1);const a=evaluateFrame(p,80);for(const f of [p.durationFrames-1,0,110])evaluateFrame(p,f);assert.deepEqual(evaluateFrame(p,80),a);assert.equal(JSON.stringify(p),saved)}
});
