import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createStore} from '../../server/storage.ts';
import {studioAPIFactory} from '../../server/api.ts';
import {createBridge} from '../../mcp/bridge.ts';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(ROOT,'studio/package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
async function setup(){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-mcp-')),store=createStore(temp),api=studioAPIFactory(store,{aiRoot:ROOT,videoRoot:ROOT});
 const server=http.createServer(async(req,res)=>{const u=new URL(req.url!,'http://127.0.0.1');if(u.pathname==='/api/health'){res.setHeader('content-type','application/json');res.end(JSON.stringify({studioReady:true,dataRoot:temp}));return;}if(u.pathname.startsWith('/api/v1/')){await api(req,res,u);return;}try{const file=path.resolve(ROOT,'www','.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));assert.ok(file.startsWith(path.join(ROOT,'www')+path.sep));const data=await fs.readFile(file);res.setHeader('content-type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)}catch{res.statusCode=404;res.end()}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+(server.address() as any).port;
 const bridge=createBridge({url,stateDir:path.join(temp,'mcp'),assetRoot:temp});
 return{temp,url,store,bridge,async close(){await bridge.dispose();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir(),'motivelium-mcp-')));await fs.rm(temp,{recursive:true,force:true})}};
}
const shape={id:'orb',name:'Орб',kind:'shape',sequenceId:'scene-main',parentId:null,geometry:{width:100,height:100},transform:{x:100,y:100,rotation:0,scaleX:1,scaleY:1,opacity:1,pivotX:50,pivotY:50},visible:true,locked:false,shape:'ellipse',fill:'#8fe5ce'};

test('MCP bridge: draft isolation, real commit, idempotency, manual edit and shared Undo/Redo',async()=>{
 const s=await setup();try{
  const c=await s.bridge.call('create_project',{requestId:'mcp-create-001',title:'Из MCP',size:{width:640,height:360},durationFrames:90});const p=c.project;
  const d=await s.bridge.call('propose_changes',{projectId:p.id,expectedRevision:p.revision,summary:'Орб',operations:[{op:'createNode',node:shape}]});
  assert.equal((await s.bridge.call('get_project',{projectId:p.id})).project.nodes.length,0);
  await assert.rejects(s.bridge.call('propose_changes',{projectId:p.id,expectedRevision:1,summary:'Некорректный пакет',operations:[{op:'createNode',node:shape},{op:'updateNode',targetId:'missing',values:{visible:false}}]}));
  assert.equal((await s.bridge.call('get_project',{projectId:p.id})).project.revision,1);
  const applied=await s.bridge.call('apply_draft',{draftId:d.draftId});assert.equal(applied.project.nodes.length,1);assert.equal(applied.project.revision,2);
  const repeated=await s.bridge.call('apply_draft',{draftId:d.draftId});assert.equal(repeated.project.revision,2);
  await s.store.commit(p.id,{transactionId:'manual-polish-001',projectId:p.id,expectedRevision:2,source:'manual',description:'Ручная доводка',operations:[{op:'updateNode',targetId:'orb',values:{fill:'#ff8866'}}]});
  assert.equal((await s.bridge.call('get_project',{projectId:p.id})).project.nodes[0].fill,'#ff8866');
  const repeatedAfterEdit=await s.bridge.call('apply_draft',{draftId:d.draftId});assert.equal(repeatedAfterEdit.project.nodes[0].fill,'#ff8866');
  const undo=await s.bridge.call('undo',{projectId:p.id,expectedRevision:3,requestId:'undo-manual-001'});assert.equal(undo.project.nodes[0].fill,'#8fe5ce');
  const redo=await s.bridge.call('redo',{projectId:p.id,expectedRevision:4,requestId:'redo-manual-001'});assert.equal(redo.project.nodes[0].fill,'#ff8866');
  const resumed=createBridge({url:s.url,stateDir:path.join(s.temp,'mcp')});const saved=await resumed.call('get_draft',{draftId:d.draftId});assert.equal(saved.application.appliedRevision,2);await resumed.dispose();
 }finally{await s.close()}
});

test('MCP bridge: stale draft does not overwrite a manual edit; invalid scopes and refinement limit',async()=>{
 const s=await setup();try{
  assert.throws(()=>createBridge({url:'https://example.com',stateDir:s.temp}),/локальной/);
  const {project:p}=await s.bridge.call('create_project',{requestId:'mcp-create-002',title:'Конфликт'});
  const first=await s.bridge.call('propose_changes',{projectId:p.id,expectedRevision:1,summary:'Первый',operations:[{op:'createNode',node:shape}]});let d=first;
  for(let i=0;i<3;i++)d=await s.bridge.call('refine_draft',{draftId:d.draftId,summary:'Доработка '+i,operations:[{op:'updateNode',targetId:'orb',values:{name:'Орб '+i}}]});
  await assert.rejects(s.bridge.call('refine_draft',{draftId:d.draftId,summary:'Лишняя',operations:[{op:'updateNode',targetId:'orb',values:{name:'Лишняя'}}]}),/три доработки/);
  await s.store.commit(p.id,{transactionId:'manual-title-001',projectId:p.id,expectedRevision:1,source:'manual',description:'Название',operations:[{op:'updateProjectMeta',values:{title:'Ручное название'}}]});
  await assert.rejects(s.bridge.call('apply_draft',{draftId:first.draftId}),/409/);assert.equal((await s.bridge.call('get_project',{projectId:p.id})).project.title,'Ручное название');
  await assert.rejects(s.bridge.call('get_draft',{draftId:'../escape'}));
  const list=await s.bridge.call('catalog',{kind:'effects',query:'свет',targetKind:'text',limit:10});assert.ok(list.total>0);assert.ok(list.items.every((x:any)=>x.targets.includes('text')));
 }finally{await s.close()}
});

