import {localDataDir} from './dataPaths.ts';
import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {crc32} from 'node:zlib';
import {createRequire} from 'node:module';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import type {Readable} from 'node:stream';
import type {Entry,ZipFile} from 'yauzl';
import {createStore,StoreError,type Store} from './storage.ts';
import {inspectGltf} from '../studio/domain/gltf.ts';
import {PACKAGE_MAX_BYTES,PACKAGE_FILE_MAX,packageProject,packageManifest,packageSummary,type PackageManifest,type PackagePreview,type PackageExport} from '../studio/domain/projectPackage.ts';
import type {Project} from '../studio/domain/schema.ts';

const require=createRequire(fileURLToPath(new URL('../studio/package.json',import.meta.url)));
const yauzl=require('yauzl') as typeof import('yauzl'),yazl=require('yazl') as typeof import('yazl');
const digest=(b:crypto.BinaryLike)=>crypto.createHash('sha256').update(b).digest('hex');
const identifier=/^[a-z0-9-]{1,100}$/;
function inside(root:string,file:string){const relative=path.relative(path.resolve(root),path.resolve(file));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new StoreError(400,'Недопустимый путь пакета');return file;}
async function atomic(file:string,value:unknown){const tmp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';await fs.writeFile(tmp,JSON.stringify(value,null,2));await fs.rename(tmp,file);}
async function shaFile(file:string){const h=crypto.createHash('sha256');for await(const c of createReadStream(file))h.update(c);return h.digest('hex');}

/** Reads only recognised entries. Never extracts archive names into the filesystem. */
export async function readProjectZip(file:string,destination:string){
 const zip=await new Promise<ZipFile>((resolve,reject)=>yauzl.open(file,{lazyEntries:true,strictFileNames:true,validateEntrySizes:true,autoClose:false},(e,z)=>e?reject(new Error('ZIP-архив повреждён или обрезан. Попробуйте скачать его заново.',{cause:e})):resolve(z!)));
 const entries=new Map<string,{file:string;bytes:number;sha256:string}>(),seen=new Set<string>();let total=0,count=0;
 let zipError:Error|undefined;zip.on('error',e=>{zipError=e});
 try{
  if(zip.entryCount>260)throw Error('В архиве слишком много файлов.');
  await fs.mkdir(destination,{recursive:true});
  for(;;){
   if(zipError)throw zipError;
   const entry=await new Promise<Entry|null>((resolve,reject)=>{const onEntry=(e:Entry)=>{clear();resolve(e)},onEnd=()=>{clear();resolve(null)},onError=(e:Error)=>{clear();reject(e)},clear=()=>{zip.off('entry',onEntry);zip.off('end',onEnd);zip.off('error',onError)};zip.once('entry',onEntry);zip.once('end',onEnd);zip.once('error',onError);zip.readEntry();});
   if(!entry)break;
   if(++count>260||seen.has(entry.fileName.toLowerCase()))throw Error('Повторяющиеся или избыточные имена файлов архива.');seen.add(entry.fileName.toLowerCase());
   const mode=(entry.externalFileAttributes>>>16)&0o170000;
   if(mode&&mode!==0o100000&&mode!==0o040000||entry.generalPurposeBitFlag&1||![0,8].includes(entry.compressionMethod))throw Error('Ссылки, специальные и зашифрованные файлы не поддерживаются.');
   if(entry.fileName==='assets/'&&entry.uncompressedSize===0)continue;
   if(!/^(manifest\.json|project\.json|assets\/[a-f0-9]{64})$/.test(entry.fileName))throw Error('Посторонний или небезопасный файл в архиве: '+entry.fileName.slice(0,100));
   const max=entry.fileName==='manifest.json'?1024*1024:entry.fileName==='project.json'?8*1024*1024:PACKAGE_FILE_MAX;
   total+=entry.uncompressedSize;if(entry.uncompressedSize>max||total>PACKAGE_MAX_BYTES)throw Error('Превышен размер распакованного архива.');
   const stream=await new Promise<Readable>((resolve,reject)=>zip.openReadStream(entry,(e,s)=>e?reject(e):resolve(s!)));
   const out=path.join(destination,'entry-'+count),handle=await fs.open(out,'wx'),hash=crypto.createHash('sha256');let bytes=0,crc=0;
   try{for await(const raw of stream){const chunk=raw as Buffer;bytes+=chunk.length;if(bytes>max||bytes>entry.uncompressedSize)throw Error('Фактический размер файла превышает лимит.');hash.update(chunk);crc=crc32(chunk,crc);await handle.write(chunk);}}finally{stream.destroy();await handle.close();}
   if(bytes!==entry.uncompressedSize||(crc>>>0)!==(entry.crc32>>>0))throw Error('Повреждён файл ZIP (размер или CRC).');
   entries.set(entry.fileName,{file:out,bytes,sha256:hash.digest('hex')});
  }
  const manifestEntry=entries.get('manifest.json');if(!manifestEntry)throw Error('В ZIP нет manifest.json Motivelium.');
  const manifest=packageManifest(JSON.parse(await fs.readFile(manifestEntry.file,'utf8'))),projectEntry=entries.get('project.json');
  if(!projectEntry||projectEntry.sha256!==manifest.project.sha256||projectEntry.bytes!==manifest.project.bytes)throw Error('Контрольная сумма project.json не совпала.');
  const project=packageProject(JSON.parse(await fs.readFile(projectEntry.file,'utf8')));
  if(project.id!==manifest.project.id||project.revision!==manifest.project.revision||project.assets.length!==manifest.assets.length)throw Error('Проект и manifest расходятся.');
  const allowed=new Set(['manifest.json','project.json']),assets=new Map<string,string>();
  for(const a of project.assets){const record=manifest.assets.find(r=>r.id===a.id),entry=record&&entries.get(record.entry);if(!record||record.bytes!==a.bytes||record.sha256!==a.sha256||!entry||entry.bytes!==a.bytes||entry.sha256!==a.sha256)throw Error('Отсутствует или повреждён ресурс: '+(a.title??a.id));allowed.add(record.entry);assets.set(a.id,entry.file);}
  for(const name of entries.keys())if(!allowed.has(name))throw Error('Есть незаявленные ресурсы архива.');
  for(const a of project.assets.filter(a=>a.mime.startsWith('model/'))){const inspected=inspectGltf(await fs.readFile(assets.get(a.id)!));for(const node of project.nodes)if(node.kind==='scene3d'&&node.model?.assetId===a.id&&JSON.stringify(inspected.parts)!==JSON.stringify(node.model.parts))throw Error('Иерархия модели не совпала: '+node.name);}
  return{project,manifest,assets};
 }finally{zip.close();}
}

export function createProjectPackageService(store:Store,root:string,onImported?:(p:Project)=>void){
 const base=path.join(localDataDir(root),'project-packages'),incoming=path.join(base,'incoming'),exports=path.join(base,'exports');let busy=false;
 const applying=new Map<string,Promise<{project:Project;preview:PackagePreview}>>();
 const stageDir=(id:string)=>{if(!identifier.test(id))throw new StoreError(400,'Неверный ID архива');return inside(incoming,path.join(incoming,id));};
 async function locked<T>(fn:()=>Promise<T>){if(busy)throw new StoreError(409,'Другой архив сейчас обрабатывается. Повторите после его завершения.');busy=true;try{return await fn()}finally{busy=false}}
 return{
  async exportProject(pid:string,expectedRevision:unknown):Promise<PackageExport>{return locked(async()=>{
   const p=(await store.get(pid)).project;if(!Number.isInteger(expectedRevision)||p.revision!==expectedRevision)throw new StoreError(409,'Проект изменился. Перечитайте его перед созданием архива.');
   try{packageProject(p)}catch(e){throw new StoreError(400,(e as Error).message)}
   const id='pack-'+crypto.randomUUID(),dir=path.join(exports,id);await fs.mkdir(dir,{recursive:true});
   try{
    const projectBytes=Buffer.from(JSON.stringify(p,null,2)),manifest:PackageManifest={format:'motivelium-project',version:1,createdAt:new Date().toISOString(),project:{entry:'project.json',bytes:projectBytes.length,sha256:digest(projectBytes),id:p.id,revision:p.revision},assets:[]},buffers=new Map<string,Buffer>();
    for(const a of p.assets){const source=await store.assetFile(pid,a.id);const real=await fs.realpath(source.file);inside(await fs.realpath(path.join(store.root,pid)),real);const bytes=await fs.readFile(real);if(bytes.length!==a.bytes||digest(bytes)!==a.sha256)throw Error('Ресурс отсутствует или повреждён: '+(a.title??a.id));const entry='assets/'+a.sha256;buffers.set(entry,bytes);manifest.assets.push({id:a.id,entry,bytes:a.bytes,sha256:a.sha256});}
    packageManifest(manifest);
    const zip=new yazl.ZipFile(),tmp=path.join(dir,'project.tmp.zip'),done=pipeline(zip.outputStream,createWriteStream(tmp));zip.on('error',err=>(zip.outputStream as Readable).destroy(err));
    zip.addBuffer(Buffer.from(JSON.stringify(manifest,null,2)),'manifest.json');zip.addBuffer(projectBytes,'project.json');for(const [name,bytes]of buffers)zip.addBuffer(bytes,name);zip.end();await done;
    const stat=await fs.stat(tmp);if(stat.size>PACKAGE_MAX_BYTES)throw Error('Сжатый архив превышает 256 МиБ.');await fs.rename(tmp,path.join(dir,'project.zip'));
    const result:PackageExport={id,revision:p.revision,title:p.title,bytes:stat.size,sha256:await shaFile(path.join(dir,'project.zip')),assets:p.assets.length,assetBytes:p.assets.reduce((n,a)=>n+a.bytes,0),downloadUrl:'/api/v1/project-packages/exports/'+id+'/file',createdAt:manifest.createdAt};await atomic(path.join(dir,'receipt.json'),result);return result;
   }catch(e){await fs.rm(inside(exports,dir),{recursive:true,force:true});throw new StoreError(400,'Архив не создан: '+(e as Error).message)}
  })},
  async exportedFile(id:string){if(!identifier.test(id))throw new StoreError(400,'Неверный ID архива');const dir=inside(exports,path.join(exports,id));let receipt:PackageExport;try{receipt=JSON.parse(await fs.readFile(path.join(dir,'receipt.json'),'utf8'))}catch{throw new StoreError(404,'Архив ещё не готов или не найден')};return{file:path.join(dir,'project.zip'),name:'motivelium-'+receipt.id+'.zip'};},
  async stage(stream:AsyncIterable<Buffer>,length?:number):Promise<PackagePreview>{return locked(async()=>{
   if(length!==undefined&&(!Number.isSafeInteger(length)||length<1||length>PACKAGE_MAX_BYTES))throw new StoreError(413,'Архив должен быть не больше 256 МиБ.');
   const id='import-'+crypto.randomUUID(),dir=stageDir(id);await fs.mkdir(dir,{recursive:true});
   try{const file=path.join(dir,'upload.zip'),handle=await fs.open(file,'wx');let size=0;try{for await(const bytes of stream){size+=bytes.length;if(size>PACKAGE_MAX_BYTES)throw Error('Архив превышает 256 МиБ.');await handle.write(bytes);}}finally{await handle.close();}
    if(!size||length!==undefined&&size!==length)throw Error('Загрузка архива не завершена.');
    const parsed=await readProjectZip(file,path.join(dir,'payload')),preview=packageSummary(id,parsed.project,size);
    await atomic(path.join(dir,'preview.json'),preview);await atomic(path.join(dir,'source.json'),parsed.project);await atomic(path.join(dir,'assets.json'),Object.fromEntries(parsed.assets));return preview;
   }catch(e){await fs.rm(inside(incoming,dir),{recursive:true,force:true});throw new StoreError(400,'Архив не принят: '+(e as Error).message)}
  })},
  async preview(id:string):Promise<PackagePreview>{try{return JSON.parse(await fs.readFile(path.join(stageDir(id),'preview.json'),'utf8'))}catch(e){if(e instanceof StoreError)throw e;throw new StoreError(404,'Проверенный архив не найден')}},
  async apply(id:string,title?:unknown):Promise<{project:Project;preview:PackagePreview}>{
   if(applying.has(id))return applying.get(id)!;
   const work=locked(async()=>{
    const dir=stageDir(id);let preview:PackagePreview;try{preview=JSON.parse(await fs.readFile(path.join(dir,'preview.json'),'utf8'))}catch{throw new StoreError(404,'Проверенный архив не найден');}
    if(preview.projectId)return{project:(await store.get(preview.projectId)).project,preview};
    const receiptFile=path.join(dir,'activation.json');let receipt:{projectId:string;title:string};
    try{receipt=JSON.parse(await fs.readFile(receiptFile,'utf8'));}catch{receipt={projectId:'project-'+crypto.randomUUID().replace(/-/g,''),title:typeof title==='string'&&title.trim()?title.trim().slice(0,200):(preview.title+' — копия').slice(0,200)};await atomic(receiptFile,receipt);}
    const final=inside(store.root,path.join(store.root,receipt.projectId));
    // The receipt is persisted before activation: a lost HTTP response/restart cannot create a second copy.
    let installed=false;try{await fs.access(path.join(final,'pointer.json'));installed=true}catch{}
    if(!installed){
     const source=packageProject(JSON.parse(await fs.readFile(path.join(dir,'source.json'),'utf8'))),mapping=JSON.parse(await fs.readFile(path.join(dir,'assets.json'),'utf8')) as Record<string,string>;
     const tempRoot=path.join(dir,'install'),temporary=createStore(tempRoot,{dataRoot:path.join(tempRoot,'.local')}),project=structuredClone(source);project.id=receipt.projectId;project.revision=1;project.title=receipt.title;packageProject(project);
     const staged=inside(temporary.root,path.join(temporary.root,project.id));await fs.mkdir(staged,{recursive:true});
     for(const asset of project.assets){const sourceFile=inside(path.join(dir,'payload'),mapping[asset.id]??'');if(await shaFile(sourceFile)!==asset.sha256||(await fs.stat(sourceFile)).size!==asset.bytes)throw new StoreError(400,'Ресурс изменился после проверки: '+asset.id);const target=inside(staged,path.join(staged,asset.path));await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(sourceFile,target);}
     await atomic(path.join(staged,'project.json'),project);await temporary.get(project.id);
     await atomic(path.join(staged,'import-receipt.json'),{importId:id,sourceProjectId:source.id,sourceRevision:source.revision,projectSha256:digest(JSON.stringify(source)),createdAt:new Date().toISOString(),history:'fresh'});
     try{await fs.lstat(final);throw new StoreError(409,'Путь новой копии уже существует.')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
     inside(path.join(dir,'install'),staged);inside(store.root,final);await fs.rename(staged,final);
    }
    const project=(await store.get(receipt.projectId)).project;if(!installed)onImported?.(project);preview.status='imported';preview.projectId=project.id;preview.projectTitle=project.title;await atomic(path.join(dir,'preview.json'),preview);return{project,preview};
   });applying.set(id,work);try{return await work}finally{applying.delete(id)}
  },
  async discard(id:string){if(applying.has(id))throw new StoreError(409,'Импорт уже применяется');const dir=stageDir(id);let preview:PackagePreview|undefined;try{preview=JSON.parse(await fs.readFile(path.join(dir,'preview.json'),'utf8'))}catch{}if(!preview?.projectId){try{const activation=JSON.parse(await fs.readFile(path.join(dir,'activation.json'),'utf8'));await fs.access(path.join(inside(store.root,path.join(store.root,activation.projectId)),'pointer.json'));return{discarded:false};}catch{}await fs.rm(inside(incoming,dir),{recursive:true,force:true});}return{discarded:!preview?.projectId};},
 };
}
