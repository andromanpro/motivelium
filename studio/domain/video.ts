import type {Project, VideoNode, AssetRef, AudioTrack} from './schema.ts';

// Small batches bound cold-seek latency: one Full HD request prepares four frames.
// Keep the cache budget separate; a paused preview must not encode a long PNG strip.
export function videoBlockSize(width:number,height:number){return Math.max(2,Math.min(64,2**Math.floor(Math.log2(32*1024*1024/(width*height*4)))));}
/** Source ranges are half-open; hold never samples the excluded last frame. */
export function videoSample(p:Project,n:VideoNode,frame:number){
 const a=p.assets.find(a=>a.id===n.assetId),s=p.sequences.find(s=>s.id===n.sequenceId);
 if(!a?.video||!s||frame<s.fromFrame||frame>=s.toFrame)return null;
 const elapsed=(frame-s.fromFrame)*p.fps.den/p.fps.num*n.speed;
 if(elapsed>=n.sourceOut-n.sourceIn&&n.endBehavior==='hide')return null;
 const fps=a.video.fps.num/a.video.fps.den;
 const last=Math.max(0,Math.ceil(n.sourceOut*fps-1e-7)-1);
 const index=Math.min(last,Math.max(0,Math.floor((n.sourceIn+elapsed)*fps+1e-7)));
 const maxZoom=Math.max(1,...p.cameraTracks.flatMap(t=>t.keys.map(k=>k.zoom))),rasterWidth=Math.min(a.width!,Math.ceil(p.size.width*maxZoom*(n.screenGuide?.autoZoom?Math.max(1,...n.screenGuide.points.map(p=>p.zoom)):1)));
 return{asset:a,index,rasterWidth,key:`video:${a.sha256}:${index}:${rasterWidth}`};
}
export function videoAudioTracks(p:Project):AudioTrack[]{
 return p.audioTracks.map(t=>{
  if(!t.videoNodeId)return t;
  const n=p.nodes.find(n=>n.id===t.videoNodeId),s=p.sequences.find(s=>s.id===n?.sequenceId);
  if(n?.kind!=='video'||!s)return{...t,mute:true};
  let visible=n.visible,parent=n.parentId;while(parent){const group=p.nodes.find(n=>n.id===parent);if(!group)break;visible=visible&&group.visible;parent=group.parentId;}
  return{...t,mute:t.mute||!visible,offsetSeconds:s.fromFrame*p.fps.den/p.fps.num,
   playbackRate:n.speed,clip:{sourceStartSeconds:n.sourceIn,
    durationSeconds:Math.min(n.sourceOut-n.sourceIn,(s.toFrame-s.fromFrame)*p.fps.den/p.fps.num*n.speed),
    fadeInSeconds:0,fadeOutSeconds:0,pan:0,duckMusicDb:0}};
 });
}
export function videoAudioTrack(n:VideoNode,a:AssetRef):AudioTrack|null{
 return a.video?.hasAudio?{id:`sound-${n.id}`,kind:'sfx',assetId:a.id,videoNodeId:n.id,gain:1,offsetSeconds:0,mute:false,name:n.name}:null;
}
