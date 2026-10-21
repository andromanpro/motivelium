import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {applyOperations,type Operation} from '../studio/domain/operations.ts';
import type {Project} from '../studio/domain/schema.ts';
import {buildComposition,compositionSettings,type CompositionId} from '../studio/domain/compositions.ts';
import {searchCatalog,GUIDE,DOCUMENT_GUIDE} from './catalog.ts';
import {createPreviewRenderer} from './preview.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=(v:unknown)=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const id=(v:unknown)=>{if(typeof v!=='string'||!/^[a-z0-9-]{1,100}$/.test(v))throw Error('Неверный идентификатор.');return v;};
type Draft={id:string;projectId:string;baseRevision:number;baseHash:string;workspace:string;summary:string;operations:Operation[];project:Project;parentId?:string;round:number;createdAt:string};
export function createBridge(options:{url:string;stateDir:string;assetRoot?:string;root?:string}){
 const url=new URL(options.url);if(!['http:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('MCP подключается только к локальной студии по http://127.0.0.1:порт/.');
 const origin=url.origin,state=path.resolve(options.stateDir),renderer=createPreviewRenderer(options.root??ROOT);
 async function api(route:string,method='GET',body?:unknown):Promise<any>{
  let token:string|undefined;
  if(method!=='GET'){const res=await fetch(origin+'/api/v1/project-packages',{redirect:'error',signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('Не удалось подключиться к студии.');token=(await res.json() as any).mutationToken;if(typeof token!=='string')throw Error('Студия не вернула токен операций.');}
  const res=await fetch(origin+route,{method,redirect:'error',headers:{...(token?{'x-motivelium-token':token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
  const data=await res.json() as any;if(!res.ok)throw Error(`HTTP ${res.status}: ${data.error??'Ошибка студии'}${data.details?' / '+JSON.stringify(data.details):''}`);return data;
 }
 async function workspace(){const health=await api('/api/health');if(health.studioReady!==true)throw Error('Это не сервер Motivelium.');if(typeof health.dataRoot==='string')return hash({origin,dataRoot:health.dataRoot});if(typeof health.root==='string'&&Number.isInteger(health.pid))return hash({origin,legacyRoot:health.root,legacyPid:health.pid});throw Error('Студия не сообщила идентификатор хранилища.');}
 async function getProject(projectId:string){const {mutationToken,...result}=await api('/api/v1/projects/'+id(projectId));return result as {project:Project;canUndo:boolean;canRedo:boolean};}
 async function readDraft(draftId:string):Promise<Draft>{const d=JSON.parse(await fs.readFile(path.join(state,'drafts',id(draftId)+'.json'),'utf8')) as Draft;if(d.workspace!==await workspace())throw Error('Черновик относится к другому хранилищу студии.');return d;}
 async function draft(base:Project,operations:Operation[],summary:string,parent?:Draft){
  const project=applyOperations(base,operations),round=parent?parent.round+1:0;if(round>3)throw Error('Лимит: три доработки. Остановитесь и обсудите новый замысел.');
  const data={projectId:base.id,baseRevision:base.revision,baseHash:hash(base),workspace:await workspace(),summary,operations,project,...(parent?{parentId:parent.id}:{}),round};
  const d:Draft={id:'draft-'+hash(data).slice(0,32),...data,createdAt:new Date().toISOString()};await fs.mkdir(path.join(state,'drafts'),{recursive:true});
  const file=path.join(state,'drafts',d.id+'.json');try{await fs.writeFile(file,JSON.stringify(d,null,2),{flag:'wx'})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  return{draftId:d.id,projectId:d.projectId,baseRevision:d.baseRevision,round,summary,operations:operations.length,nodes:project.nodes.length,effects:project.effects.length,applied:false};
 }
 async function source(input:any){if(input.draftId){const d=await readDraft(input.draftId);if(input.projectId&&input.projectId!==d.projectId)throw Error('Указаны разные проекты.');return{project:d.project,draft:d};}if(!input.projectId)throw Error('Укажите projectId или draftId.');return{project:(await getProject(input.projectId)).project};}
 async function importFile(input:any,model=false){
  if(!options.assetRoot)throw Error('Для импорта задайте --asset-root ПАПКА.');
  const base=await fs.realpath(options.assetRoot),file=await fs.realpath(path.resolve(base,input.file)),rel=path.relative(base,file);if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Файл вне --asset-root.');
  const signature=hash({workspace:await workspace(),file,input,model}),receiptFile=path.join(state,'imports',hash(input.requestId)+'.json');
  let staged:any,tx:any;
  try{const prior=JSON.parse(await fs.readFile(receiptFile,'utf8'));if(prior.signature!==signature)throw Error('Этот requestId уже используется другим импортом.');staged=prior.staged;tx=prior.tx;}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
   const stat=await fs.stat(file);if(!stat.isFile()||stat.size>(model?16:64)*1024*1024)throw Error('Нужен файл до '+(model?16:64)+' МиБ.');
   const {project}=await getProject(input.projectId);if(project.revision!==input.expectedRevision)throw Error('HTTP 409: проект изменился.');
   const bytes=await fs.readFile(file);if(bytes.length>(model?16:64)*1024*1024)throw Error('Файл слишком большой.');
   staged=await api('/api/v1/projects/'+id(input.projectId)+(model?'/model-assets':'/media-assets'),'POST',{expectedRevision:project.revision,base64:bytes.toString('base64'),name:path.basename(file)});
   if(project.assets.some(a=>a.id===staged.asset.id))return{...staged,...await getProject(project.id),alreadyImported:true};
   tx={transactionId:input.requestId,projectId:project.id,expectedRevision:project.revision,source:'agent',description:'Импорт '+staged.asset.title,operations:[{op:'addAsset',asset:staged.asset}]};
   await fs.mkdir(path.dirname(receiptFile),{recursive:true});await fs.writeFile(receiptFile,JSON.stringify({signature,staged,tx}),{flag:'wx'});
  }
  const result=await api('/api/v1/projects/'+id(input.projectId)+'/transactions','POST',tx);return{...staged,...result,current:await getProject(input.projectId)};
 }
 async function preview(input:any,signal?:AbortSignal,clip=false){
  const {project,draft:d}=await source(input),width=input.width??960;
  let frames:number[],fps:number|undefined;
  if(clip){const start=input.fromFrame??0,seconds=input.seconds??2,rate:number=input.fps??15;fps=rate;if(rate>project.fps.num/project.fps.den)throw Error('FPS превью не должен превышать FPS проекта.');frames=Array.from({length:Math.min(Math.floor(seconds*rate),Math.ceil((project.durationFrames-start)*project.fps.den/project.fps.num*rate))},(_,i)=>start+Math.floor(i*project.fps.num/project.fps.den/rate));}
  else frames=input.frames??[0,Math.floor(project.durationFrames/2),project.durationFrames-1];
  const previewId='preview-'+crypto.randomUUID(),directory=path.join(state,'previews',previewId);
  const result=await renderer.render({project,frames,width,directory,origin,asset:async(assetId,signal)=>{const r=await fetch(origin+'/api/v1/projects/'+project.id+'/assets/'+id(assetId),{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});if(!r.ok)throw Error('Не найден ресурс примерки: '+assetId);return Buffer.from(await r.arrayBuffer())},signal,...(fps?{clipFps:fps}:{})});
  return{previewId,projectId:project.id,revision:project.revision,draftId:d?.id,immutableSnapshotHash:hash(project),...result};
 }
 const tools:Record<string,(input:any,signal?:AbortSignal)=>Promise<any>>={
  capabilities:async()=>({application:'motivelium',transport:'stdio',origin,guide:GUIDE,document:DOCUMENT_GUIDE}),
  catalog:async input=>input.kind==='templates'?api('/api/v1/templates'):searchCatalog(input.kind,input.query,input.targetKind,input.offset??0,input.limit??12),
  list_projects:async()=>api('/api/v1/projects'),
  get_project:async input=>getProject(input.projectId),
  create_project:async input=>input.templateId?api(`/api/v1/templates/${id(input.templateId)}/${input.templateVersion??1}/projects`,'POST',{requestId:input.requestId,title:input.title}):api('/api/v1/projects','POST',input),
  propose_changes:async input=>{const {project}=await getProject(input.projectId);if(project.revision!==input.expectedRevision)throw Error('HTTP 409: проект изменился. Перечитайте его.');return draft(project,input.operations,input.summary)},
  propose_composition:async input=>{const {project}=await getProject(input.projectId);if(project.revision!==input.expectedRevision)throw Error('HTTP 409: проект изменился.');const settings={...compositionSettings(project,input.sequenceId,input.compositionId as CompositionId),...input.settings,id:input.compositionId,sequenceId:input.sequenceId};const plan=buildComposition(project,settings,'mcp-'+hash(input).slice(0,16));return draft(project,plan.operations,'Композиция '+input.compositionId)},
  refine_draft:async input=>{const d=await readDraft(input.draftId),{project}=await getProject(d.projectId);if(project.revision!==d.baseRevision||hash(project)!==d.baseHash)throw Error('HTTP 409: исходный проект изменился.');return draft(project,[...d.operations,...input.operations],input.summary,d)},
  get_draft:async input=>{const d=await readDraft(input.draftId);let application=null;try{application=JSON.parse(await fs.readFile(path.join(state,'applied',d.id+'.json'),'utf8'))}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}return{...d,application}},
  apply_draft:async input=>{const d=await readDraft(input.draftId);const response=await api('/api/v1/projects/'+d.projectId+'/transactions','POST',{transactionId:d.id,projectId:d.projectId,expectedRevision:d.baseRevision,source:'agent',description:d.summary,operations:d.operations});await fs.mkdir(path.join(state,'applied'),{recursive:true});await fs.writeFile(path.join(state,'applied',d.id+'.json'),JSON.stringify({appliedRevision:response.project?.revision,transactionId:d.id}));return{applied:true,draftId:d.id,appliedRevision:response.project?.revision,...await getProject(d.projectId),studioUrl:origin+'/studio/?project='+d.projectId}},
  render_preview:async(input,signal)=>preview(input,signal),
  render_clip:async(input,signal)=>preview(input,signal,true),
  undo:async input=>api('/api/v1/projects/'+id(input.projectId)+'/undo','POST',{transactionId:input.requestId,expectedRevision:input.expectedRevision}),
  redo:async input=>api('/api/v1/projects/'+id(input.projectId)+'/redo','POST',{transactionId:input.requestId,expectedRevision:input.expectedRevision}),
  history:async input=>api('/api/v1/projects/'+id(input.projectId)+'/history'),
  import_media:async input=>importFile(input),
  import_model:async input=>importFile(input,true),
  export_video:async input=>api('/api/v1/projects/'+id(input.projectId)+'/video-exports','POST',{requestId:input.requestId,expectedRevision:input.expectedRevision}),
  export_status:async input=>{const r=await api('/api/v1/projects/'+id(input.projectId)+'/video-exports/'+id(input.jobId));return{...r,...(r.job.downloadUrl?{downloadUrl:origin+r.job.downloadUrl}:{})}},
  cancel_export:async input=>api('/api/v1/projects/'+id(input.projectId)+'/video-exports/'+id(input.jobId)+'/cancel','POST',{}),
  export_project:async input=>api('/api/v1/projects/'+id(input.projectId)+'/packages','POST',{expectedRevision:input.expectedRevision}),
 };
 return{async call(name:string,input:any={},signal?:AbortSignal){if(!tools[name])throw Error('Неизвестный инструмент.');return tools[name]!(input,signal)},dispose:()=>renderer.dispose()};
}
