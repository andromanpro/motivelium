import {localDataDir} from './server/dataPaths.ts';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath}from'node:url';import {spawn}from'node:child_process';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
async function health(url){try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(900)});return r.ok?await r.json():null}catch{return null}}
function sameRoot(value){return typeof value==='string'&&path.resolve(value).toLowerCase()===ROOT.toLowerCase()}
async function ready(url,state){if(state?.application!=='workshop-live-lab'||!sameRoot(state.root)||state.studioReady!==true)return false;try{const r=await fetch(url+'/api/v1/health',{signal:AbortSignal.timeout(900)});return r.ok&&(await r.json()).application==='motivelium-studio'}catch{return false}}
function open(url){const child=process.platform==='win32'?spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'}):spawn('xdg-open',[url],{detached:true,stdio:'ignore'});child.on('error',()=>console.error('Откройте адрес вручную: '+url));child.unref();}
async function main(){
 const [a,b]=process.versions.node.split('.').map(Number);if(a!==24||b<12)throw Error('Нужен Node.js 24.12 или новее в ветке 24.x. Сейчас '+process.versions.node+'.');
 const args=process.argv.slice(2),valid=new Set(['--no-open','--check','--json','--port']);for(let i=0;i<args.length;i++){if(!valid.has(args[i]))throw Error('Неизвестный параметр '+args[i]);if(args[i]==='--port')i++;}
 const port=Number(args.includes('--port')?args[args.indexOf('--port')+1]:process.env.PORT??8676);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Порт должен быть от 1 до 65535.');
 const {requiredIssues,diagnose}=await import('./server/runtime.ts');
 if(args.includes('--check')){const report=await diagnose(ROOT);console.log(args.includes('--json')?JSON.stringify(report,null,2):['Motivelium · проверка установки',...report.issues,...report.checks.map(c=>(c.ready?'OK ':'— ')+c.id+': '+c.detail),'Ручной редактор: '+(report.manualEditing?'готов':'не готов'),'MP4: '+(report.mp4?'готов':'нужны зависимости'),'ИИ подключается отдельно; Python не требуется для ручной работы.'].join('\n'));if(!report.ready)process.exitCode=1;return;}
 const issues=requiredIssues(ROOT);if(issues.length)throw Error(issues.join('\n'));
 const origin='http://127.0.0.1:'+port,url=origin+'/studio/',current=await health(origin);
 if(current){if(!sameRoot(current.root)||current.application!=='workshop-live-lab')throw Error('Порт '+port+' занят другой программой или копией. Используйте --port НОМЕР; чужой сервер не остановлен.');if(!await ready(origin,current))throw Error('На порту '+port+' работает прежний или неисправный сервер этой копии. Остановите его и запустите студию снова.');}
 else{
  const local=localDataDir(ROOT);fs.mkdirSync(local,{recursive:true});const log=path.join(local,'server.log'),fd=fs.openSync(log,'a');let child;
  try{child=spawn(process.execPath,[path.join(ROOT,'server.mjs')],{cwd:ROOT,env:{...process.env,PORT:String(port)},windowsHide:true,detached:true,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
  let failed;child.on('error',e=>{failed=e.message});child.on('exit',code=>{failed='Сервер завершился ('+code+').'});child.unref();
  let started=false;for(let i=0;i<100;i++){if(failed)break;const state=await health(origin);if(await ready(origin,state)){started=true;break;}if(state&&!sameRoot(state.root)){failed='Порт заняла другая копия.';break;}await new Promise(r=>setTimeout(r,100));}
  if(!started){child.kill();const tail=fs.readFileSync(log,'utf8').slice(-4000);throw Error((failed??'Сервер не подтвердил готовность API студии.')+'\n'+tail+'\nЖурнал: '+log);}
  fs.writeFileSync(path.join(local,'server-'+port+'.json'),JSON.stringify({pid:child.pid,root:ROOT,port,url,startedAt:new Date().toISOString()},null,2));
 }
 console.log(url);if(!args.includes('--no-open'))open(url);
}
main().catch(e=>{console.error('Motivelium: '+e.message);process.exitCode=1;});
