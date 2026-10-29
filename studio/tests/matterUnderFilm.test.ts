import {test} from 'node:test';import assert from 'node:assert/strict';import {loadExampleFilm} from '../../server/exampleContent.ts';import {validateProject} from '../domain/schema.ts';import {poseAt} from '../domain/model3d.ts';import {evaluateFrame} from '../render/evaluate.ts';
test('Under the surface keeps native parts, orderly assembly and no premature title',async()=>{
 const {project:p}=await loadExampleFilm(new URL('../../',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),'matter-under-camera-v1');validateProject(p);assert.equal(p.durationFrames,576);assert.deepEqual(p.audioTracks,[]);
 const n=p.nodes.find(n=>n.kind==='scene3d')!;if(n.kind!=='scene3d')throw Error('Model missing');assert.equal(n.model!.parts.length,102);assert(!n.cameraTargetPart);
 for(const part of n.parts3d!){assert.deepEqual(poseAt(part,0),poseAt(part,575));if(['gltf-83','gltf-84','gltf-6'].includes(part.id))assert(!part.keys);}
 assert(poseAt(n.parts3d!.find(p=>p.id==='gltf-45')!,264).position[1]>.4);
 const title=p.nodes.find(n=>n.id==='under-title')!;assert(!evaluateFrame(p,450).items.some(i=>i.node.id===title.id));assert.equal(evaluateFrame(p,504).items.find(i=>i.node.id===title.id)!.opacity,1);
});
test('Full Matter carries independent music and accents on the same 19.2-second native timeline',async()=>{
 const {project:p}=await loadExampleFilm(new URL('../../',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),'matter-under-film-v1');validateProject(p);assert.equal(p.assets.length,5);assert.equal(p.audioTracks.length,8);
 const score=p.assets.find(a=>a.id==='asset-under-score')!;assert.equal(score.durationSeconds,19.2);
 assert.deepEqual(p.cues!.map(c=>c.frame),[0,108,264,300,504]);assert(p.audioTracks.every(t=>t.assetId&&p.assets.some(a=>a.id===t.assetId)));
});
