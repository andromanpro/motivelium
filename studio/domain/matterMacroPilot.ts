import {DemoFilm,type FilmResources} from './demoFilm.ts';import type {V3} from './model3d.ts';
/** A five-second material basis: attached brake, body context and a short reveal. */
export function buildMatterMacroPilot(resources:FilmResources){
 const q=new DemoFilm('motivelium-matter-macro-pilot','Материя · Направленный свет · проба',[{id:'macro',name:'Под поверхностью',fromFrame:0,toFrame:150}],resources);
 q.bg('#070c12');const n=q.model('macro-wheel',0,0,1920,1080);n.name='Колесо и автомобиль · предметная проба';n.cameraTargetPart='gltf-84';
 q.fx(n,'3d-studio-stage',{floor:'graphite',strength:1.15,isolate:false,lighting:'dramatic',groundPart:'gltf-85'});
 q.fx(n,'3d-finish',{glow:.025,exposure:1.10,contrast:1.05,vignette:.09});
 const offset:V3=[.8660254*.55,.06,.5*.55],pose=(frame:number,position:V3)=>({frame,position,rotation:[0,0,0]as V3,scale:[1,1,1]as V3});
 n.parts3d=resources.parts!.map(p=>({id:p.id,name:p.name,label:'',visible:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],...([82,85].includes(p.sourceIndex!)?{keys:[pose(0,[0,0,0]),pose(15,[0,0,0]),pose(69,offset),pose(96,offset),pose(149,[0,0,0])]}:{})}));
 n.camera3dKeys=[{frame:0,position:[1.10,.40,1.25],target:[0,0,0],fov:34},{frame:35,position:[1.15,.33,.78],target:[0,0,0],fov:35},{frame:78,position:[1.10,.30,-.25],target:[0,0,0],fov:36},{frame:96,position:[1.08,.26,-.30],target:[0,0,0],fov:36},{frame:149,position:[1.65,.72,1.85],target:[0,0,0],fov:36}];
 q.text('macro-label','МАТЕРИЯ / ПОД ПОВЕРХНОСТЬЮ',86,66,1500,36,19,'#a5bbc8','Onest');
 q.text('macro-credit','Car Concept · Unity Fan / Eric Chadwick / DGG · CC BY 4.0 · производная',86,1000,1600,34,16,'#7c929e','Onest');q.cam(0,960,540,1);q.cam(149,960,540,1);
 const p=q.finish();p.audioTracks=[];p.cues=[{id:'macro-context',frame:0,kind:'mark',trackId:null,label:'Контекст'},{id:'macro-reveal',frame:69,kind:'mark',trackId:null,label:'Раскрытие'},{id:'macro-metal',frame:96,kind:'mark',trackId:null,label:'Материал'},{id:'macro-back',frame:149,kind:'mark',trackId:null,label:'Целое'}];return p;
}
