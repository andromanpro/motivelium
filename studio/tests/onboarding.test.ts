import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createStore} from '../../server/storage.ts';
import {createProjectPackageService} from '../../server/projectPackage.ts';
import {createLibraryImportService} from '../../server/libraryImport.ts';
import {createExamples} from '../../server/examples.ts';
import {saveToolSettings,readRuntimeConfig} from '../../server/runtime.ts';
import {studioAPIFactory} from '../../server/api.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function isolated(fn:(temp:string)=>Promise<void>){const temp=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-onboarding-')),old=process.env.MOTIVELIUM_DATA_DIR;process.env.MOTIVELIUM_DATA_DIR=path.join(temp,'destination');try{await fn(temp)}finally{if(old===undefined)delete process.env.MOTIVELIUM_DATA_DIR;else process.env.MOTIVELIUM_DATA_DIR=old;assert.ok(path.basename(temp).startsWith('motivelium-onboarding-'));await fs.rm(temp,{recursive:true,force:true})}}
async function library(temp:string){const source=path.join(temp,'source'),a=createStore(root,{dataRoot:source}),b=createStore(root),packages=createProjectPackageService(b,root);return{source,a,b,service:createLibraryImportService(b,root,packages)}}
async function hashes(dir:string):Promise<Record<string,string>>{const out:Record<string,string>={};for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())for(const[n,h]of Object.entries(await hashes(p)))out[e.name+'/'+n]=h;else out[e.name]=crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex')}return out}
test('Library: copies confirmed graph/resources without touching source; repeat/concurrent Apply is idempotent',()=>isolated(async temp=>{
 const{source,a,b,service}=await library(temp),p=(await a.create({preset:'showcase-v1'})).project,before=await hashes(source),count=(await b.list()).length;
 const preview=await service.preview(source);assert.equal((await b.list()).length,count);assert.equal(preview.projects.length,1,JSON.stringify(preview.warnings));
 const[first,second]=await Promise.all([service.import(preview.id,p.id),service.import(preview.id,p.id)]);assert.equal(first.projectId,second.projectId);assert.notEqual(first.projectId,p.id);assert.equal((await b.list()).length,count+1);
 const copy=(await b.get(first.projectId)).project;assert.deepEqual(copy.nodes,p.nodes);assert.deepEqual(copy.assets,p.assets);for(const a0 of copy.assets){const a1=await b.assetFile(copy.id,a0.id);assert.equal(crypto.createHash('sha256').update(await fs.readFile(a1.file)).digest('hex'),a0.sha256)}assert.deepEqual(await hashes(source),before);
}));
test('Library: detects source revision changes after preview',()=>isolated(async temp=>{
 const{source,a,b,service}=await library(temp),p=(await a.create()).project,preview=await service.preview(source);
 await a.commit(p.id,{projectId:p.id,transactionId:'onboarding-change-001',source:'manual',expectedRevision:p.revision,description:'renamed',operations:[{op:'updateProjectMeta',values:{title:'Changed'}}]});
 await assert.rejects(service.import(preview.id,p.id),/изменился/);assert.equal((await b.list()).length,0);
}));
test('Library: rejects changed resource bytes and state path traversal, keeps destination empty',()=>isolated(async temp=>{
 const{source,a,b,service}=await library(temp),p=(await a.create({preset:'showcase-v1'})).project,preview=await service.preview(source),asset=await a.assetFile(p.id,p.assets[0]!.id);await fs.writeFile(asset.file,'corrupt');await assert.rejects(service.import(preview.id,p.id),/ресурс/);assert.equal((await b.list()).length,0);
 const pointer=path.join(source,'projects',p.id,'pointer.json'),v=JSON.parse(await fs.readFile(pointer,'utf8'));v.stateFile='../../outside.json';await fs.writeFile(pointer,JSON.stringify(v));const bad=await service.preview(source);assert.equal(bad.projects.length,0);assert.equal(bad.warnings.length,1);await assert.rejects(service.import(bad.id,p.id),/Выберите/);
}));
test('Library: checks folder and preview scope',()=>isolated(async temp=>{
 const{source,a,b,service}=await library(temp);await a.create();await assert.rejects(service.preview('relative'),/абсолютный/);await assert.rejects(service.preview(path.dirname(b.root)),/текущее/);const p=await service.preview(path.join(source,'projects'));assert.equal(p.projects.length,1,JSON.stringify(p.warnings));await assert.rejects(service.import('unknown',p.projects[0]!.id),/истёк/);await assert.rejects(service.import(p.id,'unknown'),/Выберите/);
}));
test('Components: saves only tool paths, preserves own GLM profile, rejects settings injection',()=>isolated(async()=>{
 const data=process.env.MOTIVELIUM_DATA_DIR!;await fs.mkdir(data,{recursive:true});await fs.writeFile(path.join(data,'runtime.json'),JSON.stringify({tools:{python:'own-python'},glm:{keyFile:'own-key',model:'own-model'}}));
 await saveToolSettings(root,{ffmpeg:path.join(data,'мой ffmpeg.exe'),ffprobe:'',chrome:''});const result=readRuntimeConfig(root);assert.equal(result.tools?.python,'own-python');assert.equal(result.glm?.keyFile,'own-key');assert.equal(result.tools?.ffmpeg,path.join(data,'мой ffmpeg.exe'));await assert.rejects(saveToolSettings(root,{python:'no'}),/Неизвестная/);await assert.rejects(saveToolSettings(root,{chrome:'relative.exe'}),/абсолютный/);
}));
test('Examples: all native gallery graphs and assets exist offline; missing kit is explained',async()=>{
 const examples=createExamples(root),list=await examples.list();assert.equal(list.length,4);assert(list.every(x=>x.ready));for(const entry of list){const p=(await examples.load(entry.id)).project;assert(p.nodes.length>0&&p.sequences.length>0&&p.durationFrames>0);for(const a of p.assets){const item=await examples.asset(entry.id,a.id),b=await fs.readFile(item.file);assert.equal(b.length,a.bytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),a.sha256)}}
 const missing=await createExamples(path.join(os.tmpdir(),'not-an-example-kit')).list();assert(missing.every(x=>!x.ready&&x.reason?.includes('комплект')));
});

