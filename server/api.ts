// API студии Motivelium: пространство /api/v1/. Подключается корневым server.mjs.
// Host только localhost; мутации требуют заголовок x-motivelium-token из GET проекта.
// SSE /api/v1/events сообщает смену ревизии для живого редактора (M2).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createStore as createStoreImpl, StoreError, type Store } from './storage.ts';
import {createAIService} from './ai/service.ts';
import type {ModelProvider} from './ai/provider.ts';
import {createAutoService} from './ai/auto.ts';
import {createVideoExportService} from './videoExport.ts';
import {createProjectPackageService} from './projectPackage.ts';
import {createProjectActions} from './projectActions.ts';
import {createMediaService} from './mediaAssets.ts';
import {createTemplateCatalog}from'./templates.ts';

const KADRIL_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = crypto.randomBytes(24).toString('hex');
const sseClients = new Set<ServerResponse>();

function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function jsonBody(req: IncomingMessage,limit=8*1024*1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new StoreError(413, 'Тело запроса слишком большое');
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new StoreError(400, 'Ожидается JSON-объект');
  return parsed as Record<string, unknown>;
}

function broadcastRevision(projectId: string, revision: number): void {
  const data = `data: ${JSON.stringify({ type: 'revision', projectId, revision, at: Date.now() })}\n\n`;
  for (const r of sseClients) r.write(data);
}

