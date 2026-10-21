import path from 'node:path';import fs from 'node:fs';import {fileURLToPath}from'node:url';import {spawn}from'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function run(binary,args){return new Promise((resolve,reject)=>{const p=spawn(binary,args,{cwd:root,windowsHide:true,stdio:'inherit'});p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error(path.basename(binary)+' завершился с кодом '+code)));});}
try{
 const [major,minor]=process.versions.node.split('.').map(Number);if(major!==24||minor<12)throw Error('Нужен Node.js 24.12 или новее в ветке 24.x.');
 // Use the npm shipped with this Node, not global modules or a shell-built command.
 const npm=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');if(!fs.existsSync(npm))throw Error('Нет npm рядом с node.exe. Установите полную поставку Node.js.');
 console.log('Motivelium: установка studio/package-lock.json');await run(process.execPath,[npm,'ci','--prefix',path.join(root,'studio'),'--no-audit','--no-fund']);
 await run(process.execPath,[path.join(root,'studio','build.mjs')]);await run(process.execPath,[path.join(root,'launch.mjs'),'--check']);
 console.log('Установка завершена. Запустите START.cmd.');
}catch(e){console.error('Motivelium: '+e.message);process.exitCode=1;}
