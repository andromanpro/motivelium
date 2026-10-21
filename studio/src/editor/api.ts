// Клиент /api/v1/ для редактора. Токен получается при чтении проекта,
// мутации идут только через транзакции с expectedRevision.

import type { Project, SceneNode,AssetRef } from '../../domain/schema.ts';
import type {ProjectSetup} from '../../domain/projectSetup.ts';
import type{TemplateSummary,TemplateDetail}from'../../domain/templates.ts';
import type { Transaction } from '../../domain/transaction.ts';
import type {AIJob} from '../../agent/proposal.ts';
import type {VisualFrame} from '../../agent/visual.ts';
import type {AutoView} from '../../agent/auto.ts';
import type {VideoExportJob} from '../../domain/videoExport.ts';
import type {PackagePreview,PackageExport} from '../../domain/projectPackage.ts';

export type ProjectSummary = { id: string; title: string; revision: number; updatedAt: string | null };

export type OpenedProject = { project: Project; canUndo: boolean; canRedo: boolean; mutationToken: string };

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(body.error ?? `HTTP ${String(res.status)}`), { status: res.status, body });
  return body;
}

export const api = {
  async templates(){return(await json<{templates:TemplateSummary[]}>(await fetch('/api/v1/templates'))).templates},
  async template(id:string,version:number){return json<TemplateDetail>(await fetch(`/api/v1/templates/${id}/${version}`))},
  templateAssetUrl(id:string,version:number,assetId:string){return `/api/v1/templates/${id}/${version}/assets/${assetId}`},
  async createFromTemplate(id:string,version:number,input:{title:string;requestId:string},token:string){return(await json<{project:Project}>(await fetch(`/api/v1/templates/${id}/${version}/projects`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify(input)}))).project},

  async journal(id:string){return(await json<{journal:Array<Record<string,unknown>>}>(await fetch(`/api/v1/projects/${id}/history`))).journal},
  async workspace(){return json<{mutationToken:string;projects:number;assets:number;assetBytes:number;media:{ready:boolean;reason?:string}}>(await fetch('/api/v1/workspace'))},
  async createBlank(input:ProjectSetup&{requestId:string},token:string){return(await json<{project:Project}>(await fetch('/api/v1/projects',{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify(input)}))).project},
  async copyProject(id:string,token:string,input:{expectedRevision:number;title:string;requestId:string}){return(await json<{project:Project}>(await fetch(`/api/v1/projects/${id}/copies`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify(input)}))).project},
  async stageMedia(id:string,token:string,input:{expectedRevision:number;name:string;base64:string}){return json<{asset:AssetRef}>(await fetch(`/api/v1/projects/${id}/media-assets`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify(input)}))},
  async packageInfo(){return json<{mutationToken:string;maxBytes:number}>(await fetch('/api/v1/project-packages'))},
  async packageExport(id:string,token:string,expectedRevision:number){return(await json<{archive:PackageExport}>(await fetch(`/api/v1/projects/${id}/packages`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify({expectedRevision})}))).archive},
  packageStage(file:File,token:string,onProgress:(n:number)=>void,signal:AbortSignal):Promise<PackagePreview>{return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/v1/project-packages/imports');xhr.setRequestHeader('Content-Type','application/zip');xhr.setRequestHeader('x-motivelium-token',token);const abort=()=>xhr.abort(),clean=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total)};xhr.onerror=()=>{clean();reject(Error('Не удалось загрузить архив.'))};xhr.onabort=()=>{clean();reject(new DOMException('Загрузка отменена','AbortError'))};xhr.onload=()=>{clean();try{const body=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw Error(body.error??'Архив не принят');resolve(body.preview as PackagePreview)}catch(e){reject(e)}};if(signal.aborted){clean();reject(new DOMException('Загрузка отменена','AbortError'));return;}xhr.send(file)})},
  async packageApply(id:string,token:string,title:string){return json<{project:Project;preview:PackagePreview}>(await fetch(`/api/v1/project-packages/imports/${id}/apply`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify({title})}))},
  async packageDiscard(id:string,token:string){return json(await fetch(`/api/v1/project-packages/imports/${id}/discard`,{method:'POST',headers:{'x-motivelium-token':token}}))},
  async videoInfo(){return json<{ready:boolean;reason?:string;encoder?:string}>(await fetch('/api/v1/video-export/status'))},
  async videoList(id:string){return(await json<{jobs:VideoExportJob[]}>(await fetch(`/api/v1/projects/${id}/video-exports`))).jobs},
  async videoStart(id:string,token:string,expectedRevision:number,requestId:string){return(await json<{job:VideoExportJob}>(await fetch(`/api/v1/projects/${id}/video-exports`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify({expectedRevision,requestId})}))).job},
  async videoGet(id:string,jobId:string){return(await json<{job:VideoExportJob}>(await fetch(`/api/v1/projects/${id}/video-exports/${jobId}`))).job},
  async videoCancel(id:string,jobId:string,token:string){return(await json<{job:VideoExportJob}>(await fetch(`/api/v1/projects/${id}/video-exports/${jobId}/cancel`,{method:'POST',headers:{'x-motivelium-token':token}}))).job},
  async stageModel(id:string,token:string,input:{name:string;base64:string;expectedRevision:number}){return json<{asset:import('../../domain/schema.ts').AssetRef;parts:import('../../domain/model3d.ts').PartDescriptor[]}>(await fetch(`/api/v1/projects/${id}/model-assets`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify(input)}))},
  async autoStart(id:string,token:string,input:{requestId:string;nodeId:string;expectedRevision:number;frame:number;prompt:string;allowText:boolean;visualFrames:VisualFrame[]}){return json<AutoView>(await fetch(`/api/v1/projects/${id}/ai/runs`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify(input)}))},
  async autoGet(id:string,runId:string){return json<AutoView>(await fetch(`/api/v1/projects/${id}/ai/runs/${runId}`))},
  async autoAdvance(id:string,runId:string,token:string,input:{stepKey:string;visualFrames:VisualFrame[]}){return json<AutoView>(await fetch(`/api/v1/projects/${id}/ai/runs/${runId}/advance`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify(input)}))},
  async autoCancel(id:string,runId:string,token:string,reason:'cancelled'|'capture-error'='cancelled'){return json<AutoView>(await fetch(`/api/v1/projects/${id}/ai/runs/${runId}/cancel`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify({reason})}))},
  async aiStatus(){return json<{ready:boolean;model:string;label:string;reason?:string;visionModel?:string}>(await fetch('/api/v1/ai/status'))},
  async aiStart(id:string,token:string,input:{requestId:string;nodeId:string;expectedRevision:number;frame:number;prompt:string;allowText:boolean;proposal?:unknown;visualFrames?:VisualFrame[];previousJobId?:string}){return(await json<{job:AIJob}>(await fetch(`/api/v1/projects/${id}/ai/edits`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify(input)}))).job},
  async aiJob(id:string,jobId:string){return(await json<{job:AIJob}>(await fetch(`/api/v1/projects/${id}/ai/edits/${jobId}`))).job},
  async aiCancel(id:string,jobId:string,token:string){return(await json<{job:AIJob}>(await fetch(`/api/v1/projects/${id}/ai/edits/${jobId}/cancel`,{method:'POST',headers:{'x-motivelium-token':token}}))).job},
  async aiApply(id:string,jobId:string,token:string){return json<{project:Project;revision:number;duplicate?:boolean;warning?:string}>(await fetch(`/api/v1/projects/${id}/ai/edits/${jobId}/apply`,{method:'POST',headers:{'x-motivelium-token':token}}))},
  async aiReview(id:string,jobId:string,token:string,input:{requestId:string;expectedRevision:number;visualFrames:VisualFrame[]}){return(await json<{job:AIJob}>(await fetch(`/api/v1/projects/${id}/ai/edits/${jobId}/review`,{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':token},body:JSON.stringify(input)}))).job},
  async aiCancelReview(id:string,jobId:string,token:string){return(await json<{job:AIJob}>(await fetch(`/api/v1/projects/${id}/ai/edits/${jobId}/cancel-review`,{method:'POST',headers:{'x-motivelium-token':token}}))).job},
  async list(): Promise<ProjectSummary[]> {
    const r = await fetch('/api/v1/projects');
    return (await json<{ projects: ProjectSummary[] }>(r)).projects;
  },
  async create(options: { preset?: 'm2-demo'|'showcase-v1'|'energy-v1'|'matter-v1'; fixture?: boolean; title?: string }): Promise<Project> {
    const r = await fetch('/api/v1/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) });
    return (await json<{ project: Project }>(r)).project;
  },
  async open(id: string): Promise<OpenedProject> {
    const r = await fetch(`/api/v1/projects/${encodeURIComponent(id)}`);
    return json<OpenedProject>(r);
  },
  async commit(id: string, token: string, tx: Transaction): Promise<{ applied: boolean; revision: number; project: Project; duplicate?: boolean }> {
    const r = await fetch(`/api/v1/projects/${encodeURIComponent(id)}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-motivelium-token': token },
      body: JSON.stringify(tx),
    });
    return json(r);
  },
  async undo(id: string, token: string, body: { transactionId: string; expectedRevision: number }): Promise<{ project: Project; canUndo: boolean; canRedo: boolean; duplicate?: boolean }> {
    const r = await fetch(`/api/v1/projects/${encodeURIComponent(id)}/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-motivelium-token': token },
      body: JSON.stringify(body),
    });
    return json(r);
  },
  async redo(id: string, token: string, body: { transactionId: string; expectedRevision: number }): Promise<{ project: Project; canUndo: boolean; canRedo: boolean; duplicate?: boolean }> {
    const r = await fetch(`/api/v1/projects/${encodeURIComponent(id)}/redo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-motivelium-token': token },
      body: JSON.stringify(body),
    });
    return json(r);
  },
  assetUrl(id: string, assetId: string): string {
    return `/api/v1/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}`;
  },
  async exportFrames(id: string, token: string, frames: Array<{ frame: number; image: string }>, expectedRevision: number): Promise<{ jobDir: string; revision: number; snapshotHash: string; manifest: Record<string, unknown> }> {
    const r = await fetch(`/api/v1/projects/${encodeURIComponent(id)}/exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-motivelium-token': token },
      body: JSON.stringify({ frames, expectedRevision }),
    });
    return json(r);
  },
};

export type { SceneNode };
