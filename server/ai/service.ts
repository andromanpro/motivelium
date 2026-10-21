import {localDataDir} from '../dataPaths.ts';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import type {Store} from '../storage.ts';import {StoreError} from '../storage.ts';
import type {Project} from '../../studio/domain/schema.ts';
import {isValidId} from '../../studio/domain/ids.ts';
import {EDIT_SYSTEM_PROMPT,makeAIContext,validateEditProposal,type AIJob} from '../../studio/agent/proposal.ts';
import {subscriptionProvider,type ModelProvider} from './provider.ts';
import type {VisualFrame} from '../../studio/agent/visual.ts';
import {VISUAL_REVIEW_PROMPT,parseVisualReview} from '../../studio/agent/visual.ts';
import {validateVisualFrames,imageMessage} from './images.ts';
import {applyOperations} from '../../studio/domain/operations.ts';
type StoredJob=AIJob&{requestHash:string};
async function atomic(file:string,value:unknown){await fs.promises.writeFile(file+'.tmp',JSON.stringify(value,null,2),'utf8');await fs.promises.rename(file+'.tmp',file)}
export function createAIService(store:Store,root:string,provider:ModelProvider=subscriptionProvider(root)){
 const jobs=new Map<string,StoredJob>(),controllers=new Map<string,AbortController>(),starts=new Map<string,Promise<AIJob>>();
 const actions=new Map<string,Promise<unknown>>(),writes=new Map<string,Promise<void>>();
 async function locked<T>(id:string,fn:()=>Promise<T>):Promise<T>{const previous=actions.get(id)??Promise.resolve(),next=previous.catch(()=>{}).then(fn);actions.set(id,next);try{return await next}finally{if(actions.get(id)===next)actions.delete(id)}}
 const dir=(id:string)=>{if(!isValidId(id))throw new StoreError(400,'Неверный ID предложения.');return path.join(localDataDir(root),'ai-edits',id)};
 const publicJob=(job:StoredJob):AIJob=>{const{requestHash,...view}=job;return structuredClone(view)};
 const own=(job:StoredJob,owner?:string)=>{if(job.autoRunId&&!job.autoReleased&&job.autoRunId!==owner)throw new StoreError(409,'Предложение ещё находится в автоматическом проходе. Останови проход или дождись результата.');};
 const persist=async(job:StoredJob)=>{job.updatedAt=new Date().toISOString();jobs.set(job.id,job);const snapshot=structuredClone(job),next=(writes.get(job.id)??Promise.resolve()).catch(()=>{}).then(()=>atomic(path.join(dir(job.id),'job.json'),snapshot));writes.set(job.id,next);try{await next}finally{if(writes.get(job.id)===next)writes.delete(job.id)}};
 async function load(projectId:string,id:string){let job=jobs.get(id);if(!job){try{job=JSON.parse(await fs.promises.readFile(path.join(dir(id),'job.json'),'utf8')) as StoredJob}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new StoreError(404,'Предложение не найдено.');throw e}jobs.set(id,job)}if(job.projectId!==projectId)throw new StoreError(404,'Предложение другого проекта.');
  if(job.status==='running'&&!controllers.has(id)){job.status='failed';job.error='Сервер перезапущен. Запрос не повторялся; сохранённые данные доступны.';await persist(job)}
  if(job.visualReview?.status==='running'&&!controllers.has(id)){job.visualReview.status='failed';job.visualReview.error='Сервер перезапущен. Визуальная проверка не повторялась.';await persist(job)}return job;
 }
 async function run(job:StoredJob,base:Project,context:unknown,controller:AbortController,frames:VisualFrame[]=[]){
  try{
   const input={request:job.prompt,context};
   const result=await provider.generate([{role:'system',content:EDIT_SYSTEM_PROMPT},frames.length?imageMessage(input,frames):{role:'user',content:JSON.stringify(input)}],dir(job.id),controller.signal);
   await atomic(path.join(dir(job.id),'model-result.json'),result);
   await locked(job.id,async()=>{
   if(job.status!=='running')return;
   job.model=result.model;job.generationId=result.generationId;job.usage=result.usage;job.finishReason=result.finishReason;
   if(result.finishReason!=='stop')throw Error('Модель не завершила ответ. Предложение не применялось.');
   if(result.content.length>256*1024)throw Error('Ответ модели слишком большой.');
   const text=result.content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1');
   const proposal=validateEditProposal(base,job.nodeId,JSON.parse(text),job.allowText,job.id+'-fx');
   Object.assign(job,proposal);job.status=proposal.operations.length?'proposed':'clarification';if(controllers.get(job.id)===controller)controllers.delete(job.id);await persist(job);
   });
  }catch(e){await locked(job.id,async()=>{if(job.status==='running'){job.status='failed';job.error=e instanceof SyntaxError?'Модель вернула некорректный JSON. Ответ сохранён для проверки.':(e as Error).message;await persist(job)}})}finally{if(controllers.get(job.id)===controller)controllers.delete(job.id)}
 }
 async function startImpl(projectId:string,body:Record<string,unknown>,owner?:string):Promise<AIJob>{
  const {requestId,nodeId,expectedRevision,frame,prompt}=body,allowText=body.allowText===true;
  if(!isValidId(requestId)||typeof nodeId!=='string'||typeof prompt!=='string'||!prompt.trim()||prompt.length>6000||!Number.isInteger(frame)||!Number.isInteger(expectedRevision))throw new StoreError(400,'Нужны объект, пожелание, кадр и ревизия проекта.');
  const manual=body.proposal!==undefined,hash=crypto.createHash('sha256').update(JSON.stringify({projectId,nodeId,expectedRevision,frame,prompt,allowText,proposal:body.proposal??null,visualFrames:body.visualFrames??null,previousJobId:body.previousJobId??null,...(owner?{owner}:{})})).digest('hex');
  try{const existing=await load(projectId,requestId);if(existing.requestHash!==hash)throw new StoreError(409,'ID запроса уже занят другим пожеланием.');return publicJob(existing)}catch(e){if(!(e instanceof StoreError)||e.status!==404)throw e;if(fs.existsSync(path.join(dir(requestId),'job.json')))throw new StoreError(409,'ID запроса принадлежит другому проекту.');}
  const {project:base}=await store.get(projectId);if(base.revision!==expectedRevision)throw new StoreError(409,'Проект изменился. Перечитай его перед новым запросом.');
  if((frame as number)<0||(frame as number)>=base.durationFrames)throw new StoreError(400,'Кадр вне проекта.');
  let context:Record<string,unknown>,frames:VisualFrame[]=[];let receipts:AIJob['visualFrames'];
  try{
   context=makeAIContext(base,nodeId,frame as number,allowText);
   if(body.previousJobId!==undefined){
    if(!isValidId(body.previousJobId))throw Error('Неверный ID предыдущей примерки.');
    const previous=await load(projectId,body.previousJobId);
    own(previous,owner);
    if(previous.nodeId!==nodeId||previous.baseRevision!==base.revision||previous.status!=='proposed'||previous.visualReview?.status!=='complete')throw Error('Нужна проверенная примерка того же объекта и ревизии.');
    context.previousProposal={summary:previous.summary,operations:previous.operations};context.visualReview=previous.visualReview;
   }
   if(body.visualFrames!==undefined){const checked=validateVisualFrames(body.visualFrames,base.durationFrames,body.previousJobId?'refinement':'source');frames=checked.frames;receipts=checked.receipts;if(!frames.some(f=>f.frame===frame&&f.role==='before'))throw Error('Нет исходного снимка выбранного кадра.');const scene=base.sequences.find(s=>s.id===base.nodes.find(n=>n.id===nodeId)?.sequenceId);if(!scene||frames.some(f=>f.frame<scene.fromFrame||f.frame>=scene.toFrame))throw Error('Снимки должны относиться к сцене выбранного объекта.');context.visualFrames=receipts;}
   if(body.previousJobId&&!frames.length)throw Error('Для доработки нужна пара кадров до/после.');
  }catch(e){throw new StoreError(400,(e as Error).message)}
  const info=provider.info();if(!manual&&!info.ready)throw new StoreError(503,info.reason??'Модель не настроена.');
  if(!manual&&controllers.size)throw new StoreError(429,'Другой запрос к модели ещё выполняется. Дождись ответа или отмени его.');
  const now=new Date().toISOString(),job:StoredJob={id:requestId,requestHash:hash,projectId,nodeId,baseRevision:base.revision,frame:frame as number,prompt:prompt.trim(),allowText,status:'running',createdAt:now,updatedAt:now,model:manual?'Вставленный ответ':frames.length?(info.visionModel??info.model):info.model,summary:'',notes:[],operations:[],changes:[],error:null,usage:null,generationId:null,finishReason:null,...(receipts?{visualFrames:receipts}:{}),...(body.previousJobId?{previousJobId:body.previousJobId as string}:{})};
  if(owner)job.autoRunId=owner;
  const controller=new AbortController();if(!manual)controllers.set(job.id,controller);
  try{
   await fs.promises.mkdir(dir(job.id),{recursive:true});await atomic(path.join(dir(job.id),'base-project.json'),base);await atomic(path.join(dir(job.id),'context.json'),{request:job.prompt,context});if(frames.length)await atomic(path.join(dir(job.id),'frames.json'),frames);
   if(manual){await atomic(path.join(dir(job.id),'manual-response.json'),body.proposal);try{const proposal=validateEditProposal(base,nodeId,body.proposal,allowText,job.id+'-fx');Object.assign(job,proposal);job.status=proposal.operations.length?'proposed':'clarification';job.finishReason='manual';await persist(job)}catch(e){job.status='failed';job.error=(e as Error).message;await persist(job);throw e}}
   else{await persist(job);void run(job,base,context,controller,frames).catch(()=>{controllers.delete(job.id)})}
  }catch(e){controllers.delete(job.id);throw new StoreError(400,(e as Error).message)}
  return publicJob(job);
 }
 async function runReview(job:StoredJob,base:Project,frames:VisualFrame[],controller:AbortController){
  const review=job.visualReview!,reviewDir=path.join(dir(job.id),'review');
  try{
   const trial=applyOperations(base,job.operations),context={request:job.prompt,original:makeAIContext(base,job.nodeId,job.frame,job.allowText),proposed:makeAIContext(trial,job.nodeId,job.frame,job.allowText),proposal:{summary:job.summary,changes:job.changes},visualFrames:review.frames};
   await atomic(path.join(reviewDir,'context.json'),context);
   const result=await provider.generate([{role:'system',content:VISUAL_REVIEW_PROMPT},imageMessage(context,frames)],reviewDir,controller.signal);
   await atomic(path.join(reviewDir,'model-result.json'),result);
   await locked(job.id,async()=>{
    if(job.status!=='proposed'||review.status!=='running')return;
    Object.assign(review,{model:result.model,generationId:result.generationId,usage:result.usage,finishReason:result.finishReason});
    if(result.finishReason!=='stop'||result.content.length>256*1024)throw Error('Визуальная проверка не завершена.');
    const parsed=parseVisualReview(JSON.parse(result.content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1')));
    Object.assign(review,parsed,{status:'complete'});if(controllers.get(job.id)===controller)controllers.delete(job.id);await persist(job);
   });
  }catch(e){await locked(job.id,async()=>{if(review.status==='running'){review.status='failed';review.error=e instanceof SyntaxError?'Некорректный JSON визуальной проверки.':(e as Error).message;await persist(job)}})}finally{if(controllers.get(job.id)===controller)controllers.delete(job.id)}
 }
 return{
  info:()=>provider.info(),
  async start(projectId:string,body:Record<string,unknown>,owner?:string){const id=String(body.requestId);if(starts.has(id)){await starts.get(id);return startImpl(projectId,body,owner)}const promise=startImpl(projectId,body,owner);starts.set(id,promise);try{return await promise}finally{starts.delete(id)}},
  async get(projectId:string,id:string){const job=await load(projectId,id);await writes.get(id);return publicJob(job)},
  async review(projectId:string,id:string,body:Record<string,unknown>,owner?:string){return locked(id,async()=>{
   const job=await load(projectId,id);own(job,owner);if(!isValidId(body.requestId))throw new StoreError(400,'Нужен ID визуальной проверки.');
   const reviewHash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex'),reviewDir=path.join(dir(id),'review');
   if(job.visualReview){const saved=JSON.parse(await fs.promises.readFile(path.join(reviewDir,'input.json'),'utf8'));if(saved.hash!==reviewHash)throw new StoreError(409,'У этой примерки уже есть визуальная проверка. Для новой подготовь другое предложение.');return publicJob(job);}
   if(job.status!=='proposed'||body.expectedRevision!==job.baseRevision)throw new StoreError(409,'Нужна текущая неприменённая примерка.');
   const {project:current}=await store.get(projectId);if(current.revision!==job.baseRevision)throw new StoreError(409,'Проект изменился. Подготовь новое предложение.');
   let checked;try{checked=validateVisualFrames(body.visualFrames,current.durationFrames,'comparison');}catch(e){throw new StoreError(400,(e as Error).message);}
   const scene=current.sequences.find(s=>s.id===current.nodes.find(n=>n.id===job.nodeId)?.sequenceId);
   if(!scene||checked.frames.some(f=>f.frame<scene.fromFrame||f.frame>=scene.toFrame))throw new StoreError(400,'Снимки должны относиться к сцене выбранного объекта.');
   const info=provider.info();if(!info.ready)throw new StoreError(503,info.reason??'Модель не настроена.');if(controllers.size)throw new StoreError(429,'Другой запрос к модели ещё выполняется.');
   const base=JSON.parse(await fs.promises.readFile(path.join(dir(id),'base-project.json'),'utf8')) as Project,controller=new AbortController();controllers.set(id,controller);
   job.visualReview={id:body.requestId,status:'running',verdict:null,summary:'',observations:[],nextPrompt:'',frames:checked.receipts,model:info.visionModel??info.model,generationId:null,usage:null,finishReason:null,error:null,createdAt:new Date().toISOString()};
   try{await fs.promises.mkdir(reviewDir,{recursive:true});await atomic(path.join(reviewDir,'input.json'),{hash:reviewHash,request:body});await persist(job);void runReview(job,base,checked.frames,controller).catch(()=>{controllers.delete(id)});}catch(e){controllers.delete(id);job.visualReview.status='failed';job.visualReview.error=(e as Error).message;throw e;}
   return publicJob(job);
  })},
  async releaseAuto(projectId:string,id:string,owner:string){return locked(id,async()=>{const job=await load(projectId,id);if(job.autoRunId!==owner||job.status!=='proposed')throw new StoreError(409,'Нельзя выдать это предложение.');job.autoReleased=true;await persist(job);return publicJob(job)})},
  async cancelReview(projectId:string,id:string,owner?:string){return locked(id,async()=>{const job=await load(projectId,id);own(job,owner);if(job.visualReview?.status==='running'){job.visualReview.status='cancelled';controllers.get(id)?.abort();controllers.delete(id);await persist(job)}return publicJob(job)})},
  async cancel(projectId:string,id:string,owner?:string){return locked(id,async()=>{const job=await load(projectId,id);own(job,owner);if(job.status==='applied')throw new StoreError(409,'Правка уже применена. Используй отмену в истории проекта.');if(job.status==='running'||job.status==='proposed'||job.status==='clarification'){job.status=job.status==='running'?'cancelled':'rejected';if(job.visualReview?.status==='running')job.visualReview.status='cancelled';controllers.get(id)?.abort();controllers.delete(id);await persist(job)}return publicJob(job)})},
  async apply(projectId:string,id:string){return locked(id,async()=>{const job=await load(projectId,id);own(job);if(!['proposed','applied'].includes(job.status))throw new StoreError(409,'Это предложение нельзя применить.');if(job.visualReview?.status==='running')throw new StoreError(409,'Дождись или отмени визуальную проверку перед применением.');
   // Stable transaction ID recovers a lost apply response without duplicating effects.
   const outcome=await store.commit(projectId,{transactionId:'apply-'+job.id,projectId,expectedRevision:job.baseRevision,source:'agent',description:job.summary,operations:job.operations});
   job.status='applied';let warning:string|undefined;try{await persist(job)}catch{warning='Правка сохранена; журнал предложения обновить не удалось.'}
   return{...outcome.response,...(warning?{warning}:{})};});
  },
 };
}
