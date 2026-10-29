import type {Project,SceneNode,Sequence,Transform,EffectInstance,AssetRef,Scene3dNode,CameraKey,AudioTrack} from './schema.ts';
import type {PartDescriptor} from './model3d.ts';
export type FilmResources={assets:AssetRef[];parts?:PartDescriptor[]};
export const filmTransform=(v:Partial<Transform>={}):Transform=>({x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,pivotX:0,pivotY:0,...v});
export class DemoFilm{
 nodes:SceneNode[]=[];effects:EffectInstance[]=[];camera:CameraKey[]=[];scene:Sequence;tracks:AudioTrack[]=[];
 id:string;title:string;sequences:Sequence[];resources:FilmResources;
 constructor(id:string,title:string,sequences:Sequence[],resources:FilmResources){this.id=id;this.title=title;this.sequences=sequences;this.resources=resources;this.scene=sequences[0]!}
 base(id:string,name:string,x:number,y:number,w:number,h:number,parentId:string|null=null){return{id,name,sequenceId:this.scene.id,parentId,geometry:{width:w,height:h},transform:filmTransform({x,y}),visible:true,locked:false}}
 shape(id:string,x:number,y:number,w:number,h:number,fill:string,ellipse=false,parentId:string|null=null,stroke?:number){const n:SceneNode={...this.base(id,id,x,y,w,h,parentId),kind:'shape',shape:ellipse?'ellipse':'rect',fill,...(stroke?{fillOpacity:0,stroke:fill,strokeWidth:stroke}:{})};this.nodes.push(n);return n}
 text(id:string,text:string,x:number,y:number,w:number,h:number,size=60,color='#f7f4e9',font='Unbounded',parentId:string|null=null,align:'left'|'center'|'right'='left'){
  const n:SceneNode={...this.base(id,text,x,y,w,h,parentId),kind:'text',text,fontFamily:font,fontWeight:font==='Unbounded'?700:400,fontSize:size,color,align,lineHeight:1.08};this.nodes.push(n);return n;
 }
 group(id:string,x:number,y:number,w:number,h:number,rotation=0){const n:SceneNode={...this.base(id,id,x,y,w,h),kind:'group'};n.transform.rotation=rotation;this.nodes.push(n);return n}
 image(id:string,assetId:string,x:number,y:number,w:number,h:number,parentId:string|null=null){const n:SceneNode={...this.base(id,id,x,y,w,h,parentId),kind:'image',assetId,fit:'cover'};this.nodes.push(n);return n}
 generator(id:string,shaderId:string,x=0,y=0,w=1920,h=1080,opacity=1,params:Record<string,number|boolean|string>={}){const n=this.shape(id,x,y,w,h,'#050915');if(n.kind==='shape')n.generator={shaderId,params,speed:1,hue:0};n.transform.opacity=opacity;return n}
 model(id:string,x:number,y:number,w:number,h:number){const asset=this.resources.assets.find(a=>a.mime.startsWith('model/'))!;const n:Scene3dNode={...this.base(id,asset.title??'Предметная модель',x,y,w,h),kind:'scene3d',adapter:'three',preset:'imported-model',spin:0,explode:0,model:{assetId:asset.id,parts:this.resources.parts!}};this.nodes.push(n);return n}
 fx(n:SceneNode,id:string,params:EffectInstance['params']={},from=this.scene.fromFrame,to=this.scene.toFrame){this.effects.push({id:'fx-'+n.id+'-'+id+'-'+this.effects.length,definitionId:id,definitionVersion:1,targetId:n.id,fromFrame:from,toFrame:to,params,enabled:true,order:this.effects.length+1});return n}
 keys(n:SceneNode,keys:Array<[number,Partial<Transform>]>){n.transformKeys=keys.map(([frame,v])=>({frame,easing:'smooth',transform:{...n.transform,...v}}));return n}
 cam(frame:number,cx:number,cy:number,zoom=1,rotation=0){this.camera.push({frame,cx,cy,zoom,rotation})}
 hud(index:number,title:string,color='#819aa4'){this.text('folio-'+index,`0${index} / ${title}`,112,67,1350,55,23,color,'Onest');this.text('brand-'+index,'motivelium.',1450,67,350,55,25,color,'Onest',null,'right')}
 bg(color='#070e1b'){return this.shape('bg-'+this.scene.id,-2000,-1500,8000,6000,color)}
 accent(frame:number,voice:'impact'|'chime'|'sweep',gain=.12){this.tracks.push({id:'accent-'+frame,kind:'sfx',assetId:null,gain,offsetSeconds:frame/30,mute:false,synth:{voice,durationSeconds:voice==='sweep'?.65:.35,pitch:voice==='impact'?70:440,seed:frame+73}})}
 finish(gain=.45):Project{
  const durationFrames=this.sequences.at(-1)!.toFrame;return{schemaVersion:2,id:this.id,revision:1,title:this.title,size:{width:1920,height:1080},fps:{num:30,den:1},durationFrames,seed:20261028,assets:this.resources.assets,nodes:this.nodes,effects:this.effects,sequences:this.sequences,cameraTracks:[{id:'film-camera',name:'Режиссёрский маршрут',keys:this.camera}],audioTracks:[{id:'film-music',kind:'music',assetId:'asset-film-score',gain,offsetSeconds:0,mute:false,clip:{sourceStartSeconds:0,durationSeconds:durationFrames/30,fadeInSeconds:.08,fadeOutSeconds:.65,pan:0,duckMusicDb:0}},...this.tracks],cues:this.sequences.map((s,i)=>({id:'chapter-'+i,trackId:null,frame:s.fromFrame,kind:'mark',label:s.name}))};
 }
}
