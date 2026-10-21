import {localDataDir} from './dataPaths.ts';
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {createStore,StoreError,type Store} from './storage.ts';
import {blankProject} from '../studio/domain/projectSetup.ts';
import {packageProject} from '../studio/domain/projectPackage.ts';
import type {Project} from '../studio/domain/schema.ts';
import type{createTemplateCatalog}from'./templates.ts';
type Receipt={signature:string;project:Project;sourceId?:string;template?:{id:string;version:number;sha256:string}};
const hash=(bytes:Buffer|string)=>crypto.createHash('sha256').update(bytes).digest('hex');
const inside=(base:string,relative:string)=>{const p=path.resolve(base,relative),rel=path.relative(base,p);if(rel.startsWith('..')||path.isAbsolute(rel))throw new StoreError(400,'Недопустимый путь ресурса.');return p;};
async function atomic(file:string,value:unknown){const tmp=file+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value,null,2));await fs.rename(tmp,file)}
export function createProjectActions(store:Store,root:string,onCreated?:(p:Project)=>void,templates?:ReturnType<typeof createTemplateCatalog>){
 const base=path.join(localDataDir(root),'project-actions'),pending=new Map<string,Promise<Project>>();
 async function run(kind:'new'|'copy'|'template',input:Record<string,unknown>,sourceId?:string):Promise<Project>{
  const requestId=input.requestId;if(typeof requestId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,80}$/.test(requestId))throw new StoreError(400,'Нужен идентификатор операции создания.');
  const signature=hash(JSON.stringify({kind,sourceId,input})),key=requestId+':'+signature;
  if(pending.has(key))return pending.get(key)!;
  // Different payloads sharing a request ID must serialize before reading its receipt.
  const predecessor=[...pending.entries()].find(([id])=>id.startsWith(requestId+':'))?.[1];
  const work=(async()=>{if(predecessor)await predecessor.catch(()=>{});const dir=inside(base,requestId);await fs.mkdir(dir,{recursive:true});let receipt:Receipt;
   try{receipt=JSON.parse(await fs.readFile(path.join(dir,'request.json'),'utf8'));if(receipt.signature!==signature)throw new StoreError(409,'Идентификатор создания уже использован с другими параметрами.');}
   catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;const id='project-'+crypto.randomUUID().replaceAll('-','');let project:Project;let template:Receipt['template'];
    if(kind==='new'){try{project=blankProject(input,id,crypto.randomInt(0,1_000_000_000))}catch(error){throw new StoreError(400,(error as Error).message)}}
    else if(kind==='template'){if(!templates)throw new StoreError(503,'Каталог шаблонов недоступен.');const detail=await templates.load(sourceId!,Number(input.version));const title=typeof input.title==='string'?input.title.trim():detail.project.title;if(!title||title.length>200)throw new StoreError(400,'Проверьте название проекта.');project={...structuredClone(detail.project),id,revision:1,title};template={id:sourceId!,version:detail.summary.version,sha256:detail.summary.projectSha256};}
    else{const source=(await store.get(sourceId!)).project;if(!Number.isInteger(input.expectedRevision)||input.expectedRevision!==source.revision)throw new StoreError(409,'Проект изменился. Обновите его перед копированием.');const title=typeof input.title==='string'?input.title.trim():source.title+' — копия';if(!title||title.length>200)throw new StoreError(400,'Проверьте название копии.');project={...structuredClone(source),id,revision:1,title};}
    try{packageProject(project)}catch(error){throw new StoreError(400,(error as Error).message)}receipt={signature,project,...(kind==='copy'?{sourceId}:{}),...(template?{template}:{})};await atomic(path.join(dir,'request.json'),receipt);
   }
   const p=receipt.project,final=inside(store.root,p.id);try{await fs.access(path.join(final,'pointer.json'));return(await store.get(p.id)).project}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   if(receipt.template){if(!templates)throw new StoreError(503,'Каталог недоступен.');const d=await templates.load(receipt.template.id,receipt.template.version);if(d.summary.projectSha256!==receipt.template.sha256)throw new StoreError(409,'Версия шаблона изменилась. Создайте новый запрос.');}
   const stagingRoot=path.join(dir,'install'),temporary=createStore(stagingRoot,{dataRoot:path.join(stagingRoot,'.local')}),staged=inside(temporary.root,p.id);await fs.mkdir(staged,{recursive:true});
   for(const asset of p.assets){const target=inside(staged,asset.path);let bytes:Buffer|undefined;try{const existing=await fs.readFile(target);if(existing.length===asset.bytes&&hash(existing)===asset.sha256)continue}catch{}if(!receipt.sourceId&&!receipt.template)throw new StoreError(400,'Не найден источник ресурса копии.');const original=receipt.template?await templates!.asset(receipt.template.id,receipt.template.version,asset.id):await store.assetFile(receipt.sourceId!,asset.id);bytes=await fs.readFile(original.file);if(bytes.length!==asset.bytes||hash(bytes)!==asset.sha256)throw new StoreError(400,'Ресурс отсутствует или повреждён: '+(asset.title??asset.id));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
   await atomic(path.join(staged,'project.json'),p);await temporary.get(p.id);
   try{await fs.lstat(final);throw new StoreError(409,'Путь создаваемого проекта уже занят.')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   await fs.rename(staged,final);const result=(await store.get(p.id)).project;onCreated?.(result);return result;
  })();pending.set(key,work);try{return await work}finally{pending.delete(key)}
 }
 return{create:(input:Record<string,unknown>)=>run('new',input),copy:(id:string,input:Record<string,unknown>)=>run('copy',input,id),fromTemplate:(id:string,version:number,input:Record<string,unknown>)=>run('template',{...input,version},id)};
}
