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
import {createRunBudget} from '../../mcp/budget.ts';
import {timingOperations} from '../../mcp/recipes.ts';
import {evaluateFrame} from '../render/evaluate.ts';
import {applyOperations} from '../domain/operations.ts';
import {listNodes,listEffects,overview,QUERY_MAX_BYTES} from '../../mcp/query.ts';
import {validateProject} from '../domain/schema.ts';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(ROOT,'studio/package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
async function setup(){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-mcp-')),store=createStore(temp),api=studioAPIFactory(store,{aiRoot:ROOT,videoRoot:ROOT});
 const server=http.createServer(async(req,res)=>{const u=new URL(req.url!,'http://127.0.0.1');if(u.pathname==='/api/health'){res.setHeader('content-type','application/json');res.end(JSON.stringify({studioReady:true,dataRoot:temp}));return;}if(u.pathname.startsWith('/api/v1/')){await api(req,res,u);return;}try{const file=path.resolve(ROOT,'www','.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));assert.ok(file.startsWith(path.join(ROOT,'www')+path.sep));const data=await fs.readFile(file);res.setHeader('content-type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)}catch{res.statusCode=404;res.end()}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+(server.address() as any).port;
 const bridge=createBridge({url,stateDir:path.join(temp,'mcp'),assetRoot:temp,responseMode:'full'});
 return{temp,url,store,bridge,async close(){await bridge.dispose();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir(),'motivelium-mcp-')));await fs.rm(temp,{recursive:true,force:true})}};
}
const shape={id:'orb',name:'Орб',kind:'shape',sequenceId:'scene-main',parentId:null,geometry:{width:100,height:100},transform:{x:100,y:100,rotation:0,scaleX:1,scaleY:1,opacity:1,pivotX:50,pivotY:50},visible:true,locked:false,shape:'ellipse',fill:'#8fe5ce'};

test('sound and musical grid proposals obey the shared iteration cap; repeat, Apply and Undo stay available',async()=>{
 const s=await setup(),b=createBridge({url:s.url,stateDir:path.join(s.temp,'audio-budget'),limits:{iterations:1,previews:2,seconds:1200},responseMode:'full'});try{
  const {project:p}=await b.call('create_project',{requestId:'audio-cap-create-001',title:'Audio cap',durationFrames:90});
  const input={projectId:p.id,expectedRevision:p.revision,soundId:'click-001',frame:30},draft=await b.call('propose_sound',input),repeat=await b.call('propose_sound',input);assert.equal(repeat.draftId,draft.draftId);assert.equal((await b.call('run_status')).used.iterations,1);
  await assert.rejects(b.call('propose_sound',{...input,frame:45}),/лимит|лимита|поручени/i);
  await assert.rejects(b.call('propose_music_grid',{projectId:p.id,expectedRevision:p.revision,trackId:'music',bpm:120}),/лимит|лимита|поручени/i);
  assert.equal((await b.call('get_project',{projectId:p.id})).project.audioTracks.length,0);
  const applied=await b.call('apply_draft',{draftId:draft.draftId});assert.equal(applied.project.audioTracks.length,1);const undone=await b.call('undo',{projectId:p.id,expectedRevision:applied.project.revision,requestId:'audio-cap-undo-001'});assert.equal(undone.project.audioTracks.length,0);assert.equal((await b.call('sound_catalog',{limit:2})).items.length,2);
 }finally{await b.dispose();await s.close()}
});

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
  const applied=await call('apply_draft',{draftId:d.structuredContent.draftId});assert.equal(applied.structuredContent.project.counts.nodes,1);assert.equal(applied.structuredContent.project.nodes,undefined);
  const outline=(await call('project_overview',{projectId:p.id})).structuredContent;assert.equal(outline.scenes.total,1);
  const selected=(await call('list_nodes',{projectId:p.id,ids:['orb'],detail:'properties',expectedRevision:2})).structuredContent;assert.equal(selected.items[0].fill,shape.fill);assert.equal(selected.items[0].keyCount,2);
  const keys=(await call('list_nodes',{projectId:p.id,ids:['orb'],detail:'keys',limit:1})).structuredContent;assert.equal(keys.items[0].frame,0);assert.equal(keys.nextOffset,1);
  const exact=(await call('get_project',{projectId:p.id,response:'full'})).structuredContent;assert.equal(exact.project.nodes.length,1);
  const empty=(await call('list_effects',{projectId:p.id,targetId:'orb'})).structuredContent;assert.equal(empty.total,0);
  const trial=await call('preview_transition',{shaderId:'gl-circlecrop',width:320});assert.equal(trial.content.filter((c:any)=>c.type==='image').length,6);assert.ok(trial.structuredContent.frames.some((f:any)=>f.frame===35));assert.equal(trial.structuredContent.clip.frames,72);
  const fresh=(await call('create_project',{requestId:'stdio-timing-create',title:'Рецепт через MCP',durationFrames:90})).structuredContent.project;
  const staticDraft=(await call('propose_changes',{projectId:fresh.id,expectedRevision:1,summary:'Статика',operations:[{op:'createNode',node:shape}]})).structuredContent;
  const timed=(await call('propose_timing',{draftId:staticDraft.draftId,items:[{nodeId:'orb',showAtFrame:10,hideAtFrame:'scene-end',fadeInFrames:5,fadeOutFrames:10}]})).structuredContent;
  assert.equal(timed.timing[0].hiddenAtFrame,89);assert.equal((await call('run_status',{})).structuredContent.used.iterations,3);
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

