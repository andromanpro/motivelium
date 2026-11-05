import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import type {AssetRef} from '../studio/domain/schema.ts';
import {videoBlockSize} from '../studio/domain/video.ts';
import {StoreError} from './storage.ts';
import {runtimeTools} from './runtime.ts';

const MAX_CACHE=128*1024*1024;
export function createVideoFrames(root:string,cacheRoot:string){
 const blocks=new Map<string,Promise<{frames:Map<number,Buffer>;bytes:number}>>();
 let active=0;const queue:Array<()=>void>=[];
 async function slot(){if(active>=2){if(queue.length>=16)throw new StoreError(429,'Подготовка видеокадров занята. Повторите перемотку.');await new Promise<void>(r=>queue.push(r));}active++;return()=>{active--;queue.shift()?.();};}
 async function decode(file:string,a:AssetRef,start:number,width:number,block:number){
  const release=await slot(),dir=path.join(cacheRoot,crypto.randomUUID());
  try{
   if(crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')!==a.sha256)throw Error('Контрольная сумма MP4 не совпала.');
   await fs.mkdir(dir,{recursive:true});const fps=a.video!.fps.num/a.video!.fps.den;
   await new Promise<void>((resolve,reject)=>{
    const args=['-hide_banner','-loglevel','error','-nostdin','-protocol_whitelist','file,pipe','-ss',String(Math.max(0,(start-.1)/fps)),'-i',file,'-map','0:v:0','-an','-sn','-dn','-vf',`scale=${width}:-1`,'-filter_threads','1','-frames:v',String(block),'-fps_mode','passthrough','-threads','1','-compression_level','1','-start_number',String(start),path.join(dir,'%09d.png')];
    const child=spawn(runtimeTools(root).ffmpeg,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let err='',done=false;
    const finish=(e?:Error)=>{if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve();};
    const timer=setTimeout(()=>{child.kill();finish(Error('Подготовка видеокадра превысила 30 секунд.'));},30000);
    child.stderr.on('data',b=>err=(err+b).slice(-1000));child.on('error',()=>finish(Error('Для видеослоя нужен FFmpeg. Проверьте компоненты.')));child.on('close',code=>finish(code===0?undefined:Error('Не удалось декодировать MP4: '+err)));
   });
   let bytes=0;const frames=new Map<number,Buffer>();for(const name of await fs.readdir(dir)){const b=await fs.readFile(path.join(dir,name));bytes+=b.length;frames.set(Number(name.slice(0,-4)),b);}
   return{frames,bytes};
  }finally{await fs.rm(dir,{recursive:true,force:true});release();}
 }
 async function sweep(keep:string){
  let bytes=0;const done:Array<[string,{frames:Map<number,Buffer>;bytes:number}]>=[];
  for(const[k,v]of [...blocks]){const b=await v.catch(()=>null);if(b){bytes+=b.bytes;done.push([k,b]);}}
  for(const[k,b]of done){if(bytes<=MAX_CACHE&&blocks.size<=12)break;if(k===keep)continue;blocks.delete(k);bytes-=b.bytes;}
 }
 return{async frame(file:string,a:AssetRef,index:number,width=a.width!):Promise<Buffer>{
  if(a.mime!=='video/mp4'||!a.video||!Number.isSafeInteger(index)||index<0||index>=Math.ceil(a.durationSeconds!*a.video.fps.num/a.video.fps.den-1e-7))throw new StoreError(400,'Видеокадр вне исходника.');
  if(!Number.isInteger(width)||width<1||width>a.width!)throw new StoreError(400,'Неверный размер видеокадра.');
  const block=videoBlockSize(width,Math.round(a.height!*width/a.width!)),start=Math.floor(index/block)*block,key=a.sha256+':'+width+':'+start;
  let pending=blocks.get(key);if(!pending){pending=decode(file,a,start,width,block);blocks.set(key,pending);pending.catch(()=>blocks.delete(key));}
  const b=await pending;blocks.delete(key);blocks.set(key,pending);
  const data=b.frames.get(index);if(!data)throw new StoreError(400,'В исходнике нет запрошенного кадра. Используйте MP4 с постоянной частотой кадров.');
  // In-memory eviction cannot invalidate another reader's Buffer; temporary PNGs are gone.
  void sweep(key).catch(()=>{});return data;
 }};
}
