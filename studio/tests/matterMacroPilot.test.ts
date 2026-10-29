import {test} from 'node:test';import assert from 'node:assert/strict';import {loadExampleFilm} from '../../server/exampleContent.ts';import {validateProject} from '../domain/schema.ts';import {poseAt} from '../domain/model3d.ts';
test('Macro study retains car context and moves only the rim and tire; import hierarchy stays editable',async()=>{
 const {project:p}=await loadExampleFilm(new URL('../../',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),'matter-macro-pilot-v1');validateProject(p);
 const n=p.nodes.find(n=>n.kind==='scene3d')!;if(n.kind!=='scene3d')throw Error('Model absent');
 assert.equal(p.durationFrames,150);assert.deepEqual(p.audioTracks,[]);assert.equal(n.model!.parts.length,102);assert.equal(n.cameraTargetPart,'gltf-84');assert(n.parts3d!.every(p=>p.visible));
 for(const part of n.parts3d!){if(['gltf-82','gltf-85'].includes(part.id)){assert(Math.hypot(...poseAt(part,69).position)<.65);assert.deepEqual(poseAt(part,0),poseAt(part,149));}else assert(!part.keys);}
 assert(p.effects.some(e=>e.definitionId==='3d-studio-stage'&&e.params.lighting==='dramatic'&&!e.params.isolate));
});
