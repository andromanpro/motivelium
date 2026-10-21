import {localDataDir} from '../dataPaths.ts';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import type {Store} from '../storage.ts';import {StoreError} from '../storage.ts';import type {Project} from '../../studio/domain/schema.ts';import type {AIJob} from '../../studio/agent/proposal.ts';
import {AUTO_LIMITS,type AutoRun,type AutoView,type AutoReason} from '../../studio/agent/auto.ts';
import {isValidId} from '../../studio/domain/ids.ts';import {applyOperations} from '../../studio/domain/operations.ts';import {validateVisualFrames} from './images.ts';import type {createAIService} from './service.ts';
type Service=ReturnType<typeof createAIService>;type StoredRun=AutoRun&{requestHash:string};
const hash=(v:unknown)=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalize=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function signature(base:Project,job:AIJob){const p=applyOperations(base,job.operations),n=p.nodes.find(n=>n.id===job.nodeId);return hash({node:n,effects:p.effects.filter(e=>e.targetId===job.nodeId).sort((a,b)=>a.order-b.order).map(({id,targetId,order,...e})=>e)});}
export function createAutoService(store:Store,ai:Service,root:string,options:{now?:()=>number}={}){
 const now=options.now??Date.now,runs=new Map<string,StoredRun>(),locks=new Map<string,Promise<unknown>>(),timers=new Map<string,ReturnType<typeof setTimeout>>();
 const dir=(id:string)=>{if(!isValidId(id))throw new StoreError(400,'Неверный ID автоматического прохода.');return path.join(localDataDir(root),'ai-runs',id)};
 async function locked<T>(id:string,fn:()=>Promise<T>):Promise<T>{const p=(locks.get(id)??Promise.resolve()).catch(()=>{}).then(fn);locks.set(id,p);try{return await p}finally{if(locks.get(id)===p)locks.delete(id)}}
 async function save(r:StoredRun){await fs.promises.mkdir(dir(r.id),{recursive:true});const file=path.join(dir(r.id),'run.json');await fs.promises.writeFile(file+'.tmp',JSON.stringify(r,null,2),'utf8');await fs.promises.rename(file+'.tmp',file);runs.set(r.id,r);}
 async function view(r:StoredRun):Promise<AutoView>{const{requestHash,...run}=r;let job:AIJob|null=null;const id=r.status==='finished'?r.resultJobId:r.currentJobId;
  if(id)try{job=await ai.get(r.projectId,id);if(r.status==='finished'&&job.status==='proposed'&&!job.autoReleased)job=await ai.releaseAuto(r.projectId,id,r.id);}catch(e){if(!(e instanceof StoreError&&e.status===404))throw e;}
  if(r.status==='running'&&job?.status==='running'){const fallback=r.bestJobId??r.steps.at(-1)?.jobId;if(fallback)job=await ai.get(r.projectId,fallback);}
  return{run:structuredClone(run),job};
 }
 async function finish(r:StoredRun,reason:AutoReason,error?:string){
  if(r.status==='finished')return;
  let current:AIJob|null=null;try{current=await ai.get(r.projectId,r.currentJobId);}catch{}
  if(current?.visualReview?.status==='running')await ai.cancelReview(r.projectId,current.id,r.id);
  if(current?.status==='running')await ai.cancel(r.projectId,current.id,r.id);
  let candidate:string|null=null;
  for(const id of [...new Set([r.bestJobId,r.currentJobId,...r.steps.map(s=>s.jobId).reverse()].filter((v):v is string=>!!v))]){try{if((await ai.get(r.projectId,id)).status==='proposed'){candidate=id;break;}}catch{}}
  r.status='finished';r.phase='finished';r.next=null;r.resultJobId=candidate;r.reason=reason;r.error=error??null;const timer=timers.get(r.id);if(timer)clearTimeout(timer);timers.delete(r.id);await save(r);
  if(candidate)await ai.releaseAuto(r.projectId,candidate,r.id);
 }
 async function load(pid:string,id:string){let r=runs.get(id);if(!r){try{r=JSON.parse(await fs.promises.readFile(path.join(dir(id),'run.json'),'utf8')) as StoredRun;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new StoreError(404,'Проход не найден.');throw e;}
   if(r.projectId!==pid)throw new StoreError(404,'Проход другого проекта.');runs.set(id,r);if(r.status==='running')await finish(r,'restart');
  }if(r.projectId!==pid)throw new StoreError(404,'Проход другого проекта.');return r;
 }
 async function refresh(r:StoredRun){
  if(r.status==='finished')return;
  if(now()>=Date.parse(r.deadlineAt)){await finish(r,'timeout');return;}
  const {project:base}=await store.get(r.projectId);if(base.revision!==r.baseRevision){await finish(r,'conflict');return;}
  if(r.phase==='launching'){await finish(r,'error','Не удалось подтвердить запуск шага. Повтор автоматически не выполняется.');return;}
  if(r.phase==='awaiting-frames')return;
  const job=await ai.get(r.projectId,r.currentJobId);
  if(r.phase==='generating'){
   if(job.status==='running')return;
   if(job.status!=='proposed'){await finish(r,job.status==='clarification'?'clarification':'error',job.error??job.summary);return;}
   const sig=signature(base,job),step={round:r.round,jobId:job.id,summary:job.summary,signature:sig};r.steps.push(step);
   if(r.steps.slice(0,-1).some(s=>s.signature===sig)){await finish(r,'same-result');return;}
   r.phase='awaiting-frames';r.next='review';r.stepKey=r.id+'-review-'+r.round;await save(r);return;
  }
  const review=job.visualReview;if(!review||review.status==='running')return;
  if(review.status!=='complete'){await finish(r,'error',review.error??'Проверка не завершена.');return;}
  const step=r.steps.at(-1)!;step.verdict=review.verdict??'uncertain';step.reviewSummary=review.summary;step.score=review.score;step.feedback=normalize(review.nextPrompt);
  const rank=review.verdict==='good'?2:review.verdict==='needs-work'?1:0;
  if(!r.bestJobId||rank>r.bestRank||(rank===r.bestRank&&review.score!==undefined&&(r.bestScore===null||review.score>r.bestScore))){r.bestJobId=job.id;r.bestRank=rank;r.bestScore=review.score??null;}
  if(review.verdict==='good'){await finish(r,'good');return;}
  if(review.verdict==='uncertain'||!review.nextPrompt.trim()){await finish(r,'uncertain');return;}
  const previous=r.steps.slice(0,-1);
  if(previous.some(s=>s.feedback&&s.feedback===step.feedback)){await finish(r,'same-feedback');return;}
  const last=previous.at(-1);if(last?.score!==undefined&&review.score!==undefined&&review.score<=last.score+1){await finish(r,'no-improvement');return;}
  if(r.round>=AUTO_LIMITS.refinements||r.calls>=AUTO_LIMITS.calls){await finish(r,'limit');return;}
  r.phase='awaiting-frames';r.next='refine';r.stepKey=r.id+'-refine-'+r.round;await save(r);
 }
 async function failure(r:StoredRun,e:unknown){await finish(r,e instanceof StoreError&&e.status===409?'conflict':'error',(e as Error).message);}
 return{
  async start(pid:string,body:Record<string,unknown>){return locked('create',async()=>{
   const id=body.requestId;if(!isValidId(id)||typeof body.nodeId!=='string'||typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>6000||!Number.isInteger(body.frame)||!Number.isInteger(body.expectedRevision)||body.proposal!==undefined||body.previousJobId!==undefined)throw new StoreError(400,'Нужны объект, пожелание, кадр и ревизия.');
   const requestHash=hash(body);try{const existing=await load(pid,id);if(existing.requestHash!==requestHash)throw new StoreError(409,'Этот ID прохода занят другим запросом.');return view(existing);}catch(e){if(!(e instanceof StoreError&&e.status===404))throw e;if(fs.existsSync(path.join(dir(id),'run.json')))throw new StoreError(409,'ID прохода принадлежит другому проекту.');}
   // Discover persisted unfinished runs after a restart; never replay their requests.
   const folder=path.join(localDataDir(root),'ai-runs');if(fs.existsSync(folder))for(const entry of await fs.promises.readdir(folder)){if(!isValidId(entry)||runs.has(entry))continue;const data=JSON.parse(await fs.promises.readFile(path.join(folder,entry,'run.json'),'utf8')) as StoredRun;await load(data.projectId,entry);}
   if([...runs.values()].some(r=>r.status==='running'))throw new StoreError(429,'Другой автоматический проход ещё выполняется.');
   const{project:base}=await store.get(pid);if(base.revision!==body.expectedRevision)throw new StoreError(409,'Проект изменился.');
   let checked;try{checked=validateVisualFrames(body.visualFrames,base.durationFrames,'source');}catch(e){throw new StoreError(400,(e as Error).message);}
   if(checked.frames.length>3||!checked.frames.some(f=>f.frame===body.frame))throw new StoreError(400,'Нужно до3 исходных кадров, включая выбранный.');
   const nodeId=body.nodeId,prompt=body.prompt.trim();
   return locked(id,async()=>{
   const r:StoredRun={id,projectId:pid,nodeId,baseRevision:base.revision,frame:body.frame as number,sampleFrames:checked.frames.map(f=>f.frame).sort((a,b)=>a-b),prompt,allowText:body.allowText===true,status:'running',phase:'launching',next:null,stepKey:'',round:0,calls:1,limits:AUTO_LIMITS,startedAt:new Date(now()).toISOString(),deadlineAt:new Date(now()+AUTO_LIMITS.milliseconds).toISOString(),currentJobId:id+'-p0',bestJobId:null,resultJobId:null,steps:[],reason:null,error:null,bestScore:null,bestRank:-1,requestHash};
   await save(r);const timer=setTimeout(()=>void locked(r.id,async()=>{await finish(r,'timeout');}).catch(()=>{}),AUTO_LIMITS.milliseconds);timer.unref();timers.set(r.id,timer);
   try{await ai.start(pid,{requestId:r.currentJobId,nodeId:r.nodeId,expectedRevision:r.baseRevision,frame:r.frame,prompt:r.prompt,allowText:r.allowText,visualFrames:checked.frames},r.id);r.phase='generating';await save(r);}catch(e){await failure(r,e);}
   return view(r);
   });
  })},
  async get(pid:string,id:string){return locked(id,async()=>{const r=await load(pid,id);await refresh(r);return view(r);})},
  async advance(pid:string,id:string,body:Record<string,unknown>){return locked(id,async()=>{
   const r=await load(pid,id);await refresh(r);const stepHash=hash(body);
   if(body.stepKey===r.lastStepKey){if(stepHash!==r.lastStepHash)throw new StoreError(409,'Повтор шага содержит другие кадры.');return view(r);}
   if(r.status!=='running')return view(r);
   if(r.phase!=='awaiting-frames'||body.stepKey!==r.stepKey)throw new StoreError(409,'Шаг прохода уже изменился.');
   if(r.calls>=AUTO_LIMITS.calls){await finish(r,'limit');return view(r);}
   let checked;try{checked=validateVisualFrames(body.visualFrames,(await store.get(pid)).project.durationFrames,'comparison');}catch(e){throw new StoreError(400,(e as Error).message);}
   if(checked.frames.length!==r.sampleFrames.length*2||checked.frames.some(f=>!r.sampleFrames.includes(f.frame)))throw new StoreError(400,'Нужны пары тех же кадров, что были при запуске.');
   const next=r.next,visualSig=hash(checked.receipts.filter(f=>f.role==='after').sort((a,b)=>a.frame-b.frame).map(f=>f.sha256));
   if(next==='review'){if(r.steps.slice(0,-1).some(s=>s.visualSignature===visualSig)){await finish(r,'same-frames');return view(r);}r.steps.at(-1)!.visualSignature=visualSig;}
   const previousId=r.currentJobId;r.lastStepKey=r.stepKey;r.lastStepHash=stepHash;r.calls++;r.phase='launching';r.next=null;
   if(next==='refine'){r.round++;r.currentJobId=r.id+'-p'+r.round;}
   await save(r); // Reservation precedes model launch. Lost responses cannot reset limits.
   try{
    if(next==='review'){await ai.review(pid,r.currentJobId,{requestId:r.id+'-v'+r.round,expectedRevision:r.baseRevision,visualFrames:checked.frames},r.id);r.phase='reviewing';}
    else{await ai.start(pid,{requestId:r.currentJobId,nodeId:r.nodeId,expectedRevision:r.baseRevision,frame:r.frame,prompt:r.prompt,allowText:r.allowText,previousJobId:previousId,visualFrames:checked.frames},r.id);r.phase='generating';}
    await save(r);
   }catch(e){await failure(r,e);}
   return view(r);
  })},
  async cancel(pid:string,id:string,reason:AutoReason='cancelled'){return locked(id,async()=>{const r=await load(pid,id);await finish(r,reason==='capture-error'?'capture-error':'cancelled');return view(r);})},
 };
}
