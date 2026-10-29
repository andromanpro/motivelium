import type{ExampleLanguage}from'./exampleLanguage.ts';
import{DISCHARGE_COPY,DISCHARGE_ASSET_NAMES,DISCHARGE_TRACK_NAMES}from'./dischargeFilmContent.ts';
import{buildDischargePilot}from'./dischargePilot.ts';
import type{FilmResources}from'./demoFilm.ts';
import type{AudioTrack,TextNode}from'./schema.ts';
import{filmTransform}from'./demoFilm.ts';

/** The accepted event is kept; a continuous camera reveals its scale before the impact. */
export function buildDischargeFilm(resources:FilmResources,language:ExampleLanguage='ru'){
 const copy=DISCHARGE_COPY[language];
 const p=buildDischargePilot(resources);p.id=language==='en'?'motivelium-one-strike-film-en':'motivelium-one-strike-film';p.title=copy.title;p.durationFrames=300;
 p.sequences[0]!.name=copy.sequence;p.sequences[0]!.toFrame=300;
 for(const e of p.effects)e.toFrame=300;
 p.effects.find(e=>e.definitionId==='3d-discharge')!.params.impact=4;
 p.effects.find(e=>e.definitionId==='3d-finish')!.params.glow=.14;
 const device=p.nodes.find(n=>n.id==='device')!;if(device.kind!=='scene3d')throw Error('Нет предмета');
 device.camera3dKeys=[
  {frame:0,position:[1.5,1.5,2.8],target:[-.06,1.10,0],fov:32},
  {frame:42,position:[1.1,1.35,2.9],target:[-.18,.95,0],fov:33},
  {frame:96,position:[3.5,1.7,7.2],target:[-.55,-.05,0],fov:36},
  {frame:113,position:[3.5,1.7,7.2],target:[-.55,-.05,0],fov:36},
  {frame:120,position:[3.525,1.715,7.15],target:[-.55,-.05,0],fov:35.6},
  {frame:124,position:[3.5,1.7,7.2],target:[-.55,-.05,0],fov:36},
  {frame:150,position:[3.2,1.65,7],target:[-.55,-.05,0],fov:36},
  {frame:207,position:[2.9,1.25,6.4],target:[-.55,0,0],fov:36},
  {frame:270,position:[3.8,1.7,8],target:[-.5,-.03,0],fov:36},
  {frame:299,position:[4,1.9,8.6],target:[-.5,-.03,0],fov:36},
 ];
 const title:TextNode={id:'film-title',name:copy.titleLayer,kind:'text',sequenceId:'one-strike',parentId:null,visible:true,locked:false,geometry:{width:760,height:160},transform:filmTransform({x:170,y:590,opacity:0}),text:copy.headline,fontFamily:'Literata Italic',fontSize:84,fontWeight:400,color:'#e6e7dc',align:'left',lineHeight:1.15,transformKeys:[{frame:0,easing:'smooth',transform:filmTransform({x:170,y:610,opacity:0})},{frame:240,easing:'smooth',transform:filmTransform({x:170,y:610,opacity:0})},{frame:262,easing:'smooth',transform:filmTransform({x:170,y:590,opacity:1})},{frame:299,easing:'smooth',transform:filmTransform({x:170,y:590,opacity:1})}]};
 const brand:TextNode={...title,id:'film-brand',name:'Motivelium',geometry:{width:700,height:55},text:'motivelium.',fontFamily:'Onest',fontSize:25,color:'#91a6a9',transform:filmTransform({x:175,y:754,opacity:0}),transformKeys:[{frame:0,easing:'smooth',transform:filmTransform({x:175,y:754,opacity:0})},{frame:250,easing:'smooth',transform:filmTransform({x:175,y:754,opacity:0})},{frame:273,easing:'smooth',transform:filmTransform({x:175,y:754,opacity:1})},{frame:299,easing:'smooth',transform:filmTransform({x:175,y:754,opacity:1})}]};
 p.nodes.push(title,brand);
 const clip=(durationSeconds:number,fadeInSeconds=0,fadeOutSeconds=.03)=>({sourceStartSeconds:0,durationSeconds,fadeInSeconds,fadeOutSeconds,pan:0,duckMusicDb:0});
 const tracks:AudioTrack[]=[
  {id:'sound-bed',kind:'music',assetId:'asset-strike-bed',offsetSeconds:0,gain:1.4,mute:false,clip:clip(10,.08,.15)},
  {id:'main-crack',kind:'sfx',assetId:'asset-strike-crack',offsetSeconds:4,gain:1.2,mute:false,clip:{...clip(.8),duckMusicDb:4}},
  {id:'echo-crack',kind:'sfx',assetId:'asset-strike-crack',offsetSeconds:4.4,gain:.44,mute:false,clip:{...clip(.8),duckMusicDb:2}},
  {id:'foley-first',kind:'sfx',assetId:'asset-strike-tick',offsetSeconds:3.82,gain:.22,mute:false,clip:clip(.15)},
  {id:'foley-second',kind:'sfx',assetId:'asset-strike-tick',offsetSeconds:3.93,gain:.3,mute:false,clip:clip(.15)},
 ];
 p.audioTracks=tracks.filter(t=>p.assets.some(a=>a.id===t.assetId));
 p.cues=[{id:'detail',frame:0,kind:'mark',trackId:null,label:copy.cues.detail},{id:'reveal',frame:60,kind:'mark',trackId:null,label:copy.cues.reveal},{id:'charge',frame:96,kind:'mark',trackId:null,label:copy.cues.charge},{id:'strike',frame:120,kind:'mark',trackId:null,label:copy.cues.strike},{id:'echo',frame:132,kind:'mark',trackId:null,label:copy.cues.echo},{id:'trace',frame:180,kind:'mark',trackId:null,label:copy.cues.trace},{id:'title',frame:250,kind:'mark',trackId:null,label:copy.cues.title}];
 if(language==='en'){
  p.nodes.find(n=>n.id==='background')!.name=copy.background;device.name=copy.device;
  p.assets=p.assets.map(a=>({...a,title:DISCHARGE_ASSET_NAMES[a.id as keyof typeof DISCHARGE_ASSET_NAMES]??a.title}));
  p.audioTracks=p.audioTracks.map(t=>({...t,name:DISCHARGE_TRACK_NAMES[t.id as keyof typeof DISCHARGE_TRACK_NAMES]}));
 }
 return p;
}
