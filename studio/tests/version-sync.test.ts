import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
// @ts-expect-error CLI module is shared with the standalone Node release tool.
import {synchronizeVersion} from '../../tools/sync-version.mjs';

test('release synchronization upgrades alpha to beta/rc/stable without rewriting historical references or dependency versions',async()=>{
 const prefix=path.join(os.tmpdir(),'motivelium-version-test-'),root=await fs.mkdtemp(prefix);
 const put=async(name:string,text:string)=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);};
 const read=(name:string)=>fs.readFile(path.join(root,name),'utf8');
 try {
  for(const name of ['package.json','package-lock.json','studio/package.json','studio/package-lock.json'])await put(name,JSON.stringify({version:'0.1.0-alpha.4',packages:{'':{version:'0.1.0-alpha.4'},'node_modules/example':{version:'1.2.3'}}}));
  await put('desktop/Program.cs','[assembly:AssemblyVersion("0.1.0.0")]\n[assembly:AssemblyFileVersion("0.1.0.4")]\n[assembly:AssemblyInformationalVersion("0.1.0-alpha.4")]');
  for(const name of ['desktop/Прочти-меня.md','THIRD_PARTY.md','third-party.txt'])await put(name,'# Motivelium 0.1.0-alpha.4\nPublished https://example.invalid/v0.1.0-alpha.3\n');
  await put('licenses/manifest.json',JSON.stringify({applicationVersion:'0.1.0-alpha.4',npm:[{version:'0.1.0-alpha.4'}]}));
  for(const version of ['0.2.0-beta.1','0.2.0-rc.2','0.2.0']){
   await put('version.json',JSON.stringify({version,buildId:'test'}));
   const before=await read('package.json');
   await assert.rejects(()=>synchronizeVersion(root,{check:true}),/Run node/);
   assert.equal(await read('package.json'),before,'check mode must not modify files');
   await synchronizeVersion(root);
   assert.deepEqual((await synchronizeVersion(root,{check:true})).updated,[]);
   const lock=JSON.parse(await read('studio/package-lock.json'));
   assert.equal(lock.version,version);assert.equal(lock.packages[''].version,version);assert.equal(lock.packages['node_modules/example'].version,'1.2.3');
   assert.ok((await read('desktop/Program.cs')).includes('AssemblyInformationalVersion("'+version+'")'));
   for(const name of ['desktop/Прочти-меня.md','THIRD_PARTY.md','third-party.txt']){const text=await read(name);assert.ok(text.startsWith('# Motivelium '+version+'\n'));assert.ok(text.includes('v0.1.0-alpha.3'));}
   const licenses=JSON.parse(await read('licenses/manifest.json'));assert.equal(licenses.applicationVersion,version);assert.equal(licenses.npm[0].version,'0.1.0-alpha.4');
  }
 } finally {
  if(!path.resolve(root).startsWith(path.resolve(prefix)))throw Error('Temporary test path escaped its prefix');
  await fs.rm(root,{recursive:true,force:true});
 }
});