test('assignment budget persists across drafts, projects and MCP restart; completed work stays applicable',async()=>{
 const s=await setup(),dir=path.join(s.temp,'bounded');let bridge=createBridge({url:s.url,stateDir:dir,limits:{iterations:2},responseMode:'full'});
 try{
  const p=(await bridge.call('create_project',{requestId:'budget-create-one',title:'Первый'})).project;
  const q=(await bridge.call('create_project',{requestId:'budget-create-two',title:'Второй'})).project;
  const input={projectId:p.id,expectedRevision:1,summary:'Первый вариант',operations:[{op:'createNode',node:shape}]};
  const d=await bridge.call('propose_changes',input);await bridge.call('propose_changes',input);
  assert.equal((await bridge.call('run_status')).used.iterations,1);
  await bridge.call('propose_changes',{...input,projectId:q.id,summary:'Другой проект'});
  await assert.rejects(bridge.call('propose_changes',{...input,summary:'Обход новым propose'}),/Лимит поручения/);
  await bridge.dispose();bridge=createBridge({url:s.url,stateDir:dir,limits:{iterations:20},responseMode:'full'});
  assert.equal((await bridge.call('run_status')).limits.iterations,2);
  await assert.rejects(bridge.call('refine_draft',{draftId:d.draftId,summary:'После перезапуска',operations:[{op:'updateNode',targetId:'orb',values:{name:'Ещё'}}]}),/Лимит поручения/);
  const applied=await bridge.call('apply_draft',{draftId:d.draftId});assert.equal(applied.project.nodes.length,1);
  await bridge.call('undo',{projectId:p.id,expectedRevision:2,requestId:'budget-undo-after-limit'});
  const runs=path.join(dir,'runs'),file=(await fs.readdir(runs)).find(n=>n.endsWith('.json'))!;
  const data=JSON.parse(await fs.readFile(path.join(runs,file),'utf8'));data.startedAt=Date.now()-2_000_000;await fs.writeFile(path.join(runs,file),JSON.stringify(data));
  assert.equal((await bridge.call('run_status')).expired,true);
  await assert.rejects(bridge.call('render_preview',{projectId:p.id,frames:[0]}),/Лимит поручения/);
  assert.equal((await bridge.call('get_project',{projectId:p.id})).project.nodes.length,0);
 }finally{await bridge.dispose();await s.close()}
});

