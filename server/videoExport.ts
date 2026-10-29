import {localDataDir} from './dataPaths.ts';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import type {Browser} from 'playwright-core';
import type {Project} from '../studio/domain/schema.ts';
import {mixProjectAudio,mixWav,AUDIO_RATE,audioSourceEnd} from '../studio/domain/audio.ts';
import {videoExportPlan,videoExportSamples,exportTerminal,type VideoExportJob} from '../studio/domain/videoExport.ts';
import {StoreError,type Store} from './storage.ts';
import {runtimeTools} from './runtime.ts';

const hash=(b:crypto.BinaryLike)=>crypto.createHash('sha256').update(b).digest('hex');
const ID=/^[a-z0-9-]{1,100}$/;
type Entry={job:VideoExportJob;dir:string;project:Project;assets:Map<string,{file:string;mime:string}>;cancel:boolean;browser?:Browser;process?:ChildProcessWithoutNullStreams;frames:Array<{frame:number;sha256:string}>;writes?:Promise<void>};
type Options={ffmpeg?:string;ffprobe?:string;chrome?:string;maxWallMs?:number};

/** Local jobs own their snapshot/assets; project/history are never written by an export. */
export function createVideoExportService(store:Store,root:string,options:Options={}){
 const base=path.join(localDataDir(root),'video-exports'),require=createRequire(path.join(root,'studio','package.json'));
 const tools=runtimeTools(root),ffmpeg=options.ffmpeg??tools.ffmpeg;
 const ffprobe=options.ffprobe??tools.ffprobe;
 const jobs=new Map<string,Entry>();let active:Entry|undefined,starting=false;
 let runtimePromise:Promise<{ready:boolean;reason?:string;encoder?:string;chrome?:string}>|undefined;
 const dirFor=(pid:string,jid:string)=>{if(!ID.test(pid)||!ID.test(jid))throw new StoreError(400,'Некорректный идентификатор экспорта');return path.join(base,pid,jid)};
 async function atomic(file:string,value:unknown){const tmp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';await fs.writeFile(tmp,JSON.stringify(value,null,2));await fs.rename(tmp,file);}
 async function save(e:Entry){e.job.updatedAt=new Date().toISOString();const snapshot=structuredClone(e.job);const writing=(e.writes??Promise.resolve()).catch(()=>{}).then(()=>atomic(path.join(e.dir,'job.json'),snapshot));e.writes=writing;await writing;}
 function ensure(e:Entry){if(e.cancel)throw Error('Экспорт отменён');}
 function runTool(binary:string,args:string[],entry?:Entry):Promise<string>{
  return new Promise((resolve,reject)=>{
   const child=spawn(binary,args,{windowsHide:true,stdio:'pipe'});if(entry)entry.process=child;
   let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('Инструмент не ответил: '+path.basename(binary)));},120_000);
   child.stdout.on('data',b=>{out=(out+b.toString()).slice(-2_000_000)});child.stderr.on('data',b=>{err=(err+b.toString()).slice(-16000)});
   child.on('error',error=>{clearTimeout(timer);reject(error)});
   child.on('close',code=>{clearTimeout(timer);if(entry?.process===child)entry.process=undefined;code===0?resolve(out):reject(Error(path.basename(binary)+': '+err.slice(-3000)))});
  });
 }
 async function runtime(){
  runtimePromise??=(async()=>{try{
   require('playwright-core');
   const chrome=options.chrome??tools.chrome;
   await fs.access(chrome);
   const version=await runTool(ffmpeg,['-version']);await runTool(ffprobe,['-version']);
   const encoders=await runTool(ffmpeg,['-hide_banner','-encoders']);if(!encoders.includes('libx264')||!encoders.includes(' aac '))throw Error('FFmpeg должен содержать кодировщики libx264 и AAC.');
   return{ready:true,chrome,encoder:version.split('\n')[0]?.trim()};
  }catch(error){return{ready:false,reason:'Для экспорта нужны FFmpeg/FFprobe с H.264/AAC, Chrome и playwright-core. '+(error as Error).message}}})();
  return runtimePromise;
 }
 async function load(pid:string,id:string){
  const dir=dirFor(pid,id),cached=jobs.get(id);if(cached?.job.projectId===pid)return cached;
  let job:VideoExportJob;try{job=JSON.parse(await fs.readFile(path.join(dir,'job.json'),'utf8')) as VideoExportJob}catch{throw new StoreError(404,'Задание экспорта не найдено');}
  if(!exportTerminal(job.status)){job.status='failed';job.error='Сервер был перезапущен во время экспорта. Запустите новое задание.';await atomic(path.join(dir,'job.json'),job);}
  const project=JSON.parse(await fs.readFile(path.join(dir,'snapshot.json'),'utf8')) as Project;
  const entry:Entry={job,dir,project,assets:new Map(),cancel:false,frames:[]};jobs.set(id,entry);return entry;
 }
 async function list(pid:string){
  if(!ID.test(pid))throw new StoreError(400,'Некорректный проект');
  let names:string[];try{names=await fs.readdir(path.join(base,pid))}catch{return[];}
  const result:VideoExportJob[]=[];
  for(const name of names.filter(n=>ID.test(n)&&n!=='requests').sort().reverse().slice(0,20)){try{result.push((await load(pid,name)).job)}catch{/* Ignore incomplete creation; never publish it as a result. */}}
  return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 }
 function wav(samples:Float32Array){
  const b=Buffer.alloc(44+samples.length*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(192000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(samples.length*4,40);for(let i=0;i<samples.length;i++)b.writeFloatLE(samples[i]!,44+i*4);return b;
 }
 async function render(e:Entry,origin:string,chrome:string){
  ensure(e);const {chromium}=require('playwright-core') as typeof import('playwright-core');
  const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-proxy-server','--mute-audio'],timeout:45000});e.browser=browser;ensure(e);
  const page=await browser.newPage({viewport:{width:e.project.size.width,height:e.project.size.height},deviceScaleFactor:1});page.setDefaultTimeout(60000);
  const errors:string[]=[];page.on('pageerror',err=>errors.push(err.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin){await route.abort();return;}
   const match=/^\/api\/v1\/projects\/([^/]+)\/assets\/([^/]+)$/.exec(url.pathname);
   if(match){const asset=match[1]===e.project.id?e.assets.get(match[2]!):undefined;if(!asset){await route.fulfill({status:404,body:'Missing snapshot asset'});return;}await route.fulfill({status:200,path:asset.file,contentType:asset.mime});return;}
   await route.continue();
  });
  await page.goto(origin+'/studio/export/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!(window as unknown as {motiveliumExport?:unknown}).motiveliumExport);
  await page.evaluate(async snapshot=>{const worker=(window as unknown as {motiveliumExport:{prepare:(p:Project)=>Promise<unknown>}}).motiveliumExport;await worker.prepare(snapshot);},e.project);
  ensure(e);e.job.status='rendering';e.job.progress=.03;await save(e);
  const p=e.project,fps=p.fps.num+'/'+p.fps.den;
  const args=['-hide_banner','-loglevel','error','-nostdin','-y','-f','image2pipe','-framerate',fps,'-i','pipe:0','-an','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2,scale=out_color_matrix=bt709:out_range=tv','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-g',String(Math.round(2*p.fps.num/p.fps.den)),'-r',fps,'-frames:v',String(p.durationFrames),'-movflags','+faststart',path.join(e.dir,'video-only.mp4')];
  const child=spawn(ffmpeg,args,{windowsHide:true,stdio:'pipe'});e.process=child;
  let stderr='',childError:Error|undefined;child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-16000)});child.stdout.resume();child.stdin.on('error',err=>{childError=err});
  const exited=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Кодирование: '+stderr.slice(-3000))))});exited.catch(()=>{});
  const sampleFrames=videoExportSamples(p);
  await fs.mkdir(path.join(e.dir,'frames'),{recursive:true});
  try{
   for(let f=0;f<p.durationFrames;f++){
    ensure(e);if(childError||child.exitCode!==null)throw childError??Error('Кодировщик завершился до последнего кадра. '+stderr);
    const data=await page.evaluate(index=>(window as unknown as {motiveliumExport:{frame:(n:number)=>string}}).motiveliumExport.frame(index),f);
    const bytes=Buffer.from(data.slice('data:image/png;base64,'.length),'base64');
    if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==p.size.width||bytes.readUInt32BE(20)!==p.size.height)throw Error('Рендер вернул неверный размер PNG.');
    e.frames.push({frame:f,sha256:hash(bytes)});
    if(sampleFrames.has(f))await fs.writeFile(path.join(e.dir,'frames',String(f).padStart(6,'0')+'.png'),bytes);
    if(!child.stdin.write(bytes))await Promise.race([once(child.stdin,'drain'),exited.then(()=>{throw Error('Кодировщик закрыл поток')})]);
    e.job.renderedFrames=f+1;e.job.progress=.03+.77*(f+1)/p.durationFrames;
    if(f%15===0)await save(e);
   }
   child.stdin.end();await exited;ensure(e);
   if(errors.length)throw Error('Ошибка рендера: '+errors.join('; '));
  }finally{if(child.exitCode===null)child.kill();if(e.process===child)e.process=undefined;await browser.close();e.browser=undefined;}
 }
 async function run(e:Entry,origin:string,info:Awaited<ReturnType<typeof runtime>>){
  const timer=setTimeout(()=>{e.cancel=true;e.job.error='Экспорт превысил лимит времени (30 минут).';e.process?.kill();void e.browser?.close();},options.maxWallMs??30*60*1000);
  try{
   for(const asset of e.project.assets){
    ensure(e);const source=await store.assetFile(e.project.id,asset.id),bytes=await fs.readFile(source.file);
    if(bytes.length!==asset.bytes||hash(bytes)!==asset.sha256)throw Error('Ресурс изменён или повреждён: '+asset.id);
    const file=path.join(e.dir,'assets',asset.sha256+path.extname(asset.path));await fs.writeFile(file,bytes);e.assets.set(asset.id,{file,mime:asset.mime});
   }
   await render(e,origin,info.chrome!);ensure(e);e.job.status='mixing';e.job.progress=.82;await save(e);
   const plan=videoExportPlan(e.project),audio=plan.audio;
   const output=path.join(e.dir,'result.tmp.mp4'),args=['-hide_banner','-loglevel','error','-nostdin','-y','-i',path.join(e.dir,'video-only.mp4')];
   if(audio.length){
    const mix=await mixProjectAudio(e.project,async asset=>{
     const metadata=JSON.parse(await runTool(ffprobe,['-v','error','-select_streams','a:0','-show_entries','stream=channels','-of','json',e.assets.get(asset.id)!.file],e)),channels=Number(metadata.streams?.[0]?.channels);if(![1,2].includes(channels))throw Error('Для общего микса нужен моно или стереофайл: '+(asset.title??asset.id));
     const decoded=path.join(e.dir,'decode.f32');
     // Preserve mono samples; FFmpeg's implicit mono→stereo rematrix attenuates them by 3 dB,
     // while decodeAudioData returns mono and our shared mixer duplicates it unchanged.
     const sourceEnd=audioSourceEnd(audio,asset.id,plan.duration);if(sourceEnd*AUDIO_RATE*channels*4>512*1024*1024)throw Error('Источник слишком длинный для экспорта. Обрежьте аудиофайл до нужного фрагмента.');
     await runTool(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-y','-i',e.assets.get(asset.id)!.file,'-vn','-t',String(sourceEnd),'-ac',String(channels),'-ar',String(AUDIO_RATE),'-f','f32le',decoded],e);
     ensure(e);const bytes=await fs.readFile(decoded),pcm=Array.from({length:channels},()=>new Float32Array(bytes.length/(channels*4)));for(let i=0;i<pcm[0]!.length;i++)for(let c=0;c<channels;c++)pcm[c]![i]=bytes.readFloatLE((i*channels+c)*4);await fs.unlink(decoded);return{sampleRate:AUDIO_RATE,channels:pcm};
    },()=>ensure(e));
    const mixFile=path.join(e.dir,'mix.wav');await fs.writeFile(mixFile,mixWav(mix));
    args.push('-i',mixFile,'-map','0:v:0','-map','1:a:0','-c:a','aac','-b:a','256k','-ar','48000');
   }else args.push('-map','0:v:0','-an');
   args.push('-c:v','copy','-t',String(plan.duration),'-movflags','+faststart',output);
   await runTool(ffmpeg,args,e);ensure(e);e.job.status='verifying';e.job.progress=.94;await save(e);
   const probe=JSON.parse(await runTool(ffprobe,['-v','error','-count_frames','-show_streams','-show_format','-of','json',output],e)) as {streams:Array<Record<string,unknown>>;format:Record<string,unknown>};
   const video=probe.streams.find(s=>s.codec_type==='video'),sound=probe.streams.find(s=>s.codec_type==='audio');
   const rate=String(video?.avg_frame_rate).split('/').map(Number);
   if(!video||video.codec_name!=='h264'||video.color_space!=='bt709'||Math.abs(rate[0]!/rate[1]!-e.project.fps.num/e.project.fps.den)>1e-6||Number(video.width)!==plan.width||Number(video.height)!==plan.height||Number(video.nb_read_frames)!==e.project.durationFrames||Math.abs(Number(video.duration)-plan.duration)>e.project.fps.den/e.project.fps.num+.002|| (!!sound)!==!!audio.length||sound&&(sound.codec_name!=='aac'||Math.abs(Number(sound.duration)-plan.duration)>.06))throw Error('Готовый MP4 не прошёл проверку кадров, размера или звука.');
   ensure(e);await fs.writeFile(path.join(e.dir,'ffprobe.json'),JSON.stringify(probe,null,2));
   const digest=crypto.createHash('sha256');for await(const chunk of createReadStream(output))digest.update(chunk);const stat=await fs.stat(output);await fs.rename(output,path.join(e.dir,'result.mp4'));
   await fs.copyFile(path.join(e.dir,'frames','000000.png'),path.join(e.dir,'poster.png'));
   e.job.bytes=stat.size;e.job.sha256=digest.digest('hex');e.job.downloadUrl=`/api/v1/projects/${e.project.id}/video-exports/${e.job.id}/file`;e.job.posterUrl=`/api/v1/projects/${e.project.id}/video-exports/${e.job.id}/poster`;
   await atomic(path.join(e.dir,'manifest.json'),{...e.job,status:'ready',assets:e.project.assets,frames:e.frames,audio:'Shared mixProjectAudio PCM48 stereo; native mono preserved; gain/mute/offset, source clips/fades/pan/ducking. Legacy ceiling .95; edited clips use .84 look-ahead ceiling. Same algorithm as studio.',probe});
   ensure(e);e.job.status='ready';e.job.progress=1;await save(e);
   await fs.rm(path.join(e.dir,'video-only.mp4'),{force:true});
  }catch(error){
   e.job.status=e.cancel&&!e.job.error?'cancelled':'failed';e.job.error=e.job.error??(e.cancel?'Экспорт отменён пользователем.':(error as Error).message);e.job.downloadUrl=undefined;e.job.posterUrl=undefined;
   await Promise.all(['result.tmp.mp4','result.mp4','video-only.mp4','manifest.json'].map(n=>fs.rm(path.join(e.dir,n),{force:true}).catch(()=>{})));await save(e);
  }finally{clearTimeout(timer);e.process?.kill();await e.browser?.close().catch(()=>{});e.browser=undefined;e.process=undefined;if(active===e)active=undefined;}
 }
 return{
  info:runtime,list,
  async start(pid:string,input:Record<string,unknown>,origin:string){
   if(!Number.isInteger(input.expectedRevision)||typeof input.requestId!=='string'||!ID.test(input.requestId))throw new StoreError(400,'Экспорт требует expectedRevision и requestId.');
   if(!ID.test(pid))throw new StoreError(400,'Некорректный проект');
   const receiptDir=path.join(base,pid,'requests'),receiptFile=path.join(receiptDir,hash(String(input.requestId))+'.json');
   let previous:VideoExportJob|undefined;
   try{const receipt=JSON.parse(await fs.readFile(receiptFile,'utf8'));previous=(await load(pid,receipt.jobId)).job;}catch(err){if((err as NodeJS.ErrnoException).code!=='ENOENT')throw err;}
   if(!previous){ // Migrate old jobs lazily without limiting the search to the UI page.
    const names=await fs.readdir(path.join(base,pid)).catch(()=>[]);
    for(const name of names.filter(n=>ID.test(n)&&n!=='requests')){try{const candidate=(await load(pid,name)).job;if(candidate.requestId===input.requestId){previous=candidate;break}}catch{}}
   }if(previous){if(previous.revision!==input.expectedRevision)throw new StoreError(409,'requestId уже относится к другой ревизии.');await fs.mkdir(receiptDir,{recursive:true});await atomic(receiptFile,{requestId:input.requestId,revision:previous.revision,jobId:previous.id});return previous;}
   if(starting||active)throw new StoreError(409,'Уже выполняется экспорт. Дождитесь завершения или отмените его.');starting=true;
   try{
    const p=(await store.get(pid)).project;if(p.revision!==input.expectedRevision)throw new StoreError(409,'Проект изменился. Перечитайте его перед экспортом.');
    let plan;try{plan=videoExportPlan(p)}catch(err){throw new StoreError(400,(err as Error).message)}
    const info=await runtime();if(!info.ready)throw new StoreError(503,info.reason!);
    const id='mp4-'+Date.now().toString(36)+'-'+crypto.randomBytes(5).toString('hex'),dir=dirFor(pid,id),at=new Date().toISOString();await fs.mkdir(path.join(dir,'assets'),{recursive:true});
    const e:Entry={job:{id,projectId:pid,title:p.title,revision:p.revision,snapshotHash:hash(JSON.stringify(p)),requestId:input.requestId,status:'preparing',progress:0,renderedFrames:0,totalFrames:p.durationFrames,createdAt:at,updatedAt:at,size:{width:plan.width,height:plan.height},fps:p.fps,durationSeconds:plan.duration,withAudio:!!plan.audio.length,audioTracks:plan.audio.length,encoder:info.encoder,renderer:'studio evaluateFrame/renderFrame/createThreeAdapter; headless Chrome, PNG → H.264'},dir,project:p,assets:new Map(),frames:[],cancel:false};
    await atomic(path.join(dir,'snapshot.json'),p);await save(e);await fs.mkdir(receiptDir,{recursive:true});await atomic(receiptFile,{requestId:input.requestId,revision:p.revision,jobId:id});jobs.set(id,e);active=e;void run(e,origin,info).catch(error=>{e.job.status='failed';e.job.error='Не удалось сохранить состояние экспорта: '+(error as Error).message;e.job.downloadUrl=undefined;e.job.posterUrl=undefined;});return e.job;
   }finally{starting=false;}
  },
  async get(pid:string,id:string){return(await load(pid,id)).job;},
  async cancel(pid:string,id:string){const e=await load(pid,id);if(exportTerminal(e.job.status))return e.job;e.cancel=true;e.job.status='cancelling';await save(e);e.process?.kill();void e.browser?.close().catch(()=>{});return e.job;},
  async file(pid:string,id:string,poster=false){const e=await load(pid,id);if(e.job.status!=='ready')throw new StoreError(409,'Экспорт ещё не готов.');return{path:path.join(e.dir,poster?'poster.png':'result.mp4'),mime:poster?'image/png':'video/mp4',name:pid+'-r'+e.job.revision+'.mp4'};},
 };
}
