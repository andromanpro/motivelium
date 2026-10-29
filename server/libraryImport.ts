import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {Readable} from 'node:stream';
import {StoreError,type Store} from './storage.ts';
import type {createProjectPackageService} from './projectPackage.ts';
import {packageProject,packageManifest,PACKAGE_MAX_BYTES,type PackageManifest} from '../studio/domain/projectPackage.ts';
import {APP_VERSION,READER_FEATURES} from '../studio/domain/version.ts';
const sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
const idPattern=/^[a-z0-9-]{1,100}$/;
export type LibraryPreview={id:string;source:string;destination:string;projects:Array<{id:string;title:string;revision:number;assets:number;bytes:number}>;warnings:string[]};
/** Source libraries are read-only. Only confirmed, hash-checked states are copied, through ZIP validation. */
export function createLibraryImportService(store:Store,root:string,packages:ReturnType<typeof createProjectPackageService>){
 const previews=new Map<string,{view:LibraryPreview;expires:number;states:Map<string,string>;results:Map<string,Promise<{projectId:string;title:string}>>}>();
 const require=createRequire(new URL('../studio/package.json',import.meta.url)),yazl=require('yazl') as typeof import('yazl');
 async function readInside(base:string,relative:string,max:number){
  const target=path.resolve(base,relative),rel=path.relative(base,target);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Файл вне папки проекта.');
  let current=base;for(const part of rel.split(path.sep)){current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())throw Error('Ссылки внутри проекта не поддерживаются.');}
  const stat=await fs.stat(target);if(!stat.isFile()||stat.size>max)throw Error('Недопустимый размер файла.');return fs.readFile(target);
 }
 async function read(source:string,id:string){
  if(!idPattern.test(id))throw Error('Недопустимое имя папки проекта.');
  const base=path.join(source,id);if((await fs.lstat(base)).isSymbolicLink())throw Error('Папка проекта является ссылкой.');
  const pointer=JSON.parse((await readInside(base,'pointer.json',1024*1024)).toString('utf8'));
  if(typeof pointer.stateFile!=='string'||!/^states\/[A-Za-z0-9_.-]+\.json$/.test(pointer.stateFile)||!/^[a-f0-9]{64}$/.test(pointer.sha256))throw Error('Нет подтверждённого указателя. Откройте проект в исходной студии и перенесите ZIP.');
  const bytes=await readInside(base,pointer.stateFile,64*1024*1024),state=JSON.parse(bytes.toString('utf8'));
  // Storage hashes compact JSON of the parsed state, not its pretty-printed file bytes.
  if(sha(Buffer.from(JSON.stringify(state)))!==pointer.sha256)throw Error('Повреждена контрольная сумма состояния.');
  const project=packageProject(state.project);
  if(project.id!==id||project.revision!==pointer.revision)throw Error('Указатель и проект расходятся.');
  return{project,fingerprint:sha(Buffer.from(JSON.stringify(pointer))),base};
 }
 return{
  async preview(folder:unknown):Promise<LibraryPreview>{
   if(typeof folder!=='string'||!path.isAbsolute(folder)||folder.length>1000)throw new StoreError(400,'Укажите абсолютный путь к папке данных или projects.');
   let source:string;try{source=await fs.realpath(folder);if(path.basename(source).toLowerCase()!=='projects')source=await fs.realpath(path.join(source,'projects'));}catch{throw new StoreError(400,'В этой папке нет доступного хранилища projects.');}
   if(source.toLowerCase()===(await fs.realpath(store.root)).toLowerCase())throw new StoreError(400,'Это уже текущее хранилище.');
   for(const[key,p]of previews)if(p.expires<Date.now())previews.delete(key);if(previews.size>=10)throw new StoreError(429,'Закройте предыдущие проверки или повторите через 30 минут.');
   const entries=await fs.readdir(source,{withFileTypes:true});if(entries.length>1000)throw new StoreError(400,'Слишком много папок: переносите проекты через ZIP.');
   const view:LibraryPreview={id:crypto.randomUUID(),source,destination:path.dirname(store.root),projects:[],warnings:[]},states=new Map<string,string>();
   for(const e of entries.filter(e=>e.isDirectory()||e.isSymbolicLink()))try{const{project:p,fingerprint}=await read(source,e.name);view.projects.push({id:p.id,title:p.title,revision:p.revision,assets:p.assets.length,bytes:p.assets.reduce((n,a)=>n+a.bytes,0)});states.set(p.id,fingerprint)}catch(e2){view.warnings.push(e.name+': '+(e2 as Error).message)}
   previews.set(view.id,{view,states,expires:Date.now()+30*60*1000,results:new Map()});return view;
  },
  async import(previewId:unknown,projectId:unknown){
   const entry=typeof previewId==='string'?previews.get(previewId):undefined;
   if(!entry||entry.expires<Date.now())throw new StoreError(409,'Предварительный просмотр истёк. Проверьте папку ещё раз.');
   if(typeof projectId!=='string'||!entry.states.has(projectId))throw new StoreError(400,'Выберите проект из проверенного списка.');
   const existing=entry.results.get(projectId);if(existing)return existing;
   const work=(async()=>{try{
    const{project:p,fingerprint,base}=await read(entry.view.source,projectId);if(fingerprint!==entry.states.get(projectId))throw new StoreError(409,'Исходный проект изменился. Проверьте папку заново.');
    const bytes=Buffer.from(JSON.stringify(p)),manifest:PackageManifest={format:'motivelium-project',version:2,compatibility:{minVersion:APP_VERSION,features:[...READER_FEATURES]},createdAt:new Date().toISOString(),project:{id:p.id,revision:p.revision,entry:'project.json',bytes:bytes.length,sha256:sha(bytes)},assets:[]},buffers=new Map<string,Buffer>();
    for(const a of p.assets){const b=await readInside(base,a.path,64*1024*1024);if(b.length!==a.bytes||sha(b)!==a.sha256)throw Error('Повреждён ресурс: '+(a.title??a.id));const name='assets/'+a.sha256;buffers.set(name,b);manifest.assets.push({id:a.id,entry:name,bytes:a.bytes,sha256:a.sha256});}packageManifest(manifest);
    if((await read(entry.view.source,projectId)).fingerprint!==fingerprint)throw new StoreError(409,'Исходный проект изменился во время копирования.');
    const zip=new yazl.ZipFile(),chunks:Buffer[]=[];let size=0;
    const finished=(async()=>{for await(const b of zip.outputStream){size+=b.length;if(size>PACKAGE_MAX_BYTES){(zip.outputStream as Readable).destroy();throw Error('Архив превышает 256 МиБ.');}chunks.push(b as Buffer)}})();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest)),'manifest.json');zip.addBuffer(bytes,'project.json');for(const[n,b]of buffers)zip.addBuffer(b,n);zip.end();await finished;
    const staged=await packages.stage(Readable.from(chunks)),copied=await packages.apply(staged.id,p.title+' — копия');return{projectId:copied.project.id,title:copied.project.title};
   }catch(e){if(e instanceof StoreError)throw e;throw new StoreError(400,'Проект не перенесён: '+(e as Error).message)}})();
   entry.results.set(projectId,work);try{return await work}catch(e){entry.results.delete(projectId);throw e}
  }
 };
}