test('budget atomic reservation across clients, failed candidates count and corrupted state fails closed',async()=>{
 const s=await setup(),stateDir=path.join(s.temp,'concurrent');const a=createBridge({url:s.url,stateDir,limits:{iterations:1}}),b=createBridge({url:s.url,stateDir,limits:{iterations:1}});
 try{
  const p=(await a.call('create_project',{requestId:'concurrent-create',title:'Конкуренция'})).project;
  const results=await Promise.allSettled([a,b].map((bridge,i)=>bridge.call('propose_changes',{projectId:p.id,expectedRevision:1,summary:'Вариант '+i,operations:[{op:'updateNode',targetId:'missing-'+i,values:{visible:false}}]})));
  assert.ok(results.every(r=>r.status==='rejected'));assert.equal((await a.call('run_status')).used.iterations,1);
  const file=path.join(stateDir,'runs',(await fs.readdir(path.join(stateDir,'runs'))).find(n=>n.endsWith('.json'))!);await fs.writeFile(file,'broken');
  await assert.rejects(b.call('propose_changes',{projectId:p.id,expectedRevision:1,summary:'Третий',operations:[{op:'createNode',node:shape}]}));
 }finally{await a.dispose();await b.dispose();await s.close()}
});

test('timing recipe hides before entry and after exit through last frame; existing manual keys preserved',async()=>{
 const s=await setup();try{
  const p=(await s.bridge.call('create_project',{requestId:'timing-create-001',title:'Время',durationFrames:180})).project;
  const initial=await s.bridge.call('propose_changes',{projectId:p.id,expectedRevision:1,summary:'Статичный объект',operations:[{op:'createNode',node:shape}]});
  const d=await s.bridge.call('propose_timing',{draftId:initial.draftId,items:[{nodeId:'orb',showAtFrame:30,hideAtFrame:120,fadeInFrames:15,fadeOutFrames:15}]});
  assert.equal((await s.bridge.call('get_project',{projectId:p.id})).project.nodes.length,0);
  const applied=await s.bridge.call('apply_draft',{draftId:d.draftId});const graph=applied.project;
  const opacity=(f:number)=>evaluateFrame(graph,f).items.find(i=>i.node.id==='orb')?.opacity??0;
  for(const f of [0,29,30,120,178,179])assert.equal(opacity(f),0);
  for(const f of [45,80,105])assert.equal(opacity(f),1);
  assert.ok(opacity(38)>0&&opacity(38)<1);assert.ok(opacity(112)>0&&opacity(112)<1);
  assert.equal(graph.nodes[0].transformKeys[1].transform.x,shape.transform.x);
  assert.throws(()=>timingOperations(graph,[{nodeId:'orb',hideAtFrame:'scene-end'}]),/уже есть ключи/);
  const blank=applyOperations(p,[{op:'createNode',node:shape}]);assert.throws(()=>timingOperations(blank,[{nodeId:'orb',hideAtFrame:180}]),/внутри/);
  const end=applyOperations(blank,timingOperations(blank,[{nodeId:'orb',hideAtFrame:'scene-end',fadeOutFrames:20}]).operations);
  assert.equal(evaluateFrame(end,179).items.find(i=>i.node.id==='orb')?.opacity??0,0);
 }finally{await s.close()}
});

