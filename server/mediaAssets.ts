import {localDataDir} from './dataPaths.ts';
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import{spawn}from'node:child_process';
import{StoreError,type Store}from'./storage.ts';import type{AssetRef}from'../studio/domain/schema.ts';
import{runtimeTools}from'./runtime.ts';
export const MEDIA_MAX_BYTES=64*1024*1024;
const hash=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
function signature(b:Buffer):{mime:string;ext:string;image:boolean;codec?:string}{
 if(b.subarray(0,8).toString('hex')==='89504e470d0a1a0a')return{mime:'image/png',ext:'png',image:true,codec:'png'};
 if(b.length>3&&b[0]===255&&b[1]===216&&b[2]===255)return{mime:'image/jpeg',ext:'jpg',image:true,codec:'mjpeg'};
 if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return{mime:'image/webp',ext:'webp',image:true,codec:'webp'};
 if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WAVE')return{mime:'audio/wav',ext:'wav',image:false};
 if(b.subarray(0,3).toString()==='ID3'||b.length>3&&b[0]===255&&(b[1]!&224)===224)return{mime:'audio/mpeg',ext:'mp3',image:false,codec:'mp3'};
 throw new StoreError(400,'Поддерживаются PNG, JPEG, WebP, WAV и MP3. Формат определяется по содержимому файла.');
}
function probe(binary:string,args:string[]):Promise<string>{return new Promise((resolve,reject)=>{const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let text='',err='',done=false;const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(text)};const timer=setTimeout(()=>{child.kill();finish(Error('Проверка файла превысила 20 секунд.'))},20000);child.stdout.on('data',b=>{text+=b.toString();if(text.length>1024*1024){child.kill();finish(Error('Слишком большой ответ проверки файла.'))}});child.stderr.on('data',b=>err=(err+b.toString()).slice(-2000));child.on('error',()=>finish(Error('Для проверки медиа нужен FFprobe. Настройте его перед импортом.')));child.on('close',code=>finish(code===0?undefined:Error('Файл не удалось прочитать. Проверьте его формат и целостность.')));})}
export function createMediaService(store:Store,root:string,options:{ffprobe?:string}={}){
 const ffprobe=options.ffprobe??runtimeTools(root).ffprobe;let ready:Promise<{ready:boolean;reason?:string}>|null=null;
 return{
  info(){return ready??=(async()=>{try{await probe(ffprobe,['-version']);return{ready:true}}catch(e){return{ready:false,reason:(e as Error).message}}})()},
  async stage(id:string,input:Record<string,unknown>):Promise<{asset:AssetRef}>{
   const original=(await store.get(id)).project;if(input.expectedRevision!==original.revision)throw new StoreError(409,'Проект изменился перед импортом файла.');
   if(typeof input.base64!=='string'||!input.base64.length||input.base64.length%4||input.base64.length>Math.ceil(MEDIA_MAX_BYTES/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))throw new StoreError(400,'Неверные данные файла или превышен предел 64 МиБ.');
   const bytes=Buffer.from(input.base64,'base64');if(!bytes.length||bytes.length>MEDIA_MAX_BYTES)throw new StoreError(413,'Размер файла должен быть от 1 байта до 64 МиБ.');const kind=signature(bytes),sha256=hash(bytes),title=typeof input.name==='string'?input.name.replaceAll('\\','/').split('/').at(-1)!.replace(/[\u0000-\u001f]/g,'').slice(0,160)||'Файл':'Файл';
   const tempRoot=path.join(localDataDir(root),'media-staging');await fs.mkdir(tempRoot,{recursive:true});const temp=path.join(tempRoot,crypto.randomUUID()+'.'+kind.ext);await fs.writeFile(temp,bytes,{flag:'wx'});
   try{const data=JSON.parse(await probe(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',temp])),streams=(data.streams??[])as Array<Record<string,unknown>>;let meta:Partial<AssetRef>={};
    if(kind.image){const stream=streams.find(s=>s.codec_type==='video');const w=Number(stream?.width),h=Number(stream?.height);if(stream?.codec_name!==kind.codec||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>8192||h>8192||w*h>33_554_432)throw new StoreError(400,'Изображение повреждено или превышает 8192 пикселей по стороне / 32 Мп.');meta={width:w,height:h};}
    else{const audio=streams.find(s=>s.codec_type==='audio');const duration=Number(data.format?.duration??audio?.duration);if(!audio||kind.codec&&audio.codec_name!==kind.codec||!Number.isFinite(duration)||duration<=0||duration>3600||streams.some(s=>s.codec_type==='video'&&!(s.disposition as{attached_pic?:number})?.attached_pic))throw new StoreError(400,'Нужен читаемый аудиофайл длительностью до 60 минут.');meta={durationSeconds:duration};}
    if((await store.get(id)).project.revision!==input.expectedRevision)throw new StoreError(409,'Проект изменился во время проверки файла. Повторите импорт.');
    const rel='assets/media/'+sha256+'.'+kind.ext,final=path.join(store.root,id,rel);await fs.mkdir(path.dirname(final),{recursive:true});try{await fs.writeFile(final,bytes,{flag:'wx'})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;if(hash(await fs.readFile(final))!==sha256)throw new StoreError(409,'Сохранённый файл повреждён.');}
    return{asset:{id:'media-'+sha256.slice(0,24),path:rel,mime:kind.mime,bytes:bytes.length,sha256,origin:'staged',title,...meta}};
   }catch(e){if(e instanceof StoreError)throw e;throw new StoreError(400,(e as Error).message)}finally{await fs.unlink(temp).catch(()=>{})}
  }
 };
}
