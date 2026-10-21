import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {localDataDir}from'../../server/dataPaths.ts';
import {createStore}from'../../server/storage.ts';
import {readRuntimeConfig}from'../../server/runtime.ts';
import {createProjectActions}from'../../server/projectActions.ts';
import {createTemplateCatalog}from'../../server/templates.ts';
import {createProjectPackageService}from'../../server/projectPackage.ts';
import {fileURLToPath}from'node:url';
test('Portable data remains local; configured storage must be absolute',()=>{
 const root=path.join(os.tmpdir(),'motivelium-code');assert.equal(localDataDir(root,{}),path.join(root,'.local'));
 for(const v of ['', 'relative/data'])assert.throws(()=>localDataDir(root,{MOTIVELIUM_DATA_DIR:v}),/абсолютный/);
});
test('Template creation, copy and ZIP import stage separately from installed project data',async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'motivelium-staging-')),root=fileURLToPath(new URL('../../',import.meta.url)),old=process.env.MOTIVELIUM_DATA_DIR;
 try{process.env.MOTIVELIUM_DATA_DIR=data;const store=createStore(root),actions=createProjectActions(store,root,undefined,createTemplateCatalog(root));const p=await actions.fromTemplate('spectrum',1,{requestId:'installed-template-0001',title:'Новый шаблон'});const copied=await actions.copy(p.id,{requestId:'installed-copy-0001',expectedRevision:p.revision,title:'Копия'});assert.notEqual(p.id,copied.id);assert.deepEqual(p.nodes,copied.nodes);assert.ok(fs.existsSync(path.join(data,'projects',p.id,'pointer.json')));assert.ok(fs.existsSync(path.join(data,'projects',copied.id,'pointer.json')));
 const packages=createProjectPackageService(store,root),receipt=await packages.exportProject(p.id,p.revision),file=await packages.exportedFile(receipt.id),preview=await packages.stage(fs.createReadStream(file.file)),imported=await packages.apply(preview.id,'После ZIP');assert.notEqual(imported.project.id,p.id);assert.deepEqual(imported.project.nodes,p.nodes);assert.deepEqual(imported.project.assets,p.assets);assert.ok(fs.existsSync(path.join(data,'projects',imported.project.id,'pointer.json')));
 }finally{if(old===undefined)delete process.env.MOTIVELIUM_DATA_DIR;else process.env.MOTIVELIUM_DATA_DIR=old;fs.rmSync(data,{recursive:true,force:true});}
});
test('Installed storage and runtime settings are independent from replaceable application files',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'motivelium-installed-')),root=path.join(temp,'program'),data=path.join(temp,'user-data'),old=process.env.MOTIVELIUM_DATA_DIR;
 fs.mkdirSync(root);fs.mkdirSync(data);fs.writeFileSync(path.join(data,'runtime.json'),JSON.stringify({tools:{ffmpeg:'configured-tool'}}));
 try{process.env.MOTIVELIUM_DATA_DIR=data;const store=createStore(root);const {project:p}=await store.create({title:'Данные отдельно'});assert.equal(readRuntimeConfig(root).tools?.ffmpeg,'configured-tool');assert.ok(fs.existsSync(path.join(data,'projects',p.id,'pointer.json')));assert.equal(fs.existsSync(path.join(root,'.local')),false);fs.renameSync(root,root+'-old');fs.mkdirSync(root);assert.equal((await createStore(root).get(p.id)).project.title,p.title);
 }finally{if(old===undefined)delete process.env.MOTIVELIUM_DATA_DIR;else process.env.MOTIVELIUM_DATA_DIR=old;fs.rmSync(temp,{recursive:true,force:true});}
});
