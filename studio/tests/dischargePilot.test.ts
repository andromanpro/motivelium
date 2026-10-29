import{test}from'node:test';import assert from'node:assert/strict';import{fileURLToPath}from'node:url';
import{dischargePulse}from'../effects/discharge3d.ts';import{loadExampleFilm}from'../../server/exampleContent.ts';import{evaluateFrame}from'../render/evaluate.ts';import{packageFeatures}from'../domain/projectPackage.ts';import{applyOperations}from'../domain/operations.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('One-strike pulse has silence before impact, one peak, weaker repeat and fading aftermath',()=>{
 const before=dischargePulse(0,1.2),main=dischargePulse(1.2,1.2),echo=dischargePulse(1.6,1.2),late=dischargePulse(3.9,1.2);
 assert.equal(before.flash,0);assert.equal(before.channel,0);assert.equal(main.main,1);assert(main.flash>echo.flash&&echo.flash>.1);assert(late.channel<.001);assert(late.ember>0&&late.ember<.1);
 assert(dischargePulse(1.5,1.2).channel<.01,'между основным ударом и повтором канал гаснет');assert(Math.abs(echo.echo-.42)<1e-10,'повтор попадает точно в кадр48');
 const copy=dischargePulse(1.2,1.2);dischargePulse(3,1.2);assert.deepEqual(dischargePulse(1.2,1.2),copy);
});
test('Discharge pilot validates with an actual source part and no music; edits are ordinary operations',async()=>{
 const{project:p}=await loadExampleFilm(root,'discharge-pilot-v1');assert.equal(p.durationFrames,120);assert.equal(p.audioTracks.length,0);assert(p.nodes.every(n=>n.kind!=='text'));
 const model=p.nodes.find(n=>n.kind==='scene3d')!;assert(model.kind==='scene3d'&&model.model);const effect=p.effects.find(e=>e.definitionId==='3d-discharge')!;assert(model.model.parts.some(d=>d.id===effect.params.sourcePart&&d.name==='source-tip'));assert(packageFeatures(p).includes('discharge3d-v1'));
 const a=evaluateFrame(p,36);evaluateFrame(p,119);assert.deepEqual(evaluateFrame(p,36),a);assert.equal(a.items.find(i=>i.node.id==='device')!.deltas.discharge3d!.seconds,1.2);
 const q=applyOperations(p,[{op:'updateEffect',targetId:effect.id,values:{params:{...effect.params,lightScene:false}}}]);assert.equal(p.effects.find(e=>e.id===effect.id)!.params.lightScene,true);assert.equal(evaluateFrame(q,36).items.find(i=>i.node.id==='device')!.deltas.discharge3d!.lightScene,false);
});
