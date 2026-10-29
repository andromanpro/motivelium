import{test}from'node:test';import assert from'node:assert/strict';import{fileURLToPath}from'node:url';
import http from'node:http';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';
import{createExamples}from'../../server/examples.ts';import{loadExampleFilm}from'../../server/exampleContent.ts';import{createStore}from'../../server/storage.ts';import{studioAPIFactory}from'../../server/api.ts';import{evaluateFrame}from'../render/evaluate.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('One Strike content variants share geometry, animation and media; only named copy changes',async()=>{
 const ru=(await loadExampleFilm(root,'discharge-film-v1')).project,en=(await loadExampleFilm(root,'discharge-film-en-v1')).project;
 const visual=(p:typeof ru)=>{const q=structuredClone(p);delete(q as Partial<typeof q>).id;delete(q as Partial<typeof q>).title;for(const n of q.nodes){n.name='';if(n.kind==='text'&&n.id==='film-title')n.text=''}for(const a of q.assets)delete a.title;for(const s of q.sequences)s.name='';for(const c of q.cues)c.label='';for(const t of q.audioTracks)delete t.name;return q};
 assert.deepEqual(visual(en),visual(ru));assert.equal(en.nodes.filter(n=>n.kind==='text').find(n=>n.id==='film-title')?.text,'One Strike');
 const copy=structuredClone(en);for(const n of copy.nodes)if(n.kind==='scene3d'&&n.model)for(const part of n.model.parts)part.name='';
 assert(!/[А-Яа-яЁё]/u.test(JSON.stringify(copy)),'recipe copy is English; source GLB part names retain their identity');
 for(let f=0;f<=240;f++)assert(!evaluateFrame(en,f).items.some(i=>i.node.id==='film-title'&&i.opacity>0));
 assert.equal(ru.title,'Один удар · полный этюд');assert.equal(ru.nodes.filter(n=>n.kind==='text').find(n=>n.id==='film-title')?.text,'Один удар');
});
test('Example catalog reports actual content language and explicit preset, independently of UI labels',async()=>{
 const examples=createExamples(root),en=await examples.list('en'),ru=await examples.list();
 assert.equal(en.length,4);assert(en.every(e=>e.ready));assert.equal(en.find(e=>e.id==='energy')!.preset,'discharge-film-en-v1');assert.equal(ru.find(e=>e.id==='energy')!.preset,'discharge-film-v1');
 assert.equal(en.filter(e=>e.contentLanguage==='en').length,4);assert(ru.every(e=>e.contentLanguage==='ru'));
 await assert.rejects(()=>examples.list('de' as 'en'),/Unsupported example language/);
});
test('HTTP example language is explicit and preview never persists a project; copying yields independent editable content',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-example-language-')),store=createStore(root,{dataRoot:temp}),api=studioAPIFactory(store,{aiRoot:root,videoRoot:root}),server=http.createServer((req,res)=>api(req,res,new URL(req.url!,'http://'+req.headers.host)));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{const opened=await fetch(base+'/api/v1/examples/energy?language=en');assert.equal(opened.status,200);const p=(await opened.json()).project;assert.equal(p.nodes.find((n:{id:string})=>n.id==='film-title').text,'One Strike');
 assert.equal((await fetch(base+'/api/v1/examples?language=de')).status,400);assert.equal((await fetch(base+'/api/v1/examples/energy?language=de')).status,400);assert.equal((await store.list()).length,0);
 const a=(await store.create({preset:'discharge-film-en-v1'})).project,b=(await store.create({preset:'discharge-film-en-v1'})).project;assert.notEqual(a.id,b.id);assert.deepEqual(a.assets.map(a=>a.sha256),p.assets.map((a:{sha256:string})=>a.sha256));assert.equal((await examplesTitle()).title,'Один удар · полный этюд');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(temp,{recursive:true,force:true})}
 async function examplesTitle(){return(await createExamples(root).load('energy')).project}
});
