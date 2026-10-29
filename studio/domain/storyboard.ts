import type {Project} from './schema.ts';
import {isValidId} from './ids.ts';

export type StoryComment={id:string;text:string;resolved:boolean};
export type StoryImage={assetId:string;origin:'concept'|'render';frame?:number;signature?:string};
export type StoryCard={id:string;title:string;description:string;durationFrames:number;camera:string;transition:string;sound:string;sources:string;status:'draft'|'review'|'selected';sequenceId:string|null;nodeIds:string[];image:StoryImage|null;comments:StoryComment[]};
export type Storyboard={version:1;synopsis:string;cards:StoryCard[]};
export const emptyStoryboard=():Storyboard=>({version:1,synopsis:'',cards:[]});
export function newStoryCard(id:string,title='Новый кадр',durationFrames=90):StoryCard{return{id,title,description:'',durationFrames,camera:'',transition:'',sound:'',sources:'',status:'draft',sequenceId:null,nodeIds:[],image:null,comments:[]}}

/** Optional extension of Project v2. No rewrite/migration of old documents. */
export function validateStoryboard(raw:unknown,p:Project,claim:(id:string,what:string)=>void):string[]{
 if(raw===undefined)return[];const errors:string[]=[];
 const object=(v:any,path:string,keys:string[])=>{if(!v||typeof v!=='object'||Array.isArray(v)){errors.push(path+': ожидается объект');return false}for(const k of Object.keys(v))if(!keys.includes(k))errors.push(path+': неизвестное поле '+k);return true};
 const text=(v:unknown,path:string,max=2000,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))errors.push(path+`: строка ${required?'1':'0'}..${max} символов`)};
 const id=(v:unknown,path:string)=>{if(typeof v!=='string'||v.length>64||!isValidId(v))errors.push(path+': неверный ID');else claim(v,path)};
 if(!object(raw,'storyboard',['version','synopsis','cards']))return errors;const b=raw as Storyboard;
 if(b.version!==1)errors.push('storyboard.version: поддерживается 1');text(b.synopsis,'storyboard.synopsis',4000);
 if(!Array.isArray(b.cards)||b.cards.length>100)return[...errors,'storyboard.cards: до 100 карточек'];
 for(const c of b.cards){const key='storyboard.cards';if(!object(c,key,['id','title','description','durationFrames','camera','transition','sound','sources','status','sequenceId','nodeIds','image','comments']))continue;
  id(c.id,key+'.id');text(c.title,key+'.title',200,true);for(const k of ['description','camera','transition','sound','sources']as const)text(c[k],key+'.'+k);
  if(!Number.isInteger(c.durationFrames)||c.durationFrames<1||c.durationFrames>1_000_000)errors.push(key+'.durationFrames: целое 1..1000000');
  if(!['draft','review','selected'].includes(c.status))errors.push(key+'.status: draft|review|selected');
  if(c.sequenceId!==null&&(typeof c.sequenceId!=='string'||!isValidId(c.sequenceId)||c.sequenceId.length>64))errors.push(key+'.sequenceId: ID или null');
  if(!Array.isArray(c.nodeIds)||c.nodeIds.length>30||c.nodeIds.some(v=>typeof v!=='string'||!isValidId(v)||v.length>64)||new Set(c.nodeIds).size!==c.nodeIds.length)errors.push(key+'.nodeIds: до 30 уникальных ID');
  if(c.image!==null&&object(c.image,key+'.image',['assetId','origin','frame','signature'])){const im=c.image,a=p.assets.find(a=>a.id===im.assetId);if(!a||!['image/png','image/jpeg','image/webp'].includes(a.mime))errors.push(key+'.image: нужен ресурс PNG/JPEG/WebP проекта');
   if(!['concept','render'].includes(im.origin))errors.push(key+'.image.origin: concept|render');
   if(im.frame!==undefined&&(!Number.isInteger(im.frame)||im.frame<0||im.frame>999999))errors.push(key+'.image.frame: кадр 0..999999');
   if(im.signature!==undefined&&(typeof im.signature!=='string'||!/^[a-f0-9]{16}$/.test(im.signature)))errors.push(key+'.image.signature: 16 hex');
   if(im.origin==='render'&&(im.frame===undefined||im.signature===undefined))errors.push(key+'.image: снимку монтажа нужны frame и signature');
  }
  if(!Array.isArray(c.comments)||c.comments.length>30){errors.push(key+'.comments: до 30 замечаний');continue}
  for(const com of c.comments){if(!object(com,key+'.comments',['id','text','resolved']))continue;id(com.id,key+'.comments.id');text(com.text,key+'.comments.text',1000,true);if(typeof com.resolved!=='boolean')errors.push(key+'.comments.resolved: boolean')}
 }
 return errors;
}

/** A change detector, not a security hash. Depends on montage, never on board metadata/assets. */
export function storySignature(p:Project,sequenceId:string,frame:number):string{
 const scenes=new Set([sequenceId]);
 for(const s of p.sequences){if(!s.transition)continue;const from=s.fromFrame-Math.floor(s.transition.durationFrames/2);if(frame>=from&&frame<from+s.transition.durationFrames){scenes.add(s.id);const before=p.sequences.find(v=>v.toFrame===s.fromFrame);if(before)scenes.add(before.id)}}
 const nodes=p.nodes.filter(n=>scenes.has(n.sequenceId)),ids=new Set(nodes.map(n=>n.id)),assets=new Set(nodes.flatMap(n=>n.kind==='image'?[n.assetId]:n.kind==='scene3d'&&n.model?[n.model.assetId]:[]));
 const data=JSON.stringify({frame,size:p.size,fps:p.fps,seed:p.seed,sequences:p.sequences.filter(s=>scenes.has(s.id)),nodes,effects:p.effects.filter(e=>ids.has(e.targetId)),cameras:p.cameraTracks.filter(c=>!c.scope||scenes.has(c.scope.sequenceId)),assets:p.assets.filter(a=>assets.has(a.id)).map(a=>[a.id,a.sha256])});
 let a=2166136261,b=3339675911;for(let i=0;i<data.length;i++){a=Math.imul(a^data.charCodeAt(i),16777619);b=Math.imul(b^data.charCodeAt(i),2246822519)}return(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
export function storyLink(p:Project,c:StoryCard):{state:'unlinked'|'missing'|'changed'|'current'|'concept'|'linked';label:string}{
 if(!c.sequenceId)return{state:'unlinked',label:'Пока без сцены'};
 const s=p.sequences.find(s=>s.id===c.sequenceId);
 if(!s||c.nodeIds.some(id=>!p.nodes.some(n=>n.id===id&&n.sequenceId===s.id)))return{state:'missing',label:'Связь с монтажом нарушена'};
 if(c.image?.origin==='render'){
  if(c.image.frame!<s.fromFrame||c.image.frame!>=s.toFrame)return{state:'changed',label:'Время сцены изменилось'};
  if(c.image.signature!==storySignature(p,s.id,c.image.frame!))return{state:'changed',label:'Монтаж сцены изменился'};
  return{state:'current',label:'Снимок соответствует сцене'};
 }
 return c.image?{state:'concept',label:'Эскиз связан со сценой'}:{state:'linked',label:'Связано со сценой'};
}
export function storyFrame(p:Project,c:StoryCard):number|null{const s=p.sequences.find(s=>s.id===c.sequenceId);if(!s)return null;return Math.min(s.toFrame-1,Math.max(s.fromFrame,c.image?.frame??Math.floor((s.fromFrame+s.toFrame)/2)))}
