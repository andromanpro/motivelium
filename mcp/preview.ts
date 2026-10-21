import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import type {Browser} from 'playwright-core';
import type {Project} from '../studio/domain/schema.ts';
import {runtimeTools} from '../server/runtime.ts';

export type PreviewRequest={project:Project;frames:number[];width:number;directory:string;origin:string;asset:(id:string,signal:AbortSignal)=>Promise<Buffer>;signal?:AbortSignal;clipFps?:number};
export type PreviewResult={frames:Array<{frame:number;path:string;sha256:string;width:number;height:number}>;clip?:{path:string;frames:number;fps:number;durationSeconds:number;withAudio:false}};
export function createPreviewRenderer(root:string){
 const require=createRequire(path.join(root,'studio','package.json'));
 let browser:Browser|undefined,busy=false,encoder:ReturnType<typeof spawn>|undefined;
 async function dispose(){encoder?.kill();await browser?.close().catch(()=>{});browser=undefined;}
 return{dispose,async render(input:PreviewRequest):Promise<PreviewResult>{
  if(busy)throw Error('Другая примерка ещё рисуется. Дождитесь результата.');busy=true;
  const signal=AbortSignal.any([AbortSignal.timeout(90_000),...(input.signal?[input.signal]:[])]),abort=()=>{void dispose()};signal.addEventListener('abort',abort,{once:true});
  try{
   signal.throwIfAborted();const p=input.project;
   if(!input.frames.length||input.frames.length>96||input.frames.some(f=>!Number.isInteger(f)||f<0||f>=p.durationFrames))throw Error('Неверные кадры примерки.');
   const width=Math.min(input.width,p.size.width),height=Math.max(2,Math.round(p.size.height*width/p.size.width));
   await fs.mkdir(input.directory,{recursive:true});
   const assets=new Map<string,Buffer>();let total=0;
   for(const a of p.assets){signal.throwIfAborted();const bytes=await input.asset(a.id,signal);total+=bytes.length;if(total>256*1024*1024)throw Error('Ресурсы примерки превышают 256 МиБ.');if(bytes.length!==a.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw Error('Ресурс изменился: '+a.id);assets.set(a.id,bytes);}
   const {chromium}=require('playwright-core') as typeof import('playwright-core');
   browser=await chromium.launch({headless:true,executablePath:runtimeTools(root).chrome,args:['--no-proxy-server','--mute-audio'],timeout:30000});
   const page=await browser.newPage({viewport:{width:p.size.width,height:p.size.height},deviceScaleFactor:1});page.setDefaultTimeout(45000);
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin!==input.origin){await route.abort();return;}
    const match=/^\/api\/v1\/projects\/([^/]+)\/assets\/([^/]+)$/.exec(url.pathname);
    if(match){const a=p.assets.find(a=>a.id===match[2]),bytes=match[1]===p.id?assets.get(match[2]!):undefined;await route.fulfill(bytes&&a?{status:200,body:bytes,contentType:a.mime}:{status:404,body:'Missing snapshot asset'});return;}
    await route.continue();
   });
   await page.goto(input.origin+'/studio/export/',{waitUntil:'networkidle'});
   await page.waitForFunction(()=>!!(window as unknown as {motiveliumExport?:unknown}).motiveliumExport);
   await page.evaluate(async project=>{await (window as any).motiveliumExport.prepare(project)},p);
   const frames:PreviewResult['frames']=[];
   for(const [index,frame] of input.frames.entries()){
    signal.throwIfAborted();
    const png=await page.evaluate(({frame,width,height})=>{const raw=(window as any).motiveliumExport.frame(frame);const source=document.querySelector('canvas')!;if(source.width===width&&source.height===height)return raw;const target=document.createElement('canvas');target.width=width;target.height=height;target.getContext('2d')!.drawImage(source,0,0,width,height);return target.toDataURL('image/png')},{frame,width,height});
    const bytes=Buffer.from(png.slice('data:image/png;base64,'.length),'base64');if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==width||bytes.readUInt32BE(20)!==height)throw Error('Рендер не вернул ожидаемый PNG.');
    const file=path.join(input.directory,String(index).padStart(6,'0')+'.png');await fs.writeFile(file,bytes);frames.push({frame,path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),width,height});
   }
   if(errors.length)throw Error('Ошибка рендера: '+errors.join('; '));
   const result:PreviewResult={frames};
   if(input.clipFps){
    signal.throwIfAborted();
    const file=path.join(input.directory,'preview.mp4');
    await new Promise<void>((resolve,reject)=>{
     const child=spawn(runtimeTools(root).ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-y','-framerate',String(input.clipFps),'-i',path.join(input.directory,'%06d.png'),'-an','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','-crf','21','-movflags','+faststart',file],{windowsHide:true,stdio:'pipe'});encoder=child;let error='';child.stderr!.on('data',b=>error=(error+b).slice(-3000));child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Превью MP4: '+error)));
    });encoder=undefined;result.clip={path:file,frames:frames.length,fps:input.clipFps,durationSeconds:frames.length/input.clipFps,withAudio:false};
   }
   signal.throwIfAborted();await fs.writeFile(path.join(input.directory,'manifest.json'),JSON.stringify(result,null,2));return result;
  }finally{signal.removeEventListener('abort',abort);await dispose();busy=false;}
 }};
}
