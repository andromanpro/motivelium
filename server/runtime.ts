import {localDataDir} from './dataPaths.ts';
/** Installation settings belong to this copy, never to an author's external profile. */
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {spawnSync,spawn} from 'node:child_process';
export type RuntimeConfig={tools?:{ffmpeg?:string;ffprobe?:string;chrome?:string;python?:string};glm?:{keyFile?:string;model?:string;visionModel?:string;effort?:string;proxy?:string}};
export function nodeSupported(version=process.versions.node){const [major,minor]=version.split('.').map(Number);return major===24&&minor!>=12;}
export function readRuntimeConfig(root:string):RuntimeConfig{
 const file=path.join(localDataDir(root),'runtime.json');if(!fs.existsSync(file))return{};
 let c:RuntimeConfig;try{c=JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw Error('Не читается .local/runtime.json. Исправьте JSON или временно переименуйте файл.');}
 if(!c||typeof c!=='object'||Array.isArray(c))throw Error('В .local/runtime.json нужен объект настроек.');
 for(const key of ['tools','glm'] as const){const group=c[key];if(group!==undefined&&(!group||typeof group!=='object'||Array.isArray(group)||Object.values(group).some(v=>typeof v!=='string')))throw Error('Неверный раздел '+key+' в .local/runtime.json.');}
 return c;
}
export function runtimeTools(root:string,env:NodeJS.ProcessEnv=process.env){
 const c=readRuntimeConfig(root),resolve=(v:string)=>v.includes('/')||v.includes('\\')?path.resolve(root,v):v;
 const tool=(name:'ffmpeg'|'ffprobe')=>resolve(env['MOTIVELIUM_'+name.toUpperCase()]??c.tools?.[name]??(fs.existsSync(path.join(root,'runtime','bin',name+(process.platform==='win32'?'.exe':'')))?path.join(root,'runtime','bin',name+(process.platform==='win32'?'.exe':'')):name));
 const candidates=process.platform==='win32'?[env.PROGRAMFILES,env['PROGRAMFILES(X86)'],env.LOCALAPPDATA].filter(Boolean).map(p=>path.join(p!,'Google','Chrome','Application','chrome.exe')):['/usr/bin/google-chrome','/usr/bin/chromium'];
 return{ffmpeg:tool('ffmpeg'),ffprobe:tool('ffprobe'),chrome:resolve(env.MOTIVELIUM_CHROME??c.tools?.chrome??candidates.find(p=>fs.existsSync(p))??'chrome'),python:resolve(env.MOTIVELIUM_PYTHON_LAUNCHER??c.tools?.python??(process.platform==='win32'?'py':'python3'))};
}
export function pythonCommand(binary:string){return{binary,args:[...(/^py(?:\.exe)?$/i.test(path.basename(binary))?['-3.14']:[]),'-X','utf8']};}
export function pythonReady(binary:string){const cmd=pythonCommand(binary),r=spawnSync(cmd.binary,[...cmd.args,'--version'],{windowsHide:true,encoding:'utf8',timeout:5000});return !r.error&&r.status===0&&/Python 3\.14\./.test(r.stdout+r.stderr);}
export function requiredIssues(root:string,version=process.versions.node){
 const issues:string[]=[];if(!nodeSupported(version))issues.push('Нужен Node.js 24.12 или новее в ветке 24.x; сейчас '+version+'.');
 const require=createRequire(path.join(root,'studio','package.json')),modules=path.resolve(root,'studio','node_modules')+path.sep;
 for(const name of ['flubber','playwright-core','react','react-dom','three','yauzl','yazl']){try{if(!fs.realpathSync(require.resolve(name)).toLowerCase().startsWith(modules.toLowerCase()))throw Error('outside');}catch{issues.push('Нет собственной зависимости '+name+'. Запустите SETUP.cmd.');}}
 for(const file of ['www/studio/index.html','www/studio/app.js','www/studio/export/worker.js','templates/catalog.json'])if(!fs.existsSync(path.join(root,file)))issues.push('Нет '+file+'. Запустите SETUP.cmd из полного комплекта.');
 try{readRuntimeConfig(root);}catch(e){issues.push((e as Error).message)}return issues;
}
export function runRuntimeTool(binary:string,args:string[],timeout=15000):Promise<string>{return new Promise((resolve,reject)=>{
 const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let text='',done=false;
 const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(text)};
 const timer=setTimeout(()=>{child.kill();finish(Error('Не ответил '+path.basename(binary)))},timeout);
 for(const s of [child.stdout,child.stderr])s.on('data',b=>{text=(text+b.toString()).slice(-300000)});
 child.on('error',()=>finish(Error('Не найден или не запускается '+binary)));child.on('close',code=>finish(code===0?undefined:Error(path.basename(binary)+' завершился с кодом '+code)));
 });}
export async function diagnose(root:string){
 const issues=requiredIssues(root),tools=runtimeTools(root);
 const checks=await Promise.all((['ffmpeg','ffprobe','chrome'] as const).map(async id=>{try{let text='';if(id==='chrome'){if(!path.isAbsolute(tools.chrome)||!fs.existsSync(tools.chrome))throw Error('Укажите путь к Chrome в .local/runtime.json или MOTIVELIUM_CHROME.');}else{text=await runRuntimeTool(tools[id],['-version']);if(id==='ffmpeg'){const encoders=await runRuntimeTool(tools.ffmpeg,['-hide_banner','-encoders']);if(!encoders.includes('libx264')||!encoders.includes(' aac '))throw Error('Нет кодировщиков libx264 и AAC.');}}return{id,ready:true,detail:id==='chrome'?path.basename(tools.chrome):text.split(/\r?\n/)[0]}}catch(e){return{id,ready:false,detail:(e as Error).message}}}));
 return{root,node:process.versions.node,ready:!issues.length,issues,checks,manualEditing:!issues.length,mediaImport:checks.find(x=>x.id==='ffprobe')!.ready,mp4:checks.every(x=>x.ready),ai:'Необязательное собственное подключение; проверка не отправляет запросы к модели.'};
}
