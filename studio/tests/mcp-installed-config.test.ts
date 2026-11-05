import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {studioAPIFactory} from '../../server/api.ts';import {createStore} from '../../server/storage.ts';

test('Installed MCP config carries the active library and resolves its tool paths in an external process',async()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url)),data=await fs.mkdtemp(path.join(os.tmpdir(),'motivelium-installed-mcp-'));
 const tools={ffmpeg:path.join(data,'Tools with spaces','ffmpeg.exe'),ffprobe:path.join(data,'Tools with spaces','ffprobe.exe'),chrome:path.join(data,'Chrome','chrome.exe')};
 await fs.writeFile(path.join(data,'runtime.json'),JSON.stringify({tools}));const store=createStore(root,{dataRoot:data});
 const api=studioAPIFactory(store),server=http.createServer((req,res)=>api(req,res,new URL(req.url!,'http://'+req.headers.host)));
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{
  const address=server.address() as {port:number};const response=await fetch('http://127.0.0.1:'+address.port+'/api/v1/mcp/config');assert.equal(response.status,200);
  const cfg=(await response.json()).config.mcpServers.motivelium;assert.equal(cfg.env.MOTIVELIUM_DATA_DIR,data);
  assert.equal(cfg.args[cfg.args.indexOf('--state-dir')+1],path.join(data,'mcp'));
  const env={...process.env,...cfg.env};for(const name of ['MOTIVELIUM_FFMPEG','MOTIVELIUM_FFPROBE','MOTIVELIUM_CHROME'])delete env[name];
  const child=spawnSync(cfg.command,['--input-type=module','-e','import {runtimeTools} from "./server/runtime.ts";console.log(JSON.stringify(runtimeTools(process.cwd())));'],{cwd:root,env,encoding:'utf8',windowsHide:true});
  assert.equal(child.status,0,child.stderr);const resolved=JSON.parse(child.stdout);for(const name of ['ffmpeg','ffprobe','chrome'])assert.equal(resolved[name],tools[name as keyof typeof tools]);
 }finally{await new Promise<void>(r=>server.close(()=>r()));await fs.rm(data,{recursive:true,force:true})}
});
