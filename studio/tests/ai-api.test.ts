import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import type {AddressInfo} from 'node:net';
import {createStore} from '../../server/storage.ts';import {studioAPIFactory} from '../../server/api.ts';
test('AI HTTP requires a token, checks revision before generation, scopes proposal, applies idempotently and undoes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-api-')),store=createStore(root),{project:p}=await store.create({fixture:true});let calls=0;
 const provider={info:()=>({ready:true,model:'http-test',label:'test'}),generate:async()=>{calls++;return{content:JSON.stringify({summary:'Сдвиг',operations:[{op:'updateNode',values:{transform:{x:40}}}]}),model:'http-test',generationId:'g-http',usage:null,finishReason:'stop'}}};
 const api=studioAPIFactory(store,{aiRoot:root,aiProvider:provider}),server=http.createServer((req,res)=>api(req,res,new URL(req.url??'/',`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const call=async(route:string,body?:unknown,token?:string)=>fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{'x-motivelium-token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  const token=(await(await call('/api/v1/projects/'+p.id)).json()).mutationToken,route='/api/v1/projects/'+p.id+'/ai/edits',body={requestId:'ai-http-one',nodeId:'card-left',expectedRevision:1,frame:10,prompt:'Смести вправо'};
  assert.equal((await call(route,body)).status,403);assert.equal(calls,0);assert.equal((await call(route,{...body,expectedRevision:0},token)).status,409);assert.equal(calls,0);
  assert.equal((await call(route,body,token)).status,202);let job;for(let i=0;i<100;i++){job=(await(await call(route+'/'+body.requestId)).json()).job;if(job.status!=='running')break;await new Promise(r=>setTimeout(r,5))}assert.equal(job.status,'proposed');assert.equal(calls,1);
  assert.equal((await call(route,body,token)).status,202);assert.equal(calls,1);assert.equal((await call(route+'/'+body.requestId+'/apply',{})).status,403);
  const a=await(await call(route+'/'+body.requestId+'/apply',{},token)).json(),b=await(await call(route+'/'+body.requestId+'/apply',{},token)).json();assert.equal(a.revision,2);assert.equal(b.revision,2);assert.equal(b.duplicate,true);
  await call('/api/v1/projects/'+p.id+'/undo',{transactionId:'ai-http-undo',expectedRevision:2},token);assert.deepEqual((await store.get(p.id)).project.nodes,p.nodes);
  assert.equal((await call('/api/v1/projects/different/ai/edits/'+body.requestId)).status,404);
 }finally{await new Promise<void>(r=>server.close(()=>r()));fs.rmSync(root,{recursive:true,force:true})}
});
