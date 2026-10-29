import type {Project,SceneNode} from '../studio/domain/schema.ts';
import {REGISTRY} from '../studio/effects/registry.ts';

export const QUERY_MAX_BYTES=8_000;
export type QueryOptions={offset?:number;limit?:number;query?:string;sequenceId?:string;ids?:string[];parentId?:string|null;kind?:string;targetId?:string;includeDescendants?:boolean;definitionId?:string;enabled?:boolean;detail?:'summary'|'properties'|'keys';section?:'project'|'scenes'|'assets'|'tracks'|'cues'};
const size=(v:unknown)=>Buffer.byteLength(JSON.stringify(v),'utf8');
const cut=(s:string,max=240)=>s.length>max?s.slice(0,max)+'…':s;
// Projection never changes the source document. Long user values are labelled, not
// silently offered as complete replacement values for a later update operation.
function bounded(value:any,omitted:string[],where='',depth=0):any{
 if(typeof value==='string'){if(value.length>512){omitted.push(where);return cut(value,512)}return value;}
 if(value===null||typeof value!=='object')return value;
 if(depth>4){omitted.push(where);return '[nested value omitted]';}
 if(Array.isArray(value)){if(value.length>24)omitted.push(where);return value.slice(0,24).map((v,i)=>bounded(v,omitted,where+'['+i+']',depth+1));}
 const entries=Object.entries(value);if(entries.length>32)omitted.push(where);
 return Object.fromEntries(entries.slice(0,32).map(([k,v])=>[k,bounded(v,omitted,where?where+'.'+k:k,depth+1)]));
}
function safe(value:unknown){const truncatedFields:string[]=[];const data=bounded(value,truncatedFields);return{...data,...(truncatedFields.length?{truncatedFields}: {})};}
export function projectHeader(p:Project){return{id:p.id,title:cut(p.title),revision:p.revision,schemaVersion:p.schemaVersion,size:p.size,fps:p.fps,durationFrames:p.durationFrames,seed:p.seed,counts:{scenes:p.sequences.length,nodes:p.nodes.length,effects:p.effects.length,assets:p.assets.length,cameras:p.cameraTracks.length,audio:p.audioTracks.length,cues:p.cues.length,...(p.storyboard?{storyboardCards:p.storyboard.cards.length}:{})}};}
export function page<T>(p:Project,kind:string,items:T[],options:QueryOptions,project=(v:T)=>safe(v)){
 const offset=options.offset??0,limit=options.limit??12;
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>30)throw Error('Выборка: offset>=0, limit1..30.');
 const result:any={projectId:p.id,revision:p.revision,kind,total:items.length,offset,limit,items:[],nextOffset:null,maxResponseBytes:QUERY_MAX_BYTES};
 for(const item of items.slice(offset,offset+limit)){
  const mapped=project(item);result.items.push(mapped);
  if(size(result)>QUERY_MAX_BYTES-400){result.items.pop();if(!result.items.length)throw Error('Элемент слишком велик для компактной страницы. Сузьте detail/query; полный документ доступен через response:full.');break;}
 }
 const next=offset+result.items.length;result.nextOffset=next<items.length?next:null;
 result.returned=result.items.length;result.truncated=result.nextOffset!==null;
 return result;
}
const match=(text:string,query='')=>query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean).every(w=>text.toLocaleLowerCase().includes(w));
function baseNode(p:Project,n:SceneNode){return{id:n.id,name:cut(n.name,120),kind:n.kind,parentId:n.parentId,sequenceId:n.sequenceId,visible:n.visible,locked:n.locked,transform:n.transform,geometry:n.geometry,keyCount:n.transformKeys?.length??0,effectCount:p.effects.filter(e=>e.targetId===n.id).length,...(n.kind==='text'?{text:cut(n.text),textLength:n.text.length,textTruncated:n.text.length>240}:{}),...(n.kind==='image'?{assetId:n.assetId,fit:n.fit}:{}),...(n.kind==='shape'?{shape:n.shape,fill:n.fill}:{}),...(n.kind==='scene3d'?{preset:n.preset,partCount:n.parts3d?.length??0,cameraKeyCount:n.camera3dKeys?.length??0}: {})};}
export function listNodes(p:Project,q:QueryOptions={}){
 const nodes=p.nodes.filter(n=>(!q.ids||q.ids.includes(n.id))&&(!q.sequenceId||n.sequenceId===q.sequenceId)&&(!q.kind||n.kind===q.kind)&&(q.parentId===undefined||n.parentId===q.parentId)&&match(n.id+' '+n.name+' '+(n.kind==='text'?n.text:''),q.query));
 if(q.detail==='keys'){
  if(q.ids?.length!==1||nodes.length!==1)throw Error('Ключи: укажите ids с одним существующим объектом, без конфликтующих фильтров.');
  return{...page(p,'node-keys',nodes[0]!.transformKeys??[],q),nodeId:nodes[0]!.id};
 }
 return page(p,'nodes',nodes,q,n=>{
  if(q.detail!=='properties')return baseNode(p,n);
  const{transformKeys,metadata,...props}=n;
  if(props.kind==='scene3d'){
   const{parts3d,camera3dKeys,...rest}=props;
   return{...safe(rest),keyCount:transformKeys?.length??0,partCount:parts3d?.length??0,cameraKeyCount:camera3dKeys?.length??0,omittedFields:['transformKeys','metadata','parts3d','camera3dKeys']};
  }
  return{...safe(props),keyCount:transformKeys?.length??0,omittedFields:['transformKeys','metadata']};
 });
}
export function listEffects(p:Project,q:QueryOptions={}){
 const targets=new Set(q.targetId?[q.targetId]:[]);
 if(q.targetId&&!p.nodes.some(n=>n.id===q.targetId))throw Error('Объект targetId не найден.');
 if(q.includeDescendants&&q.targetId){let added=true;while(added){added=false;for(const n of p.nodes)if(n.parentId&&targets.has(n.parentId)&&!targets.has(n.id)){targets.add(n.id);added=true;}}}
 const nodes=new Map(p.nodes.map(n=>[n.id,n]));
 const effects=p.effects.filter(e=>{const n=nodes.get(e.targetId)!;return(!q.ids||q.ids.includes(e.id))&&(!q.targetId||targets.has(e.targetId))&&(!q.sequenceId||n.sequenceId===q.sequenceId)&&(!q.definitionId||e.definitionId===q.definitionId)&&(q.enabled===undefined||e.enabled===q.enabled)&&match(e.id+' '+e.definitionId+' '+(REGISTRY.get(e.definitionId)?.name??'')+' '+n.name,q.query)});
 return page(p,'effects',effects,q,e=>({...safe(e),name:REGISTRY.get(e.definitionId)?.name??e.definitionId,targetName:cut(nodes.get(e.targetId)!.name,100),sequenceId:nodes.get(e.targetId)!.sequenceId}));
}
export function overview(p:Project,q:QueryOptions={}){
 const scenes=p.sequences.filter(s=>match(s.id+' '+s.name,q.query));
 const assets=p.assets.filter(a=>match(a.id+' '+(a.title??'')+' '+a.mime,q.query));
 const cameras=p.cameraTracks.map(t=>({id:t.id,name:t.name,kind:'camera',scope:t.scope,enabled:t.enabled??true,keyCount:t.keys.length,firstKey:t.keys[0],lastKey:t.keys.at(-1)}));
 if(q.section==='scenes')return page(p,'scenes',scenes,q);
 if(q.section==='assets')return page(p,'assets',assets,q);
 if(q.section==='tracks')return page(p,'tracks',[...p.audioTracks.map(t=>({...t,trackType:'audio'})),...cameras],q);
 if(q.section==='cues')return page(p,'cues',p.cues,q);
 // Even large documents have a bounded overview; all collections disclose totals.
 const preview=(items:unknown[])=>({total:items.length,items:items.slice(0,6).map(safe),hasMore:items.length>6});
 return{project:projectHeader(p),scenes:preview(p.sequences),assets:preview(p.assets),audio:preview(p.audioTracks),cameras:preview(cameras),nextTools:['list_nodes','list_effects','project_overview(section:scenes|assets|tracks|cues)']};
}
export function compactResponse(name:string,value:any){
 const result:any={...value};
 if(result.project?.nodes)result.project=projectHeader(result.project);
 if(result.current?.project)result.current={...result.current,project:projectHeader(result.current.project)};
 if(name==='get_draft'){
  delete result.operations;delete result.workspace;delete result.baseHash;
  result.draftId=result.id;result.operationCount=value.operations.length;result.compact=true;
 }
 // Import-model details can include hundreds of parts; retain identification and a
 // labelled sample instead of serialising the entire staged response twice.
 for(const key of ['parts','warnings','model'])if(result[key]&&typeof result[key]==='object')result[key]=safe(Array.isArray(result[key])?{total:result[key].length,items:result[key].slice(0,6)}:result[key]);
 return result;
}
