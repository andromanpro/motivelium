import{test}from'node:test';import assert from'node:assert/strict';import{fileURLToPath}from'node:url';import{loadExampleFilm}from'../../server/exampleContent.ts';import{evaluateFrame}from'../render/evaluate.ts';import{packageFeatures}from'../domain/projectPackage.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('Assembly title has no raw text before the entrance, then remains after it',async()=>{
 const {project:p}=await loadExampleFilm(root,'showcase-v4'),effect=p.effects.find(e=>e.targetId==='c-title'&&e.definitionId==='glyph-motion')!;
 for(let f=0;f<=effect.fromFrame;f++)assert(!evaluateFrame(p,f).items.some(i=>i.node.id==='c-title'),'Text leaked before assembly at frame '+f);
 for(let f=effect.fromFrame+1;f<effect.toFrame;f++)assert.equal(evaluateFrame(p,f).items.find(i=>i.node.id==='c-title')?.deltas.glyphMotion?.mode,'assemble');
 const final=evaluateFrame(p,effect.toFrame).items.find(i=>i.node.id==='c-title')!;assert.equal(final.opacity,1);assert(!final.deltas.glyphMotion);
 const a=evaluateFrame(p,effect.fromFrame-1);evaluateFrame(p,effect.toFrame+1);assert.deepEqual(evaluateFrame(p,effect.fromFrame-1),a);
});
test('New discharge uses a separate licensed shader; legacy effect and project remain readable',async()=>{
 const {project:p}=await loadExampleFilm(root,'energy-v5');assert(p.effects.some(e=>e.definitionId==='storm-lightning'));assert(!p.effects.some(e=>e.definitionId==='electric-arc'));assert(packageFeatures(p).includes('storm-lightning-v1'));
 const old=(await loadExampleFilm(root,'energy-v4')).project;assert(old.effects.some(e=>e.definitionId==='electric-arc'));assert(!old.effects.some(e=>e.definitionId==='storm-lightning'));
 const a=evaluateFrame(p,154);evaluateFrame(p,310);assert.deepEqual(evaluateFrame(p,154),a);assert(a.items.some(i=>i.deltas.stormLightning));
});
