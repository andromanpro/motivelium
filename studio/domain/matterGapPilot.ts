import{DemoFilm,type FilmResources}from'./demoFilm.ts';
import type{V3}from'./model3d.ts';

/** A short material test: the tire and rim leave the brake assembly in place. */
export function buildMatterGapPilot(resources:FilmResources){
 const q=new DemoFilm('motivelium-matter-gap-pilot','Материя · Зазор · проба',[{id:'gap',name:'Зазор',fromFrame:0,toFrame:150}],resources);
 q.bg('#080e14');const n=q.model('wheel-study',0,0,1920,1080);n.name='Переднее колесо · обод, шина и тормозной узел';n.cameraTargetPart='gltf-81';
 q.fx(n,'3d-studio-stage',{floor:'graphite',strength:1.65,isolate:true});q.fx(n,'3d-finish',{glow:.025,exposure:1.07,contrast:1,vignette:.07});
 const axis:V3=[.8660254,0,.5],offset:V3=axis.map(v=>v*.9)as V3;
 n.parts3d=resources.parts!.map(p=>({id:p.id,name:p.name,label:'',visible:[0,1,81,82,83,84,85].includes(p.sourceIndex!),position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],...([82,85].includes(p.sourceIndex!)?{keys:[{frame:0,position:[0,0,0]as V3,rotation:[0,0,0]as V3,scale:[1,1,1]as V3},{frame:18,position:[0,0,0]as V3,rotation:[0,0,0]as V3,scale:[1,1,1]as V3},{frame:72,position:offset,rotation:[20,0,0]as V3,scale:[1,1,1]as V3},{frame:102,position:offset,rotation:[38,0,0]as V3,scale:[1,1,1]as V3},{frame:149,position:[0,0,0]as V3,rotation:[0,0,0]as V3,scale:[1,1,1]as V3}]}:{})}));
 n.camera3dKeys=[{frame:0,position:[1.25,.7,1.1],target:[0,0,0],fov:28},{frame:72,position:[.5,.75,1.6],target:[0,0,0],fov:28},{frame:102,position:[.4,.75,1.6],target:[0,0,0],fov:28},{frame:149,position:[1.25,.7,1.1],target:[0,0,0],fov:28}];
 q.text('study-label','МАТЕРИЯ / ЗАЗОР',86,66,1500,36,19,'#b6c6cd','Onest');q.text('study-credit','Car Concept · Unity Fan / Eric Chadwick / DGG · CC BY 4.0',86,1000,1600,34,16,'#8797a0','Onest');q.cam(0,960,540,1);q.cam(149,960,540,1);
 const p=q.finish();p.audioTracks=[];p.cues=[{id:'cue-closed',frame:0,kind:'mark',trackId:null,label:'Собрано'},{id:'cue-gap',frame:72,kind:'mark',trackId:null,label:'Зазор'},{id:'cue-material',frame:102,kind:'mark',trackId:null,label:'Материал'},{id:'cue-back',frame:149,kind:'mark',trackId:null,label:'Обратно'}];return p;
}
