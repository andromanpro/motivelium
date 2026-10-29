import type{ExampleLanguage}from'./exampleLanguage.ts';
import{buildCollageFilm}from'./collageFilm.ts';
import{DemoFilm,type FilmResources}from'./demoFilm.ts';
import type{SceneNode}from'./schema.ts';

/** Paper details are editable scene objects, animated from the document frame. */
export function buildCollagePaperDetails(resources:FilmResources,language:ExampleLanguage='ru'){
 const p=buildCollageFilm(resources,language);p.id='motivelium-collage-paper';p.title='Дай идее ход · бумажный полёт';
 const removed=new Set(['gutter-arrow','collage-seal','collage-seal-word']);p.nodes=p.nodes.filter(n=>!removed.has(n.id));p.effects=p.effects.filter(e=>!removed.has(e.targetId));
 const q=new DemoFilm(p.id,p.title,p.sequences,resources),blue='#3158e9',ink='#243da6',paper='#fff0d5',coral='#ec795c';
 const polygon=(id:string,name:string,path:string,fill:string,parent:string,w:number,h:number,x=0,y=0)=>{const n=q.shape(id,x,y,w,h,fill,false,parent);n.name=name;q.fx(n,'contour-morph',{from:'custom',to:'custom',fromPath:path,toPath:path});return n};
 const plane=q.group('paper-plane',2850,1030,470,240);plane.name='Самолётик · из обрезков в полёт';plane.transform.pivotX=235;plane.transform.pivotY=120;
 q.keys(plane,[[0,{opacity:0,rotation:150,scaleX:.76,scaleY:.76}],[270,{opacity:0,rotation:150,scaleX:.76,scaleY:.76}],[286,{x:2580,y:1110,rotation:150,opacity:1,scaleX:.86,scaleY:.86}],[312,{x:2140,y:1295,rotation:140,opacity:1,scaleX:.82,scaleY:.82}],[333,{x:1940,y:1900,rotation:90,opacity:1,scaleX:.4,scaleY:.4}],[350,{x:2080,y:2255,rotation:89,opacity:1,scaleX:.36,scaleY:.36}],[358,{x:2080,y:2255,rotation:89,opacity:0,scaleX:.06,scaleY:.06}],[599,{x:2080,y:2255,rotation:89,opacity:0,scaleX:.06,scaleY:.06}]]);
 const shadow=polygon('plane-shadow','Чёткая тень сложенной бумаги','M2 16L98 2L46 91L36 50Z','#4e5149',plane.id,470,240,10,16);shadow.transform.opacity=.32;
 const faces=[
  ['wing-upper','Верхнее крыло','M2 16L98 2L36 50Z','#5878cb',-18,.1],
  ['wing-lower','Светлая оборотная сторона','M36 50L98 2L46 91Z',paper,20,.12],
  ['plane-keel','Тёмный сгиб','M36 50L98 2L48 64L46 91Z',ink,-11,.14],
  ['plane-lip','Коралловый край бумаги','M46 91L48 64L98 2L55 75Z','#d9977f',15,.2],
 ]as const;
 for(const[id,name,path,fill,rotation,scaleY]of faces){const n=polygon(id,name,path,fill,plane.id,470,240);n.transform.pivotX=170;n.transform.pivotY=120;q.keys(n,[[0,{opacity:0,rotation,scaleY}],[268,{opacity:0,rotation,scaleY}],[277,{opacity:1,rotation:rotation*.5,scaleY:.45}],[288,{opacity:1,rotation:0,scaleY:1}],[340,{opacity:1,rotation:0,scaleY:1}],[354,{opacity:1,rotation:rotation*.3,scaleY:.7}],[599,{opacity:1,rotation:rotation*.3,scaleY:.7}]]);}
 polygon('plane-crease-light','Свет на ребре сгиба','M36 49.3L98 2L37 51Z','#b8caff',plane.id,470,240);
 polygon('plane-crease-dark','Тонкая линия перегиба','M46 90L48 64L98 2L48.6 64Z','#b69d80',plane.id,470,240);
 // Short fibre marks sit inside the broad upper wing, not over the captions.
 for(let i=0;i<6;i++){const x=60+i*32,y=45-i*4.2,n=q.shape('plane-fibre-'+i,x,y,46,1.2,'#8ea7ff',false,plane.id);n.name='След сгиба '+(i+1);n.transform.rotation=-8;n.transform.opacity=.38;}
 // Fibres appear after the fold settles and follow the plane group.
 for(let i=0;i<36;i++){let u=((i*37+17)%97)/100,v=((i*53+9)%89)/100;if(u+v>.94){u*=.48;v*=.48}const x=(2+96*u+34*v)*4.7,y=(16-14*u+34*v)*2.4,n=q.shape('paper-grain-'+i,x,y,3+i%5,1+i%3*.3,i%3===0?'#223c88':'#dbe4ed',false,plane.id);n.name='Бумажное волокно '+(i+1);n.transform.rotation=-12+i%4*9;q.keys(n,[[0,{opacity:0}],[288,{opacity:0}],[294,{opacity:.3}],[340,{opacity:.3}],[350,{opacity:0}],[599,{opacity:0}]]);}
 const scallop=()=>{let path='';for(let i=0;i<12;i++){const a=i*Math.PI/6,point=(angle:number,r:number)=>[50+Math.cos(angle)*r,50+Math.sin(angle)*r].map(v=>v.toFixed(3)).join(' ');if(!i)path='M'+point(a,41);path+='C'+point(a+Math.PI/18,49)+' '+point(a+Math.PI/9,49)+' '+point(a+Math.PI/6,41)}return path+'Z'};
 const seal=q.group('paper-seal',1280,825,320,320);seal.parentId='collage-board';seal.name='Бумажная печать · СВОЁ';seal.transform.pivotX=seal.transform.pivotY=160;
 q.keys(seal,[[0,{opacity:0,scaleX:.25,scaleY:.25,rotation:-15}],[350,{opacity:0,scaleX:.25,scaleY:.25,rotation:-15}],[364,{opacity:1,scaleX:1.06,scaleY:1.06,rotation:-4}],[374,{opacity:1,scaleX:1,scaleY:1,rotation:-3}],[599,{opacity:1,scaleX:1,scaleY:1,rotation:-3}]]);
 const sealShadow=polygon('seal-shadow','Контактная тень бумажной медали',scallop(),'#655c4c',seal.id,310,310,7,10);sealShadow.transform.opacity=.3;
 const back=polygon('seal-back','Оборотный слой бумаги',scallop(),'#cbbb9c',seal.id,310,310,6,11);back.transform.rotation=6;back.transform.pivotX=back.transform.pivotY=155;
 const face=polygon('seal-face','Высеченная бумага',scallop(),'#f1bea0',seal.id,310,310,0,0);face.transform.rotation=-3;face.transform.pivotX=face.transform.pivotY=155;
 q.shape('seal-inner-paper',40,40,230,230,paper,true,seal.id).name='Бумажная середина';
 const r1=q.shape('seal-registration',39,42,230,230,coral,true,seal.id,3);r1.name='Смещение красочного оттиска';r1.transform.opacity=.65;
 q.shape('seal-ink-ring',43,39,224,224,ink,true,seal.id,3).name='Контур оттиска';
 q.shape('seal-inner-ring',54,50,202,202,ink,true,seal.id,1).name='Тонкий печатный контур';
 const text=(id:string,value:string,y:number,size:number,color=ink)=>{const n=q.text(id,value,35,y,240,size*1.4,size,color,'Onest',seal.id,'center');n.name='Оттиск · '+value;if(n.kind==='text'){n.fontWeight=800;n.lineHeight=1}q.keys(n,[[0,{opacity:0}],[367,{opacity:0,rotation:-1}],[378,{opacity:1,rotation:0}],[599,{opacity:1,rotation:0}]]);return n};
 text('seal-caption-top','МАСТЕРСКАЯ',84,20);const mis=text('seal-word-register','СВОЁ',119,55,coral);mis.transform.x+=2;mis.transform.y+=2;mis.transformKeys?.forEach(k=>{k.transform.x+=2;k.transform.y+=2;k.transform.opacity*=.5});text('seal-word','СВОЁ',119,55);text('seal-caption-bottom','№ 03',196,18);
 polygon('seal-corner','Залом на краю печати','M75 82L95 70L91 94Z','#d99877',seal.id,310,310);
 polygon('seal-corner-light','Светлая грань залома','M75 82L95 70L84 87Z','#ffddbd',seal.id,310,310);
 for(let i=0;i<9;i++){const a=i*.73,x=155+Math.cos(a)*125,y=155+Math.sin(a)*125,n=q.shape('seal-fibre-'+i,x,y,2+i%2,1.3+i%3*.6,paper,true,seal.id);n.name='Фактура оттиска '+(i+1);n.transform.rotation=i*37;n.transform.opacity=.8;}
 for(let i=0;i<22;i++){const a=i*2.39996,x=155+Math.cos(a)*(i%2?111:101),y=153+Math.sin(a)*(i%2?111:101),n=q.shape('ink-wear-'+i,x,y,2+i%4,1+i%3*.6,paper,false,seal.id);n.name='Пробел в краске '+(i+1);n.transform.rotation=i*47;n.transform.opacity=.88;}
 for(let i=0;i<12;i++){const n=q.shape('ink-word-wear-'+i,77+i*13,146+(i*17)%25,1.4+i%3,1,paper,false,seal.id);n.name='Неровность печати '+(i+1);n.transform.rotation=i*23;n.transform.opacity=.55;}
 p.nodes.push(...q.nodes);p.effects.push(...q.effects);return p;
}
