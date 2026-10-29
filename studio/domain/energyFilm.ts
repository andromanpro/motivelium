import {DemoFilm,type FilmResources} from './demoFilm.ts';
export function buildEnergyFilm(resources:FilmResources){
 const q=new DemoFilm('motivelium-energy-film','Разряд · свет обретает скорость',[
  {id:'energy-charge',name:'Импульс',fromFrame:0,toFrame:160},
  {id:'energy-swarm',name:'Разлёт и след',fromFrame:160,toFrame:320,transition:{shaderId:'gl-crosszoom',durationFrames:12,params:{}}},
  {id:'energy-warp',name:'Сквозь пространство',fromFrame:320,toFrame:480,transition:{shaderId:'gl-directionalwarp',durationFrames:12,params:{}}},
  {id:'energy-focus',name:'Собрать энергию',fromFrame:480,toFrame:640,transition:{shaderId:'gl-circleopen',durationFrames:14,params:{}}},
 ],resources);const cyan='#8bfff0',pink='#ff78ca',gold='#ffd58c';
 q.bg();q.generator('charge-haze','radiant-aurora-veil',-180,-100,2280,1280,.35,{u_auroraIntensity:.7,u_auroraSpeed:.4});q.hud(1,'ИМПУЛЬС');
 for(let i=0;i<38;i++){const a=i*Math.PI*2/38,r=180+(i%5)*55,n=q.shape('charge-arc-'+i,1230+Math.cos(a)*r,535+Math.sin(a)*r,4+i%3*2,22+i%4*8,i%3?cyan:pink);n.transform.rotation=i*360/38;q.fx(n,'orbit-motion',{radiusX:25,radiusY:35,cycles:1,phase:i*360/38});q.fx(n,'neon-aura',{strength:.5});q.keys(n,[[0,{opacity:.3}],[35+i%12,{opacity:1}],[130,{opacity:1}],[159,{opacity:.2}]])}
 const seed=q.shape('charge-seed',1100,405,260,260,cyan);q.fx(seed,'contour-morph',{from:'circle',to:'bolt',delay:.1,span:.55});q.fx(seed,'neon-aura',{strength:.8});q.keys(seed,[[0,{scaleX:.35,scaleY:.35}],[36,{scaleX:1,scaleY:1}],[125,{scaleX:1,scaleY:1}],[159,{scaleX:2.8,scaleY:2.8,opacity:0}]]);seed.transform.pivotX=seed.transform.pivotY=130;seed.transformKeys?.forEach(k=>{k.transform.pivotX=k.transform.pivotY=130});
 const title=q.text('charge-title','Достаточно\nодной искры.',120,320,900,340,99);q.fx(title,'glyph-motion',{mode:'assemble',amplitude:32,rotation:12,stagger:.3},0,55);q.fx(title,'fade-exit',{span:.18,dx:-40,dy:0});q.text('charge-note','СВЕТ / ЧАСТИЦЫ / СКОРОСТЬ',126,932,1500,50,26,cyan,'Onest');
 q.cam(0,1060,530,1.22,-3);q.cam(65,960,540,1,0);q.cam(142,1000,540,1.06,0);q.cam(159,1130,540,1.45,2);q.accent(25,'chime');q.accent(150,'sweep');
 q.scene=q.sequences[1]!;q.bg();q.generator('swarm-light','radiant-laser-labyrinth',-120,-70,2160,1220,.38,{u_intensity:.7,u_sweep:.6});q.hud(2,'РАЗЛЁТ И СЛЕД');
 for(let i=0;i<96;i++){const n=q.shape('burst-'+i,960,540,i%4?5:18,i%4?5:3,[cyan,pink,gold][i%3]!,i%4!==0);q.fx(n,'radial-burst',{angle:(i*137.508)%360,distance:440+(i%13)*55,gravity:40,span:.6,delay:0});q.fx(n,'neon-aura',{strength:.5})}
 for(let i=0;i<3;i++){const n=q.shape('comet-'+i,0,0,17,17,[cyan,pink,gold][i]!,true);q.keys(n,Array.from({length:13},(_,k)=>{const a=k/12*Math.PI*2+i*2.1;return[160+Math.round(k/12*159),{x:960+Math.cos(a)*670,y:540+Math.sin(a*1.4)*270}] as [number,{x:number;y:number}]}));q.fx(n,'motion-memory',{copies:7,spacing:3,decay:.72});q.fx(n,'neon-aura',{strength:.8})}
 const trail=q.text('swarm-title','ОСТАВЬ\nСЛЕД.',120,338,1050,400,120);q.fx(trail,'mask-wipe',{delay:.25,span:.22});q.text('swarm-note','ТРАЕКТОРИИ ПОМНЯТ ДВИЖЕНИЕ.',126,932,1500,50,26,cyan,'Onest');q.cam(160,960,540,.9,1);q.cam(225,960,540,1,0);q.cam(290,980,530,1.04,-1);q.cam(319,960,540,1.18,0);q.accent(160,'impact',.1);
 q.scene=q.sequences[2]!;q.bg();q.generator('event-horizon','radiant-event-horizon',-150,-90,2220,1260,1,{u_diskIntensity:1.35,u_rotationSpeed:.65,u_tilt:.45,u_chromatic:.18});q.hud(3,'ПРОХОД ЧЕРЕЗ ПРОСТРАНСТВО');
 for(let i=0;i<46;i++){const a=i*2.399,r=180+i*15,n=q.shape('warp-speck-'+i,960+Math.cos(a)*r,530+Math.sin(a)*r*.55,2+i%3,7+i%7,cyan);n.transform.rotation=(i*137)%360;q.keys(n,[[320,{opacity:0,scaleY:.2}],[365,{opacity:.7,scaleY:1}],[479,{opacity:0,scaleY:4}]])}
 const matte=q.shape('warp-matte',80,820,1760,200,'#07111c');matte.transform.opacity=.8;q.fx(matte,'fade-exit',{span:.25,dy:0});const warp=q.text('warp-title','И НЕ СБАВЛЯЙ.',130,850,1660,140,89);q.fx(warp,'glyph-motion',{mode:'wave',amplitude:7,cycles:1,rotation:1});q.fx(warp,'fade-exit',{span:.25,dy:0});q.cam(320,960,530,.88,0);q.cam(400,950,530,1.05,4);q.cam(479,960,540,1.65,10);q.accent(323,'sweep',.12);
 q.scene=q.sequences[3]!;q.bg();const caustic=q.generator('focus-caustic','radiant-diamond-caustics',1120,220,640,640,.9,{u_brilliance:1.2,u_rotationSpeed:.8});q.fx(caustic,'contour-window',{from:'circle',to:'hexagon',span:.55,delay:0});
 for(let i=0;i<16;i++){const n=q.shape('focus-rays-'+i,1440,540,310,2,i%2?pink:cyan);n.transform.rotation=i*22.5;n.transform.pivotX=0;n.transform.pivotY=1;q.fx(n,'spin-turn',{turns:.08});q.keys(n,[[480,{opacity:0,scaleX:.1}],[530,{opacity:.45,scaleX:1}],[639,{opacity:.1,scaleX:.7}]])}
 q.hud(4,'ЭНЕРГИЯ ПОД КОНТРОЛЕМ');q.text('energy-finale','РАЗРЯД',125,355,970,190,130,'#f4f3e9','Rubik Mono One');const sub=q.text('energy-final-sub','Энергия —\nв твоих руках.',135,599,1000,230,75,cyan,'Literata Italic');q.fx(sub,'fade-slide',{delay:.04,span:.08,dy:0,blur:0});q.text('energy-footer','Редактируй любой слой. Даже эту искру.',135,941,1620,55,28,'#b1c9d4','Onest');q.cam(480,960,540,.94,-2);q.cam(535,960,540,1,0);q.cam(639,960,540,1.025,0);q.accent(480,'chime',.11);
 // Reading planes clear before the camera accelerates; no cropped half-words.
 const t=q.nodes.find(n=>n.id==='charge-title')!;q.keys(t,[[0,{opacity:1}],[110,{opacity:1}],[130,{opacity:0}],[159,{opacity:0}]]);
 const note=q.nodes.find(n=>n.id==='charge-note')!;q.keys(note,[[0,{opacity:0}],[48,{opacity:1}],[110,{opacity:1}],[130,{opacity:0}],[159,{opacity:0}]]);
 const word=q.nodes.find(n=>n.id==='swarm-title')!;q.keys(word,[[160,{opacity:1}],[283,{opacity:1}],[305,{opacity:0}],[319,{opacity:0}]]);
 const swarmNote=q.nodes.find(n=>n.id==='swarm-note')!;q.keys(swarmNote,[[160,{opacity:1}],[283,{opacity:1}],[305,{opacity:0}],[319,{opacity:0}]]);
 const p=q.finish(.45);p.nodes=p.nodes.filter(n=>!n.id.startsWith('folio-')&&!n.id.startsWith('brand-'));return p;
}
