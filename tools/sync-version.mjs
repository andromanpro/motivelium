import fs from 'node:fs/promises';import path from 'node:path';import{fileURLToPath}from'node:url';
import {parseReleaseVersion,windowsReleaseVersion} from '../studio/domain/releaseVersion.ts';

export async function synchronizeVersion(root,{check=false}={}) {
 const meta=JSON.parse(await fs.readFile(path.join(root,'version.json'),'utf8'));
 const release=parseReleaseVersion(meta.version),fileVersion=windowsReleaseVersion(meta.version),changed=[];
 const files=['package.json','package-lock.json','studio/package.json','studio/package-lock.json','desktop/Program.cs','desktop/Прочти-меня.md','THIRD_PARTY.md','third-party.txt','licenses/manifest.json'];
 const updates=[];
 for(const file of files){
  const target=path.join(root,file),source=await fs.readFile(target,'utf8');let output=source;
  if(file.endsWith('.json')) {
   const json=JSON.parse(source),before=JSON.stringify(json);
   if(file==='licenses/manifest.json')json.applicationVersion=meta.version;
   else {json.version=meta.version;if(json.packages?.[''])json.packages[''].version=meta.version;}
   if(JSON.stringify(json)!==before)output=JSON.stringify(json,null,2)+'\n';
  } else if(file==='desktop/Program.cs') {
   output=source.replace(/AssemblyVersion\("[^"]+"\)/,'AssemblyVersion("'+[release.major,release.minor,release.patch,0].join('.')+'")')
    .replace(/AssemblyFileVersion\("[^"]+"\)/,'AssemblyFileVersion("'+fileVersion+'")')
    .replace(/AssemblyInformationalVersion\("[^"]+"\)/,'AssemblyInformationalVersion("'+meta.version+'")');
  } else {
   // Only the current document title; published links and historical evidence stay intact.
   output=source.replace(/^(#?[^\r\n]*Motivelium )\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?/,'$1'+meta.version);
  }
  if(output.replaceAll('\r\n','\n')!==source.replaceAll('\r\n','\n')){changed.push(file);updates.push([target,output]);}
 }
 if(check&&changed.length)throw Error('Run node tools/sync-version.mjs: '+changed.join(', '));
 for(const[target,output]of updates)await fs.writeFile(target,output);
 return {version:meta.version,buildId:meta.buildId,fileVersion,updated:changed};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 console.log(JSON.stringify(await synchronizeVersion(root,{check:process.argv.includes('--check')})));
}
