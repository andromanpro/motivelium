import{test}from'node:test';import assert from'node:assert/strict';import{fileURLToPath}from'node:url';import fs from'node:fs/promises';
import{createExamples}from'../../server/examples.ts';import{createTemplateCatalog}from'../../server/templates.ts';import{validateProject}from'../domain/schema.ts';import{evaluateFrame}from'../render/evaluate.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('All four English examples have native editable text, valid graphs and identical source resources',async()=>{
 const ex=createExamples(root),list=await ex.list('en');assert.equal(list.length,4);
 for(const e of list){assert.equal(e.contentLanguage,'en');assert(e.ready);const p=(await ex.load(e.id,'en')).project,ru=(await ex.load(e.id)).project;validateProject(p);
 assert.deepEqual(p.assets.map(a=>[a.id,a.sha256,a.bytes]),ru.assets.map(a=>[a.id,a.sha256,a.bytes]));
 for(const n of p.nodes.filter(n=>n.kind==='text'))assert(!/[А-Яа-яЁё]/u.test(n.text),e.id+':'+n.id);
 assert(p.sequences.every(s=>!/[А-Яа-яЁё]/u.test(s.name)));assert(p.cues.every(c=>!/[А-Яа-яЁё]/u.test(c.label)));
 assert.deepEqual(p.audioTracks.map(({name,...t})=>t),ru.audioTracks.map(({name,...t})=>t));
 }
});
test('English collage regenerates eleven letters and their masks; whole glyphs wait until frame105',async()=>{
 const p=(await createExamples(root).load('showcase','en')).project,settled=p.nodes.filter(n=>n.id.endsWith('-settled'));assert.equal(settled.length,11);
 assert.equal(settled.filter(n=>n.id.startsWith('letter-0')).map(n=>n.kind==='text'?n.text:'').join(''),'MAKEIT');
 assert.equal(settled.filter(n=>n.id.startsWith('letter-1')).map(n=>n.kind==='text'?n.text:'').join(''),'YOURS');
 assert.equal(p.effects.filter(e=>e.definitionId==='contour-window'&&e.targetId.startsWith('letter-')).length,44);
 for(const f of[0,30,75,104])assert(!evaluateFrame(p,f).items.some(i=>i.node.id.endsWith('-settled')&&i.opacity>0));
 assert.equal(evaluateFrame(p,105).items.filter(i=>i.node.id.endsWith('-settled')&&i.opacity>0).length,11);
});
test('Three virtual English templates retain original assets, valid SHA and complete English slot labels',async()=>{
 const t=createTemplateCatalog(root),ru=await t.list(),en=await t.list('en');assert.equal(en.length,3);assert.equal(ru.length,3);
 for(const s of en){assert(s.id.endsWith('-en'));const d=await t.load(s.id,s.version),source=await t.load(s.id.slice(0,-3),s.version);validateProject(d.project);
 assert.deepEqual(d.project.assets.map(a=>[a.id,a.sha256]),source.project.assets.map(a=>[a.id,a.sha256]));
 for(const n of d.project.nodes){if(n.kind==='text')assert(!/[А-Яа-яЁё]/u.test(n.text));if(n.metadata?.slot)assert(!/[А-Яа-яЁё]/u.test(String(n.metadata.slotLabel)))}
 for(const a of d.project.assets){const p=await t.asset(s.id,s.version,a.id);assert.equal((await fs.readFile(p.file)).length,a.bytes)}
 }
});
