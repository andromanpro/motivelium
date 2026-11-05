import type {Project} from '../domain/schema.ts';
import {videoSample,videoBlockSize} from '../domain/video.ts';
import {transitionAtFrame} from '../domain/transitions.ts';
import type {AssetBitmaps} from './renderFrame.ts';

/** Abort discards superseded seeks; bitmaps are immutable and keyed by source SHA/frame. */
const prefetched=new Map<string,Promise<void>>();
function prefetchSample(p:Project,sample:NonNullable<ReturnType<typeof videoSample>>,index:number){
 const a=sample.asset;if(index>=Math.ceil(a.durationSeconds!*a.video!.fps.num/a.video!.fps.den))return Promise.resolve();
 const url=`/api/v1/projects/${p.id}/video-frames/${a.id}?index=${index}&sha=${a.sha256}&width=${sample.rasterWidth}`;
 let pending=prefetched.get(url);if(!pending){pending=fetch(url).then(async r=>{if(!r.ok)throw Error('Не удалось подготовить видео.');await r.body?.cancel();});prefetched.set(url,pending);pending.catch(()=>prefetched.delete(url));if(prefetched.size>64)prefetched.delete(prefetched.keys().next().value!);}return pending;
}
export async function warmVideoPlayback(p:Project,frame:number){
 await Promise.all(p.nodes.flatMap(n=>{if(n.kind!=='video')return[];const s=videoSample(p,n,frame);if(!s)return[];const block=videoBlockSize(s.rasterWidth,Math.round(s.asset.height!*s.rasterWidth/s.asset.width!)),start=Math.floor(s.index/block)*block;return[0,1,2].map(k=>prefetchSample(p,s,start+k*block));}));
}
export async function prepareVideoFrame(p:Project,frame:number,bitmaps:AssetBitmaps,signal?:AbortSignal,prefetch=false){
 const blend=transitionAtFrame(p,frame),frames=blend?[frame,blend.fromSourceFrame,blend.toSourceFrame]:[frame];
 const wanted=new Map<string,NonNullable<ReturnType<typeof videoSample>>>();
 for(const f of frames)for(const n of p.nodes)if(n.kind==='video'){const sample=videoSample(p,n,f);if(sample)wanted.set(sample.key,sample);}
 for(const sample of wanted.values()){
  if(prefetch){const a=sample.asset,block=videoBlockSize(sample.rasterWidth,Math.round(a.height!*sample.rasterWidth/a.width!)),start=Math.floor(sample.index/block)*block;for(const ahead of [1,2])void prefetchSample(p,sample,start+ahead*block).catch(()=>{});}
  signal?.throwIfAborted();if(bitmaps.has(sample.key))continue;
  const res=await fetch(`/api/v1/projects/${p.id}/video-frames/${sample.asset.id}?index=${sample.index}&sha=${sample.asset.sha256}&width=${sample.rasterWidth}`,{signal});
  if(!res.ok){const error=await res.json().catch(()=>({}));throw Error(error.error??'Не загружен видеокадр.');}
  const bitmap=await createImageBitmap(await res.blob());
  if(signal?.aborted){bitmap.close();signal.throwIfAborted();}
  if(bitmaps.has(sample.key))bitmap.close();else bitmaps.set(sample.key,bitmap);
 }
 // Eight full-resolution frames per canvas, independent of film length.
 const keys=[...bitmaps.keys()].filter(k=>k.startsWith('video:'));
 for(const key of keys){if(keys.length<=8)break;if(wanted.has(key))continue;(bitmaps.get(key) as ImageBitmap).close?.();bitmaps.delete(key);keys.splice(keys.indexOf(key),1);}
}
