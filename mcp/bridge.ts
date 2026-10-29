import {buildStoryMontage} from '../studio/domain/storyMontage.ts';
import {APP_VERSION,BUILD_ID} from '../studio/domain/version.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {applyOperations,type Operation} from '../studio/domain/operations.ts';
import type {Project} from '../studio/domain/schema.ts';
import {buildComposition,compositionSettings,type CompositionId} from '../studio/domain/compositions.ts';
import {searchCatalog,capabilitySection} from './catalog.ts';
import {createPreviewRenderer} from './preview.ts';
import {createRunBudget,type RunLimits} from './budget.ts';
import {timingOperations,type TimingItem} from './recipes.ts';
import {transitionSample,TRANSITION_NOTES} from './transitions.ts';
import {overview,listNodes,listEffects,compactResponse,page} from './query.ts';
import {listStoryboard,getStoryCard} from './storyboard.ts';
import {storyFrame,storySignature,storyLink} from '../studio/domain/storyboard.ts';
import {placeSound,gridCues,gridOperations,type SoundEntry}from'../studio/domain/audioEditing.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=(v:unknown)=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const id=(v:unknown)=>{if(typeof v!=='string'||!/^[a-z0-9-]{1,100}$/.test(v))throw Error('Неверный идентификатор.');return v;};
type Draft={id:string;projectId:string;baseRevision:number;baseHash:string;workspace:string;summary:string;operations:Operation[];project:Project;parentId?:string;round:number;createdAt:string};
export function createBridge(options:{url:string;stateDir:string;assetRoot?:string;root?:string;runKey?:string;limits?:Partial<RunLimits>;responseMode?:'compact'|'full'}){
 if(options.responseMode&&!['compact','full'].includes(options.responseMode))throw Error('responseMode: compact или full.');
 const url=new URL(options.url);if(!['http:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('MCP подключается только к локальной студии по http://127.0.0.1:порт/.');
 const origin=url.origin,state=path.resolve(options.stateDir),renderer=createPreviewRenderer(options.root??ROOT);
 async function api(route:string,method='GET',body?:unknown):Promise<any>{
  let token:string|undefined;
  if(method!=='GET'){const res=await fetch(origin+'/api/v1/project-packages',{redirect:'error',signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('Не удалось подключиться к студии.');token=(await res.json() as any).mutationToken;if(typeof token!=='string')throw Error('Студия не вернула токен операций.');}
  const res=await fetch(origin+route,{method,redirect:'error',headers:{...(token?{'x-motivelium-token':token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
  const data=await res.json() as any;if(!res.ok)throw Error(`HTTP ${res.status}: ${data.error??'Ошибка студии'}${data.details?' / '+JSON.stringify(data.details):''}`);return data;
 }
 async function workspace(){const health=await api('/api/health');if(health.studioReady!==true)throw Error('Это не сервер Motivelium.');if(typeof health.dataRoot==='string')return hash({origin,dataRoot:health.dataRoot});if(typeof health.root==='string'&&Number.isInteger(health.pid))return hash({origin,legacyRoot:health.root,legacyPid:health.pid});throw Error('Студия не сообщила идентификатор хранилища.');}
 const budget=createRunBudget({stateDir:state,runKey:options.runKey,limits:options.limits,workspace:async()=>{const h=await api('/api/health');if(h.studioReady!==true||typeof(h.dataRoot??h.root)!=='string')throw Error('Неизвестное хранилище лимита.');return hash({origin,dataRoot:h.dataRoot??h.root});}});
 async function getProject(projectId:string){const {mutationToken,...result}=await api('/api/v1/projects/'+id(projectId));return result as {project:Project;canUndo:boolean;canRedo:boolean};}
 async function readDraft(draftId:string):Promise<Draft>{const d=JSON.parse(await fs.readFile(path.join(state,'drafts',id(draftId)+'.json'),'utf8')) as Draft;if(d.workspace!==await workspace())throw Error('Черновик относится к другому хранилищу студии.');return d;}
 async function draft(base:Project,operations:Operation[],summary:string,parent?:Draft){
  const project=applyOperations(base,operations),round=parent?parent.round+1:0;if(round>3)throw Error('Лимит: три доработки. Остановитесь и обсудите новый замысел.');
  const data={projectId:base.id,baseRevision:base.revision,baseHash:hash(base),workspace:await workspace(),summary,operations,project,...(parent?{parentId:parent.id}:{}),round};
  const d:Draft={id:'draft-'+hash(data).slice(0,32),...data,createdAt:new Date().toISOString()};await fs.mkdir(path.join(state,'drafts'),{recursive:true});
  const file=path.join(state,'drafts',d.id+'.json');try{await fs.writeFile(file,JSON.stringify(d,null,2),{flag:'wx'})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  return{draftId:d.id,projectId:d.projectId,baseRevision:d.baseRevision,round,summary,operations:operations.length,nodes:project.nodes.length,effects:project.effects.length,applied:false,affectedIds:[...new Set(operations.map((o:any)=>o.targetId??o.node?.id??o.effect?.id??o.sequence?.id).filter(Boolean))].slice(0,24),budget:await budget.status()};
 }
 async function source(input:any){if(input.draftId){const d=await readDraft(input.draftId);if(input.projectId&&input.projectId!==d.projectId)throw Error('Указаны разные проекты.');return{project:d.project,draft:d};}if(!input.projectId)throw Error('Укажите projectId или draftId.');return{project:(await getProject(input.projectId)).project};}
 async function query(input:any,fn:typeof overview|typeof listNodes|typeof listEffects){
  const {project,draft:d}=await source(input);
  if(input.expectedRevision!==undefined&&project.revision!==input.expectedRevision)throw Error('HTTP 409: ревизия выборки изменилась. Получите project_overview и начните страницы заново.');
  return{...fn(project,input),...(d?{draftId:d.id,baseRevision:d.baseRevision,immutableDraft:true}:{})};
 }
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
 const samples=<T>(list:T[])=>list.length<=6?list:Array.from({length:6},(_,i)=>list[Math.round(i*(list.length-1)/5)]!);
 async function renderSnapshot(project:Project,frames:number[],width:number,signal?:AbortSignal,clipFps?:number,sampleFrames?:number[]){
  signal?.throwIfAborted();const key=hash({version:2,project,frames,width,clipFps,sampleFrames}),file=path.join(state,'render-cache',key+'.json');
  try{const cached=JSON.parse(await fs.readFile(file,'utf8'));for(const f of cached.frames)if(crypto.createHash('sha256').update(await fs.readFile(f.path)).digest('hex')!==f.sha256)throw Error('Повреждён кэш кадра.');if(cached.clip&&crypto.createHash('sha256').update(await fs.readFile(cached.clip.path)).digest('hex')!==cached.clip.sha256)throw Error('Повреждён кэш клипа.');return{...cached,cached:true,budget:await budget.status()};}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  await budget.reserve('previews',key,false);
  const directory=path.join(state,'previews','preview-'+crypto.randomUUID());
  const result=await renderer.render({project,frames,width,directory,origin,asset:async(assetId,signal)=>{const r=await fetch(origin+'/api/v1/projects/'+project.id+'/assets/'+id(assetId),{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});if(!r.ok)throw Error('Не найден ресурс примерки: '+assetId);return Buffer.from(await r.arrayBuffer())},signal,...(clipFps?{clipFps}:{})});
  const clip=result.clip?{...result.clip,bytes:(await fs.stat(result.clip.path)).size,sha256:crypto.createHash('sha256').update(await fs.readFile(result.clip.path)).digest('hex')}:undefined;
  const output={previewId:path.basename(directory),projectId:project.id,revision:project.revision,immutableSnapshotHash:hash(project),frames:sampleFrames?sampleFrames.map(f=>result.frames.find(r=>r.frame===f)!):samples(result.frames),...(clip?{clip}:{}),allFramesManifest:path.join(directory,'manifest.json')};
  await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(output));await fs.rename(temp,file);return{...output,cached:false,budget:await budget.status()};
 }
 async function preview(input:any,signal?:AbortSignal,clip=false){
  const {project,draft:d}=await source(input),width=input.width??960;
  let frames:number[],fps:number|undefined;
  if(clip){const start=input.fromFrame??0,seconds=input.seconds??2,rate:number=input.fps??15;fps=rate;if(rate>project.fps.num/project.fps.den)throw Error('FPS превью не должен превышать FPS проекта.');frames=Array.from({length:Math.min(Math.floor(seconds*rate),Math.ceil((project.durationFrames-start)*project.fps.den/project.fps.num*rate))},(_,i)=>start+Math.floor(i*project.fps.num/project.fps.den/rate));}
  else frames=input.frames??[...new Set([0,Math.floor(project.durationFrames/2),project.durationFrames-2,project.durationFrames-1].filter(f=>f>=0))];
  return{...await renderSnapshot(project,frames,width,signal,fps),draftId:d?.id};
 }
 const tools:Record<string,(input:any,signal?:AbortSignal)=>Promise<any>>={
  assemble_storyboard:async input=>{const {project}=await getProject(input.projectId);if(project.revision!==input.expectedRevision)throw Error('HTTP 409: проект изменился');return draft(project,buildStoryMontage(project,{cardIds:input.cardIds,recipe:input.recipe}).operations,'Собрать монтаж из раскадровки')},
  capabilities:async input=>({application:'motivelium',version:APP_VERSION,buildId:BUILD_ID,transport:'stdio',origin,section:input.section??'overview',...capabilitySection(input.section,input.offset,input.limit),budget:await budget.status()}),
  run_status:async()=>budget.status(),
  preview_transition:async(input,signal)=>{const p=transitionSample(input.shaderId,input.params??{},input.width??640);const result=await renderSnapshot(p,Array.from({length:72},(_,i)=>i),p.size.width,signal,24,[0,18,27,35,44,71]);return{...result,shaderId:input.shaderId,description:TRANSITION_NOTES[input.shaderId]??'Смотрите фактический переход между синей сценой A и янтарной B.',sampleOnly:true,changesProject:false};},
  catalog:async input=>input.kind==='templates'?api('/api/v1/templates?language='+(input.language==='en'?'en':'ru')):searchCatalog(input.kind,input.query,input.targetKind,input.offset??0,input.limit??12),
  sound_catalog:async input=>{const data=await api('/api/v1/sounds'),words=String(input.query??'').toLowerCase().split(/\s+/).filter(Boolean),matches=(data.sounds as SoundEntry[]).filter(s=>words.every(w=>[s.id,s.title,s.category,...s.tags].join(' ').toLowerCase().includes(w))),offset=input.offset??0,limit=input.limit??8;return{total:matches.length,items:matches.slice(offset,offset+limit),nextOffset:offset+limit<matches.length?offset+limit:null}},
  propose_sound:async input=>{const {project}=await getProject(input.projectId);if(project.revision!==input.expectedRevision)throw Error('HTTP 409: проект изменился.');const staged=await api(`/api/v1/projects/${project.id}/sound-assets`,'POST',{soundId:input.soundId,expectedRevision:project.revision}),asset=project.assets.find(a=>a.sha256===staged.asset.sha256)??staged.asset,track=placeSound(project,asset,input.frame,input.align??'peak',staged.entry.peakSeconds,'sound-'+hash(input).slice(0,16),staged.entry);if(input.gain!==undefined)track.gain=input.gain;if(input.duckMusicDb!==undefined)track.clip!.duckMusicDb=input.duckMusicDb;return draft(project,[...(!project.assets.some(a=>a.id===asset.id)?[{op:'addAsset' as const,asset}]:[]),{op:'addAudioTrack',track}],'Звуковой эффект: '+staged.entry.title)},
  analyze_audio:async input=>{const out=await api(`/api/v1/projects/${id(input.projectId)}/audio-analysis`,'POST',{expectedRevision:input.expectedRevision,trackId:input.trackId}),{waveform,beatsSeconds,...summary}=out.analysis;return{...out,analysis:{...summary,beats:beatsSeconds.length,firstBeatsSeconds:beatsSeconds.slice(0,8)},changesProject:false}},
  propose_music_grid:async input=>{const {project}=await getProject(input.projectId);if(project.revision!==input.expectedRevision)throw Error('HTTP 409: проект изменился.');let bpm=input.bpm,first=input.firstSeconds??0;if(bpm===undefined){const out=await api(`/api/v1/projects/${project.id}/audio-analysis`,'POST',{expectedRevision:project.revision,trackId:input.trackId});if(!out.analysis.bpm)throw Error('Темп не найден. Передайте BPM вручную.');bpm=out.analysis.bpm;first=out.timelineStartSeconds+out.analysis.firstBeatSeconds;}const cues=gridCues(project,input.trackId,bpm,first,input.every??4,input.fromFrame??0,input.toFrame??project.durationFrames-1,'musicgrid-'+hash(input).slice(0,12)),ops=gridOperations(project,input.trackId,cues,input.replace??true);if(ops.length>200)throw Error('Слишком много изменений сетки: сократите интервал или увеличьте every.');return{...await draft(project,ops,'Музыкальная сетка: '+bpm+' BPM'),bpm,firstSeconds:first,marks:cues.length}},
  list_projects:async()=>api('/api/v1/projects'),
  get_project:async input=>getProject(input.projectId),
  project_overview:async input=>query(input,overview),
  list_nodes:async input=>query(input,listNodes),
  list_effects:async input=>query(input,listEffects),
  list_storyboard:async input=>query(input,listStoryboard),
  get_story_card:async input=>{const {project}=await source(input);if(input.expectedRevision!==undefined&&input.expectedRevision!==project.revision)throw Error('HTTP 409: раскадровка изменилась');return getStoryCard(project,input)},
  preview_story_card:async(input,signal)=>{
   const {project}=await source(input),card=project.storyboard?.cards.find(c=>c.id===input.cardId);if(!card)throw Error('Карточка не найдена');
   if(input.view==='montage'){const frame=storyFrame(project,card);if(frame===null)throw Error('Сначала свяжите карточку со сценой');return{...await renderSnapshot(project,[frame],input.width??960,signal),cardId:card.id,view:'montage',frame,signature:storySignature(project,card.sequenceId!,frame),link:storyLink(project,card)}}
   if(!card.image)throw Error('В карточке пока нет изображения');const asset=project.assets.find(a=>a.id===card.image!.assetId)!;const response=await fetch(origin+'/api/v1/projects/'+project.id+'/assets/'+id(asset.id),{redirect:'error',signal});if(!response.ok)throw Error('Изображение не загружено. Если оно только в примерке, примените импорт или смотрите PNG из propose_story_capture.');const bytes=Buffer.from(await response.arrayBuffer());if(crypto.createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('SHA изображения не совпал');const directory=path.join(state,'story-images');await fs.mkdir(directory,{recursive:true});const file=path.join(directory,asset.sha256+({ 'image/jpeg':'.jpg','image/webp':'.webp'}[asset.mime]??'.png'));await fs.writeFile(file,bytes);return{projectId:project.id,revision:project.revision,cardId:card.id,view:'image',link:storyLink(project,card),image:{path:file,mime:asset.mime,sha256:asset.sha256,width:asset.width,height:asset.height},changesProject:false};
  },
  propose_story_capture:async(input,signal)=>{
   const {project}=await getProject(input.projectId);if(project.revision!==input.expectedRevision)throw Error('HTTP 409: проект изменился');const card=project.storyboard?.cards.find(c=>c.id===input.cardId);if(!card)throw Error('Карточка не найдена');const scene=project.sequences.find(s=>s.id===card.sequenceId);if(!scene)throw Error('Свяжите карточку со сценой');const frame=input.frame??storyFrame(project,card)!;if(!Number.isInteger(frame)||frame<scene.fromFrame||frame>=scene.toFrame)throw Error('Кадр вне связанной сцены');
   const preview=await renderSnapshot(project,[frame],input.width??1280,signal),png=await fs.readFile(preview.frames[0]!.path);signal?.throwIfAborted();const staged=await api('/api/v1/projects/'+project.id+'/media-assets','POST',{expectedRevision:project.revision,name:'Раскадровка-'+frame+'.png',base64:png.toString('base64')});
   const operations:Operation[]=[...(!project.assets.some(a=>a.id===staged.asset.id)?[{op:'addAsset' as const,asset:staged.asset}]:[]),{op:'updateStoryCard',targetId:card.id,values:{image:{assetId:staged.asset.id,origin:'render',frame,signature:storySignature(project,scene.id,frame)}}}];
   return{...await draft(project,operations,'Ключевой кадр из монтажа'),frames:preview.frames,frame,cardId:card.id,changesProject:false};
  },
  create_project:async input=>input.templateId?api(`/api/v1/templates/${id(input.templateId)}/${input.templateVersion??1}/projects`,'POST',{requestId:input.requestId,title:input.title}):api('/api/v1/projects','POST',input),
  propose_changes:async input=>{const {project}=await getProject(input.projectId);if(project.revision!==input.expectedRevision)throw Error('HTTP 409: проект изменился. Перечитайте его.');return draft(project,input.operations,input.summary)},
  propose_composition:async input=>{const {project}=await getProject(input.projectId);if(project.revision!==input.expectedRevision)throw Error('HTTP 409: проект изменился.');const settings={...compositionSettings(project,input.sequenceId,input.compositionId as CompositionId),...input.settings,id:input.compositionId,sequenceId:input.sequenceId};const plan=buildComposition(project,settings,'mcp-'+hash(input).slice(0,16));return draft(project,plan.operations,'Композиция '+input.compositionId)},
  propose_timing:async input=>{const {project,draft:d}=await source(input),plan=timingOperations(project,input.items as TimingItem[]);if(d)return{...await tools.refine_draft!({draftId:d.id,summary:'Рецепт появления и ухода',operations:plan.operations}),timing:plan.details};if(project.revision!==input.expectedRevision)throw Error('HTTP 409: проект изменился.');return{...await draft(project,plan.operations,'Рецепт появления и ухода'),timing:plan.details};},
  refine_draft:async input=>{const d=await readDraft(input.draftId),{project}=await getProject(d.projectId);if(project.revision!==d.baseRevision||hash(project)!==d.baseHash)throw Error('HTTP 409: исходный проект изменился.');return draft(project,[...d.operations,...input.operations],input.summary,d)},
  get_draft:async input=>{const d=await readDraft(input.draftId);let application=null;try{application=JSON.parse(await fs.readFile(path.join(state,'applied',d.id+'.json'),'utf8'))}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}return{...d,application}},
  apply_draft:async input=>{const d=await readDraft(input.draftId);const response=await api('/api/v1/projects/'+d.projectId+'/transactions','POST',{transactionId:d.id,projectId:d.projectId,expectedRevision:d.baseRevision,source:'agent',description:d.summary,operations:d.operations});await fs.mkdir(path.join(state,'applied'),{recursive:true});await fs.writeFile(path.join(state,'applied',d.id+'.json'),JSON.stringify({appliedRevision:response.project?.revision,transactionId:d.id}));return{applied:true,draftId:d.id,appliedRevision:response.project?.revision,...await getProject(d.projectId),studioUrl:origin+'/studio/?project='+d.projectId}},
  render_preview:async(input,signal)=>preview(input,signal),
  render_clip:async(input,signal)=>preview(input,signal,true),
  undo:async input=>api('/api/v1/projects/'+id(input.projectId)+'/undo','POST',{transactionId:input.requestId,expectedRevision:input.expectedRevision}),
  redo:async input=>api('/api/v1/projects/'+id(input.projectId)+'/redo','POST',{transactionId:input.requestId,expectedRevision:input.expectedRevision}),
  history:async input=>{const r=await api('/api/v1/projects/'+id(input.projectId)+'/history');const {project}=await getProject(input.projectId);return page(project,'history',r.journal,input,(entry:any)=>({transactionId:entry.transactionId,kind:entry.kind,description:entry.description,revision:entry.revision,at:entry.at}))},
  import_media:async input=>importFile(input),
  import_model:async input=>importFile(input,true),
  export_video:async input=>api('/api/v1/projects/'+id(input.projectId)+'/video-exports','POST',{requestId:input.requestId,expectedRevision:input.expectedRevision}),
  export_status:async input=>{const r=await api('/api/v1/projects/'+id(input.projectId)+'/video-exports/'+id(input.jobId));return{...r,...(r.job.downloadUrl?{downloadUrl:origin+r.job.downloadUrl}:{})}},
  cancel_export:async input=>api('/api/v1/projects/'+id(input.projectId)+'/video-exports/'+id(input.jobId)+'/cancel','POST',{}),
  export_project:async input=>api('/api/v1/projects/'+id(input.projectId)+'/packages','POST',{expectedRevision:input.expectedRevision}),
 };
 const iterations=new Set(['propose_sound','propose_music_grid','assemble_storyboard','propose_changes','propose_composition','propose_timing','refine_draft','propose_story_capture']);
 return{async call(name:string,input:any={},signal?:AbortSignal){if(!tools[name])throw Error('Неизвестный инструмент.');signal?.throwIfAborted();const{response,...body}=input;if(response&&!['compact','full'].includes(response))throw Error('response: compact или full.');const mode=response??options.responseMode??'compact';if(iterations.has(name))await budget.reserve('iterations',hash({name,input:body}));if(name==='history'&&mode==='full')return api('/api/v1/projects/'+id(body.projectId)+'/history');const result=await tools[name]!(body,signal);return mode==='full'?result:compactResponse(name,result)},dispose:()=>renderer.dispose()};
}
