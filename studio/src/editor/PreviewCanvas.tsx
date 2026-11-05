import {prepareVideoFrame} from '../../render/videoFrames.ts';
import {ui} from './i18n.ts';
import {useInterfaceLocale} from './useInterfaceLocale.ts';
import {memo,useEffect,useRef,useState} from 'react';
import type {Project} from '../../domain/schema.ts';
import {evaluateFrame} from '../../render/evaluate.ts';
import {renderFrame,type AssetBitmaps,type ThreeLayerRenderer} from '../../render/renderFrame.ts';
const emptyBitmaps:AssetBitmaps=new Map();
export function useLoop(playing:boolean,length:number,fps:number,initialFrame=0){
 const [frame,setFrame]=useState(initialFrame),latest=useRef(initialFrame);latest.current=frame;
 useEffect(()=>{setFrame(f=>Math.min(f,Math.max(0,length-1)))},[length]);
 useEffect(()=>{if(!playing)return;let raf=0,hidden=document.hidden,base=performance.now(),from=latest.current;
  const visibility=()=>{hidden=document.hidden;base=performance.now();from=latest.current};document.addEventListener('visibilitychange',visibility);
  const tick=(now:number)=>{if(!hidden)setFrame(Math.floor(from+(now-base)*fps/1000)%Math.max(1,length));raf=requestAnimationFrame(tick)};
  raf=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility)};
 },[playing,length,fps]);
 return[frame,setFrame] as const;
}
export const FrameCanvas=memo(function FrameCanvas({project,frame,bitmaps=emptyBitmaps,threeLayer,playing=false,label=ui('Предпросмотр композиции'),metrics=false}:{project:Project;frame:number;bitmaps?:AssetBitmaps;threeLayer?:ThreeLayerRenderer;playing?:boolean;label?:string;metrics?:boolean}){
 const locale=useInterfaceLocale(),ref=useRef<HTMLCanvasElement|null>(null);
 const budget=useRef<HTMLOutputElement|null>(null);

 const jobs=useRef<{next:{project:Project;frame:number;playing:boolean;bitmaps:AssetBitmaps;threeLayer?:ThreeLayerRenderer;draw:()=>void}|null;latest:{project:Project;frame:number;playing:boolean;bitmaps:AssetBitmaps;threeLayer?:ThreeLayerRenderer;draw:()=>void}|null;running:boolean;controller:AbortController|null}>({next:null,latest:null,running:false,controller:null});
 useEffect(()=>()=>{jobs.current.next=null;jobs.current.latest=null;jobs.current.controller?.abort();},[]);
 useEffect(()=>{const c=ref.current;if(!c)return;if(c.width!==project.size.width)c.width=project.size.width;if(c.height!==project.size.height)c.height=project.size.height;
 const job={project,frame,playing,bitmaps,threeLayer,draw:()=>{const ctx=c.getContext('2d');if(!ctx)return;renderFrame(evaluateFrame(project,frame),{ctx,project,bitmaps,threeLayer});c.dataset.renderedFrame=String(frame);if(metrics&&budget.current){const node=project.nodes.find(n=>n.kind==='scene3d');const stats=node?threeLayer?.stats?.(node.id):null;budget.current.textContent=stats?ui('{0}×{1} · {2} шагов · {3} проходов · CPU {4} мс{5}',[stats.width,stats.height,stats.steps,stats.passes,stats.cpuMs.toFixed(1),stats.hdr?' · HDR':'']):'';}}};
 const q=jobs.current;q.next=q.latest=job;
 if(!q.running)void(async()=>{q.running=true;try{while(q.next){const item=q.next;q.next=null;const controller=new AbortController();q.controller=controller;
  try{await item.threeLayer?.prepare?.(item.project);await prepareVideoFrame(item.project,item.frame,item.bitmaps,controller.signal,item.playing);
   if(q.latest===item||(q.latest?.project===item.project&&q.latest?.playing&&item.playing))item.draw();
  }catch(e){if(controller.signal.aborted||q.latest!==item)continue;const ctx=c.getContext('2d');if(ctx){ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#ffb899';ctx.font='16px Arial';ctx.fillText((e as Error).message,16,30,c.width-32);}}
 }}finally{q.running=false;q.controller=null;}})();
 },[project,frame,bitmaps,threeLayer,metrics,locale,playing]);
 return <><canvas ref={ref} aria-label={label} style={{aspectRatio:`${project.size.width}/${project.size.height}`}}/>{metrics&&<output ref={budget} className="render-budget" aria-label={ui("Стоимость 3D-кадра")} title={ui("Время CPU на отправку команд рендеринга; не полное время GPU. Профиль качества одинаков для примерки и экспорта.")}/>}</>;
});
