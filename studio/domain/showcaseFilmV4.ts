import{buildShowcaseFilm as buildV3}from'./showcaseFilmV3.ts';import type{FilmResources}from'./demoFilm.ts';import{filmTransform}from'./demoFilm.ts';import type{SceneNode,EffectInstance}from'./schema.ts';
/** An evolving collage: live 3D, assembling image cards, then a shorter reveal of the whole. */
export function buildShowcaseFilm(resources:FilmResources){
 const p=buildV3(resources);p.id='motivelium-showcase-film-v4';p.title='Дай идее ход · коллаж оживает';
 const photo=p.nodes.find(n=>n.id==='a-photo')!;photo.transformKeys=[{frame:0,easing:'smooth',transform:{...photo.transform,scaleX:1.01,scaleY:1.01}},{frame:145,easing:'smooth',transform:{...photo.transform,rotation:-1,scaleX:1.04,scaleY:1.04}}];
 p.effects=p.effects.filter(e=>!(e.targetId==='a-star'&&e.definitionId==='spin-turn'));const stamp=p.nodes.find(n=>n.id==='a-stamp')!;stamp.transform.x=670;stamp.transform.y=783;stamp.geometry.width=230;if(stamp.kind==='text')stamp.align='center';
 const folio=p.nodes.find(n=>n.id==='b-folio');if(folio?.kind==='text')folio.color='#183234';
 const window=p.nodes.find(n=>n.id==='b-window')!;window.transformKeys=[{frame:170,easing:'smooth',transform:{...window.transform,scaleX:.2,scaleY:.2,rotation:-14,opacity:0}},{frame:225,easing:'smooth',transform:{...window.transform,scaleX:1,scaleY:1,rotation:2,opacity:1}},{frame:340,easing:'smooth',transform:{...window.transform,x:1220,y:420,rotation:6,scaleX:1.15,scaleY:1.15}}];
 const cTitle=p.nodes.find(n=>n.id==='c-title')!;cTitle.transform.y=140;if(cTitle.kind==='text')cTitle.fontSize=140;
 const cNote=p.nodes.find(n=>n.id==='c-italic')!;cNote.transform.y=945;if(cNote.kind==='text')cNote.fontSize=39;p.nodes=p.nodes.filter(n=>n.id!=='c-footer');
 const fx=(targetId:string,definitionId:string,from:number,to:number,params:EffectInstance['params'])=>p.effects.push({id:'collage-'+targetId+'-'+definitionId,targetId,definitionId,definitionVersion:1,fromFrame:from,toFrame:to,order:20,enabled:true,params});
 fx('c-title','glyph-motion',445,490,{mode:'assemble',amplitude:65,rotation:18,stagger:.3});
 cTitle.transformKeys=[{frame:0,easing:'linear',transform:{...cTitle.transform,opacity:0}},{frame:445,easing:'linear',transform:{...cTitle.transform,opacity:0}},{frame:446,easing:'linear',transform:{...cTitle.transform,opacity:1}}];
 ['asset-film-knot','asset-film-road','asset-film-sculpture'].forEach((assetId,i)=>{
  const id='c-image-'+i,n:SceneNode={id,name:'Собрать карточку '+(i+1),sequenceId:p.sequences[0]!.id,parentId:'poster-c',kind:'image',assetId,fit:'cover',geometry:{width:455,height:330},transform:filmTransform({x:80+i*535,y:555,rotation:i*4-4}),visible:true,locked:false};
  n.transformKeys=[{frame:454+i*10,easing:'smooth',transform:{...n.transform,y:800,scaleX:.65,scaleY:.65,opacity:0}},{frame:482+i*10,easing:'smooth',transform:{...n.transform,opacity:1}}];p.nodes.push(n);fx(id,'contour-window',454+i*10,514+i*10,{from:'circle',to:'source',span:.65,delay:0});
 });
 // Shorten the tour without changing the shape of the editable camera route.
 const scale=640/768,frame=(f:number)=>Math.min(639,Math.round(f*scale));p.durationFrames=640;p.sequences[0]!.toFrame=640;
 p.nodes.forEach(n=>n.transformKeys?.forEach(k=>k.frame=frame(k.frame)));p.effects.forEach(e=>{e.fromFrame=frame(e.fromFrame);e.toFrame=Math.max(e.fromFrame+1,Math.min(640,Math.round(e.toFrame*scale)))});p.cameraTracks.forEach(t=>t.keys.forEach(k=>k.frame=frame(k.frame)));p.cues.forEach(c=>c.frame=frame(c.frame));p.audioTracks.forEach(t=>{if(t.synth)t.offsetSeconds*=scale;if(t.clip)t.clip.durationSeconds=640/30});
 return p;
}