test('visual transition samples return real A/B frames and clip; cache is free, fresh renders share global limit',async()=>{
 const s=await setup(),dir=path.join(s.temp,'visual');let bridge=createBridge({url:s.url,stateDir:dir,limits:{previews:1}});
 try{
  const before=await bridge.call('list_projects');const input={shaderId:'gl-circleopen',width:320};
  const result=await bridge.call('preview_transition',input);assert.equal(result.frames.length,6);assert.ok(result.frames.some((f:any)=>f.frame===35));
  assert.notEqual(result.frames[0].sha256,result.frames.at(-1).sha256);assert.equal(result.clip.frames,72);assert.equal(result.clip.withAudio,false);
  assert.equal(result.budget.used.previews,1);assert.deepEqual(await bridge.call('list_projects'),before);
  await bridge.dispose();bridge=createBridge({url:s.url,stateDir:dir,limits:{previews:30}});
  const cached=await bridge.call('preview_transition',input);assert.equal(cached.cached,true);assert.equal(cached.budget.used.previews,1);
  await assert.rejects(bridge.call('preview_transition',{shaderId:'gl-circlecrop',width:320}),/Лимит поручения/);
 }finally{await bridge.dispose();await s.close()}
});

test('compact queries: filtered complete pagination, keys/properties, descendant effects and UTF8 byte bound',async()=>{
 const s=await setup();try{
  const {project:base}=await s.bridge.call('create_project',{requestId:'query-fixture-create',title:'Выборки',durationFrames:900});
  const nodes:any[]=[{...shape,id:'group',name:'Группа',kind:'group'}];delete nodes[0].shape;delete nodes[0].fill;
  const{shape:shapeKind,fill,...nodeBase}=shape;
  for(let i=0;i<90;i++)nodes.push({...nodeBase,id:'item-'+i,name:'Карточка '+i,parentId:i%2?'group':null,kind:'text',text:'Текст '+i+' '+('я'.repeat(3000)),fontFamily:'Arial',fontSize:20,color:'#ffffff',align:'left',lineHeight:1.1,transformKeys:Array.from({length:500},(_,frame)=>({frame,transform:{...shape.transform,x:frame},easing:'linear'}))});
  const project:any={...base,nodes,effects:nodes.slice(1).map((n,i)=>({id:'fx-'+i,definitionId:'fade-slide',definitionVersion:1,targetId:n.id,fromFrame:0,toFrame:900,params:{dy:20},enabled:i%3!==0,order:0}))};
  validateProject(project);
  const unchanged=JSON.stringify(project),overviewResult=overview(project);
  assert.equal(overviewResult.project.counts.nodes,91);assert.equal(overviewResult.project.nodes,undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(overviewResult))<QUERY_MAX_BYTES);
  const seen:string[]=[];let offset=0;
  do{const result=listNodes(project,{kind:'text',offset,limit:30});assert.ok(Buffer.byteLength(JSON.stringify(result))<=QUERY_MAX_BYTES);seen.push(...result.items.map((x:any)=>x.id));if(result.nextOffset===null)break;assert.ok(result.nextOffset>offset);offset=result.nextOffset;}while(true);
  assert.equal(new Set(seen).size,90);assert.equal(seen.length,90);
  assert.equal(listNodes(project,{parentId:null}).total,46);
  const selected=listNodes(project,{ids:['item-5'],detail:'properties'}).items[0];assert.equal(selected.keyCount,500);assert.equal(selected.transformKeys,undefined);assert.ok(selected.truncatedFields.includes('text'));
  assert.equal(listNodes(project,{ids:['item-5'],detail:'keys',offset:498,limit:2}).items[1].frame,499);
  assert.equal(listEffects(project,{targetId:'group'}).total,0);
  assert.equal(listEffects(project,{targetId:'group',includeDescendants:true}).total,45);
  assert.equal(listEffects(project,{ids:['fx-5']}).items[0].targetId,'item-5');
  assert.equal(listNodes(project,{query:'карточка 5',kind:'text'}).items.some((n:any)=>n.id==='item-5'),true);
  assert.equal(JSON.stringify(project),unchanged);
 }finally{await s.close()}
});

