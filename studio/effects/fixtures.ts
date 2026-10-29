import type {Project,SceneNode,Transform} from '../domain/schema.ts';
import {REGISTRY,defaultParams} from './registry.ts';
import {CATALOG} from './catalog.ts';
export const FIXTURE_FRAMES=120;
export function galleryDefaultParams(id:string){
 const def=REGISTRY.get(id);if(!def)throw Error('Неизвестный эффект');
 const fit:Record<string,Record<string,number>>={'fade-slide':{dx:-110,dy:30},'reveal-deal':{distance:150},'soft-lift':{height:45},'orbit-motion':{radiusX:45,radiusY:30},'echo-trail':{distance:10},'shock-wave':{growth:4.5},'radial-burst':{distance:180,gravity:20,span:.85}};
 return{...defaultParams(def),...fit[id]};
}
const tr=(x:number,y:number,w:number,h:number):Transform=>({x,y,pivotX:w/2,pivotY:h/2,rotation:0,scaleX:1,scaleY:1,opacity:1});
export function buildEffectFixture(id:string,params:Record<string,number|boolean|string>={}):Project {
 const def=REGISTRY.get(id);if(!def)throw Error('Неизвестный эффект');
 const color=CATALOG.find(c=>c.id===id)?.color??'#b5cafd';
 const base=(id:string,x:number,y:number,w:number,h:number)=>({id,name:id,sequenceId:'fixture-scene',parentId:null,geometry:{width:w,height:h},transform:tr(x,y,w,h),visible:true,locked:false});
 const nodes:SceneNode[]=[{...base('fixture-bg',0,0,480,300),kind:'shape',shape:'rect',fill:'#0d1421'}];
 for(let i=0;i<7;i++)nodes.push({...base('grid-'+i,i*80,0,1,300),kind:'shape',shape:'rect',fill:'#1c2739'});
 for(let i=0;i<4;i++)nodes.push({...base('grid-h-'+i,0,i*80,480,1),kind:'shape',shape:'rect',fill:'#1c2739'});
 if(['assembly-spread','3d-assembly-wave','3d-camera-orbit','3d-volume-light','3d-surface','3d-finish','3d-studio-stage','3d-discharge'].includes(id)){nodes.push({...base('subject',80,0,340,300),kind:'scene3d',adapter:'three',preset:'anatomy-device',spin:18,explode:0});}
 const particles=id==='radial-burst';
 const ring=id==='shock-wave'||id==='neon-aura';
 if(id==='electric-arc'||id==='storm-lightning'){nodes.push({...base('subject',16,20,448,260),transform:{...tr(16,20,448,260),pivotX:0,pivotY:0},kind:'shape',shape:'rect',fill:'#8ce8ff'});}
 else if(id==='glyph-motion'){nodes.push({...base('subject',25,102,430,125),kind:'text',text:'ЖИВЫЕ',fontFamily:'Unbounded',fontSize:62,color,align:'center',lineHeight:1.1});}
 else if(id==='letter-morph'){nodes.push({...base('subject',22,92,436,140),kind:'text',text:'ПРЕСНО',fontFamily:'Arial',fontSize:86,color,align:'center',lineHeight:1.1});}
 else if(id==='ascii-screen'){nodes.push({...base('subject',20,60,440,220),kind:'text',text:'ASCII',fontFamily:'Arial Black',fontSize:122,color,align:'center',lineHeight:1.1});}
 else if(id==='contour-morph'){nodes.push({...base('subject',160,68,160,160),kind:'shape',shape:'ellipse',fill:color});}
 else if(['contour-window','organic-reveal','noise-dissolve'].includes(id)){nodes.push({...base('subject',40,88,400,150),kind:'text',text:id==='contour-window'?'ОКНО.':id==='organic-reveal'?'ЖИВОЕ.':'ИЗ ШУМА.',fontFamily:'Arial Black',fontSize:68,color,align:'center',lineHeight:1.04});}
 else if(id==='fluid-ink'){nodes.push({...base('subject',0,0,480,300),kind:'shape',shape:'rect',fill:'#08111e'});}else if(particles){
  for(let i=0;i<18;i++)nodes.push({...base('subject-'+i,235,145,i%3?7:17,i%3?7:3),kind:'shape',shape:i%3?'ellipse':'rect',fill:i%2?color:'#e2fffb'});
 }else if(['assembly-spread','3d-assembly-wave','3d-camera-orbit','3d-volume-light','3d-surface','3d-finish','3d-studio-stage','3d-discharge'].includes(id)){}else if(ring)nodes.push({...base('subject',185,95,110,110),kind:'shape',shape:'ellipse',fill:color,fillOpacity:0,stroke:color,strokeWidth:5});
 else{
  nodes.push({...base('fixture-accent',83,78,314,144),kind:'shape',shape:'rect',fill:'#1b293e'});
  nodes.push({...base('subject',100,70,280,160),kind:'text',text:id==='prism-fold'?'Я.':'MOVE',fontFamily:'Arial Black',fontSize:id==='prism-fold'?122:74,color,align:'center',lineHeight:1.05});
 }
 if(id==='motion-memory'){const subject=nodes.find(n=>n.id==='subject')!;subject.transformKeys=[{frame:0,transform:{...subject.transform,x:40,y:40,rotation:-12},easing:'smooth'},{frame:60,transform:{...subject.transform,x:200,y:120,rotation:8,scaleX:.8,scaleY:.8},easing:'smooth'},{frame:119,transform:{...subject.transform,x:60,y:70,rotation:-5},easing:'smooth'}];}
 if(['feedback-trail','feedback-smoke','comet-tails'].includes(id)){
  const subject=nodes.find(n=>n.id==='subject')!;
  nodes.splice(nodes.findIndex(n=>n.id==='fixture-accent'),1);
  const emitter:SceneNode={...base('subject',229,139,22,22),kind:'shape',shape:'ellipse',fill:color};
  nodes[nodes.findIndex(n=>n.id==='subject')]=emitter;
  emitter.transformKeys=Array.from({length:49},(_,i)=>{const a=i/48*Math.PI*2;return{frame:Math.round(i/48*119),easing:'linear' as const,transform:{...emitter.transform,x:229+Math.cos(a)*150,y:139+Math.sin(a)*88,rotation:i*8}};});
 }
 const subjects=nodes.filter(n=>n.id.startsWith('subject'));
 const fixtureParams={...galleryDefaultParams(id),...params};
 const effects=subjects.map((n,i)=>({id:'fixture-fx-'+i,definitionId:id,definitionVersion:def.version,targetId:n.id,fromFrame:0,toFrame:FIXTURE_FRAMES,params:particles?{...fixtureParams,angle:i*20+Number(fixtureParams.angle),distance:Number(fixtureParams.distance)*(.7+(i%3)*.15)}:fixtureParams,enabled:true,order:1}));
 return{schemaVersion:2,id:'effect-fixture',revision:1,title:'Пример эффекта',size:{width:480,height:300},fps:{num:30,den:1},durationFrames:FIXTURE_FRAMES,seed:20261015,assets:[],sequences:[{id:'fixture-scene',name:'Пример',fromFrame:0,toFrame:FIXTURE_FRAMES}],nodes,effects,cameraTracks:[{id:'fixture-camera',name:'Камера',keys:[{frame:0,cx:240,cy:150,zoom:1,rotation:0}]}],audioTracks:[],cues:[]};
}
