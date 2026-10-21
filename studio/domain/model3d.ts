// Editable members of a 3D layer. Local poses are separate from the layer's 2D transform.
export type V3 = [number,number,number];
export type PartDescriptor = {id:string;name:string;parentId:string|null;sourceIndex?:number};
export type PartPose = {position:V3;rotation:V3;scale:V3};
export type PartKey = PartPose & {frame:number};
export type PartEdit = PartPose & {id:string;name:string;visible:boolean;label:string;keys?:PartKey[]};
export type ModelRef = {assetId:string;parts:PartDescriptor[]};
export type CameraPose3d = {position:V3;target:V3;fov:number};
export type CameraKey3d = CameraPose3d & {frame:number};
export type Editable3d = {preset:string;model?:ModelRef;parts3d?:PartEdit[];camera3d?:CameraPose3d;camera3dKeys?:CameraKey3d[];cameraTargetPart?:string};
export const neutralPose=():PartPose=>({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
export const defaultCamera=():CameraPose3d=>({position:[3.5,3,6.5],target:[0,.3,0],fov:38});
const names:Record<string,string>={base:'Основание',foot:'Ножка',fastener:'Винт',board:'Плата',processor:'Процессор',core:'Ядро',capacitor:'Конденсатор',heatsink:'Ребро радиатора',cover:'Крышка',port:'Разъём','gear-a':'Шестерня А','gear-b':'Шестерня Б','gear-c':'Шестерня В',axle:'Стойка',halo:'Орбита',satellite:'Спутник',shard:'Осколок',tunnel:'Тоннель'};
export function descriptors(node:Editable3d):PartDescriptor[]{
 if(node.model)return node.model.parts;
 const kinds=node.preset==='anatomy-device'?['base',...Array.from({length:4},()=>['foot','fastener']).flat(),'board','processor','core',...Array(10).fill('capacitor'),...Array(8).fill('heatsink'),'cover',...Array(6).fill('port')]:node.preset==='logo-monolith'?['core','halo','satellite']:node.preset==='neon-reactor'?['core',...Array(36).fill('shard')]:node.preset==='ribbon-tunnel'?['tunnel']:['gear-a','gear-b','gear-c','axle'];
 const counts=new Map<string,number>();return kinds.map(k=>{const n=(counts.get(k)??0)+1;counts.set(k,n);const multiple=kinds.filter(v=>v===k).length>1;return{id:k+(multiple?'-'+n:''),name:(names[k]??k)+(multiple?' '+n:''),parentId:null}});
}
export function partEdit(node:Editable3d,id:string):PartEdit{
 const d=descriptors(node).find(p=>p.id===id);if(!d)throw Error('Деталь не найдена: '+id);
 return node.parts3d?.find(p=>p.id===id)??{id,name:d.name,visible:true,label:'',...neutralPose()};
}
const smooth=(p:number)=>{p=Math.max(0,Math.min(1,p));return p*p*(3-2*p)};
const mixV=(a:V3,b:V3,t:number)=>a.map((v,i)=>v+(b[i]!-v)*t)as V3;
export function poseAt(part:PartEdit,frame:number):PartPose{
 const copy=(p:PartPose):PartPose=>({position:[...p.position],rotation:[...p.rotation],scale:[...p.scale]});
 const keys=[...(part.keys??[])].sort((a,b)=>a.frame-b.frame);if(!keys.length)return copy(part);
 const last=keys.at(-1)!;if(frame<=keys[0]!.frame)return copy(keys[0]!);if(frame>=last.frame)return copy(last);
 const i=keys.findIndex(k=>k.frame>=frame),a=keys[i-1]!,b=keys[i]!,t=smooth((frame-a.frame)/(b.frame-a.frame));
 return{position:mixV(a.position,b.position,t),rotation:mixV(a.rotation,b.rotation,t),scale:mixV(a.scale,b.scale,t)};
}
export function camera3dAt(node:Editable3d,frame:number):CameraPose3d|undefined{
 const keys=[...(node.camera3dKeys??[])].sort((a,b)=>a.frame-b.frame);if(!keys.length)return node.camera3d;
 if(frame<=keys[0]!.frame)return keys[0]!;if(frame>=keys.at(-1)!.frame)return keys.at(-1)!;
 const i=keys.findIndex(k=>k.frame>=frame),a=keys[i-1]!,b=keys[i]!,t=smooth((frame-a.frame)/(b.frame-a.frame));return{position:mixV(a.position,b.position,t),target:mixV(a.target,b.target,t),fov:a.fov+(b.fov-a.fov)*t};
}
export function validate3d(node:Editable3d,duration:number):string[]{
 const errors:string[]=[];
 const object=(v:unknown,keys:string[],where:string)=>{if(!v||typeof v!=='object'||Array.isArray(v)){errors.push(where+': ожидается объект');return false}for(const k of Object.keys(v))if(!keys.includes(k))errors.push(where+': неизвестное поле '+k);return true};
 const vector=(v:unknown,where:string,min=-1000,max=1000)=>{if(!Array.isArray(v)||v.length!==3||v.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<min||x>max))errors.push(where+': требуется тройка чисел '+min+'…'+max)};
 const text=(v:unknown,where:string,max=120,empty=false)=>{if(typeof v!=='string'||v.length>max||(!empty&&!v.length))errors.push(where+': неверная строка')};
 const id=(v:unknown)=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(v);
 if(node.preset==='imported-model'&&!node.model)errors.push('Импортированной модели нужен ресурс');
 if(node.model&&node.preset!=='imported-model')errors.push('Ресурс модели допустим только для imported-model');
 if(node.model){const m=node.model;if(object(m,['assetId','parts'],'model')){if(!id(m.assetId))errors.push('model.assetId: неверный ID');if(!Array.isArray(m.parts)||!m.parts.length||m.parts.length>128)errors.push('model.parts: 1–128 деталей');else{const seen=new Set<string>(),indices=new Set<number>();for(const p of m.parts){if(!object(p,['id','name','parentId','sourceIndex'],'model.parts'))continue;if(!id(p.id)||seen.has(p.id))errors.push('model.parts: неверный/повторный ID');seen.add(p.id);text(p.name,'model.parts.name');if(indices.has(p.sourceIndex!)||!Number.isInteger(p.sourceIndex)||p.sourceIndex!<0||p.sourceIndex!>2047)errors.push('model.parts.sourceIndex: неверный индекс');indices.add(p.sourceIndex!);if(p.parentId===p.id||(p.parentId!==null&&!seen.has(p.parentId)))errors.push('model.parts: родитель должен предшествовать детали');}}}}
 const known=new Set((node.model?(Array.isArray(node.model.parts)?node.model.parts:[]):descriptors(node)).filter(p=>p&&typeof p==='object').map(p=>p.id));
 if(node.cameraTargetPart!==undefined&&(typeof node.cameraTargetPart!=='string'||node.cameraTargetPart!==''&&!known.has(node.cameraTargetPart)))errors.push('cameraTargetPart: неизвестная деталь');
 const pose=(p:PartPose,where:string)=>{vector(p.position,where+'.position');vector(p.rotation,where+'.rotation',-3600,3600);vector(p.scale,where+'.scale',.01,100)};
 const frames=(keys:Array<{frame:number}>,where:string)=>{const seen=new Set<number>();for(const k of keys){if(!k||typeof k!=='object'){errors.push(where+': неверный ключ');continue;}if(!Number.isInteger(k.frame)||k.frame<0||k.frame>=duration||seen.has(k.frame))errors.push(where+': неверный/повторный кадр');seen.add(k.frame)}};
 if(node.parts3d!==undefined){if(!Array.isArray(node.parts3d)||node.parts3d.length>128)errors.push('parts3d: не более128 деталей');else{const seen=new Set<string>();for(const p of node.parts3d){if(!object(p,['id','name','visible','label','position','rotation','scale','keys'],'parts3d'))continue;if(!known.has(p.id)||seen.has(p.id))errors.push('parts3d: неизвестная/повторная деталь');seen.add(p.id);text(p.name,'parts3d.name');text(p.label,'parts3d.label',100,true);if(typeof p.visible!=='boolean')errors.push('parts3d.visible: boolean');pose(p,'parts3d');if(p.keys!==undefined){if(!Array.isArray(p.keys)||p.keys.length>100)errors.push('parts3d.keys: не более100 ключей');else{frames(p.keys,'parts3d.keys');for(const k of p.keys)if(object(k,['frame','position','rotation','scale'],'parts3d.key'))pose(k,'parts3d.key')}}}}}
 const camera=(c:CameraPose3d,where:string)=>{vector(c.position,where+'.position');vector(c.target,where+'.target');if(typeof c.fov!=='number'||!Number.isFinite(c.fov)||c.fov<10||c.fov>100)errors.push(where+'.fov: 10…100');if(Array.isArray(c.position)&&Array.isArray(c.target)&&Math.hypot(...c.position.map((v,i)=>v-c.target[i]!))<.05)errors.push(where+': камера совпала с целью')};
 if(node.camera3d&&object(node.camera3d,['position','target','fov'],'camera3d'))camera(node.camera3d,'camera3d');
 if(node.camera3dKeys!==undefined){if(!Array.isArray(node.camera3dKeys)||node.camera3dKeys.length>100)errors.push('camera3dKeys: не более100 ключей');else{frames(node.camera3dKeys,'camera3dKeys');for(const c of node.camera3dKeys)if(object(c,['frame','position','target','fov'],'camera3dKey'))camera(c,'camera3dKey')}}
 return errors;
}
