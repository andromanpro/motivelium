// A real editable Project v2, not an animation hidden inside the player.
// Coordinates, typography, images, effects and camera keys are document data.
import type {AssetRef,EffectInstance,Project,SceneNode,Sequence,Transform} from './schema.ts';

export const SHOWCASE_PREFIX='motivelium-showcase';
export const SHOWCASE_ASSET_ID='asset-kinetic-sculpture';
export const SHOWCASE_FRAMES=720;
type ImageMeta={sha256:string;bytes:number;width:number;height:number};
const ink='#10251f',paper='#f0eddf',jade='#bbdfab',coral='#e56f4b',muted='#91a899';
const tr=(v:Partial<Transform>={}):Transform=>({x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,pivotX:0,pivotY:0,...v});

export function buildShowcase(meta:ImageMeta):Project {
 const nodes:SceneNode[]=[],effects:EffectInstance[]=[];
 const sequences:Sequence[]=[
  {id:'seq-spark',name:'Импульс',fromFrame:0,toFrame:108},
  {id:'seq-type',name:'Типографика',fromFrame:108,toFrame:216},
  {id:'seq-collage',name:'Коллаж',fromFrame:216,toFrame:342},
  {id:'seq-canvas',name:'Холст',fromFrame:342,toFrame:498},
  {id:'seq-depth',name:'Объём',fromFrame:498,toFrame:618},
  {id:'seq-finale',name:'Финал',fromFrame:618,toFrame:720},
 ];
 let seq=sequences[0]!;
 function base(id:string,name:string,x:number,y:number,w:number,h:number,parentId:string|null=null,transform:Partial<Transform>={}) {
  return {id,name,parentId,sequenceId:seq.id,transform:tr({x,y,...transform}),geometry:{width:w,height:h},visible:true,locked:false};
 }
 function shape(id:string,name:string,x:number,y:number,w:number,h:number,fill=paper,ellipse=false,parentId:string|null=null,transform:Partial<Transform>={},stroke?:string,strokeWidth=2) {
  nodes.push({...base(id,name,x,y,w,h,parentId,transform),kind:'shape',shape:ellipse?'ellipse':'rect',fill,...(stroke?{stroke,strokeWidth}:{})});return id;
 }
 function text(id:string,name:string,value:string,x:number,y:number,w:number,h:number,size=60,color=paper,parentId:string|null=null,font='Impact',align:'left'|'center'|'right'='left',transform:Partial<Transform>={}) {
  nodes.push({...base(id,name,x,y,w,h,parentId,transform),kind:'text',text:value,fontFamily:font,fontSize:size,color,align,lineHeight:1.02});return id;
 }
 function group(id:string,name:string,x:number,y:number,w:number,h:number,rotation=0) {
  nodes.push({...base(id,name,x,y,w,h,null,{rotation}),kind:'group'});return id;
 }
 function image(id:string,name:string,x:number,y:number,w:number,h:number,parentId:string|null=null) {
  nodes.push({...base(id,name,x,y,w,h,parentId),kind:'image',assetId:SHOWCASE_ASSET_ID,fit:'cover'});return id;
 }
 function fx(targetId:string,definitionId:string,params:EffectInstance['params']={},order=1,from=seq.fromFrame,to=seq.toFrame) {
  effects.push({id:`fx-${targetId}-${definitionId}`,definitionId,definitionVersion:1,targetId,fromFrame:from,toFrame:to,params,enabled:true,order});
 }
 const enter=(id:string,delay=0,dx=0,dy=70,span=.30)=>fx(id,'fade-slide',{delay,span,dx,dy,blur:9});
 function hud(number:string,label:string,dark=true) {
  const color=dark?muted:'#4e6654';
  text(`hud-${number}`,`Глава ${number}`,`${number} / ${label}`,130,83,1250,42,23,color,null,'Consolas');
  text(`edition-${number}`,'Название мастерской','MOTIVELIUM',1500,83,290,42,23,color,null,'Consolas','right');
  shape(`rule-${number}`,'Верхняя линейка',130,139,1660,2,dark?'#365448':'#c3cbb6');
 }
 function star(id:string,x:number,y:number,size:number,color:string) {
  const g=group(id,'Лучистый акцент',x,y,size,size);
  Object.assign(nodes.at(-1)!.transform,{pivotX:size/2,pivotY:size/2});
  for(let i=0;i<8;i++)shape(`${id}-${i}`,'Луч',size*.075,size*.455,size*.85,size*.09,color,false,g,{rotation:i*22.5,pivotX:size*.425,pivotY:size*.045});
  fx(g,'spin-turn',{turns:.5});return g;
 }
 function wipe(id:string,color:string,delay=.84) {
  shape(id,'Переход к следующей сцене',-500,-500,3000,2100,color);
  fx(id,'fade-slide',{delay,span:1-delay,dx:-2400,dy:0,blur:0});
 }

 // 01. Monumental type and a real, rotating 3D sculpture.
 shape('spark-bg','Тёмный фон',-1000,-1000,4200,3200,ink);hud('01','ДАЙ ИДЕЕ ХОД');
 shape('spark-ghost','Кольцо на заднем плане',1140,220,650,650,ink,true,null,{},'#274738',2);
 const intro3d='spark-sculpture';
 nodes.push({...base(intro3d,'Нефритовая скульптура',870,155,1090,800),kind:'scene3d',adapter:'three',preset:'logo-monolith',spin:45,explode:.12});
 fx(intro3d,'float-drift',{height:18,angle:0,cycles:1});
 text('spark-title','Дай идее ход','ДАЙ\nИДЕЕ\nХОД.',130,218,780,650,192,paper);
 fx('spark-title','float-drift',{height:14,angle:0,cycles:1});
 shape('spark-dot','Красный спутник',1660,255,40,40,coral,true);fx('spark-dot','orbit-motion',{radiusX:110,radiusY:180,cycles:1,phase:35});
 text('spark-note','Подпись вступления','Типографика. Коллаж. Камера. Объём.',136,929,1500,60,32,jade,null,'Segoe UI');enter('spark-note',.1,0,40,.3);
 wipe('spark-wipe',paper);

 // 02. Independent words, mask reveals, overshoot and a rotating asterisk.
 seq=sequences[1]!;
 shape('type-bg','Бумажный фон',-1000,-1000,4200,3200,paper);hud('02','СЛОВА ДЕРЖАТ РИТМ',false);
 const words=[['type-one','СЛОВА',160,190,210,ink],['type-two','ТОЖЕ',430,410,190,coral],['type-three','ДВИГАЮТСЯ.',155,657,160,ink]] as const;
 words.forEach(([id,value,x,y,size,color],i)=>{text(id,'Текст: '+value,value,x,y,1620,210,size,color);enter(id,i*.08,i%2?-140:140,35,.35);fx(id,'spring-pop',{amount:.09,delay:i*.08,span:.4},2)});
 shape('type-underline','Подчёркивание',167,860,1550,12,jade);fx('type-underline','mask-wipe',{delay:.18,span:.5});
 const typeStar=star('type-star',1320,290,280,coral);enter(typeStar,.08,0,100,.3);
 text('type-note','Подпись типографики','У каждого слова — своя траектория.',160,948,1400,55,31,'#50624e',null,'Segoe UI');enter('type-note',.2,0,30,.35);

 // 03. Tactile image cards; every caption and matte remains editable.
 seq=sequences[2]!;
 shape('collage-bg','Бумажный фон',-1000,-1000,4200,3200,paper);hud('03','КАДР С ХАРАКТЕРОМ',false);
 text('collage-title','Кадр с характером','СОБЕРИ\nСВОЙ\nХАРАКТЕР.',130,240,760,450,126,ink);enter('collage-title',0,-90,0,.28);
 const poster=group('collage-poster','Большой постер',982,190,780,720,4);
 shape('collage-poster-matte','Бумажная рамка',0,0,780,720,'#fffcf0',false,poster);
 image('collage-photo','Скульптура — общий план',18,18,744,624,poster);
 text('collage-photo-note','Подпись постера','KINETIC STUDY / 001',25,661,730,38,24,ink,poster,'Consolas');
 fx(poster,'reveal-deal',{distance:470,angle:16},1,seq.fromFrame,seq.fromFrame+40);fx(poster,'float-drift',{height:16,angle:1.2,cycles:1},2);
 const detail=group('collage-detail','Карточка крупного плана',725,664,546,340,-7);
 shape('collage-detail-matte','Рамка крупного плана',0,0,546,340,'#fffcf0',false,detail);image('collage-detail-photo','Скульптура — фрагмент',12,12,522,316,detail);
 fx(detail,'fade-slide',{delay:.1,span:.35,dx:120,dy:140,blur:5});fx(detail,'float-drift',{height:20,angle:-1.5,cycles:1},2);
 const sticker=star('collage-star',722,310,184,coral);fx(sticker,'spring-pop',{amount:.8,delay:.08,span:.35},2);
 text('collage-stamp','Подпись стикера','ЖИВОЕ',741,381,148,45,34,paper,null,'Impact','center',{rotation:6});enter('collage-stamp',.1,0,0,.35);
 fx('collage-stamp','fade-exit',{span:.12,dx:0,dy:-20},3);
 shape('collage-tape','Полоска скотча',1110,174,240,52,jade,false,null,{rotation:-8,opacity:.88});enter('collage-tape',.14,0,-100,.25);
 text('collage-note','Подпись коллажа','Изображение — только один из слоёв.',132,925,1030,70,30,'#50624e',null,'Segoe UI');
 wipe('collage-wipe',ink,.88);

 // 04. Three connected artboards on a genuine 4000×2400 world canvas.
 seq=sequences[3]!;
 shape('canvas-bg','Фон большого холста',-2500,-2000,10000,7000,ink);
 for(let i=0;i<9;i++)shape(`canvas-grid-v-${i}`,'Сетка холста',i*500-100, -1000,2,5000,'#1c372b');
 for(let i=0;i<7;i++)shape(`canvas-grid-h-${i}`,'Сетка холста',-1000,i*500-100,6500,2,'#1c372b');
 shape('canvas-orbit','Связь между плакатами',650,280,2500,1600,ink,true,null,{},'#547650',5);
 const a=group('canvas-a','Холст: близкий план',80,80,1540,980);
 shape('canvas-a-paper','Плакат 01',0,0,1540,980,paper,false,a);image('canvas-a-image','Скульптура на плакате',700,40,800,900,a);
 text('canvas-a-title','Близкий план','ВНУТРИ\nКАДРА.',65,230,740,450,150,ink,a);
 text('canvas-a-num','Номер плаката','01 / БЛИЗКО',65,65,600,55,30,'#536449',a,'Consolas');
 const b=group('canvas-b','Холст: смещение камеры',2200,80,1540,980);
 shape('canvas-b-paper','Плакат 02',0,0,1540,980,jade,false,b);
 text('canvas-b-num','Номер плаката','02 / В СТОРОНУ',65,65,700,55,30,'#536449',b,'Consolas');
 text('canvas-b-title','Смена перспективы','СМЕНИ\nПЕРСПЕКТИВУ.',65,245,1450,530,145,ink,b);
 shape('canvas-b-orbit','Кольцо перспективы',1050,80,390,390,jade,true,b,{},coral,28);fx('canvas-b-orbit','float-drift',{height:28,angle:0,cycles:1});
 const c=group('canvas-c','Холст: общая картина',1140,1410,1540,980);
 shape('canvas-c-paper','Плакат 03',0,0,1540,980,coral,false,c);
 text('canvas-c-num','Номер плаката','03 / ЦЕЛИКОМ',65,65,700,55,30,ink,c,'Consolas');
 text('canvas-c-title','Большой холст','ОДИН ХОЛСТ.\nМНОГО\nИСТОРИЙ.',65,205,1400,650,157,ink,c);
 text('canvas-label','Подпись общего полотна','КАМЕРА МЕНЯЕТ МАСШТАБ. ОБЪЕКТЫ ОСТАЮТСЯ НА МЕСТЕ.',180,2535,3700,90,42,jade,null,'Consolas','center');
 shape('canvas-blackout','Переход из общего плана',-2500,-2000,10000,7000,ink);fx('canvas-blackout','fade-slide',{delay:.92,span:.08,dx:0,dy:0,blur:0});

 // 05. A live WebGL layer, not the previously generated photograph.
 seq=sequences[4]!;
 shape('depth-bg','Тёмный фон',-1000,-1000,4200,3200,ink);hud('05','ЖИВОЙ ОБЪЁМ');
 shape('depth-orbit','Графическая орбита',1160,250,600,600,ink,true,null,{},'#365c43',2);
 nodes.push({...base('depth-sculpture','Живая 3D-скульптура',815,153,1120,800),kind:'scene3d',adapter:'three',preset:'logo-monolith',spin:72,explode:.48});
 enter('depth-sculpture',0,80,0,.3);fx('depth-sculpture','float-drift',{height:25,angle:0,cycles:1},2);
 text('depth-title','Есть глубина','ЕСТЬ\nГЛУБИНА.',130,320,900,420,155,paper);fx('depth-title','mask-wipe',{delay:.02,span:.35});
 text('depth-note','Подпись объёма','Свет. Отражения. Поворот.\nЭтот объект действительно объёмный.',135,864,1300,115,32,jade,null,'Segoe UI');enter('depth-note',.1,0,45,.3);
 wipe('depth-wipe',paper,.85);

 // 06. Final composition remains on screen; no empty last frame.
 seq=sequences[5]!;
 shape('final-bg','Бумажный фон',-1000,-1000,4200,3200,paper);hud('06','ТЕПЕРЬ ТВОЙ ХОД',false);
 shape('final-disc','Большой зелёный диск',1150,230,630,630,jade,true);fx('final-disc','spring-pop',{amount:.8,delay:0,span:.43});
 const finalStar=star('final-star',180,235,230,coral);fx(finalStar,'spring-pop',{amount:.85,delay:.05,span:.40},2);
 text('final-brand','Название проекта','motivelium.',245,373,1430,280,224,ink,null,'Impact','center');enter('final-brand',.02,0,120,.38);
 text('final-invitation','Приглашение к правке','Останови кадр.\nПоменяй что-нибудь.',370,707,1180,155,54,ink,null,'Segoe UI','center');enter('final-invitation',.16,0,70,.4);
 shape('final-line','Финальная линейка',350,917,1220,3,'#a8bea0');fx('final-line','mask-wipe',{delay:.2,span:.55});
 text('final-capabilities','Возможности демо','ТЕКСТ  /  КОЛЛАЖ  /  КАМЕРА  /  3D',350,950,1220,50,28,'#50624e',null,'Consolas','center');enter('final-capabilities',.24,0,20,.4);

 const asset:AssetRef={id:SHOWCASE_ASSET_ID,path:'assets/kinetic-sculpture.png',mime:'image/png',...meta,origin:'generated',title:'Скульптура для демо Motivelium · imagegen · 14.10.2026'};
 return {
  schemaVersion:2,id:SHOWCASE_PREFIX,revision:1,title:'Дай идее ход — демо Motivelium',size:{width:1920,height:1080},fps:{num:30,den:1},durationFrames:SHOWCASE_FRAMES,seed:20261014,
  assets:[asset],sequences,nodes,effects,audioTracks:[],cues:sequences.map((s,i)=>({id:`cue-chapter-${i}`,trackId:null,frame:s.fromFrame,kind:'mark',label:s.name})),
  cameraTracks:[{id:'cam-main',name:'Камера: от детали к общему холсту',keys:[
   {frame:0,cx:960,cy:540,zoom:1,rotation:0},{frame:89,cx:960,cy:540,zoom:1.025,rotation:0},{frame:107,cx:960,cy:540,zoom:1,rotation:0},
   {frame:108,cx:960,cy:540,zoom:1,rotation:0},{frame:215,cx:960,cy:540,zoom:1.025,rotation:-.45},
   {frame:216,cx:960,cy:540,zoom:1,rotation:0},{frame:325,cx:960,cy:540,zoom:1.025,rotation:0},{frame:341,cx:960,cy:540,zoom:1,rotation:0},
   {frame:342,cx:850,cy:570,zoom:1.04,rotation:0},{frame:359,cx:850,cy:570,zoom:1.04,rotation:0},
   {frame:386,cx:2970,cy:570,zoom:1.05,rotation:-1},{frame:399,cx:2970,cy:570,zoom:1.05,rotation:-1},
   {frame:433,cx:1910,cy:1900,zoom:.95,rotation:1},{frame:448,cx:1910,cy:1900,zoom:.95,rotation:1},
   {frame:480,cx:1900,cy:1200,zoom:.38,rotation:0},{frame:497,cx:1900,cy:1200,zoom:.38,rotation:0},
   {frame:498,cx:960,cy:540,zoom:1,rotation:0},{frame:600,cx:1000,cy:540,zoom:1.04,rotation:0},{frame:617,cx:960,cy:540,zoom:1,rotation:0},
   {frame:618,cx:960,cy:540,zoom:1,rotation:0},{frame:690,cx:960,cy:540,zoom:1.015,rotation:0},{frame:719,cx:960,cy:540,zoom:1.015,rotation:0},
  ]}],
 };
}
