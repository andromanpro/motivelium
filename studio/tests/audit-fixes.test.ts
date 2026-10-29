import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {buildFixture} from '../domain/fixture.ts';
import {audioPlan,mixProjectAudio,mixWav,AUDIO_RATE} from '../domain/audio.ts';
import {createStore} from '../../server/storage.ts';
import {createVideoExportService} from '../../server/videoExport.ts';
import {studioAPIFactory} from '../../server/api.ts';

test('shared PCM: music, voice, SFX, offsets, mute, clipping and deterministic output',async()=>{
 const p=buildFixture();p.durationFrames=30;p.fps={num:30,den:1};
 p.assets=[{id:'tone',mime:'audio/wav',path:'assets/tone.wav',sha256:'a'.repeat(64),bytes:100,origin:'generated'}];
 p.audioTracks=[{id:'music',kind:'music',assetId:'tone',gain:.5,offsetSeconds:.25,mute:false},{id:'voice',kind:'voice',assetId:'tone',gain:.25,offsetSeconds:-.25,mute:false},{id:'silent',kind:'sfx',assetId:'tone',gain:4,offsetSeconds:0,mute:true}];
 const samples=new Float32Array(AUDIO_RATE);samples[2400]=.2;samples[14400]=.2;
 const load=async()=>({channels:[samples],sampleRate:AUDIO_RATE});const mixed=await mixProjectAudio(p,load);
 const at=(s:number)=>mixed.left[Math.round(s*AUDIO_RATE)]!;
 assert.ok(Math.abs(at(.05)-.05)<1e-6);assert.ok(Math.abs(at(.3)-.1)<1e-6);assert.ok(Math.abs(at(.55)-.1)<1e-6);assert.equal(at(.9),0);assert.equal(mixed.tracks,2);
 assert.deepEqual(mixWav(mixed),mixWav(await mixProjectAudio(p,load)));assert.deepEqual(mixed.left,mixed.right);
 p.audioTracks=[{id:'loud',kind:'sfx',assetId:'tone',gain:4,offsetSeconds:0,mute:false}];samples[0]=1;assert.ok((await mixProjectAudio(p,load)).left[0]!<=.950001);
 p.audioTracks.push({id:'accent',kind:'sfx',assetId:null,synth:{voice:'impact',durationSeconds:.2,pitch:100,seed:7},gain:.4,offsetSeconds:.3,mute:false});assert.equal(audioPlan(p).tracks.length,2);
});

test('API: every legacy and modern creation requires token and accepts only same-origin JSON',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-guard-')),store=createStore(root),api=studioAPIFactory(store,{aiRoot:root,videoRoot:root});
 const server=http.createServer((req,res)=>void api(req,res,new URL(req.url!,'http://127.0.0.1:'+String((server.address()as{port:number}).port))));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+String((server.address()as{port:number}).port);
 try{
  const token=(await(await fetch(base+'/api/v1/project-packages')).json()).mutationToken;
  const send=(headers:Record<string,string>)=>fetch(base+'/api/v1/projects',{method:'POST',headers,body:JSON.stringify({title:'guard fixture'})});
  assert.equal((await send({'Content-Type':'text/plain','Origin':'http://127.0.0.1:1'})).status,403);
  assert.equal((await send({'Content-Type':'application/json'})).status,403);
  assert.equal((await send({'Content-Type':'text/plain','x-motivelium-token':token})).status,415);
  assert.equal((await send({'Content-Type':'application/json','x-motivelium-token':token,'Origin':'null'})).status,403);
  assert.equal((await send({'Content-Type':'application/json','x-motivelium-token':token,'Origin':base})).status,201);
  assert.equal((await store.list()).length,1);
 }finally{await new Promise<void>(r=>server.close(()=>r()));assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('motivelium-guard-')||path.basename(root).startsWith('motivelium-receipt-'));await fs.rm(root,{recursive:true,force:true})}
});

test('export receipt: retry survives over20 jobs, restart and index migration',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-receipt-'));try{
  const store=createStore(root),p=(await store.create({fixture:true})).project;
  for(let i=0;i<25;i++){const id='mp4-'+String(i).padStart(3,'0'),dir=path.join(root,'.local','video-exports',p.id,id);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify(p));await fs.writeFile(path.join(dir,'job.json'),JSON.stringify({id,projectId:p.id,revision:p.revision,status:'failed',requestId:'request-'+i,createdAt:new Date(2026,0,1,i).toISOString()}))}
  const svc=createVideoExportService(store,root),a=await svc.start(p.id,{requestId:'request-0',expectedRevision:p.revision},'http://127.0.0.1:1');assert.equal(a.id,'mp4-000');
  const next=createVideoExportService(store,root);assert.equal((await next.start(p.id,{requestId:'request-0',expectedRevision:p.revision},'http://127.0.0.1:1')).id,a.id);
  await assert.rejects(()=>next.start(p.id,{requestId:'request-0',expectedRevision:p.revision+1},'http://127.0.0.1:1'),/другой ревизии/);
 }finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('motivelium-guard-')||path.basename(root).startsWith('motivelium-receipt-'));await fs.rm(root,{recursive:true,force:true})}
});
