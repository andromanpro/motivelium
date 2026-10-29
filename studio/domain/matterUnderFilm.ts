import {DemoFilm,type FilmResources} from './demoFilm.ts';import type {V3,CameraKey3d} from './model3d.ts';

/** 12 bars at 150 BPM. One continuous, editable camera; no invented engine internals. */
export function buildMatterUnderFilm(resources:FilmResources){
 const q=new DemoFilm('motivelium-matter-under-film','Материя · Под поверхностью',[{id:'under',name:'Под поверхностью',fromFrame:0,toFrame:576}],resources);
 q.bg('#070c12');const n=q.model('under-car',0,0,1920,1080);n.name='Автомобиль · кузов, колесо и конструкция';
 q.fx(n,'3d-studio-stage',{floor:'graphite',strength:1.15,isolate:false,lighting:'dramatic',groundPart:'gltf-85'});
 q.fx(n,'3d-finish',{glow:.025,exposure:1.10,contrast:1.05,vignette:.09});
 const pose=(frame:number,position:V3,rotation:V3=[0,0,0])=>({frame,position,rotation,scale:[1,1,1]as V3}),wheel:V3=[.8660254*.55,.06,.5*.55];
 const keys:Record<number,ReturnType<typeof pose>[]>={
  82:[pose(0,[0,0,0]),pose(24,[0,0,0]),pose(96,wheel),pose(168,wheel),pose(216,[0,0,0])],
  85:[pose(0,[0,0,0]),pose(24,[0,0,0]),pose(96,wheel),pose(168,wheel),pose(216,[0,0,0])],
  45:[pose(0,[0,0,0]),pose(180,[0,0,0]),pose(240,[0,.55,.12],[-8,0,0]),pose(396,[0,.55,.12],[-8,0,0]),pose(432,[0,0,0])],
  34:[pose(0,[0,0,0]),pose(204,[0,0,0]),pose(264,[0,.73,0]),pose(348,[0,.73,0]),pose(396,[0,0,0])],
  51:[pose(0,[0,0,0]),pose(192,[0,0,0]),pose(252,[-.52,.12,0],[0,0,-7]),pose(300,[-.52,.12,0],[0,0,-7]),pose(348,[0,0,0])],
  66:[pose(0,[0,0,0]),pose(192,[0,0,0]),pose(252,[.52,.12,0],[0,0,7]),pose(324,[.52,.12,0],[0,0,7]),pose(372,[0,0,0])],
 };
 n.parts3d=resources.parts!.map(p=>({id:p.id,name:p.name,label:'',visible:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],...(keys[p.sourceIndex!]?{keys:keys[p.sourceIndex!]}:{})}));
 // Centers measured from car-macro-study.glb (d41e113c...), normalized by the shared loader.
 const w:V3=[.6537725,-.0763534,.8462931],atWheel=(frame:number,relative:V3,fov:number):CameraKey3d=>({frame,position:relative.map((v,i)=>v+w[i]!)as V3,target:w,fov});
 n.camera3dKeys=[atWheel(0,[1.10,.40,1.25],34),atWheel(24,[1.04,.34,1.12],34),atWheel(60,[1.15,.33,.68],35),atWheel(108,[1.10,.30,-.25],36),atWheel(144,[1.06,.24,-.27],34),
  {frame:192,position:[2.35,1.4,3.05],target:[.30,.08,.5],fov:34},{frame:264,position:[3.3,2.7,3.1],target:[0,.30,.1],fov:36},{frame:336,position:[2.6,2.7,3.4],target:[0,.30,.1],fov:36},{frame:384,position:[2.9,1.2,4.0],target:[0,.2,0],fov:34},{frame:456,position:[3.3,1.6,4.2],target:[0,.1,.1],fov:34},{frame:504,position:[3.02,2.4,4.89],target:[-.78,.1,.69],fov:34},{frame:575,position:[2.9,2.34,4.7],target:[-.78,.1,.69],fov:34}];
 const head=q.text('under-label','МАТЕРИЯ / ПОД ПОВЕРХНОСТЬЮ',86,66,1500,36,19,'#a5bbc8','Onest');q.keys(head,[[0,{opacity:1}],[120,{opacity:1}],[144,{opacity:0}],[575,{opacity:0}]]);
 const shade=q.generator('under-title-shade','isf-linear-gradient',0,0,1250,1080,1,{offset:.5,frequency:1,curve:1,vertical:false,startColor:'#071420de',endColor:'#07142000'});shade.name='Мягкое затемнение под финальным заголовком';q.keys(shade,[[0,{opacity:0}],[456,{opacity:0}],[480,{opacity:1}],[575,{opacity:1}]]);
 const title=q.text('under-title','МАТЕРИЯ',95,355,610,125,82,'#e7eff2','Unbounded');q.keys(title,[[0,{opacity:0,x:75}],[456,{opacity:0,x:75}],[480,{opacity:1,x:95}],[575,{opacity:1,x:95}]]);
 const sub=q.text('under-subtitle','3D · материалы · движение',100,494,590,50,25,'#9fb7c5','Onest');q.keys(sub,[[0,{opacity:0}],[468,{opacity:0}],[492,{opacity:1}],[575,{opacity:1}]]);
 q.text('under-credit','Car Concept · Unity Fan / Eric Chadwick / DGG · CC BY 4.0 · производная',86,1000,1600,34,16,'#7c929e','Onest');q.cam(0,960,540,1);q.cam(575,960,540,1);
 const p=q.finish();p.audioTracks=[];
 if(resources.assets.some(a=>a.id==='asset-under-score')){
  p.audioTracks.push({id:'under-score',kind:'music',assetId:'asset-under-score',gain:.96,offsetSeconds:0,mute:false,clip:{sourceStartSeconds:0,durationSeconds:19.2,fadeInSeconds:.04,fadeOutSeconds:.6,pan:0,duckMusicDb:0}});
  for(const [i,frame]of [48,180,300].entries())p.audioTracks.push({id:'under-sweep-'+i,kind:'sfx',assetId:'asset-under-sweep',gain:.24,offsetSeconds:frame/30-.08,mute:false});
  for(const [i,frame]of [348,372,396,432].entries())p.audioTracks.push({id:'under-lock-'+i,kind:'sfx',assetId:'asset-under-lock',gain:i===3?.40:.24,offsetSeconds:frame/30,mute:false});
 }
 p.cues=[{id:'under-material',frame:0,kind:'mark',trackId:null,label:'Материал'},{id:'under-wheel',frame:108,kind:'mark',trackId:null,label:'Под поверхностью'},{id:'under-structure',frame:264,kind:'mark',trackId:null,label:'Конструкция'},{id:'under-assembly',frame:300,kind:'mark',trackId:null,label:'Сборка'},{id:'under-hero',frame:504,kind:'mark',trackId:null,label:'Материя'}];return p;
}
