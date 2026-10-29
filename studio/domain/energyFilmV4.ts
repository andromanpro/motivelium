import{DemoFilm,type FilmResources}from'./demoFilm.ts';
/** The discharge is the action. Reading beats clear before camera acceleration. */
export function buildEnergyFilm(resources:FilmResources){
 const q=new DemoFilm('motivelium-energy-film-v4','Разряд · между двумя контактами',[
  {id:'charge',name:'Напряжение',fromFrame:0,toFrame:120},
  {id:'breakdown',name:'Пробой',fromFrame:120,toFrame:240,transition:{shaderId:'gl-crosszoom',durationFrames:10,params:{}}},
  {id:'branches',name:'Цепная реакция',fromFrame:240,toFrame:360,transition:{shaderId:'gl-directionalwarp',durationFrames:10,params:{}}},
  {id:'control',name:'Энергия под контролем',fromFrame:360,toFrame:480,transition:{shaderId:'gl-circleopen',durationFrames:10,params:{}}}
 ],resources);const blue='#87eaff',ivory='#eef9ff',orange='#ffb379';
 const field=(id:string,palette='ion',branches=7,width=2.5,startX=.18,endX=.82)=>{const n=q.shape(id,0,0,1920,1080,blue);q.fx(n,'electric-arc',{startX,startY:.52,endX,endY:.47,branches,width,roughness:.95,power:1,speed:.85,seed:73+q.scene.fromFrame,palette});return n};
 const room=(index:number)=>{q.bg('#040912');q.generator('haze-'+index,'radiant-aurora-veil',-200,-100,2320,1280,.12,{u_auroraIntensity:.45,u_auroraSpeed:.12});
  for(let i=0;i<18;i++){const n=q.shape('rail-'+index+'-'+i,-100,170+i*47,2150,1,'#172a3a');n.transform.opacity=.28;}
  for(let i=0;i<8;i++){q.shape('grid-'+index+'-'+i,120+i*240,0,1,1080,'#10202e');q.text('coord-'+index+'-'+i,String(i*125).padStart(4,'0'),133+i*240,945,120,28,16,'#496578','Onest');}
 };
 const terminal=(id:string,x:number,y:number,side:number)=>{
  const g=q.group(id,x,y,370,400);q.shape(id+'-mount',-170*side-70,-210,140,420,'#17212c',false,g.id);q.shape(id+'-edge',-170*side-68,-206,4,410,'#527181',false,g.id);
  for(let i=0;i<13;i++){const xx=-side*(65+i*11),fill=['#223140','#a7bac2','#344655','#111e2c'][i%4]!;q.shape(id+'-fin-'+i,xx-7,-150+(i%2)*5,14,300-(i%2)*10,fill,false,g.id);}
  q.shape(id+'-core',side===1?-92:0,-47,92,94,'#8396a1',false,g.id);q.shape(id+'-glint',side===1?-92:0,-45,92,5,'#d9eef2',false,g.id);q.shape(id+'-tip',-8,-24,16,48,'#b8e3eb',false,g.id);
  for(const yy of[-175,175])for(const xx of[-170*side-37,-170*side+37]){q.shape(id+'-bolt-'+xx+'-'+yy,xx-7,yy-7,14,14,'#5a6d7b',true,g.id);q.shape(id+'-slot-'+xx+'-'+yy,xx-5,yy-1,10,2,'#0a131c',false,g.id)}
  const glow=q.shape(id+'-halo',-18,-30,36,60,blue,true,g.id);q.fx(glow,'neon-aura',{strength:.65});q.keys(glow,[[q.scene.fromFrame,{opacity:.1}],[q.scene.fromFrame+36,{opacity:.7}],[q.scene.toFrame-1,{opacity:.85}]]);return g;
 };
 const reading=(id:string,text:string,from:number,to:number,x=105,y=820,size=70)=>{const n=q.text(id,text,x,y,1640,180,size,ivory,'Unbounded');q.keys(n,[[q.scene.fromFrame,{opacity:0}],[from,{opacity:0}],[from+7,{opacity:1}],[to-7,{opacity:1}],[to,{opacity:0}],[q.scene.toFrame-1,{opacity:0}]]);return n};
 room(1);terminal('cathode',346,562,1);terminal('anode',1574,508,-1);const initial=field('charge-channel','ion',5,1.6);q.keys(initial,[[0,{opacity:0}],[24,{opacity:.08}],[52,{opacity:.32}],[84,{opacity:1}],[119,{opacity:1}]]);
 reading('quiet','Тише. Сейчас пробьёт.',12,78,110,805,62);q.cam(0,920,540,1.05,-1);q.cam(70,960,540,1,0);q.cam(119,950,540,1.42,2);q.accent(72,'chime',.07);q.accent(116,'sweep',.075);
 q.scene=q.sequences[1]!;room(2);terminal('break-cathode',250,562,1);terminal('break-anode',1670,508,-1);const arc=field('breakdown-channel','ion',10,3.1,.13,.87);q.fx(arc,'motion-memory',{copies:2,spacing:2,decay:.22});
 for(let i=0;i<24;i++){const n=q.shape('spark-'+i,960,540,2+i%3,2+i%3,i%3?blue:orange,true);q.fx(n,'radial-burst',{angle:(i*137.5)%360,distance:250+i%8*70,gravity:50,delay:0,span:.9});q.fx(n,'neon-aura',{strength:.6});}
 reading('strike','ПРОБОЙ.',133,186,105,795,88);q.cam(120,960,540,.98,0);q.cam(180,960,540,1.1,-1);q.cam(239,960,530,1.62,-4);q.accent(121,'impact',.085);q.accent(230,'sweep',.07);
 q.scene=q.sequences[2]!;room(3);q.generator('reaction-field','radiant-event-horizon',-80,-60,2080,1200,.28,{u_diskIntensity:.55,u_rotationSpeed:.2,u_tilt:.25});
 const main=field('reaction-main','violet',9,2.4,.08,.92);q.keys(main,[[240,{rotation:-8}],[300,{rotation:0}],[359,{rotation:8}]]);
 const cross=field('reaction-cross','ion',5,1.8,.19,.81);cross.transform.rotation=-27;cross.transform.pivotX=960;cross.transform.pivotY=540;cross.transform.opacity=.6;
 reading('chain','Уже не остановить.',255,307,105,830,62);q.cam(240,960,540,.93,4);q.cam(300,970,530,1.08,0);q.cam(359,1030,530,1.46,-5);q.accent(241,'chime',.065);
 q.scene=q.sequences[3]!;room(4);terminal('final-cathode',250,390,1);terminal('final-anode',1670,336,-1);const final=field('controlled-channel','ion',5,2.3,.13,.87);final.transform.y=-172;
 const title=q.text('final-title','РАЗРЯД',105,645,1710,200,146,ivory,'Rubik Mono One',null,'center');q.fx(title,'glyph-motion',{mode:'assemble',amplitude:22,rotation:6,stagger:.15},360,389);q.text('final-caption','Сначала укроти. Потом редактируй.',105,900,1710,70,37,blue,'Literata Italic',null,'center');
 q.cam(360,960,510,.96,-1);q.cam(410,960,540,1,0);q.cam(479,960,540,1,0);q.accent(367,'chime',.075);return q.finish(.38);
}
