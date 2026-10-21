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
export const FrameCanvas=memo(function FrameCanvas({project,frame,bitmaps=emptyBitmaps,threeLayer,label='Пример эффекта',metrics=false}:{project:Project;frame:number;bitmaps?:AssetBitmaps;threeLayer?:ThreeLayerRenderer;label?:string;metrics?:boolean}){
 const ref=useRef<HTMLCanvasElement|null>(null);
 const budget=useRef<HTMLOutputElement|null>(null);

 useEffect(()=>{const c=ref.current;if(!c)return;let cancelled=false;if(c.width!==project.size.width)c.width=project.size.width;if(c.height!==project.size.height)c.height=project.size.height;const draw=()=>{if(cancelled)return;const ctx=c.getContext('2d');if(ctx){renderFrame(evaluateFrame(project,frame),{ctx,project,bitmaps,threeLayer});if(metrics&&budget.current){const node=project.nodes.find(n=>n.kind==='scene3d'&&project.effects.some(e=>e.targetId===n.id&&e.enabled&&['3d-volume-light','3d-finish'].includes(e.definitionId)));const stats=node?threeLayer?.stats?.(node.id):null;budget.current.textContent=stats?`${stats.width}×${stats.height} · ${stats.steps} шагов · ${stats.passes} проходов · CPU ${stats.cpuMs.toFixed(1)} мс${stats.hdr?' · HDR':''}`:'';}}};if(threeLayer?.prepare)void threeLayer.prepare(project).then(draw).catch(e=>{if(cancelled)return;const ctx=c.getContext('2d');if(ctx){ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#ffb899';ctx.font='16px Arial';ctx.fillText('Модель: '+(e as Error).message,16,30,c.width-32);}});else draw();return()=>{cancelled=true}},[project,frame,bitmaps,threeLayer,metrics]);
 return <><canvas ref={ref} aria-label={label} style={{aspectRatio:`${project.size.width}/${project.size.height}`}}/>{metrics&&<output ref={budget} className="render-budget" aria-label="Стоимость 3D-кадра" title="Время CPU на отправку команд рендеринга; не полное время GPU. Профиль качества одинаков для примерки и экспорта."/>}</>;
});