test('real MCP stdio: initialize, tools/list, tools/call, image content, preview isolation, validation',async()=>{
 const s=await setup();const transport=new StdioClientTransport({command:process.execPath,args:[path.join(ROOT,'mcp/server.mjs'),'--url',s.url,'--state-dir',path.join(s.temp,'stdio')],stderr:'pipe'}),client=new Client({name:'motivelium-test',version:'1.0.0'});
 try{
  await client.connect(transport);const {tools}=await client.listTools();assert.ok(tools.some((t:any)=>t.name==='render_preview'));assert.ok(tools.some((t:any)=>t.name==='refine_draft'));
  const call=async(name:string,args:any)=>{const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return result;};
  const r=await call('create_project',{requestId:'stdio-create-001',title:'Настоящий MCP',size:{width:640,height:360},durationFrames:90});const p=r.structuredContent.project;
  const animated={...shape,transformKeys:[{frame:0,transform:shape.transform,easing:'smooth'},{frame:89,transform:{...shape.transform,x:350},easing:'smooth'}]};
  const d=await call('propose_changes',{projectId:p.id,expectedRevision:1,summary:'Живой орб',operations:[{op:'createNode',node:animated}]});
  const preview=await call('render_preview',{draftId:d.structuredContent.draftId,frames:[0,45],width:320});assert.equal(preview.content.filter((c:any)=>c.type==='image').length,2);
  for(const c of preview.content.filter((c:any)=>c.type==='image')){const bytes=Buffer.from(c.data,'base64');assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),320)}
  assert.notEqual(preview.structuredContent.frames[0].sha256,preview.structuredContent.frames[1].sha256);
  const clip=await call('render_clip',{draftId:d.structuredContent.draftId,fromFrame:0,seconds:1,fps:10,width:320});assert.equal(clip.structuredContent.clip.frames,10);assert.ok((await fs.stat(clip.structuredContent.clip.path)).size>1000);
  assert.equal((await s.store.get(p.id)).project.nodes.length,0);
  const bad=await client.callTool({name:'render_preview',arguments:{projectId:p.id,frames:[0],width:20000}});assert.ok(bad.isError);
  const applied=await call('apply_draft',{draftId:d.structuredContent.draftId});assert.equal(applied.structuredContent.project.nodes.length,1);
 }finally{await client.close();await transport.close();await s.close()}
});

test('MCP: imported media retries are idempotent; root escape rejected; composition is a draft',async()=>{
 const s=await setup();try{
  const data=Buffer.alloc(44+1600);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(8000,24);data.writeUInt32LE(16000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(1600,40);for(let i=0;i<800;i++)data.writeInt16LE(Math.round(4000*Math.sin(i*.2)),44+i*2);await fs.writeFile(path.join(s.temp,'tone.wav'),data);await fs.writeFile(path.join(s.temp,'another.wav'),data);
  const {project:p}=await s.bridge.call('create_project',{requestId:'media-create-001',title:'Медиа'}),input={projectId:p.id,expectedRevision:1,requestId:'IMPORT_same_001',file:'tone.wav'};
  const imported=await s.bridge.call('import_media',input);assert.equal(imported.project.revision,2);
  const repeated=await s.bridge.call('import_media',input);assert.equal(repeated.current.project.revision,2);assert.equal(repeated.current.project.assets.length,1);
  await assert.rejects(s.bridge.call('import_media',{...input,file:'another.wav'}),/requestId/);
  await assert.rejects(s.bridge.call('import_media',{...input,requestId:'escape-media-001',file:path.join(ROOT,'LICENSE')}),/asset-root/);
  const comp=await s.bridge.call('propose_composition',{projectId:p.id,expectedRevision:2,sequenceId:'scene-main',compositionId:'orbit',settings:{particles:10,title:'ПРОБА'}});assert.ok(comp.nodes>10);assert.equal((await s.bridge.call('get_project',{projectId:p.id})).project.nodes.length,0);
  await assert.rejects(s.bridge.call('render_preview',{draftId:comp.draftId,frames:[0]},AbortSignal.abort()),/abort/i);
 }finally{await s.close()}
});

test('MCP stdio: 2025-era initialize and tools/list remain compatible; stdout is JSON only',async()=>{
 const s=await setup(),child=spawn(process.execPath,[path.join(ROOT,'mcp/server.mjs'),'--url',s.url,'--state-dir',path.join(s.temp,'legacy')],{windowsHide:true,stdio:'pipe'}),lines=createInterface({input:child.stdout});
 const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();let corrupt='';child.stderr.resume();
 lines.on('line',line=>{try{const value=JSON.parse(line);pending.get(value.id)?.resolve(value);pending.delete(value.id)}catch{corrupt=line}});
 const request=(requestId:number,method:string,params:any)=>new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('MCP timeout')),5000);pending.set(requestId,{resolve:v=>{clearTimeout(timer);resolve(v)},reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})+'\n')});
 try{const init=await request(1,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'legacy-test',version:'1'}});assert.ok(init.result.serverInfo.name==='motivelium');child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');const list=await request(2,'tools/list',{});assert.ok(list.result.tools.some((t:any)=>t.name==='apply_draft'));assert.equal(corrupt,'');}
 finally{child.kill();lines.close();await s.close()}
});
