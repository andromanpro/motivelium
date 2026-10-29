import{test}from'node:test';import assert from'node:assert/strict';import{fileURLToPath}from'node:url';
import{loadExampleFilm}from'../../server/exampleContent.ts';import{evaluateFrame}from'../render/evaluate.ts';import{camera3dAt}from'../domain/model3d.ts';import{dischargePulse}from'../effects/discharge3d.ts';import{audioPlan}from'../domain/audio.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('Full one-strike film keeps the accepted event, camera detail/wide plans and an invisible title until the end',async()=>{
 const p=(await loadExampleFilm(root,'discharge-camera-v1')).project;assert.equal(p.durationFrames,300);assert.equal(p.audioTracks.length,0);
 const node=p.nodes.find(n=>n.id==='device')!;assert.equal(node.kind,'scene3d');if(node.kind!=='scene3d')return;const close=camera3dAt(node,0)!,wide=camera3dAt(node,96)!,held=camera3dAt(node,113)!;assert(close.position[2]<wide.position[2]*.5);assert([...wide.position,...wide.target,wide.fov].every((v,i)=>Math.abs(v-[...held.position,...held.target,held.fov][i]!)<1e-10));
 for(let f=0;f<=240;f++){const a=evaluateFrame(p,f);assert(!a.items.some(i=>i.node.id==='film-title'&&i.opacity>0),'название не появляется до завершения события');const pose=camera3dAt(node,f)!;assert(pose.position.every(Number.isFinite))}
 const effect=p.effects.find(e=>e.definitionId==='3d-discharge')!;assert.equal(effect.params.impact,4);assert.equal(dischargePulse(4,4).main,1);assert(dischargePulse(4.4,4).echo>.4);assert(dischargePulse(4.3,4).channel<.01);
 const a=evaluateFrame(p,120);evaluateFrame(p,299);assert.deepEqual(evaluateFrame(p,120),a);
});
test('Final audio is editable independent clips, aligned to both strike frames and with bounded gain',async()=>{
 const p=(await loadExampleFilm(root,'discharge-film-v1')).project;const main=p.audioTracks.find(t=>t.id==='main-crack')!,echo=p.audioTracks.find(t=>t.id==='echo-crack')!;assert.equal(main.offsetSeconds*30,120);assert.equal(echo.offsetSeconds*30,132);assert(main.gain>echo.gain);assert(p.audioTracks.every(t=>t.clip&&t.assetId));assert.equal(audioPlan(p).duration,10);
});
