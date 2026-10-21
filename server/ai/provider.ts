import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {readRuntimeConfig,runtimeTools,pythonCommand,pythonReady}from'../runtime.ts';
export type ModelResult={content:string;model:string;generationId:string|null;usage:Record<string,unknown>|null;finishReason:string};
export type ModelMessage={role:string;content:string|Array<{type:'text';text:string}|{type:'image_url';image_url:{url:string}}>};
export type ModelProvider={info:()=>{ready:boolean;model:string;label:string;reason?:string;visionModel?:string};generate:(messages:ModelMessage[],dir:string,signal:AbortSignal)=>Promise<ModelResult>};
const helper=fileURLToPath(new URL('./request_glm.py',import.meta.url));
function settings(root:string){
 const local=readRuntimeConfig(root).glm??{},raw=process.env.MOTIVELIUM_GLM_KEY_FILE??local.keyFile;
 const keyFile=raw?path.resolve(root,raw):'';
 const model=process.env.MOTIVELIUM_GLM_MODEL??local.model??'glm-5.3';let effort=local.effort??'high';
 if(!/^glm-[\w.-]+$/.test(model))throw Error('В профиле не настроена GLM-модель.');
 if(!['low','high','max'].includes(effort))effort='high';
 const visionModel=process.env.MOTIVELIUM_GLM_VISION_MODEL??local.visionModel??'glm-5.3-flash';
 if(!['glm-5.3-flash','glm-4.6v','glm-4.6v-flash'].includes(visionModel))throw Error('Нужна поддерживаемая мультимодальная GLM-модель.');
 return{keyFile,model,effort,visionModel,proxy:process.env.MOTIVELIUM_GLM_PROXY??local.proxy??''};
}
async function atomic(file:string,data:unknown){await fs.promises.writeFile(file+'.tmp',JSON.stringify(data,null,2),'utf8');await fs.promises.rename(file+'.tmp',file)}
export function subscriptionProvider(root=fileURLToPath(new URL('../../',import.meta.url))):ModelProvider{return{
 info(){try{const s=settings(root),key=!!s.keyFile&&fs.existsSync(s.keyFile)&&fs.readFileSync(s.keyFile,'utf8').trim().length>0;const python=key&&pythonReady(runtimeTools(root).python);return{ready:key&&python,model:s.model,visionModel:s.visionModel,label:'GLM · существующая подписка',...(key&&python?{}:{reason:key?'Для GLM нужен Python 3.14. Укажите tools.python в .local/runtime.json.':'ИИ не настроен. Укажите свой файл ключа в .local/runtime.json или MOTIVELIUM_GLM_KEY_FILE. Ручной редактор работает без ИИ.'})}}catch(e){return{ready:false,model:'GLM',label:'GLM · подписка',reason:(e as Error).message}}},
 async generate(messages,dir,signal){
  const s=settings(root);if(signal.aborted)throw Error('Запрос отменён.');
  const vision=messages.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='image_url'));
  const chosen={...s,...(vision?{model:s.visionModel,effort:'max'}:{})};
  await atomic(path.join(dir,'request.json'),{settings:chosen,messages});
  return new Promise((resolve,reject)=>{
   const python=pythonCommand(runtimeTools(root).python);
   const child=spawn(python.binary,[...python.args,helper,path.join(dir,'request.json')],{windowsHide:true,stdio:['ignore','ignore','pipe']});
   const stderr=fs.createWriteStream(path.join(dir,'runner.stderr.log'));child.stderr.pipe(stderr);
   const abort=()=>{child.kill();reject(Error('Запрос отменён.'))};signal.addEventListener('abort',abort,{once:true});
   const timer=setTimeout(()=>{child.kill();reject(Error('Модель не завершила ответ за 180 секунд. Повтор можно запустить вручную.'))},180000);
   child.on('error',()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(Error('Не удалось запустить Python для подписочного GLM.'))});
   child.on('close',async code=>{clearTimeout(timer);signal.removeEventListener('abort',abort);try{if(signal.aborted)throw Error('Запрос отменён.');if(code!==0){let error='';try{error=JSON.parse(await fs.promises.readFile(path.join(dir,'receipt.json'),'utf8')).error??''}catch{}throw Error(error.startsWith('provider_http_')?'GLM вернул HTTP '+error.slice('provider_http_'.length)+'. Ответ сохранён.':'GLM не вернул готовое предложение. Подробности сохранены на сервере.')}resolve(JSON.parse(await fs.promises.readFile(path.join(dir,'completion.json'),'utf8')) as ModelResult)}catch(e){reject(e)}});
  });
 },
}}
