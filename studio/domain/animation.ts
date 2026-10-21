import type {Project,SceneNode,Transform,TransformKey} from './schema.ts';
export const MAX_NODE_KEYS=500;
export function transformAtFrame(node:SceneNode,frame:number):Transform{
 const keys=node.transformKeys;if(!keys?.length)return node.transform;const sorted=[...keys].sort((a,b)=>a.frame-b.frame),first=sorted[0]!,last=sorted.at(-1)!;
 if(frame<=first.frame)return first.transform;if(frame>=last.frame)return last.transform;
 const hi=sorted.findIndex(k=>k.frame>frame),a=sorted[hi-1]!,b=sorted[hi]!;let t=(frame-a.frame)/(b.frame-a.frame);if(a.easing==='hold')t=0;else if(a.easing==='smooth')t=t*t*(3-2*t);
 const out={...a.transform};for(const key of Object.keys(out)as(keyof Transform)[])out[key]=a.transform[key]+(b.transform[key]-a.transform[key])*t;return out;
}
export function upsertTransformKey(keys:TransformKey[]|undefined,key:TransformKey):TransformKey[]{return[...(keys??[]).filter(k=>k.frame!==key.frame),key].sort((a,b)=>a.frame-b.frame);}
export function keyAt(node:SceneNode,frame:number,transform=transformAtFrame(node,frame)):TransformKey{return{frame,transform:{...transform},easing:node.transformKeys?.find(k=>k.frame===frame)?.easing??'smooth'};}
/** Generic/base edits move the whole animation; frame editing uses setNodeKey instead. */
export function offsetTransformKeys(node:SceneNode,base:Transform):TransformKey[]{const old=node.transform;return(node.transformKeys??[]).map(k=>{const t={...k.transform};for(const prop of Object.keys(t)as(keyof Transform)[])if(base[prop]!==old[prop])t[prop]=prop==='scaleX'||prop==='scaleY'?t[prop]*base[prop]/old[prop]:t[prop]+base[prop]-old[prop];return{...k,transform:t};});}
export function keyEditReason(project:Project,id:string){let node=project.nodes.find(n=>n.id===id);if(!node)return'Слой удалён.';const group=node.kind==='group',ids=new Set([id]);while(node){if(node.locked)return'Слой или его группа заблокированы.';node=project.nodes.find(n=>n.id===node!.parentId);}if(group){for(let i=0;i<project.nodes.length;i++){const before=ids.size;for(const n of project.nodes)if(n.parentId&&ids.has(n.parentId))ids.add(n.id);if(before===ids.size)break;}if(project.nodes.some(n=>ids.has(n.id)&&n.locked))return'В группе есть заблокированные слои.';}return'';}
