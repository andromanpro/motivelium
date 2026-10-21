// Beat-aligned editable demo. 180 BPM => ten frames per beat at 30 fps.
import type {Project,SceneNode,Transform,EffectInstance,Sequence} from './schema.ts';
export const ENERGY_PREFIX='motivelium-energy';
export const ENERGY_AUDIO_ID='asset-energy-score';
export const ENERGY_FRAMES=640;
const black='#060912',cyan='#73fff1',pink='#e05dff',hot='#ff7955',white='#f3f7ff',blue='#8b88ff';
const tr=(v:Partial<Transform>={}):Transform=>({x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,pivotX:0,pivotY:0,...v});
type AudioMeta={sha256:string;bytes:number};
export function buildEnergy(meta:AudioMeta):Project {
 const nodes:SceneNode[]=[],effects:EffectInstance[]=[];
 const sequences:Sequence[]=[
  {id:'seq-charge',name:'Заряд',fromFrame:0,toFrame:80},
  {id:'seq-burst',name:'Разряд',fromFrame:80,toFrame:200},
  {id:'seq-prism',name:'Призма',fromFrame:200,toFrame:320},
  {id:'seq-flight',name:'Тоннель',fromFrame:320,toFrame:440},
  {id:'seq-jelly',name:'Ещё',fromFrame:440,toFrame:560},
  {id:'seq-impact',name:'Финал',fromFrame:560,toFrame:640},
 ];let seq=sequences[0]!;
 const base=(id:string,name:string,x:number,y:number,w:number,h:number,parentId:string|null=null,transform:Partial<Transform>={})=>({id,name,sequenceId:seq.id,parentId,geometry:{width:w,height:h},transform:tr({x,y,...transform}),visible:true,locked:false});
 function shape(id:string,name:string,x:number,y:number,w:number,h:number,color=white,ellipse=false,parentId:string|null=null,transform:Partial<Transform>={},outline=0){nodes.push({...base(id,name,x,y,w,h,parentId,transform),kind:'shape',shape:ellipse?'ellipse':'rect',fill:color,...(outline?{fillOpacity:0,stroke:color,strokeWidth:outline}:{})});return id}
 function text(id:string,name:string,value:string,x:number,y:number,w:number,h:number,size=80,color=white,font='Arial Black',parentId:string|null=null,align:'left'|'center'|'right'='left'){nodes.push({...base(id,name,x,y,w,h,parentId),kind:'text',text:value,fontFamily:font,fontSize:size,color,align,lineHeight:1.04});return id}
 function group(id:string,name:string,x:number,y:number,w:number,h:number){nodes.push({...base(id,name,x,y,w,h),kind:'group'});return id}
 function model(id:string,name:string,preset:'neon-reactor'|'ribbon-tunnel',x:number,y:number,w:number,h:number,spin=65,explode=.3){nodes.push({...base(id,name,x,y,w,h,null,{pivotX:w/2,pivotY:h/2}),kind:'scene3d',adapter:'three',preset,spin,explode});return id}
 function fx(id:string,definitionId:string,params:EffectInstance['params']={},order=1,from=seq.fromFrame,to=seq.toFrame){effects.push({id:`fx-${id}-${definitionId}`,definitionId,definitionVersion:1,targetId:id,fromFrame:from,toFrame:to,params,enabled:true,order})}
 function bg(color=black){shape(seq.id+'-bg','Фон сцены',-1500,-1500,5000,4000,color)}
 function hud(index:number,title:string){text(`hud-${index}`,'Название сцены',`${String(index).padStart(2,'0')} / ${title}`,150,100,1200,50,25,cyan,'Consolas');text(`brand-${index}`,'Название мастерской','MOTIVELIUM',1400,100,310,50,25,blue,'Consolas',null,'right');shape(`rule-${index}`,'Линейка',150,160,1560,2,'#243249')}
 function aura(id:string,strength=.7){fx(id,'neon-aura',{strength},8)}
 function ring(id:string,x:number,y:number,size:number,color:string,width:number){return shape(id,'Световое кольцо',x-size/2,y-size/2,size,size,color,true,null,{pivotX:size/2,pivotY:size/2},width)}
 function enter(id:string,delay=0,dx=0,dy=90,span=.25){fx(id,'fade-slide',{delay,span,dx,dy,blur:8})}

 // 01. A readable first frame, slow charge, no empty lead-in.
 bg();hud(1,'ПЕРЕД ИМПУЛЬСОМ');
 ring('charge-ring',1420,555,610,cyan,2);aura('charge-ring',.45);
 model('charge-core','Реактор перед разрядом','neon-reactor',850,145,1130,840,38,.1);aura('charge-core',.5);
 text('charge-title','Тише','ТИШЕ.',110,372,1050,340,260,white);fx('charge-title','chromatic-split',{amount:8});
 text('charge-note','Подпись заряда','СЕЙЧАС БУДЕТ.',118,872,1200,65,43,cyan,'Consolas');enter('charge-note',.05,0,35,.35);
 for(let i=0;i<18;i++){const a=i*Math.PI*2/18;const id=shape('charge-spark-'+i,'Искра заряда',1420+Math.cos(a)*365,555+Math.sin(a)*365,5,5,i%2?pink:cyan,true);fx(id,'orbit-motion',{radiusX:35,radiusY:35,cycles:1,phase:i*20});aura(id,.65)}

 // 02. Seeded particles are editable objects; ballistic paths are registry instances.
 seq=sequences[1]!;bg();hud(2,'РАЗРЯД');
 for(let i=0;i<4;i++){const id=ring('shock-'+i,960,510,170,[cyan,pink,hot,white][i%4]!,14-i*2);fx(id,'shock-wave',{delay:i*.035,span:.62,growth:9+i*2});aura(id,.8)}
 model('burst-core','Ядро взрыва','neon-reactor',615,162,690,690,88,.9);fx('burst-core','elastic-wave',{amount:.34,cycles:3});fx('burst-core','chromatic-split',{amount:24},2);aura('burst-core',.75);
 const particles=group('particle-field','Частицы взрыва',0,0,1920,1080);
 let seed=20261014;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let i=0;i<112;i++){
  const a=random()*360,distance=450+random()*900,size=3+random()*9,streak=i%5===0;
  const id=shape('particle-'+String(i).padStart(3,'0'),streak?'Световой осколок':'Горящая частица',960-size/2,510-size/2,streak?size*5:size,streak?size*.48:size,[cyan,pink,hot,white,'#ffce6f'][i%5]!,!streak,particles,{rotation:a,pivotX:size/2,pivotY:size/2});
  fx(id,'radial-burst',{angle:a,distance,gravity:80+random()*160,delay:random()*.06,span:.78});aura(id,.45+random()*.45);
 }
 text('burst-title','Разряд','РАЗРЯД.',110,788,1710,250,206,white,'Arial Black',null,'center');fx('burst-title','echo-trail',{copies:3,distance:13,angle:-6});fx('burst-title','chromatic-split',{amount:25},2);

 // 03. A true sector mirror of a live WebGL layer.
 seq=sequences[2]!;bg();hud(3,'ПРЕЛОМЛЕНИЕ');
 model('prism-core','Живая призма','neon-reactor',410,70,1100,1100,70,.7);fx('prism-core','prism-fold',{copies:8});fx('prism-core','spin-turn',{turns:.28},2);fx('prism-core','chromatic-split',{amount:17},3);aura('prism-core',.8);
 ring('prism-rim',960,590,830,cyan,2);fx('prism-rim','elastic-wave',{amount:.2,cycles:2});aura('prism-rim',.7);
 text('prism-title','Лови цвет','ЛОВИ ЦВЕТ.',110,872,1710,170,108,white,'Arial Black',null,'center');fx('prism-title','slice-glitch',{amount:32});

 // 04. Real depth travel, not a sequence of scaled circles on a flat slide.
 seq=sequences[3]!;bg();model('flight-world','Неоновый тоннель','ribbon-tunnel',-160,-110,2240,1300,94,.5);fx('flight-world','chromatic-split',{amount:10});
 hud(4,'ВНУТРЬ');text('flight-title','Внутрь','ВНУТРЬ.',110,400,1710,280,220,white,'Arial Black',null,'center');fx('flight-title','echo-trail',{copies:4,distance:25,angle:90});fx('flight-title','fade-exit',{span:.7,dy:-80},3);

 // 05. Individual letters deform, split colour and leave echoes.
 seq=sequences[4]!;bg('#271051');hud(5,'ЕЩЁ');
 for(let i=0;i<7;i++){const id=ring('jelly-ring-'+i,960,540,250+i*180,i%2?pink:cyan,2);fx(id,'elastic-wave',{amount:.18,cycles:2});aura(id,.45)}
 const letters=[['Е',190,320],['Щ',545,505],['Ё',1095,340],['.',1465,230]] as const;
 letters.forEach(([letter,x,w],i)=>{const id=text('jelly-letter-'+i,'Буква '+letter,letter,x,330,w,450,365,white);const n=nodes.at(-1)!;n.transform.pivotX=w/2;n.transform.pivotY=225;enter(id,i*.04,i%2?140:-140,0,.28);fx(id,'elastic-wave',{amount:.58,cycles:3},2);fx(id,'chromatic-split',{amount:32+i*4},3);fx(id,'echo-trail',{copies:2,distance:22,angle:i%2?-30:30},4)});
 text('jelly-note','Подпись деформации','СЖАТИЕ  /  ИНЕРЦИЯ  /  ЦВЕТОВОЙ СДВИГ',150,934,1620,60,31,cyan,'Consolas',null,'center');

 // 06. A final impact, then a stable readable end card.
 seq=sequences[5]!;bg();hud(6,'ЭТО ТОЛЬКО НАЧАЛО');
 model('final-core','Финальный реактор','neon-reactor',570,34,780,780,55,.45);aura('final-core',.75);
 text('impact-title','Финальный разряд','РАЗРЯД.',100,545,1720,300,245,white,'Arial Black',null,'center');fx('impact-title','slice-glitch',{amount:70},2,560,590);fx('impact-title','chromatic-split',{amount:32},3,560,600);aura('impact-title',.45);
 text('impact-brand','Название проекта','motivelium.',310,860,1300,95,72,cyan,'Consolas',null,'center');enter('impact-brand',.08,0,45,.35);
 text('impact-note','Финальная подпись','ЕЩЁ НЕ ПРЕДЕЛ.',310,976,1300,50,30,blue,'Consolas',null,'center');
 const audio={id:ENERGY_AUDIO_ID,path:'assets/razryad-180.wav',mime:'audio/wav',sha256:meta.sha256,bytes:meta.bytes,durationSeconds:ENERGY_FRAMES/30,origin:'generated' as const,title:'Разряд · оригинальный синтез · 180 BPM'};
 return {schemaVersion:2,id:ENERGY_PREFIX,revision:1,title:'Разряд — энергия и новые эффекты',size:{width:1920,height:1080},fps:{num:30,den:1},durationFrames:ENERGY_FRAMES,seed:20261014,assets:[audio],sequences,nodes,effects,
  audioTracks:[{id:'track-energy-music',kind:'music',assetId:ENERGY_AUDIO_ID,gain:.85,offsetSeconds:0,mute:false}],
  cues:[...Array.from({length:64},(_,i)=>({id:'beat-'+String(i).padStart(3,'0'),trackId:'track-energy-music',frame:i*10,kind:'beat' as const,label:String(i+1)})),...sequences.map((s,i)=>({id:'chapter-energy-'+i,trackId:null,frame:s.fromFrame,kind:'mark' as const,label:s.name}))],
  cameraTracks:[{id:'cam-main',name:'Разгон и пролёты',keys:[
   {frame:0,cx:960,cy:540,zoom:1,rotation:0},{frame:79,cx:1030,cy:540,zoom:1.08,rotation:0},
   {frame:80,cx:960,cy:540,zoom:1.15,rotation:-2},{frame:98,cx:960,cy:540,zoom:.92,rotation:1},{frame:165,cx:960,cy:540,zoom:1.025,rotation:0},{frame:199,cx:960,cy:540,zoom:1,rotation:0},
   {frame:200,cx:960,cy:540,zoom:.92,rotation:-3},{frame:260,cx:960,cy:560,zoom:1.04,rotation:3},{frame:319,cx:960,cy:540,zoom:1,rotation:0},
   {frame:320,cx:960,cy:540,zoom:1,rotation:0},{frame:375,cx:960,cy:540,zoom:1.06,rotation:3},{frame:439,cx:960,cy:540,zoom:1.02,rotation:-2},
   {frame:440,cx:960,cy:540,zoom:1,rotation:0},{frame:490,cx:960,cy:540,zoom:1.04,rotation:-1},{frame:559,cx:960,cy:540,zoom:1,rotation:0},
   {frame:560,cx:960,cy:540,zoom:.95,rotation:0},{frame:590,cx:960,cy:540,zoom:1.01,rotation:0},{frame:639,cx:960,cy:540,zoom:1.01,rotation:0},
  ]}],
 };
}
