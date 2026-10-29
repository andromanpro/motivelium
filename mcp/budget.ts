import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export type RunLimits={iterations:number;previews:number;seconds:number};
export const DEFAULT_RUN_LIMITS:RunLimits={iterations:6,previews:8,seconds:1200};
type Ledger={version:1;startedAt:number;limits:RunLimits;claims:Array<{kind:'iterations'|'previews';key:string}>};
const digest=(value:unknown)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateRunLimits(input:Partial<RunLimits>={}):RunLimits{
 const limits={...DEFAULT_RUN_LIMITS,...input};
 for(const [key,min,max]of [['iterations',1,20],['previews',1,30],['seconds',30,3600]] as const)
  if(!Number.isInteger(limits[key])||limits[key]<min||limits[key]>max)throw Error(`Лимит ${key}: целое ${min}..${max}.`);
 return limits;
}
/** Host-selected runKey scopes the whole assignment, not an individual draft/project. */
export function createRunBudget(options:{stateDir:string;runKey?:string;limits?:Partial<RunLimits>;workspace:()=>Promise<string>}){
 const limits=validateRunLimits(options.limits),runKey=options.runKey??'default';
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(runKey))throw Error('run-key: 1..80 латинских букв, цифр, _ или -.');
 async function files(){const dir=path.join(options.stateDir,'runs');await fs.mkdir(dir,{recursive:true});const key=digest({workspace:await options.workspace(),runKey});return{file:path.join(dir,key+'.json'),lock:path.join(dir,key+'.lock')};}
 async function read(file:string):Promise<Ledger|null>{
  try{const data=JSON.parse(await fs.readFile(file,'utf8')) as Ledger;
   if(data.version!==1||!Number.isFinite(data.startedAt)||!Array.isArray(data.claims)||data.claims.length>50)throw Error('Повреждён журнал лимита поручения.');
   if(!data.limits||!['iterations','previews','seconds'].every(k=>Number.isInteger((data.limits as any)[k])))throw Error('Повреждены настройки лимита.');validateRunLimits(data.limits);if(data.claims.some(c=>!['iterations','previews'].includes(c.kind)||typeof c.key!=='string'))throw Error('Повреждены записи лимита.');return data;
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
 }
 function summary(data:Ledger|null){
  const actual=data?.limits??limits,used={iterations:0,previews:0};for(const c of data?.claims??[])used[c.kind]++;
  const elapsed=data?Math.max(0,(Date.now()-data.startedAt)/1000):0;
  return{runKey,limits:actual,used,remaining:{iterations:Math.max(0,actual.iterations-used.iterations),previews:Math.max(0,actual.previews-used.previews),seconds:Math.max(0,Math.ceil(actual.seconds-elapsed))},startedAt:data?new Date(data.startedAt).toISOString():null,expired:elapsed>=actual.seconds,
   scope:'Всё поручение: все проекты и черновики этого run-key. Новый propose или перезапуск MCP не сбрасывает счётчики.',
   afterLimit:['get_project','get_draft','apply_draft','undo','redo','export_video','export_status','export_project']};
 }
 async function locked<T>(lock:string,work:()=>Promise<T>):Promise<T>{
  const owner=JSON.stringify({pid:process.pid,nonce:crypto.randomUUID()});let handle:Awaited<ReturnType<typeof fs.open>>|undefined;
  for(let attempt=0;attempt<80;attempt++){
   try{handle=await fs.open(lock,'wx');await handle.writeFile(owner);break;}
   catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
    // Recover only a proven dead owner's lock; do not steal an active process lock.
    try{const raw=await fs.readFile(lock,'utf8'),prior=JSON.parse(raw);if(Number.isInteger(prior.pid)&&prior.pid>0){try{process.kill(prior.pid,0)}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH'&&await fs.readFile(lock,'utf8')===raw)await fs.unlink(lock);}}}catch(e){if(!['ENOENT'].includes((e as NodeJS.ErrnoException).code??'')&&!(e instanceof SyntaxError))throw e;}
    await new Promise(r=>setTimeout(r,25));
   }
  }
  if(!handle)throw Error('Журнал лимита занят другим вызовом. Повторите запрос после его завершения.');
  try{return await work()}finally{await handle.close();if(await fs.readFile(lock,'utf8').catch(()=>null)===owner)await fs.unlink(lock);}
 }
 return{
  async status(){const {file}=await files();return summary(await read(file));},
  async reserve(kind:'iterations'|'previews',key:string,idempotent=true){
   const {file,lock}=await files();return locked(lock,async()=>{
    const data=await read(file)??{version:1,startedAt:Date.now(),limits,claims:[]} as Ledger;
    if(idempotent&&data.claims.some(c=>c.kind===kind&&c.key===key))return summary(data);
    const state=summary(data);if(state.expired||state.remaining[kind]===0)throw Error(`Лимит поручения ${runKey} исчерпан (${kind}; ${JSON.stringify(state.remaining)}). Новый черновик лимит не сбросит. Посмотрите run_status и завершите лучший вариант: apply/Undo/экспорт доступны.`);
    data.claims.push({kind,key});const temp=file+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(data,null,2));await fs.rename(temp,file);return summary(data);
   });
  },
 };
}
