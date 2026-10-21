import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {validateVisualFrames,imageMessage} from '../../server/ai/images.ts';
import {parseVisualReview,type VisualFrame} from '../agent/visual.ts';
import {createAIService} from '../../server/ai/service.ts';import {createStore} from '../../server/storage.ts';import type {ModelProvider,ModelMessage} from '../../server/ai/provider.ts';
import http from 'node:http';import type {AddressInfo} from 'node:net';import {studioAPIFactory} from '../../server/api.ts';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const frame=(role:'before'|'after'='before',f=10):VisualFrame=>({frame:f,role,image:png,width:1,height:1,target:{visible:true,quad:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]}});
const result={verdict:'needs-work',summary:'Нужно мягче',observations:['Сильное свечение на краю букв'],nextPrompt:'Уменьши силу свечения'};
test('Visual input validates embedded pixels, dimensions, roles and matching pairs; receipts contain no image',()=>{
 const checked=validateVisualFrames([frame(),frame('after')],100,'comparison');assert.equal(checked.frames.length,2);assert.equal(checked.receipts[0]!.sha256.length,64);assert.equal('image' in checked.receipts[0]!,false);
 for(const value of [[{...frame(),image:'https://example.com/a.png'}],[{...frame(),image:'data:image/svg+xml;base64,PHN2Zz4='}],[{...frame(),width:1281}],[frame(),frame()],[frame('after')],[{...frame(),image:png.slice(0,-1)}],[{...frame(),frame:100}]])assert.throws(()=>validateVisualFrames(value,100,'source'));
 assert.throws(()=>validateVisualFrames([frame()],100,'comparison'),/пары/);
 assert.throws(()=>validateVisualFrames([frame(),frame('after',11)],100,'comparison'),/пары/);
 const dirty={...frame(),secret:'not-forwarded',target:{...frame().target,secret:'not-forwarded'}};assert.equal(JSON.stringify(validateVisualFrames([dirty],100,'source')).includes('not-forwarded'),false);
});
test('Multimodal messages contain actual image blocks with explicit role/frame labels, review JSON cannot contain operations',()=>{
 const m=imageMessage({request:'Compare'},[frame(),frame('after')]);assert.ok(Array.isArray(m.content));assert.equal(m.content.filter(v=>v.type==='image_url').length,2);assert.ok(JSON.stringify(m).includes(png));assert.deepEqual(parseVisualReview(result),result);assert.throws(()=>parseVisualReview({...result,operations:[]}));assert.throws(()=>parseVisualReview({...result,verdict:'pass'}));
});
async function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-visual-')),store=createStore(root),{project}=await store.create({fixture:true});return{root,store,project,clean:()=>fs.rmSync(root,{recursive:true,force:true})}}
async function ready(ai:ReturnType<typeof createAIService>,pid:string,id:string,review=false){for(let i=0;i<200;i++){const job=await ai.get(pid,id);if(review?job.visualReview?.status!=='running':job.status!=='running')return job;await new Promise(r=>setTimeout(r,5));}throw Error('Timeout test');}
function provider(delay=1,reviewRaw=JSON.stringify(result)){
 const messages:ModelMessage[][]=[];const instance:ModelProvider={info:()=>({ready:true,model:'text-test',visionModel:'vision-test',label:'test'}),generate:(m,dir,signal)=>new Promise((resolve,reject)=>{messages.push(m);const timer=setTimeout(()=>resolve({content:dir.endsWith('review')?reviewRaw:JSON.stringify({summary:'Сдвиг',notes:[],operations:[{op:'updateNode',values:{transform:{x:40}}}]}),model:'vision-test',generationId:'visual-g-'+messages.length,usage:{total_tokens:15},finishReason:'stop'}),delay);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('Cancelled'));},{once:true});})};return{instance,messages};
}
const body={requestId:'visual-source',nodeId:'card-left',expectedRevision:1,frame:10,prompt:'Смести на40пикселей',allowText:false,visualFrames:[frame()]};
const reviewBody={requestId:'visual-review',expectedRevision:1,visualFrames:[frame(),frame('after')]};
test('Visual edit and explicit comparison preserve the document, persist receipts, resume without calls, refine against original, apply and undo',async()=>{
 const f=await fixture(),p=provider();try{
  const ai=createAIService(f.store,f.root,p.instance);await ai.start(f.project.id,body);let job=await ready(ai,f.project.id,body.requestId);assert.equal(job.status,'proposed');assert.equal(job.model,'vision-test');assert.equal(job.visualFrames?.length,1);assert.equal(p.messages.length,1);assert.ok(Array.isArray(p.messages[0]![1]!.content));
  await ai.review(f.project.id,job.id,reviewBody);job=await ready(ai,f.project.id,job.id,true);assert.equal(job.visualReview?.status,'complete');assert.equal(job.visualReview.verdict,'needs-work');assert.equal((await f.store.get(f.project.id)).project.revision,1);assert.equal(p.messages.length,2);assert.ok(fs.existsSync(path.join(f.root,'.local/ai-edits',job.id,'review/model-result.json')));assert.equal(JSON.stringify(job).includes(png),false);
  await ai.review(f.project.id,job.id,reviewBody);assert.equal(p.messages.length,2);await assert.rejects(()=>ai.review(f.project.id,job.id,{...reviewBody,requestId:'another-review'}),/уже есть/);
  const restored=createAIService(f.store,f.root,p.instance);assert.equal((await restored.get(f.project.id,job.id)).visualReview?.status,'complete');assert.equal(p.messages.length,2);
  const next=await restored.start(f.project.id,{...body,requestId:'visual-refined',previousJobId:job.id,visualFrames:reviewBody.visualFrames});await ready(restored,f.project.id,next.id);const content=p.messages.at(-1)![1]!.content;assert.ok(Array.isArray(content)&&content[0]?.type==='text'&&content[0].text.includes('previousProposal'));assert.equal(p.messages.length,3);
  await restored.apply(f.project.id,next.id);assert.equal((await f.store.get(f.project.id)).project.revision,2);await f.store.undo(f.project.id,{transactionId:'visual-undo',expectedRevision:2});assert.deepEqual((await f.store.get(f.project.id)).project.nodes,f.project.nodes);
 }finally{f.clean();}
});
test('Visual review guards revision and paired frames before calling a model',async()=>{
 const f=await fixture(),p=provider();try{const ai=createAIService(f.store,f.root,p.instance);await ai.start(f.project.id,body);await ready(ai,f.project.id,body.requestId);await assert.rejects(()=>ai.review(f.project.id,body.requestId,{...reviewBody,expectedRevision:0}));await assert.rejects(()=>ai.review(f.project.id,body.requestId,{...reviewBody,visualFrames:[frame()]}));assert.equal(p.messages.length,1);
  await f.store.commit(f.project.id,{transactionId:'visual-neighbor',projectId:f.project.id,expectedRevision:1,source:'manual',operations:[{op:'updateNode',targetId:'card-right',values:{name:'Kept'}}]});await assert.rejects(()=>ai.review(f.project.id,body.requestId,reviewBody),/изменился/);assert.equal(p.messages.length,1);
 }finally{f.clean();}
});
test('Cancelling visual review preserves the applicable proposal; applying while review runs is blocked',async()=>{
 const f=await fixture(),p=provider(25);try{const ai=createAIService(f.store,f.root,p.instance);await ai.start(f.project.id,body);await ready(ai,f.project.id,body.requestId);await ai.review(f.project.id,body.requestId,reviewBody);await assert.rejects(()=>ai.apply(f.project.id,body.requestId),/проверку/);await ai.cancelReview(f.project.id,body.requestId);await new Promise(r=>setTimeout(r,10));const job=await ai.get(f.project.id,body.requestId);assert.equal(job.status,'proposed');assert.equal(job.visualReview?.status,'cancelled');assert.equal((await f.store.get(f.project.id)).project.revision,1);await ai.apply(f.project.id,body.requestId);assert.equal((await f.store.get(f.project.id)).project.revision,2);
 }finally{f.clean();}
});
test('Malformed visual review is retained as failed and cannot silently alter the proposal',async()=>{
 const f=await fixture(),p=provider(1,'{broken');try{const ai=createAIService(f.store,f.root,p.instance);await ai.start(f.project.id,body);const before=await ready(ai,f.project.id,body.requestId);await ai.review(f.project.id,body.requestId,reviewBody);const after=await ready(ai,f.project.id,body.requestId,true);assert.equal(after.visualReview?.status,'failed');assert.deepEqual(after.operations,before.operations);assert.equal((await f.store.get(f.project.id)).project.revision,1);assert.ok(fs.existsSync(path.join(f.root,'.local/ai-edits',body.requestId,'review/model-result.json')));
 }finally{f.clean();}
});
test('Invalid source images and unchecked foreign refinement do not reach the model',async()=>{
 const f=await fixture(),p=provider();try{const ai=createAIService(f.store,f.root,p.instance);await assert.rejects(()=>ai.start(f.project.id,{...body,visualFrames:[{...frame(),image:'https://example.com/image.png'}]}));await assert.rejects(()=>ai.start(f.project.id,{...body,previousJobId:'unknown-job',visualFrames:reviewBody.visualFrames}));assert.equal(p.messages.length,0);assert.equal((await f.store.get(f.project.id)).project.revision,1);}finally{f.clean();}
});
test('Visual review HTTP requires the project token, preserves revision and cancels only the review',async()=>{
 const f=await fixture(),p=provider(50),api=studioAPIFactory(f.store,{aiRoot:f.root,aiProvider:p.instance}),server=http.createServer((req,res)=>api(req,res,new URL(req.url??'/',`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,route='/api/v1/projects/'+f.project.id+'/ai/edits';
 const post=(url:string,b:unknown,token?:string)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'x-motivelium-token':token}:{})},body:JSON.stringify(b)});
 try{const token=(await fetch(base+'/api/v1/projects/'+f.project.id).then(r=>r.json())).mutationToken;assert.equal((await post(route,body,token)).status,202);let j;for(let i=0;i<100;i++){j=(await fetch(base+route+'/'+body.requestId).then(r=>r.json())).job;if(j.status==='proposed')break;await new Promise(r=>setTimeout(r,5));}assert.equal(j.status,'proposed');
  const review=route+'/'+body.requestId+'/review';assert.equal((await post(review,reviewBody)).status,403);assert.equal(p.messages.length,1);assert.equal((await post(review,reviewBody,token)).status,202);assert.equal((await post(route+'/'+body.requestId+'/cancel-review',{})).status,403);assert.equal((await post(route+'/'+body.requestId+'/cancel-review',{},token)).status,200);j=(await fetch(base+route+'/'+body.requestId).then(r=>r.json())).job;assert.equal(j.status,'proposed');assert.equal(j.visualReview.status,'cancelled');assert.equal((await f.store.get(f.project.id)).project.revision,1);
 }finally{await new Promise<void>(r=>server.close(()=>r()));f.clean();}
});
test('Restored running visual review fails explicitly without replaying its model call',async()=>{
 const f=await fixture(),p=provider();try{const ai=createAIService(f.store,f.root,p.instance);await ai.start(f.project.id,body);await ready(ai,f.project.id,body.requestId);await ai.review(f.project.id,body.requestId,reviewBody);await ready(ai,f.project.id,body.requestId,true);const file=path.join(f.root,'.local/ai-edits',body.requestId,'job.json'),stored=JSON.parse(fs.readFileSync(file,'utf8'));stored.visualReview.status='running';fs.writeFileSync(file,JSON.stringify(stored));const restarted=createAIService(f.store,f.root,p.instance),job=await restarted.get(f.project.id,body.requestId);assert.equal(job.visualReview?.status,'failed');assert.match(job.visualReview!.error!,/перезапущен/);assert.equal(job.status,'proposed');assert.equal(p.messages.length,2);assert.equal((await f.store.get(f.project.id)).project.revision,1);
 }finally{f.clean();}
});
