import {localDataDir} from './server/dataPaths.ts';
import http from 'node:http';
import fs from 'node:fs';import fsp from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('.',import.meta.url)),WWW=path.join(ROOT,'www'),REVIEW=process.env.KADRIL_REVIEW_DIR||path.join(localDataDir(ROOT),'review');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.txt':'text/plain; charset=utf-8'};
fs.mkdirSync(REVIEW,{recursive:true});
const clients=new Set();let timer;
fs.watch(WWW,{recursive:true},(event,file)=>{if(!file)return;clearTimeout(timer);timer=setTimeout(()=>{for(const r of clients)r.write(`data: ${JSON.stringify({type:'reload',file,at:Date.now()})}\n\n`);},180);});
async function jsonBody(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>8*1024*1024)throw Error('body too large');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
async function atomic(p,value){let tmp=p+'.tmp';await fsp.writeFile(tmp,JSON.stringify(value,null,2),'utf8');await fsp.rename(tmp,p);}
function respond(res,code,value){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
// Ошибка API — ошибка старта, а не ложный healthy старого проигрывателя.
let studioAPI;try{studioAPI=(await import('./server/api.ts')).studioAPI;}catch(e){console.error('Motivelium: API студии не запущен. Выполните SETUP.cmd.\n'+e.stack);process.exit(1);}
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1');
 if(studioAPI&&u.pathname.startsWith('/api/v1/'))return await studioAPI(req,res,u);
 if(u.pathname==='/api/health'){respond(res,200,{application:'workshop-live-lab',root:ROOT,dataRoot:localDataDir(ROOT),studioReady:true,pid:process.pid});return;}
 if(u.pathname==='/'){res.writeHead(302,{Location:'/studio/','Cache-Control':'no-store'});res.end();return;}
 if(u.pathname==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
 if(u.pathname==='/api/notes'&&req.method==='POST'){
  const n=await jsonBody(req);if(typeof n.text!=='string'||!n.text.trim()||!Number.isFinite(n.time))throw Error('invalid note');
  await fsp.mkdir(REVIEW,{recursive:true});const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+Math.random().toString(16).slice(2,6);
  let picture=null;if(n.image?.startsWith('data:image/png;base64,')){picture=id+'.png';await fsp.writeFile(path.join(REVIEW,picture),Buffer.from(n.image.split(',')[1],'base64'));}
  const saved={id,time:n.time,text:n.text.trim(),project:typeof n.project==='string'?n.project.slice(0,80):null,part:typeof n.part==='string'?n.part.slice(0,80):null,settings:n.settings||{},camera:n.camera||{},picture,created_at:new Date().toISOString()};
  await atomic(path.join(REVIEW,id+'.json'),saved);respond(res,200,saved);return;
 }
 if(u.pathname==='/api/notes'&&req.method==='GET'){let notes=[];for(const f of await fsp.readdir(REVIEW)){if(f.endsWith('.json')&&f!=='settings.json')notes.push(JSON.parse(await fsp.readFile(path.join(REVIEW,f),'utf8')));}respond(res,200,notes.sort((a,b)=>b.created_at.localeCompare(a.created_at)));return;}
 if(u.pathname==='/api/settings'){
  const p=path.join(REVIEW,'settings.json');
  if(req.method==='POST'){const body=await jsonBody(req);await atomic(p,body);respond(res,200,{saved:true});return;}
  respond(res,200,fs.existsSync(p)?JSON.parse(await fsp.readFile(p,'utf8')):{});return;
 }
 let pathname=decodeURIComponent(u.pathname);if(pathname==='/')pathname='/index.html';
 // Каталоги (например /studio/) отдают свой index.html, как корень.
 if(pathname.endsWith('/')&&pathname!=='/'){const d=path.join(WWW,pathname);let st=null;try{st=await fsp.stat(d);}catch{}if(st&&st.isDirectory())pathname+='index.html';}
 const file=path.resolve(WWW,'.'+pathname);if(!file.startsWith(WWW+path.sep)){respond(res,403,{error:'outside www'});return;}
 const stat=await fsp.stat(file);let start=0,end=stat.size-1;const range=req.headers.range;
 if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){res.writeHead(416);res.end();return;}start=Number(m[1]);end=m[2]?Math.min(end,Number(m[2])):end;if(start>end){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}}
 const h={'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Content-Length':end-start+1,'Cache-Control':'no-cache','Accept-Ranges':'bytes'};if(range)h['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
 res.writeHead(range?206:200,h);fs.createReadStream(file,{start,end}).pipe(res);
 }catch(e){respond(res,req.method==='POST'?400:404,{error:e.message});}});
server.on('error',e=>{console.error('Motivelium: сервер не запущен. '+(e.code==='EADDRINUSE'?'Порт занят. Укажите другой PORT или --port для launch.mjs.':e.message));process.exit(1);});
server.listen(Number(process.env.PORT||8676),'127.0.0.1',()=>console.log('Motivelium http://127.0.0.1:'+server.address().port+'/studio/'));
