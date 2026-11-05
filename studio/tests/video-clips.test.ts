import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {blankProject} from '../domain/projectSetup.ts';
import {validateProject,type AssetRef,type VideoNode} from '../domain/schema.ts';
import {applyOperations} from '../domain/operations.ts';
import {videoSample,videoAudioTrack,videoBlockSize} from '../domain/video.ts';
import {audioPlan,mixProjectAudio,AUDIO_RATE} from '../domain/audio.ts';
import {packageFeatures} from '../domain/projectPackage.ts';
import {assertReaderCompatible} from '../domain/version.ts';
import {createMediaService} from '../../server/mediaAssets.ts';
import {createVideoFrames} from '../../server/videoFrames.ts';
import {inspectMp4} from '../../server/videoMetadata.ts';
import {runtimeTools} from '../../server/runtime.ts';
import {createStore} from '../../server/storage.ts';

function fixture(){const p=blankProject({size:{width:160,height:90},durationFrames:180},'video-test',4);
 const a:AssetRef={id:'source',path:'assets/video.mp4',mime:'video/mp4',bytes:1,sha256:'a'.repeat(64),width:160,height:90,durationSeconds:4,origin:'staged',video:{codec:'h264',fps:{num:24,den:1},hasAudio:true}};
 const n:VideoNode={id:'video-main',name:'Clip',kind:'video',assetId:a.id,sequenceId:p.sequences[0]!.id,parentId:null,visible:true,locked:false,geometry:p.size,transform:{x:0,y:0,pivotX:0,pivotY:0,rotation:0,scaleX:1,scaleY:1,opacity:1},fit:'contain',sourceIn:1,sourceOut:3,speed:2,endBehavior:'hide'};
 p.assets=[a];p.nodes=[n];p.audioTracks=[videoAudioTrack(n,a)!];return{p,a,n};}
test('video: cold Full HD seeks prepare at most four frames within a 32MiB raster batch',()=>{
 assert.ok(videoBlockSize(1920,1080)<=4);
 for(const [w,h]of [[1920,1080],[1280,720],[640,360]] as const)assert.ok(videoBlockSize(w,h)*w*h*4<=32*1024*1024);
});
test('video: half-open trims, different source fps, speed, hold/hide and package feature',()=>{
 const{p,n}=fixture();validateProject(p);assert.equal(videoSample(p,n,0)?.index,24);assert.equal(videoSample(p,n,14)?.index,46);assert.equal(videoSample(p,n,30),null);
 n.endBehavior='hold';assert.equal(videoSample(p,n,179)?.index,71);assert.equal(videoSample(p,n,180),null);
 p.fps={num:30000,den:1001};assert.equal(videoSample(p,n,15)?.index,48);
 assert.ok(packageFeatures(p).includes('video-clips-v1'));assert.throws(()=>assertReaderCompatible({minVersion:'0.2.0-beta.1',features:packageFeatures(p)},'0.2.0-beta.1',[]),/Обновите/);
 assert.throws(()=>applyOperations(p,[{op:'updateNode',targetId:n.id,values:{sourceIn:3,sourceOut:2}}]),/sourceIn/);
 assert.throws(()=>applyOperations(p,[{op:'updateNode',targetId:n.id,values:{sourceOut:5}}]),/исходника/);
});
test('video: linked shared mix follows source trim, speed and scene length, delete removes its sound atomically',async()=>{
 const{p,n}=fixture();const pcm=new Float32Array(4*AUDIO_RATE);for(let i=0;i<pcm.length;i++)pcm[i]=i/pcm.length*.1;
 const plan=audioPlan(p);assert.equal(plan.tracks[0]!.playbackRate,2);assert.equal(plan.tracks[0]!.clip!.sourceStartSeconds,1);
 const mix=await mixProjectAudio(p,async()=>({sampleRate:AUDIO_RATE,channels:[pcm]}));assert.ok(Math.abs(mix.left[0]!-.025)<1e-6);assert.ok(Math.abs(mix.left[AUDIO_RATE/2]!-.05)<1e-6);assert.equal(mix.left[AUDIO_RATE+1],0);
 const deleted=applyOperations(p,[{op:'deleteNode',targetId:n.id}]);assert.equal(deleted.audioTracks.length,0);assert.throws(()=>applyOperations(p,[{op:'removeAsset',targetId:'source'}]),/используется/);
});
test('video: real H264 import and random chunk decoding agree with independent frame-index selection',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-video-')),tools=runtimeTools(process.cwd().endsWith('studio')?path.dirname(process.cwd()):process.cwd());
 const run=(args:string[])=>{const r=spawnSync(tools.ffmpeg,['-hide_banner','-loglevel','error','-nostdin',...args],{windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stderr?.toString());};
 try{
  const file=path.join(root,'source.mp4');run(['-f','lavfi','-i','testsrc2=s=1920x1080:r=30000/1001:d=1','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-y',file]);
  const store=createStore(path.join(root,'projects')),p=(await store.create()).project,media=createMediaService(store,root),bytes=await fs.readFile(file),a=(await media.stage(p.id,{expectedRevision:p.revision,name:'source.mp4',base64:bytes.toString('base64')})).asset;
  assert.equal(a.video?.codec,'h264');assert.equal(a.video?.hasAudio,true);assert.equal(a.video?.fps.num,30000);assert.equal((await store.get(p.id)).project.assets.length,0);
  const decoder=createVideoFrames(root,path.join(root,'cache'));
  const rgba=(png:Buffer)=>{const r=spawnSync(tools.ffmpeg,['-v','error','-i','pipe:0','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{input:png,windowsHide:true,timeout:30000,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout;};
  for(const index of [0,17,8,29,1,16]){const expected=path.join(root,'expected.png');run(['-i',file,'-vf',`select=eq(n\\,${index})`,'-frames:v','1','-threads','1','-y',expected]);const actual=await decoder.frame(file,a,index);assert.deepEqual(rgba(actual),rgba(await fs.readFile(expected)),'lossless pixels at source frame '+index);}
  assert.deepEqual(await fs.readdir(path.join(root,'cache')),[],'temporary frames cleaned');
  await assert.rejects(()=>decoder.frame(file,a,30),/вне исходника/);
  const vfr=path.join(root,'vfr.mp4');run(['-f','lavfi','-i','testsrc2=s=160x90:r=30:d=1','-vf',"select='not(eq(mod(n,4),0))'",'-fps_mode','vfr','-c:v','libx264','-y',vfr]);
  await assert.rejects(()=>inspectMp4(tools.ffprobe,vfr),/CFR/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
