import {fitCopy} from './textLayout.ts';
import type {Project,SceneNode} from './schema.ts';
import type {Operation} from './operations.ts';
import {applyOperations} from './operations.ts';
import {newId} from './ids.ts';

export type StoryRecipe = 'screen' | 'poster' | 'data';
export const STORY_RECIPES = [
 {id:'screen' as const,name:'Экран и крупный текст',description:'Интерфейс справа, редактируемый заголовок и подпись, мягкий наезд.',cost:'Низкая · 2D'},
 {id:'poster' as const,name:'Плакат и пролёт',description:'Изображение на весь кадр; текст на тёмной подложке, плавное приближение.',cost:'Низкая · 2D'},
 {id:'data' as const,name:'Карточка результата',description:'Крупный акцент, изображение и пояснение; удобно для финала или цифр.',cost:'Низкая · 2D'},
];
/** Build a reversible draft, never mutate the source. Card order alone never edits montage. */
export function buildStoryMontage(p:Project,options:{cardIds:string[];recipe?:StoryRecipe;prefix?:string}) {
 if(new Set(options.cardIds).size!==options.cardIds.length||options.cardIds.some(id=>!p.storyboard?.cards.some(c=>c.id===id)))throw Error('Неверный список карточек.');
 const cards=p.storyboard?.cards.filter(c=>options.cardIds.includes(c.id))??[];
 if(!cards.length||cards.some(c=>!c))throw Error('Выберите карточки для сборки.');
 if(cards.length>10)throw Error('Одна примерка собирает до 10 сцен.');
 const recipe=options.recipe??'screen',ops:Operation[]=[],prefix=options.prefix??newId('montage');
 let from=p.nodes.length?p.durationFrames:0;
 if(!p.nodes.length){for(const c of p.cameraTracks)ops.push({op:'removeCameraTrack',targetId:c.id});for(const s of p.sequences)ops.push({op:'deleteSequence',targetId:s.id});}
 const sequences=[];
 for(const [i,card]of cards.entries()){
  const c=card!,sid=prefix+'-scene-'+i,to=from+c.durationFrames,w=p.size.width,h=p.size.height,unit=w/1920;
  const sequence={id:sid,name:c.title,fromFrame:from,toFrame:to};sequences.push(sequence);ops.push({op:'addSequence',sequence});
  const nodes:SceneNode[]=[];
  const add=(kind:'text'|'shape'|'image'|'group',role:string,x:number,y:number,width:number,height:number,extra:Record<string,unknown>={})=>{
   const id=prefix+'-'+i+'-'+role,node={id,name:role==='title'?'Заголовок · '+c.title:role==='screen'?'Экран · '+c.title:role==='background'?'Фон · '+c.title:role==='caption'?'Подпись · '+c.title:'Сцена · '+c.title,sequenceId:sid,parentId:role==='group'?null:prefix+'-'+i+'-group',kind,visible:true,locked:false,transform:{x,y,scaleX:1,scaleY:1,rotation:0,opacity:1,pivotX:0,pivotY:0},geometry:{width,height},...extra} as SceneNode;nodes.push(node);return node;
  };
  add('group','group',0,0,w,h);
  add('shape','background',0,0,w,h,{shape:'rect',fill:'#0c1820'});
  const image=c.image&&p.assets.find(a=>a.id===c.image!.assetId);
  if(image){const full=recipe==='poster';const screen=add('image','screen',full?0:w*.43,full?0:h*.17,full?w:w*.53,full?h:h*.69,{assetId:image.id,fit:full?'cover':'contain'});screen.transformKeys=[{frame:from,transform:{...screen.transform,scaleX:.96,scaleY:.96,opacity:.2},easing:'smooth'},{frame:Math.min(to-1,from+18),transform:{...screen.transform,opacity:1},easing:'smooth'},{frame:to-1,transform:{...screen.transform,x:screen.transform.x-12*unit,scaleX:1.025,scaleY:1.025},easing:'smooth'}];}
  if(recipe==='poster')add('shape','shade',0,0,w*.44,h,{shape:'rect',fill:'#0c1820',fillOpacity:.86});
  const title=add('text','title',w*.055,h*.17,w*.35,h*.43,{text:c.title,fontFamily:'Arial',fontSize:Math.min(90,Math.max(48,500/Math.max(5,c.title.length)**.35))*unit,color:recipe==='data'?'#f5c472':'#f1f5ef',align:'left',lineHeight:1.08});
  title.transformKeys=[{frame:from,transform:{...title.transform,y:title.transform.y+32*unit,opacity:0},easing:'smooth'},{frame:Math.min(to-1,from+16),transform:title.transform,easing:'smooth'}];
  if(c.description.trim())add('text','caption',w*.057,h*.65,w*.33,h*.22,{text:c.description.slice(0,240),fontFamily:'Arial',fontSize:25*unit,color:'#adbec2',align:'left',lineHeight:1.3});
  add('shape','accent',w*.057,h*.9,w*.31,3*unit,{shape:'rect',fill:'#e5b86b'});
  for(const node of nodes){if(node.kind==='text'){const fit=fitCopy(node.text,node.geometry.width,node.geometry.height,node.fontSize,node.lineHeight);node.text=fit.text;node.fontSize=fit.fontSize}if(node.transformKeys)node.transformKeys=[...new Map(node.transformKeys.map(k=>[k.frame,k])).values()].sort((a,b)=>a.frame-b.frame);ops.push({op:'createNode',node})}
  const cameraKeys=[{frame:from,cx:w/2,cy:h/2,zoom:1,rotation:0},{frame:to-1,cx:w/2+8*unit,cy:h/2,zoom:1.025,rotation:0}];
  ops.push({op:'addCameraTrack',track:{id:prefix+'-camera-'+i,name:'Камера · '+c.title,scope:{sequenceId:sid,fromFrame:from,toFrame:to},keys:[...new Map(cameraKeys.map(k=>[k.frame,k])).values()]}});
  ops.push({op:'updateStoryCard',targetId:c.id,values:{sequenceId:sid,nodeIds:nodes.map(n=>n.id)}});
  from=to;
 }
 ops.push({op:'updateProjectMeta',values:{durationFrames:from}});
 const project=applyOperations(p,ops);
 return{project,operations:ops,sequences,recipe};
}
