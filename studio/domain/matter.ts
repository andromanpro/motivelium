import type {Project,SceneNode,Transform,EffectInstance,Scene3dNode} from './schema.ts';
export const MATTER_PREFIX='motivelium-matter',MATTER_AUDIO_ID='asset-matter-score',MATTER_FRAMES=960;
const tr=(v:Partial<Transform>={}):Transform=>({x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,pivotX:0,pivotY:0,...v}),ink='#050a12',white='#f1f7f3',mint='#8affdc',orange='#ffae69';
export function buildMatter(meta:{sha256:string;bytes:number}):Project{
 const sequences:Project['sequences']=[{id:'matter-flow',name:'Поток',fromFrame:0,toFrame:192},{id:'matter-memory',name:'След',fromFrame:192,toFrame:384},{id:'matter-light',name:'Свет',fromFrame:384,toFrame:576},{id:'matter-device',name:'Устройство',fromFrame:576,toFrame:816},{id:'matter-final',name:'Собрано',fromFrame:816,toFrame:960}],nodes:SceneNode[]=[],effects:EffectInstance[]=[];let scene=sequences[0]!;
 const base=(id:string,name:string,x:number,y:number,w:number,h:number)=>({id,name,sequenceId:scene.id,parentId:null,geometry:{width:w,height:h},transform:tr({x,y}),visible:true,locked:false});
 const rect=(id:string,name:string,x:number,y:number,w:number,h:number,fill:string,ellipse=false)=>{nodes.push({...base(id,name,x,y,w,h),kind:'shape',shape:ellipse?'ellipse':'rect',fill});return nodes.at(-1)!;};
 const text=(id:string,name:string,value:string,x:number,y:number,w:number,h:number,size=96,color=white,font='Arial Black',align:'left'|'center'|'right'='left')=>{nodes.push({...base(id,name,x,y,w,h),kind:'text',text:value,fontFamily:font,fontSize:size,color,align,lineHeight:1.02});return nodes.at(-1)!;};
 const model=(id:string,name:string,preset:Scene3dNode['preset'],x:number,y:number,w:number,h:number,spin=20)=>{nodes.push({...base(id,name,x,y,w,h),kind:'scene3d',adapter:'three',preset,spin,explode:0});return nodes.at(-1)! as Scene3dNode;};
 const fx=(node:SceneNode,id:string,params:EffectInstance['params'],order=1,from=scene.fromFrame,to=scene.toFrame)=>effects.push({id:'fx-'+node.id+'-'+id,definitionId:id,definitionVersion:1,targetId:node.id,params,order,fromFrame:from,toFrame:to,enabled:true});
 const hud=(n:number,title:string)=>{text('label-'+n,'Название сцены',String(n).padStart(2,'0')+' / '+title,120,76,1300,60,25,mint,'Consolas');text('wordmark-'+n,'Название мастерской','motivelium.',1450,76,350,60,26,white,'Consolas','right');};
 const bg=()=>rect(scene.id+'-bg','Фон сцены',-300,-300,2520,1680,ink);
 // 01. A real colour field, broad negative space, large tactile typography.
 const flow=rect('flow-field','Цветные течения',0,0,1920,1080,ink);fx(flow,'fluid-ink',{speed:.8,swirl:1.8,retention:.985,palette:-12,seed:415,mix:1});hud(1,'ЦВЕТ В ДВИЖЕНИИ');
 const title=text('flow-title','Течёт','ТЕЧЁТ.',120,345,1690,360,295);
 text('flow-note','Подпись потока','НИ ОДНОГО СЛУЧАЙНОГО КАДРА.',130,898,1550,65,37,white,'Consolas');
 for(let i=0;i<3;i++){const node=rect('flow-rule-'+i,'Световая полоса',132,1007+i*9,160+i*70,2,i===0?orange:mint);fx(node,'fade-slide',{dx:-100-i*30,dy:0,delay:i*.06,span:.2,blur:0});}
 // 02. Historical poses make actual curved trails; individual objects remain editable.
 scene=sequences[1]!;bg();hud(2,'ДВИЖЕНИЕ ПОМНИТ');
 for(let i=0;i<7;i++){
  const size=34+i*9,node=rect('memory-orb-'+i,'Орбита со следом '+(i+1),0,0,size,size,[mint,orange,'#c799ff'][i%3]!,true);node.transform.pivotX=node.transform.pivotY=size/2;
  node.transformKeys=Array.from({length:9},(_,k)=>{const a=k/8*Math.PI*2+i*.42;return{frame:scene.fromFrame+Math.round(k/8*191),easing:'smooth' as const,transform:tr({x:960+Math.cos(a)*(520+i*27)-size/2,y:535+Math.sin(a*1.5+i*.25)*(225+i*12)-size/2,pivotX:size/2,pivotY:size/2,scaleX:.8+k*.04,scaleY:.8+k*.04})};});
  fx(node,'motion-memory',{copies:7,spacing:3+i%3,decay:.72});fx(node,'neon-aura',{strength:.55},5);
 }
 const memory=text('memory-title','Остаётся','ОСТАЁТСЯ.',180,407,1560,230,184,white,'Arial Black','center');fx(memory,'fade-slide',{dy:35,span:.12,blur:5});
 text('memory-note','Подпись следа','СЛЕД ЕСТЬ. ТОРМОЗОВ НЕТ.',180,934,1560,70,34,mint,'Consolas','center');
 // 03. Image-space scattering from a real reflective 3D source.
 scene=sequences[2]!;bg();
 const light=model('light-core','Источник световых лучей','neon-reactor',630,80,1270,1030,36);light.explode=.15;fx(light,'light-shafts',{strength:1.65,lightX:.52,lightY:.52,spread:.95,decay:.986,threshold:.4});
 hud(3,'СВЕТ ПРОХОДИТ');text('light-title','Свет есть','СВЕТ\nЕСТЬ.',120,312,900,500,206);text('light-note','Подпись света','ОТ СИЛУЭТА — ДО ЛУЧА.',130,920,1150,65,34,mint,'Consolas');
 // 04. Assembly with real fasteners, traces, ports and a transparent cover.
 scene=sequences[3]!;bg();const device=model('matter-device-model','Разборное устройство','anatomy-device',610,30,1300,1010,22);fx(device,'assembly-spread',{amount:1,delay:.03,span:.92});fx(device,'light-shafts',{strength:.3,lightX:.55,lightY:.52,spread:.75,decay:.97,threshold:.75},2);
 hud(4,'ВСЁ ПО МЕСТАМ');text('device-title','До винтика','ДО\nВИНТИКА.',120,350,950,430,139);text('device-note','Подпись устройства','РАЗОБРАЛИ. ПОНЯЛИ. СОБРАЛИ.',130,929,1600,65,33,mint,'Consolas');
 for(let i=0;i<3;i++){const n=rect('device-index-'+i,'Метка устройства',140,770+i*28,90+i*45,3,[mint,orange,white][i]!);fx(n,'fade-slide',{dx:-80,dy:0,span:.25,delay:i*.07,blur:0});}
 // 05. Restrained hero finish; no empty black tail.
 scene=sequences[4]!;const end=rect('final-flow','Финальный поток',0,0,1920,1080,ink);fx(end,'fluid-ink',{speed:.5,swirl:1.2,retention:.984,palette:30,seed:712,mix:.6});hud(5,'МАТЕРИЯ');
 text('matter-final-title','Материя','МАТЕРИЯ.',120,330,1680,330,240,white,'Arial Black','center');text('matter-final-note','Финальная подпись','УЖЕ В СТУДИИ.',180,712,1560,115,74,mint,'Consolas','center');
 for(let i=0;i<4;i++)text('final-capability-'+i,'Возможность '+i,['ПОТОК','ПАМЯТЬ','СВЕТ','УСТРОЙСТВО'][i]!,170+i*420,946,370,60,24,i%2?orange:mint,'Consolas','center');
 for(const [i,id]of [[1,'gl-displacement'],[2,'gl-dreamy'],[3,'gl-cube'],[4,'gl-swirl']]as const)sequences[i]!.transition={shaderId:id,durationFrames:12,params:{}};
 const asset={id:MATTER_AUDIO_ID,path:'assets/matter-150.wav',mime:'audio/wav',sha256:meta.sha256,bytes:meta.bytes,durationSeconds:32,origin:'generated' as const,title:'Материя · оригинальный брейкбит ·150 BPM'};
 return{schemaVersion:2,id:MATTER_PREFIX,revision:1,title:'Материя — потоки, свет и устройство',size:{width:1920,height:1080},fps:{num:30,den:1},durationFrames:MATTER_FRAMES,seed:20261015,assets:[asset],nodes,effects,sequences,cameraTracks:[{id:'matter-camera',name:'Крупность и движение',keys:[{frame:0,cx:960,cy:540,zoom:1,rotation:0},{frame:191,cx:1000,cy:540,zoom:1.06,rotation:0},{frame:192,cx:960,cy:540,zoom:1,rotation:0},{frame:383,cx:960,cy:540,zoom:1.025,rotation:0},{frame:384,cx:960,cy:540,zoom:1,rotation:0},{frame:575,cx:1000,cy:540,zoom:1.04,rotation:0},{frame:576,cx:960,cy:540,zoom:1,rotation:0},{frame:815,cx:960,cy:540,zoom:1.02,rotation:0},{frame:816,cx:960,cy:540,zoom:1,rotation:0},{frame:959,cx:960,cy:540,zoom:1.025,rotation:0}]}],audioTracks:[{id:'matter-music',kind:'music',assetId:MATTER_AUDIO_ID,gain:.75,offsetSeconds:0,mute:false}],cues:[...Array.from({length:80},(_,i)=>({id:'matter-beat-'+i,trackId:'matter-music',frame:i*12,kind:'beat' as const,label:String(i+1)})),...sequences.map((s,i)=>({id:'matter-scene-'+i,trackId:null,frame:s.fromFrame,kind:'mark' as const,label:s.name}))]};
}
