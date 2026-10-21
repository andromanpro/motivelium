import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildFixture} from '../domain/fixture.ts';
import {videoExportPlan,videoExportSamples,audioMixGraph,exportTerminal} from '../domain/videoExport.ts';
import {createVideoExportService} from '../../server/videoExport.ts';
import {createStore,StoreError} from '../../server/storage.ts';

test('MP4 plan: rational fps, even padding, muted tracks omitted and gain retained',()=>{
 const p=buildFixture();p.size={width:801,height:451};p.fps={num:30000,den:1001};p.durationFrames=300;
 p.assets.push({id:'a-sound',path:'assets/tone.wav',mime:'audio/wav',sha256:'a'.repeat(64),bytes:1,origin:'generated'});
 p.audioTracks=[{id:'a',kind:'music',assetId:'a-sound',gain:.4,offsetSeconds:-.2,mute:false},{id:'b',kind:'music',assetId:'a-sound',gain:1,offsetSeconds:0,mute:true}];
 const plan=videoExportPlan(p);assert.equal(plan.duration,10.01);assert.deepEqual([plan.width,plan.height],[802,452]);assert.equal(plan.audio.length,1);assert.equal(plan.audio[0]!.gain,.4);
});
test('MP4 preflight: bounds and invalid audio fail before encoding',()=>{
 const p=buildFixture();p.size.width=8192;assert.throws(()=>videoExportPlan(p),/4096/);p.size.width=1280;p.durationFrames=1_000_000;assert.throws(()=>videoExportPlan(p),/5 минут/);p.durationFrames=300;
 p.audioTracks=[{id:'wrong',kind:'voice',assetId:p.assets[0]!.id,gain:1,offsetSeconds:0,mute:false}];assert.throws(()=>videoExportPlan(p),/не на аудио/);
});
test('MP4 evidence: many cues never omit first/poster or last frame',()=>{const p=buildFixture();p.cues=Array.from({length:300},(_,frame)=>({id:'cue-'+frame,frame,kind:'accent',label:'x',trackId:null}));const samples=videoExportSamples(p);assert.ok(samples.has(0));assert.ok(samples.has(p.durationFrames-1));assert.ok(samples.size<=64);});
test('MP4 service: stale revision rejected, no files or project changes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-video-'));try{const store=createStore(root),p=(await store.create({fixture:true})).project;const svc=createVideoExportService(store,root);await assert.rejects(()=>svc.start(p.id,{expectedRevision:0,requestId:'request-123'},'http://127.0.0.1:1'),(e:unknown)=>e instanceof StoreError&&e.status===409);assert.deepEqual((await store.get(p.id)).project,p);assert.deepEqual(await svc.list(p.id),[]);}finally{await fs.rm(root,{recursive:true,force:true})}
});
test('MP4 service: unavailable dependencies are explicit, never a ready job',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-video-'));try{const store=createStore(root),p=(await store.create({fixture:true})).project;const svc=createVideoExportService(store,root,{ffmpeg:'missing-ffmpeg-binary'});const info=await svc.info();assert.equal(info.ready,false);assert.match(info.reason!,/FFmpeg/);await assert.rejects(()=>svc.start(p.id,{expectedRevision:1,requestId:'request-123'},'http://127.0.0.1:1'),(e:unknown)=>e instanceof StoreError&&e.status===503);assert.deepEqual(await svc.list(p.id),[]);}finally{await fs.rm(root,{recursive:true,force:true})}
});
test('MP4 recovery: restart marks interrupted job failed; incomplete file unavailable',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-video-'));try{const store=createStore(root),p=(await store.create({fixture:true})).project,dir=path.join(root,'.local','video-exports',p.id,'mp4-test');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify(p));await fs.writeFile(path.join(dir,'job.json'),JSON.stringify({id:'mp4-test',projectId:p.id,status:'rendering',createdAt:new Date().toISOString()}));const svc=createVideoExportService(store,root);assert.equal((await svc.get(p.id,'mp4-test')).status,'failed');await assert.rejects(()=>svc.file(p.id,'mp4-test'),/не готов/);await assert.rejects(()=>svc.get('../','mp4-test'),/идентификатор/);assert.equal(exportTerminal((await svc.get(p.id,'mp4-test')).status),true);}finally{await fs.rm(root,{recursive:true,force:true})}
});
test('Actual audio mix: positive offset, negative trim, gain, silence and exact duration',async t=>{
 const ffmpeg=process.env.MOTIVELIUM_FFMPEG??'ffmpeg';if(spawnSync(ffmpeg,['-version'],{windowsHide:true}).status!==0){t.skip('FFmpeg unavailable');return;}
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-audio-'));try{
  const sampleRate=48000,n=sampleRate,bytes=Buffer.alloc(44+n*4);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(sampleRate,24);bytes.writeUInt32LE(sampleRate*4,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(n*4,40);
  for(const at of [.05,.3])for(let j=0;j<2;j++)bytes.writeInt16LE(6553,44+Math.round(at*sampleRate)*4+j*2);
  const file=path.join(root,'impulse.wav');await fs.writeFile(file,bytes);
  const tracks=[{id:'late',kind:'sfx' as const,assetId:'a',gain:.5,offsetSeconds:.25,mute:false},{id:'trim',kind:'sfx' as const,assetId:'a',gain:.25,offsetSeconds:-.25,mute:false}];
  const r=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=s=16x16:d=1','-i',file,'-i',file,'-filter_complex',audioMixGraph(tracks,1),'-map','[mix]','-f','f32le','-ar','48000','-ac','2','pipe:1'],{windowsHide:true,maxBuffer:2_000_000});assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stdout.length,48000*2*4);
  const value=(time:number)=>r.stdout.readFloatLE(Math.round(time*48000)*8);assert.ok(Math.abs(value(.05)-.05)<.001);assert.ok(Math.abs(value(.3)-.1)<.001);assert.ok(Math.abs(value(.55)-.1)<.001);assert.equal(value(.9),0);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