test('Energy gallery selects the complete one-strike film with its own model, four resources and exact event cues',async()=>{const examples=createExamples(root),entry=(await examples.list()).find(e=>e.id==='energy')!;assert.equal(entry.preset,'discharge-film-v1');assert.equal(entry.durationSeconds,10);assert.equal(entry.coverUrl,'/examples/covers-v5/energy.webp');const p=(await examples.load('energy')).project;assert(p.nodes.some(n=>n.kind==='scene3d'&&n.model));assert.equal(p.assets.length,4);assert.equal(p.audioTracks.length,5);assert.equal(p.cues.find(c=>c.id==='strike')?.frame,120);assert.equal(p.cues.find(c=>c.id==='echo')?.frame,132)});
test('Collage gallery selects the accepted paper film, its complete media and exact chapter marks',async()=>{const examples=createExamples(root),entry=(await examples.list()).find(e=>e.id==='showcase')!;assert.equal(entry.preset,'collage-paper-v1');assert.equal(entry.durationSeconds,20);assert.equal(entry.coverUrl,'/examples/covers-v5/showcase.webp');const p=(await examples.load('showcase')).project;assert.equal(p.assets.length,6);assert(p.audioTracks.some(t=>t.id==='collage-score'));assert(p.nodes.some(n=>n.id==='paper-plane'));assert(p.nodes.some(n=>n.id==='paper-seal'));assert(!p.nodes.some(n=>n.id==='gutter-arrow'));assert.equal(p.cues.find(c=>c.id==='collage')?.frame,366)});
test('Onboarding HTTP: folder reads/tool writes need token; example viewing never creates a project',()=>isolated(async temp=>{
 const store=createStore(root),api=studioAPIFactory(store,{aiRoot:root,videoRoot:root}),server=http.createServer((req,res)=>api(req,res,new URL(req.url!,'http://'+req.headers.host)));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{for(const route of ['library/preview','library/import','tools']){const r=await fetch(base+'/api/v1/workspace/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403)}
 const w=await(await fetch(base+'/api/v1/workspace')).json();assert.equal(w.dataRoot,path.dirname(store.root));const ex=await(await fetch(base+'/api/v1/examples')).json();assert.equal(ex.examples.length,4);for(const e of ex.examples){const r=await fetch(base+'/api/v1/examples/'+e.id);assert.equal(r.status,200,e.id);const preview=(await r.json()).project;assert(preview.nodes.length>0&&preview.durationFrames>0)}assert.equal((await store.list()).length,0);
 const invalid=await fetch(base+'/api/v1/workspace/tools',{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':w.mutationToken},body:JSON.stringify({tools:{chrome:'relative'}})});assert.equal(invalid.status,400);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
}));