test('compact mutation receipts preserve semantics, explicit full reads and immutable draft queries with revision guard',async()=>{
 const s=await setup(),bridge=createBridge({url:s.url,stateDir:path.join(s.temp,'compact')});
 try{
  const p=(await bridge.call('create_project',{requestId:'compact-create-001',title:'Компактно'})).project;
  assert.equal(p.nodes,undefined);assert.equal(p.counts.nodes,0);
  const d=await bridge.call('propose_changes',{projectId:p.id,expectedRevision:1,summary:'Группа и эффект',operations:[{op:'createNode',node:shape},{op:'addEffect',effect:{id:'intro',definitionId:'fade-slide',definitionVersion:1,targetId:'orb',fromFrame:0,toFrame:90,params:{dy:20},enabled:true,order:0}}]});
  const draft=await bridge.call('get_draft',{draftId:d.draftId});assert.equal(draft.operations,undefined);assert.equal(draft.operationCount,2);assert.equal(draft.project.nodes,undefined);
  assert.equal((await bridge.call('list_nodes',{draftId:d.draftId})).total,1);
  assert.equal((await bridge.call('list_effects',{draftId:d.draftId,targetId:'orb'})).items[0].id,'intro');
  assert.equal((await bridge.call('list_nodes',{projectId:p.id})).total,0);
  const applied=await bridge.call('apply_draft',{draftId:d.draftId});assert.equal(applied.project.nodes,undefined);assert.equal(applied.project.revision,2);
  const repeated=await bridge.call('apply_draft',{draftId:d.draftId,response:'full'});assert.equal(repeated.project.nodes.length,1);assert.equal(repeated.project.revision,2);
  await assert.rejects(bridge.call('list_nodes',{projectId:p.id,expectedRevision:1}),/409/);
  assert.equal((await bridge.call('list_nodes',{draftId:d.draftId,expectedRevision:1})).revision,1);
  assert.equal((await bridge.call('get_project',{projectId:p.id,response:'full'})).project.effects[0].id,'intro');
  const undid=await bridge.call('undo',{projectId:p.id,expectedRevision:2,requestId:'compact-undo-001'});assert.equal(undid.project.counts.nodes,0);assert.equal(undid.project.nodes,undefined);
  const redid=await bridge.call('redo',{projectId:p.id,expectedRevision:3,requestId:'compact-redo-001'});assert.equal(redid.project.counts.nodes,1);
  const history=await bridge.call('history',{projectId:p.id,limit:1});assert.equal(history.items.length,1);assert.ok(history.nextOffset!==null);assert.ok(history.items[0].revision);
  assert.ok(Buffer.byteLength(JSON.stringify(redid))<3000);
 }finally{await bridge.dispose();await s.close()}
});

test('capability sections and definition catalog pages stay small without losing entries',async()=>{
 const s=await setup();try{
  for(const section of ['overview','nodes','timing','reading']){
   const result=await s.bridge.call('capabilities',{section});assert.ok(Buffer.byteLength(JSON.stringify(result))<=8000,section);
  }
  const full=await s.bridge.call('capabilities',{section:'full'});assert.ok(full.document.nodeBase);assert.ok(full.document.timingRecipes);
  const operations:string[]=[];let offset=0;
  do{const r=await s.bridge.call('capabilities',{section:'operations',offset,limit:12});assert.ok(Buffer.byteLength(JSON.stringify(r))<=8000);operations.push(...r.items.map((i:any)=>i.name));if(r.nextOffset===null)break;assert.ok(r.nextOffset>offset);offset=r.nextOffset;}while(true);
  assert.deepEqual(operations,Object.keys(full.document.operationShapes));
  for(const kind of ['effects','shaders']){
   const ids:string[]=[];offset=0;let total=0;
   do{const r=await s.bridge.call('catalog',{kind,offset,limit:30});assert.ok(Buffer.byteLength(JSON.stringify(r))<=6000);total=r.total;ids.push(...r.items.map((i:any)=>i.id));if(r.nextOffset===null)break;assert.ok(r.nextOffset>offset);offset=r.nextOffset;}while(true);
   assert.equal(ids.length,total);assert.equal(new Set(ids).size,total);
  }
 }finally{await s.close()}
});
