import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';
import{nodeSupported,readRuntimeConfig,runtimeTools,pythonCommand,requiredIssues}from'../../server/runtime.ts';
import{subscriptionProvider}from'../../server/ai/provider.ts';
test('Install: version boundary and own dependencies; no parent module fallback',()=>{
 assert.equal(nodeSupported('24.12.0'),true);assert.equal(nodeSupported('24.13.1'),true);for(const v of ['22.20.0','24.11.9','25.0.0'])assert.equal(nodeSupported(v),false);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'motivelium-install-'));try{const issues=requiredIssues(root,'22.0.0');assert(issues.some(x=>x.includes('Node.js')));assert(issues.some(x=>x.includes('yauzl')));assert(issues.some(x=>x.includes('templates/catalog.json')));}finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('Install: explicit config paths resolve relative to the copy; environment wins',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'motivelium-config-'));try{fs.mkdirSync(path.join(root,'.local'));fs.writeFileSync(path.join(root,'.local/runtime.json'),JSON.stringify({tools:{ffmpeg:'runtime/bin/ffmpeg.exe',ffprobe:'custom/probe.exe',chrome:'runtime/chrome.exe'}}));
 const tools=runtimeTools(root,{});assert.equal(tools.ffmpeg,path.join(root,'runtime/bin/ffmpeg.exe'));assert.equal(tools.ffprobe,path.join(root,'custom/probe.exe'));assert.equal(tools.chrome,path.join(root,'runtime/chrome.exe'));assert.equal(runtimeTools(root,{MOTIVELIUM_FFPROBE:'explicit-probe'}).ffprobe,'explicit-probe');
 fs.writeFileSync(path.join(root,'.local/runtime.json'),'{ broken');assert.throws(()=>readRuntimeConfig(root),/runtime.json/);fs.writeFileSync(path.join(root,'.local/runtime.json'),'null');assert.throws(()=>readRuntimeConfig(root),/объект/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('Install: clean copy never discovers Hermes/DSH credentials; Python is optional',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'motivelium-ai-off-')),env={...process.env};try{for(const k of Object.keys(process.env))if(k.startsWith('MOTIVELIUM_GLM_'))delete process.env[k];
 const info=subscriptionProvider(root).info();assert.equal(info.ready,false);assert.match(info.reason!,/ИИ не настроен/);assert(!JSON.stringify(info).includes('.hermes'));assert(!fs.existsSync(path.join(root,'.local')));
 fs.mkdirSync(path.join(root,'.local'));fs.writeFileSync(path.join(root,'own.key'),'test-only-placeholder');fs.writeFileSync(path.join(root,'.local/runtime.json'),JSON.stringify({tools:{python:'no-such-python'},glm:{keyFile:'own.key'}}));const configured=subscriptionProvider(root).info();assert.equal(configured.ready,false);assert.match(configured.reason!,/Python 3.14/);assert(!JSON.stringify(configured).includes('test-only-placeholder'));
 assert.deepEqual(pythonCommand('py').args,['-3.14','-X','utf8']);assert.deepEqual(pythonCommand('C:/Python314/python.exe').args,['-X','utf8']);
 }finally{for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);fs.rmSync(root,{recursive:true,force:true})}
});