/** Создать обработчик /api/v1/ поверх хранилища. Тесты подключают своё хранилище. */
export function studioAPIFactory(store: Store, options:{aiRoot?:string;aiProvider?:ModelProvider;videoRoot?:string}={}) {
  const impl = store;
  const ai=createAIService(store,options.aiRoot??KADRIL_ROOT,options.aiProvider);
  const auto=createAutoService(store,ai,options.aiRoot??KADRIL_ROOT);
  const video=createVideoExportService(store,options.videoRoot??options.aiRoot??KADRIL_ROOT);
  const packages=createProjectPackageService(store,options.videoRoot??options.aiRoot??KADRIL_ROOT,p=>broadcastRevision(p.id,p.revision));
  const workspaceRoot=options.videoRoot??options.aiRoot??KADRIL_ROOT;
  const templateCatalog=createTemplateCatalog(workspaceRoot);
  const projects=createProjectActions(store,workspaceRoot,p=>broadcastRevision(p.id,p.revision),templateCatalog);
  const media=createMediaService(store,workspaceRoot);
  // F3: ровно одно revision-событие на фактическое изменение подтверждённой ревизии —
  // коммит, undo/redo или завершение recovery; дубликат подтверждённого и 409 молчат.
  if (impl.setOnConfirmedChange) impl.setOnConfirmedChange(broadcastRevision);

  async function handle(req: IncomingMessage, res: ServerResponse, u: URL): Promise<void> {
    const route = u.pathname;
    const method = req.method ?? 'GET';

    // Host-проверка по образцу лаборатории: только локальные имена.
    const port = u.port || String(req.socket.localPort);
    if (![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(String(req.headers.host))) {
      send(res, 403, { error: 'Недопустимый Host' });
      return;
    }

    if (route === '/api/v1/health') {
      send(res, 200, { application: 'motivelium-studio', api: 'v1', tokenRequired: true });
      return;
    }

    if(route==='/api/v1/templates'&&method==='GET'){send(res,200,{templates:await templateCatalog.list()});return;}
    const templateRoute=/^\/api\/v1\/templates\/([a-z0-9-]+)\/(\d+)(?:\/(projects|assets)(?:\/([a-z0-9-]+))?)?$/.exec(route);
    if(templateRoute){const [,id,rawVersion,action,assetId]=templateRoute,version=Number(rawVersion);
      if(method==='GET'&&!action){send(res,200,await templateCatalog.load(id!,version));return;}
      if(method==='GET'&&action==='assets'&&assetId){const item=await templateCatalog.asset(id!,version,assetId),stat=await fs.promises.stat(item.file);let start=0,end=stat.size-1;const range=req.headers.range;if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){res.writeHead(416);res.end();return;}start=Number(m[1]);end=m[2]?Math.min(end,Number(m[2])):end;if(start>end){res.writeHead(416);res.end();return;}}res.writeHead(range?206:200,{'Content-Type':item.asset.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff',...(range?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})});fs.createReadStream(item.file,{start,end}).pipe(res);return;}
      if(method==='POST'&&action==='projects'&&!assetId){if(req.headers['x-motivelium-token']!==TOKEN){send(res,403,{error:'Недопустимый токен изменения'});return;}send(res,201,{project:await projects.fromTemplate(id!,version,await jsonBody(req))});return;}
      send(res,404,{error:'Нет такого действия шаблона'});return;
    }
    if(route==='/api/v1/project-packages'&&method==='GET'){send(res,200,{format:'motivelium-project',version:1,maxBytes:256*1024*1024,mutationToken:TOKEN});return;}
    if(route==='/api/v1/workspace'&&method==='GET'){
      const list=await store.list();let assets=0,assetBytes=0;const counted=new Set<string>();
      for(const item of list){const p=(await store.get(item.id)).project;for(const a of p.assets){const key=p.id+'/'+a.path;if(!counted.has(key)){counted.add(key);assets++;assetBytes+=a.bytes;}}}
      send(res,200,{mutationToken:TOKEN,projects:list.length,assets,assetBytes,media:await media.info()});return;
    }
    const copyRoute=/^\/api\/v1\/projects\/([a-z0-9-]+)\/copies$/.exec(route);
    if(copyRoute&&method==='POST'){if(req.headers['x-motivelium-token']!==TOKEN){send(res,403,{error:'Недопустимый токен изменения'});return;}send(res,201,{project:await projects.copy(copyRoute[1]!,await jsonBody(req))});return;}
    const mediaRoute=/^\/api\/v1\/projects\/([a-z0-9-]+)\/media-assets$/.exec(route);
    if(mediaRoute&&method==='POST'){if(req.headers['x-motivelium-token']!==TOKEN){send(res,403,{error:'Недопустимый токен изменения'});return;}send(res,201,await media.stage(mediaRoute[1]!,await jsonBody(req,90*1024*1024)));return;}
    const packageExport=/^\/api\/v1\/projects\/([a-z0-9-]+)\/packages$/.exec(route);
    if(packageExport&&method==='POST'){if(req.headers['x-motivelium-token']!==TOKEN){send(res,403,{error:'Недопустимый токен изменения'});return;}const body=await jsonBody(req);send(res,201,{archive:await packages.exportProject(packageExport[1]!,body.expectedRevision)});return;}
    const packageRoute=/^\/api\/v1\/project-packages\/(exports|imports)(?:\/([a-z0-9-]+))?(?:\/(file|apply|discard))?$/.exec(route);
    if(packageRoute){const kind=packageRoute[1],id=packageRoute[2],action=packageRoute[3];
      if(method==='GET'&&kind==='exports'&&id&&action==='file'){const file=await packages.exportedFile(id),stat=await fs.promises.stat(file.file);res.writeHead(200,{'Content-Type':'application/zip','Content-Length':stat.size,'Content-Disposition':`attachment; filename="${file.name}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(file.file).pipe(res);return;}
      if(method==='GET'&&kind==='imports'&&id&&!action){send(res,200,{preview:await packages.preview(id)});return;}
      if(req.headers['x-motivelium-token']!==TOKEN){send(res,403,{error:'Недопустимый токен изменения'});return;}
      if(method==='POST'&&kind==='imports'&&!id){send(res,201,{preview:await packages.stage(req,req.headers['content-length']===undefined?undefined:Number(req.headers['content-length']))});return;}
      if(method==='POST'&&kind==='imports'&&id&&action==='apply'){const body=await jsonBody(req);const result=await packages.apply(id,body.title);send(res,201,result);return;}
      if(method==='POST'&&kind==='imports'&&id&&action==='discard'){send(res,200,await packages.discard(id));return;}
      send(res,404,{error:'Нет такого действия архива'});return;
    }

    if(route==='/api/v1/video-export/status'&&method==='GET'){send(res,200,await video.info());return;}
    const videoRoute=/^\/api\/v1\/projects\/([a-z0-9-]+)\/video-exports(?:\/([a-z0-9-]+))?(?:\/(cancel|file|poster))?$/.exec(route);
    if(videoRoute){const pid=videoRoute[1]!,id=videoRoute[2],action=videoRoute[3];
      if(method==='GET'&&!id){send(res,200,{jobs:await video.list(pid)});return;}
      if(method==='GET'&&id&&!action){send(res,200,{job:await video.get(pid,id)});return;}
      if(method==='GET'&&id&&(action==='file'||action==='poster')){
        const file=await video.file(pid,id,action==='poster'),stat=await fs.promises.stat(file.path);let start=0,end=stat.size-1;
        if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);start=m?.[1]?Number(m[1]):Math.max(0,stat.size-Number(m?.[2]));end=m?.[1]&&m[2]?Math.min(end,Number(m[2])):end;if(!m||!m[1]&&!m[2]||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}}
        const headers:Record<string,string|number>={'Content-Type':file.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store'};
        if(action==='file'&&u.searchParams.get('download')==='1')headers['Content-Disposition']=`attachment; filename="${file.name}"`;
        if(req.headers.range)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
        res.writeHead(req.headers.range?206:200,headers);fs.createReadStream(file.path,{start,end}).pipe(res);return;
      }
      if(req.headers['x-motivelium-token']!==TOKEN){send(res,403,{error:'Недопустимый токен изменения'});return;}
      if(method==='POST'&&!id){send(res,202,{job:await video.start(pid,await jsonBody(req),`http://${req.headers.host}`)});return;}
      if(method==='POST'&&id&&action==='cancel'){send(res,200,{job:await video.cancel(pid,id)});return;}
      send(res,404,{error:'Нет такого действия экспорта'});return;
    }

    if(route==='/api/v1/ai/status'&&method==='GET'){send(res,200,ai.info());return;}
    const autoRoute=/^\/api\/v1\/projects\/([a-z0-9-]+)\/ai\/runs(?:\/([a-z0-9-]+))?(?:\/(advance|cancel))?$/.exec(route);
    if(autoRoute){const pid=autoRoute[1]!,id=autoRoute[2],action=autoRoute[3];
      if(method==='GET'&&id&&!action){send(res,200,await auto.get(pid,id));return;}
      if(req.headers['x-motivelium-token']!==TOKEN){send(res,403,{error:'Недопустимый токен изменения'});return;}
      if(method==='POST'&&!id){send(res,202,await auto.start(pid,await jsonBody(req)));return;}
      if(method==='POST'&&id&&action==='advance'){send(res,202,await auto.advance(pid,id,await jsonBody(req)));return;}
      if(method==='POST'&&id&&action==='cancel'){const body=await jsonBody(req);send(res,200,await auto.cancel(pid,id,body.reason==='capture-error'?'capture-error':'cancelled'));return;}
      send(res,404,{error:'Нет такого действия прохода'});return;
    }
    const editRoute=/^\/api\/v1\/projects\/([a-z0-9-]+)\/ai\/edits(?:\/([a-z0-9-]+))?(?:\/(apply|cancel|review|cancel-review))?$/.exec(route);
    if(editRoute){
      const projectId=editRoute[1]!,jobId=editRoute[2],action=editRoute[3];
      if(method==='GET'&&jobId&&!action){send(res,200,{job:await ai.get(projectId,jobId)});return;}
      if(req.headers['x-motivelium-token']!==TOKEN){send(res,403,{error:'Недопустимый токен изменения'});return;}
      if(method==='POST'&&!jobId){send(res,202,{job:await ai.start(projectId,await jsonBody(req))});return;}
      if(method==='POST'&&jobId&&action==='apply'){send(res,200,await ai.apply(projectId,jobId));return;}
      if(method==='POST'&&jobId&&action==='cancel'){send(res,200,{job:await ai.cancel(projectId,jobId)});return;}
      if(method==='POST'&&jobId&&action==='review'){send(res,202,{job:await ai.review(projectId,jobId,await jsonBody(req))});return;}
      if(method==='POST'&&jobId&&action==='cancel-review'){send(res,200,{job:await ai.cancelReview(projectId,jobId)});return;}
      send(res,404,{error:'Нет такого действия ИИ-правки'});return;
    }

    if (route === '/api/v1/events' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (route === '/api/v1/projects' && method === 'GET') {
      send(res, 200, { projects: await impl.list() });
      return;
    }

    if (route === '/api/v1/projects' && method === 'POST') {
      const body = await jsonBody(req);
      if(body.requestId!==undefined){if(req.headers['x-motivelium-token']!==TOKEN){send(res,403,{error:'Недопустимый токен изменения'});return;}send(res,201,{project:await projects.create(body)});return;}
      const options: { fixture?: boolean; preset?: string; title?: string; durationFrames?: number } = {};
      if (body.fixture === true) options.fixture = true;
      if (body.preset === 'm2-demo' || body.preset === 'showcase-v1' || body.preset === 'energy-v1' || body.preset==='matter-v1') options.preset = body.preset;
      if (typeof body.title === 'string') options.title = body.title;
      if (typeof body.durationFrames === 'number' && Number.isInteger(body.durationFrames)) options.durationFrames = body.durationFrames;
      const created = await impl.create(options);
      send(res, 201, created);
      return;
    }

    const modelRoute=/^\/api\/v1\/projects\/([a-z0-9-]+)\/model-assets$/.exec(route);
    if(modelRoute&&method==='POST'){if(req.headers['x-motivelium-token']!==TOKEN){send(res,403,{error:'Недопустимый токен изменения'});return;}send(res,201,await impl.stageModel(modelRoute[1]!,await jsonBody(req,24*1024*1024)));return;}
    const m = /^\/api\/v1\/projects\/([A-Za-z0-9-]+)(?:\/(transactions|undo|redo|history|assets|exports))?(?:\/([A-Za-z0-9-]+))?$/.exec(route);
    if (m) {
      const id = m[1] as string;
      const sub = m[2];
      const tail = m[3];

      if (method === 'GET' && !sub) {
        const got = await impl.get(id);
        send(res, 200, { ...got, mutationToken: TOKEN });
        return;
      }
      if (method === 'GET' && sub === 'history') {
        send(res, 200, { journal: await impl.journal(id) });
        return;
      }
      // Раздача ассета проекта (только чтение, Host уже проверен).
      if (method === 'GET' && sub === 'assets' && tail) {
        const { file, mime } = await impl.assetFile(id, tail);
        const data = await fs.promises.readFile(file);
        const headers = { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:" };
        const range = req.headers.range;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          const start = match?.[1] ? Number(match[1]) : Math.max(0, data.length - Number(match?.[2]));
          const end = match?.[1] && match[2] ? Math.min(data.length - 1, Number(match[2])) : data.length - 1;
          if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= data.length) {
            res.writeHead(416, { ...headers, 'Content-Range': `bytes */${data.length}`, 'Content-Length': 0 });
            res.end();
            return;
          }
          res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
          res.end(data.subarray(start, end + 1));
          return;
        }
        res.writeHead(200, { ...headers, 'Content-Length': data.length });
        res.end(data);
        return;
      }

      // Всё ниже — мутации: нужен токен.
      if (req.headers['x-motivelium-token'] !== TOKEN) {
        send(res, 403, { error: 'Недопустимый токен изменения' });
        return;
      }

      if (method === 'POST' && sub === 'transactions') {
        const tx = await jsonBody(req);
        const outcome = await impl.commit(id, tx);
        // SSE — через onConfirmedChange хранилища (F3): дубль подтверждённого молчит,
        // recovery-завершение сообщает ровно одно событие.
        send(res, 200, outcome.response);
        return;
      }
      if (method === 'POST' && (sub === 'undo' || sub === 'redo')) {
        // Контракт как у транзакций: {transactionId, expectedRevision}; конфликт → 409 без SSE.
        const body = await jsonBody(req);
        const outcome = sub === 'undo' ? await impl.undo(id, body) : await impl.redo(id, body);
        send(res, 200, outcome.response);
        return;
      }
      if (method === 'POST' && sub === 'exports') {
        const body = await jsonBody(req);
        if (typeof body.expectedRevision !== 'number' || !Number.isInteger(body.expectedRevision)) {
          send(res, 400, { error: 'Экспорт требует expectedRevision снимка' });
          return;
        }
        const frames = Array.isArray(body.frames) ? (body.frames as Array<{ frame: unknown; image: unknown }>) : [];
        if (frames.length === 0 || frames.length > 12) {
          send(res, 400, { error: 'Короткий экспорт: 1–12 кадров' });
          return;
        }
        const result = await impl.saveExport(id, { expectedRevision: body.expectedRevision, frames: frames.map(f => ({ frame: f.frame as number, image: f.image as string })) });
        send(res, 201, result);
        return;
      }
    }

    send(res, 404, { error: 'Нет такого /api/v1/ маршрута', route });
  }

  return async function studioAPI(req: IncomingMessage, res: ServerResponse, u: URL): Promise<void> {
    try {
      await handle(req, res, u);
    } catch (e) {
      if (e instanceof StoreError) send(res, e.status, { error: e.message, details: e.details, ...e.extra });
      else if (e instanceof SyntaxError) send(res, 400, { error: 'Некорректный JSON' });
      else send(res, 500, { error: 'Внутренняя ошибка: ' + (e as Error).message });
    }
  };
}

/** Хранилище по умолчанию: .local/projects корня kadril. */
export const store = createStoreImpl(KADRIL_ROOT);
/** Обработчик, подключаемый корневым server.mjs. */
export const studioAPI = studioAPIFactory(store);
export { createStoreImpl as createStore };
