import type{ExampleLanguage}from'./exampleLanguage.ts';
import {buildCollageLettersPilot}from'./collageLettersPilot.ts';
import {DemoFilm,filmTransform,type FilmResources}from'./demoFilm.ts';
import type{SceneNode,Transform}from'./schema.ts';

/** One editable canvas; the accepted opening keeps its original frame calculation. */
export function buildCollageFilm(resources:FilmResources,language:ExampleLanguage='ru'){
 const p=buildCollageLettersPilot(language);p.id='motivelium-collage-film';p.title='Дай идее ход · бумажная мастерская';p.durationFrames=600;p.assets=resources.assets;p.sequences[0]!.name='Фрагменты → ракурс → коллаж → целое';p.sequences[0]!.toFrame=600;
 const q=new DemoFilm(p.id,p.title,p.sequences,resources);q.scene=p.sequences[0]!;
 const ink='#182b2a',paper='#f1eadb',blue='#3158e9',coral='#ff6248',jade='#c0d4ca';
 const world=q.shape('world-paper',-4000,-3500,12000,9000,'#d8d0bd');
 p.nodes.unshift(world);q.nodes=[];
 // The world grid is outside the opaque opening sheet.
 for(let i=0;i<25;i++){const x=-300+i*200;q.shape('grid-v-'+i,x,-300,1,3400,'#b8b49f');q.shape('grid-h-'+i,-300,-300+i*140,5200,1,'#b8b49f')}
 p.nodes.splice(1,0,...q.nodes);q.nodes=[];
 const tapePath='M0 8L12 0L24 10L38 1L50 9L63 0L75 10L88 1L100 8L97 40L100 72L98 96L84 90L70 100L57 91L44 100L30 90L17 99L2 91L0 57L2 26Z';
 const tape=(id:string,x:number,y:number,rotation:number,parent:string)=>{const n=q.shape(id,x,y,230,52,'#d7bd74',false,parent);n.transform.rotation=rotation;n.transform.opacity=.86;q.fx(n,'contour-morph',{from:'custom',to:'custom',fromPath:tapePath,toPath:tapePath});return n};
 const typed=(id:string,value:string,x:number,y:number,w:number,h:number,size:number,color=ink,font='Onest',parent:string|null=null)=>{const n=q.text(id,value,x,y,w,h,size,color,font,parent);if(n.kind==='text'){n.fontWeight=font==='Onest'?700:400;n.lineHeight=1.03}return n};
 const show=(n:SceneNode,start:number,end:number,dy=0,rotation=0)=>{const t={...n.transform};q.keys(n,[[0,{opacity:0,y:t.y+dy,rotation:t.rotation+rotation}],[start,{opacity:0,y:t.y+dy,rotation:t.rotation+rotation}],[end,t],[599,t]]);return n};
 // Board two: paper, type and a photographic window, kept in separate zones.
 const b=q.group('perspective-board',2230,-20,1920,1080,2);
 q.shape('perspective-shadow',20,24,1920,1080,'#b9b4a4',false,b.id);q.shape('perspective-paper',0,0,1920,1080,'#e4e9dc',false,b.id);
 typed('perspective-folio','02 / ДРУГОЙ ВЗГЛЯД',90,80,920,50,26,blue,'Onest',b.id);
 const bTitle=typed('perspective-title','СМЕНИ\nРАКУРС',90,248,870,360,136,ink,'Rubik Mono One',b.id);
 const bNote=typed('perspective-note','Всё дело в точке зрения.',96,857,930,74,37,ink,'Literata Italic',b.id);
 const macroType=(n:SceneNode)=>q.keys(n,[[0,{}],[228,{}],[234,{opacity:0}],[290,{opacity:0}],[350,{opacity:1}],[599,{opacity:1}]]);
 for(const n of[bTitle,bNote,q.nodes.find(n=>n.id==='perspective-folio')!])macroType(n);
 q.shape('photo-blue-matte',1020,130,790,790,blue,false,b.id);
 const knot=q.image('perspective-knot','asset-film-knot',1040,150,750,750,b.id);
 show(knot,144,193,85,-9);q.fx(knot,'contour-window',{from:'circle',to:'source',delay:0,span:1},144,195);
 q.keys(knot,[[0,{...knot.transform,opacity:0,rotation:-9,y:235}],[144,{...knot.transform,opacity:0,rotation:-9,y:235}],[193,knot.transform],[270,{...knot.transform,scaleX:1.035,scaleY:1.035,x:1028,y:137}],[599,knot.transform]]);
 tape('perspective-tape',1290,107,-7,b.id);macroType(typed('perspective-caption','МЕТАЛЛ / СВЕТ / ФАКТУРА',1035,955,800,45,23,blue,'Onest',b.id));
 const ring=q.shape('perspective-ring',780,680,170,170,coral,true,b.id,10);q.keys(ring,[[0,{}],[155,{rotation:-35,scaleX:.55,scaleY:.55}],[220,{rotation:0,scaleX:1,scaleY:1}],[280,{rotation:45,scaleX:.8,scaleY:.8}],[599,{}]]);ring.transform.pivotX=ring.transform.pivotY=85;ring.transformKeys?.forEach(k=>{k.transform.pivotX=k.transform.pivotY=85});
 // Board three is a landscape layout, with a protected text column.
 const c=q.group('collage-board',850,1450,2900,1240,-2);
 q.shape('collage-shadow',22,24,2900,1240,'#b9b4a4',false,c.id);q.shape('collage-paper',0,0,2900,1240,'#f5e7ce',false,c.id);
 typed('collage-folio','03 / ИЗ ЧАСТЕЙ — ЦЕЛОЕ',92,82,1200,55,27,blue,'Onest',c.id);
 const finalTitle=typed('collage-final-title','ДАЙ\nИДЕЕ\nХОД',90,285,1160,640,182,ink,'Rubik Mono One',c.id);show(finalTitle,349,371,48);
 typed('collage-signature','Своё — из того, что под рукой.',98,1062,1370,80,43,ink,'Literata Italic',c.id);
 const cards=[{id:'journey',asset:'asset-film-road',x:1390,y:160,w:1320,h:555,r:-3,from:282},{id:'object',asset:'asset-film-sculpture',x:1660,y:730,w:960,h:410,r:4,from:315}];
 for(const card of cards){const g=q.group('card-'+card.id,card.x,card.y,card.w,card.h,card.r);g.parentId=c.id;show(g,card.from,card.from+39,180,card.id==='journey'?-14:16);q.shape(card.id+'-matte',0,0,card.w,card.h,'#fffaf0',false,g.id);const im=q.image(card.id+'-image',card.asset,16,16,card.w-32,card.h-70,g.id);q.fx(im,'contour-window',{from:'circle',to:'source',span:1,delay:0},card.from,card.from+40);typed(card.id+'-note',card.id==='journey'?'НЕ ОСТАВЛЯЙ ИДЕЮ НА ОБОЧИНЕ.':'ЭТО ТОЖЕ ЧАСТЬ КАДРА.',25,card.h-42,card.w-50,34,21,ink,'Onest',g.id);tape(card.id+'-tape',card.w*.45,-17,card.r*-1,g.id)}
 const stamp=q.shape('collage-seal',1320,865,225,225,coral,true,c.id);show(stamp,332,365,130,-30);q.fx(stamp,'contour-morph',{from:'star',to:'star'});const stampText=typed('collage-seal-word','СВОЁ',1320,956,225,42,31,paper,'Onest',c.id);if(stampText.kind==='text')stampText.align='center';show(stampText,356,372,12);
 // Small editorial details live in the gutters, never over the main captions.
 const aFolio=typed('opening-folio','01 / СНАЧАЛА БЫЛИ ЧАСТИ',100,80,1500,60,30,blue);show(aFolio,135,153);
 const brand=typed('footer-brand','motivelium.',950,2800,1680,170,118,ink,'Onest');q.keys(brand,[[0,{opacity:0}],[425,{opacity:0}],[450,{opacity:1}],[495,{opacity:1}],[510,{opacity:0}],[599,{opacity:0}]]);
 const arrow=q.shape('gutter-arrow',1910,1280,250,130,blue);q.fx(arrow,'contour-morph',{from:'custom',to:'custom',fromPath:'M0 35L67 35L67 0L100 50L67 100L67 65L0 65Z',toPath:'M0 35L67 35L67 0L100 50L67 100L67 65L0 65Z'});q.keys(arrow,[[0,{opacity:0}],[250,{opacity:0,x:1870}],[290,{opacity:1,x:1910}],[599,{opacity:1,x:1910}]]);
 for(let i=0;i<12;i++){const n=q.shape('gutter-chip-'+i,2020+(i%3)*75,200+i*66,18+i%3*8,11,i%2?coral:blue);n.transform.rotation=i*29;q.keys(n,[[0,{opacity:0}],[140,{opacity:0}],[180,{opacity:.7}],[420,{y:n.transform.y+20,rotation:n.transform.rotation+30,opacity:.7}],[599,{opacity:.7}]]);}
 p.nodes.push(...q.nodes);p.effects.push(...q.effects);
 p.cameraTracks=[{id:'collage-camera',name:'Пролёт по бумажной мастерской',keys:[
  {frame:0,cx:960,cy:540,zoom:1,rotation:0},{frame:134,cx:960,cy:540,zoom:1,rotation:0},
  {frame:165,cx:1600,cy:620,zoom:.62,rotation:-2},
  {frame:210,cx:3160,cy:530,zoom:.91,rotation:-2},
  {frame:228,cx:3160,cy:530,zoom:.91,rotation:-2},
  {frame:260,cx:3635,cy:555,zoom:2.15,rotation:-2},
  {frame:276,cx:3670,cy:550,zoom:2.05,rotation:-1.5},
  {frame:312,cx:2710,cy:1360,zoom:.68,rotation:2},
  {frame:366,cx:2320,cy:2020,zoom:.62,rotation:2},
  {frame:405,cx:2300,cy:2020,zoom:.63,rotation:2},
  {frame:465,cx:2120,cy:1470,zoom:.36,rotation:0},
  {frame:495,cx:2120,cy:1450,zoom:.36,rotation:0},
  {frame:549,cx:2320,cy:2020,zoom:.62,rotation:2},
  {frame:599,cx:2310,cy:2020,zoom:.63,rotation:2},
 ]}];
 const clip=(durationSeconds:number,fadeInSeconds=0,fadeOutSeconds=.05)=>({sourceStartSeconds:0,durationSeconds,fadeInSeconds,fadeOutSeconds,pan:0,duckMusicDb:0});
 p.audioTracks=resources.assets.some(a=>a.id==='asset-collage-score')?[{id:'collage-score',kind:'music',assetId:'asset-collage-score',gain:1,offsetSeconds:0,mute:false,clip:clip(20,.06,.4)},...[[.50,-.5],[1.2,.5],[2.4,-.3],[3.5,.3],[6.5,0],[10.9,-.3],[11.5,.4],[12.1,-.4]].map(([offsetSeconds,pan],i)=>({id:'paper-tick-'+i,kind:'sfx' as const,assetId:'asset-collage-tick',gain:.4,offsetSeconds:offsetSeconds!,mute:false,clip:{...clip(.16),pan:pan!}})),...[[4.50,-.35],[8.75,.3],[10.1,-.3],[14.05,0],[16.5,.35]].map(([offsetSeconds,pan],i)=>({id:'paper-flight-'+i,kind:'sfx' as const,assetId:'asset-collage-sweep',gain:.38,offsetSeconds:offsetSeconds!,mute:false,clip:{...clip(.65),pan:pan!,duckMusicDb:1.5}}))]:[];
 p.cues=[{id:'pieces',frame:0,kind:'mark',trackId:null,label:'Сборка букв'},{id:'whole-word',frame:105,kind:'mark',trackId:null,label:'Собери своё'},{id:'first-flight',frame:135,kind:'mark',trackId:null,label:'За пределами кадра'},{id:'perspective',frame:210,kind:'mark',trackId:null,label:'Смени ракурс'},{id:'texture',frame:260,kind:'mark',trackId:null,label:'Ближе к фактуре'},{id:'collage',frame:366,kind:'mark',trackId:null,label:'Карточки собираются'},{id:'canvas',frame:465,kind:'mark',trackId:null,label:'Весь холст'},{id:'final',frame:549,kind:'mark',trackId:null,label:'Дай идее ход'}];
 return p;
}
