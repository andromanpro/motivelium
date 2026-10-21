// Отрисовка кадра на Canvas2D. renderFrame не меняет проект и не читает состояние
// проигрывания: одинаковым FrameState соответствует одинаковый кадр (в пределах
// одного устройства и зафиксированных ассетов/шрифтов).
// 3D-слой рисуется адаптером в отдельный прозрачный canvas и компонозитором
// вставляется в кадр той же матрицей.

import type { Project, SceneNode } from '../domain/schema.ts';
import {evaluateFrame} from './evaluate.ts';
import {transitionAtFrame} from '../domain/transitions.ts';
import {renderShader} from './shaderRenderer.ts';
import {renderFeedback} from './feedbackRenderer.ts';
import {fluidAt,fluidPixels,FLUID_W,FLUID_H} from './fluidField.ts';
import type { FrameState, FrameItem } from './evaluate.ts';
import { applyMatrix } from '../domain/matrix.ts';
import {morphContour,nativeContourShape,maskIsPass} from '../effects/contours.ts';
import {maskLayer} from './layerMasks.ts';

export type AssetBitmaps = Map<string, CanvasImageSource & { width: number; height: number }>;

export type ThreeLayerRenderer = {
  stats?:(nodeId:string)=>import('../effects/lighting3d.ts').RenderStats3d|undefined;
  prepare?:(project:Project)=>Promise<void>;
  parts?:(node:import('../domain/schema.ts').Scene3dNode)=>import('../domain/model3d.ts').PartDescriptor[];
  projectPart?:(item:FrameItem,state:FrameState,id:string)=>import('./modelRig.ts').PartProjection|null;
  /** Отрисовать слой под текущее состояние кадра; возвращает canvas для композита. */
  render: (item: FrameItem, state: FrameState) => HTMLCanvasElement | OffscreenCanvas;
  /** Выбор части 3D-сцены по координатам слоя; тот же id, что в дереве проекта. */
  raycast: (item: FrameItem, localX: number, localY: number) => string | null;
  dispose: () => void;
};

export type RenderResult = {
  drawnNodeIds: string[];
  missingAssets: string[];
  threeLayerUsed: boolean;
};

function setTransformFromItem(ctx: CanvasRenderingContext2D, item: FrameItem): void {
  const m = item.screen;
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
}

// Bounded reusable surfaces. Each draw overwrites pixels; no frame-history cache.
const surfaces=new Map<string,HTMLCanvasElement>();
const feedbackSources=new WeakMap<CanvasRenderingContext2D,HTMLCanvasElement>();
const bitmapIds=new WeakMap<object,number>();let nextBitmapId=0;
function bitmapIdentity(bitmap:object):number{let id=bitmapIds.get(bitmap);if(id===undefined){id=++nextBitmapId;bitmapIds.set(bitmap,id);}return id;}
function surface(key:string,w:number,h:number):HTMLCanvasElement {
 let c=surfaces.get(key);
 if(c){surfaces.delete(key);surfaces.set(key,c)}
 if(!c){c=document.createElement('canvas');surfaces.set(key,c);if(surfaces.size>12){const first=surfaces.keys().next().value!;const old=surfaces.get(first)!;old.width=1;old.height=1;surfaces.delete(first)}}
 if(c.width!==w||c.height!==h){c.width=w;c.height=h}return c;
}
function compositeNode(ctx:CanvasRenderingContext2D,item:FrameItem,project:Project,bitmaps:AssetBitmaps,result:RenderResult,state:FrameState,threeLayer?:ThreeLayerRenderer):void {
 const w=item.bounds.width,h=item.bounds.height,padTop=item.node.kind==='text'?Math.ceil(item.node.fontSize*.32):0,paintH=h+padTop,k=Math.min(1,2048/w,2048/paintH),sw=Math.max(1,Math.ceil(w*k)),sh=Math.max(1,Math.ceil(paintH*k));
 let source=surface(item.node.id+':source',sw,sh);const sc=source.getContext('2d')!;
 sc.setTransform(1,0,0,1,0,0);sc.clearRect(0,0,sw,sh);sc.filter='none';sc.globalAlpha=1;sc.globalCompositeOperation='source-over';
 drawNode(sc,{...item,opacity:1,screen:{a:k,b:0,c:0,d:k,e:0,f:padTop*k},deltas:{...item.deltas,glow:0,chromatic:0,echoes:0,glitch:0,prism:0,shaderFilters:[],fluid:undefined,memory:undefined}},project,bitmaps,result,state,threeLayer,true);
 if(item.deltas.fluid){
  const f=item.deltas.fluid,field=fluidAt({seed:f.seed,swirl:f.swirl,retention:f.retention},Math.min(3600,Math.floor(f.seconds*30+1e-6))),map=surface('fluid-map',FLUID_W,FLUID_H),mc=map.getContext('2d')!,pixels=mc.createImageData(FLUID_W,FLUID_H);pixels.data.set(fluidPixels(field,f.palette));mc.putImageData(pixels,0,0);
  const flowed=surface(item.node.id+':flow',sw,sh),fc=flowed.getContext('2d')!;fc.setTransform(1,0,0,1,0,0);fc.clearRect(0,0,sw,sh);fc.globalCompositeOperation='source-over';fc.globalAlpha=1;fc.imageSmoothingEnabled=true;fc.imageSmoothingQuality='high';fc.drawImage(renderShader('motivelium-ink-surface',sw,sh,f.seconds,{},map),0,0,sw,sh);fc.globalCompositeOperation='destination-in';fc.drawImage(source,0,0);fc.globalCompositeOperation='source-over';
  const blended=surface(item.node.id+':flow-mix',sw,sh),bc=blended.getContext('2d')!;bc.setTransform(1,0,0,1,0,0);bc.clearRect(0,0,sw,sh);bc.globalAlpha=1;bc.drawImage(source,0,0);bc.globalCompositeOperation='source-atop';bc.globalAlpha=f.mix;bc.drawImage(flowed,0,0);bc.globalAlpha=1;bc.globalCompositeOperation='source-over';source=blended;
 }
 for(const [index,filter]of (item.deltas.shaderFilters??[]).entries()){
  const filtered=renderShader(filter.id,sw,sh,state.frame*project.fps.den/project.fps.num*filter.speed,filter.params,source),blended=surface(item.node.id+':shader-'+index,sw,sh),bc=blended.getContext('2d')!;bc.setTransform(1,0,0,1,0,0);bc.clearRect(0,0,sw,sh);bc.globalAlpha=1;bc.drawImage(source,0,0);bc.globalAlpha=filter.mix;bc.drawImage(filtered,0,0,sw,sh);bc.globalAlpha=1;source=blended;
 }
 if((item.deltas.prism??0)>=3){
  const folded=surface(item.node.id+':prism',sw,sh),fc=folded.getContext('2d')!,n=item.deltas.prism!,step=Math.PI*2/n,r=Math.hypot(sw,sh);
  fc.setTransform(1,0,0,1,0,0);fc.clearRect(0,0,sw,sh);fc.save();fc.translate(sw/2,sh/2);
  for(let i=0;i<n;i++){fc.save();fc.rotate(i*step);fc.beginPath();fc.moveTo(0,0);fc.lineTo(r*Math.cos(-step/2),r*Math.sin(-step/2));fc.lineTo(r*Math.cos(step/2),r*Math.sin(step/2));fc.closePath();fc.clip();if(i%2)fc.scale(1,-1);fc.drawImage(source,-sw/2,-sh/2);fc.restore()}
  fc.restore();source=folded;
 }
 if(item.deltas.masks?.length)source=maskLayer(source,item.deltas.masks,item.node.kind==='shape'?item.node.shape:'rect');
 ctx.save();setTransformFromItem(ctx,item);
 const paint=()=>{
  if((item.deltas.glitch??0)>.1){
   const bands=18;
   for(let i=0;i<bands;i++){const sy=i*sh/bands,sy2=(i+1)*sh/bands,shift=Math.sin(i*17.31+state.frame*.73)*(item.deltas.glitch??0)*(i%3===0?1:.18);ctx.drawImage(source,0,sy,sw,sy2-sy,shift,-padTop+i*paintH/bands,w,paintH/bands+.5)}
  }else ctx.drawImage(source,0,-padTop,w,paintH);
 };
 const copies=item.deltas.echoes??0;
 for(let i=copies;i>=1;i--){ctx.save();ctx.globalAlpha=item.opacity*.22/(1+i*.35);ctx.translate((item.deltas.echoX??0)*i,(item.deltas.echoY??0)*i);ctx.translate(w/2,h/2);ctx.scale(1+i*.015,1+i*.015);ctx.translate(-w/2,-h/2);paint();ctx.restore()}
 const chroma=item.deltas.chromatic??0;
 if(chroma>.1){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=item.opacity*.65;ctx.filter='grayscale(1) sepia(1) saturate(9) hue-rotate(120deg)';ctx.translate(-chroma,0);paint();ctx.translate(chroma*2,0);ctx.filter='grayscale(1) sepia(1) saturate(9) hue-rotate(280deg)';paint();ctx.restore()}
 ctx.globalAlpha=item.opacity;
 if(item.deltas.glow>.01){ctx.shadowBlur=35*item.deltas.glow;ctx.shadowColor=item.node.kind==='text'?item.node.color:item.node.kind==='shape'?(item.node.stroke??item.node.fill):'#70fff2'}
 paint();ctx.restore();
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  item: FrameItem,
  project: Project,
  bitmaps: AssetBitmaps,
  result: RenderResult,
  state: FrameState,
  threeLayer?: ThreeLayerRenderer,
  plain=false,
): void {
  const node = item.node;
  if(item.deltas.masks?.some(maskIsPass)){drawNode(ctx,{...item,deltas:{...item.deltas,masks:item.deltas.masks.filter(m=>!maskIsPass(m))}},project,bitmaps,result,state,threeLayer,plain);return;}
  if(!plain&&item.deltas.feedback){
   const feedback=item.deltas.feedback;let sourceCanvas=feedbackSources.get(ctx);if(!sourceCanvas){sourceCanvas=document.createElement('canvas');feedbackSources.set(ctx,sourceCanvas);}const source=sourceCanvas,assetKey=[...bitmaps].map(([id,b])=>[id,bitmapIdentity(b)]);
   try{
    if(feedback.mix>0){const image=renderFeedback({key:JSON.stringify([project,node.id,assetKey]),pipelineId:feedback.pipelineId,frame:state.frame,fromFrame:feedback.fromFrame,fps:project.fps.num/project.fps.den,width:project.size.width,height:project.size.height,params:feedback.params,source:(frame,width,height)=>{
     if(source.width!==width||source.height!==height){source.width=width;source.height=height;}
     const sc=source.getContext('2d',{willReadFrequently:true})!;sc.setTransform(1,0,0,1,0,0);sc.clearRect(0,0,width,height);sc.globalAlpha=1;sc.globalCompositeOperation='source-over';sc.filter='none';
     const history=evaluateFrame(project,frame),old=history.sequence?.id===state.sequence?.id?history.items.find(i=>i.node.id===node.id):null;
     if(old){const sx=width/project.size.width,sy=height/project.size.height,m=old.screen;drawNode(sc,{...old,screen:{a:m.a*sx,b:m.b*sy,c:m.c*sx,d:m.d*sy,e:m.e*sx,f:m.f*sy},deltas:{...old.deltas,feedback:undefined,memory:undefined}},project,bitmaps,result,history,threeLayer);}
     return source;
    }});ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=feedback.mix;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.drawImage(image,0,0,project.size.width,project.size.height);ctx.restore();}
   }finally{if(threeLayer&&node.kind==='scene3d')threeLayer.render(item,state);}
   // Keep the current source sharp over the lower-resolution accumulated field.
   drawNode(ctx,{...item,deltas:{...item.deltas,feedback:undefined}},project,bitmaps,result,state,threeLayer);return;
  }
  if(!plain&&item.deltas.memory){const m=item.deltas.memory;for(let i=m.copies;i>=1;i--){const f=state.frame-i*m.spacing;if(f<m.fromFrame)continue;const history=evaluateFrame(project,f);if(history.sequence?.id!==state.sequence?.id)continue;const old=history.items.find(n=>n.node.id===node.id);if(old)drawNode(ctx,{...old,opacity:old.opacity*Math.pow(m.decay,i)*.55,deltas:{...old.deltas,memory:undefined,feedback:undefined}},project,bitmaps,result,history,threeLayer);}}
  if(!plain&&node.kind!=='group'&&((item.deltas.chromatic??0)>.1||(item.deltas.echoes??0)>0||(item.deltas.glitch??0)>.1||(item.deltas.prism??0)>=3||!!item.deltas.shaderFilters?.length||!!item.deltas.fluid||!!item.deltas.masks?.length)){
    compositeNode(ctx,item,project,bitmaps,result,state,threeLayer);return;
  }
  ctx.save();
  setTransformFromItem(ctx, item);
  ctx.globalAlpha = item.opacity;
  if(item.deltas.glow>.01){ctx.shadowColor=node.kind==='text'?node.color:node.kind==='shape'?(node.stroke??node.fill):'#70fff2';ctx.shadowBlur=24*item.deltas.glow}
  if (item.deltas.blur > 0.05) ctx.filter = `blur(${item.deltas.blur.toFixed(2)}px)`;
  if (item.deltas.reveal < 0.999) {
    ctx.beginPath();
    ctx.rect(0, 0, node.geometry.width * item.deltas.reveal, node.geometry.height);
    ctx.clip();
  }

  switch (node.kind) {
    case 'shape':
      if(item.deltas.morph){const native=nativeContourShape(item.deltas.morph,node.shape);ctx.beginPath();if(native==='rect')ctx.rect(0,0,node.geometry.width,node.geometry.height);else if(native==='ellipse')ctx.ellipse(node.geometry.width/2,node.geometry.height/2,node.geometry.width/2,node.geometry.height/2,0,0,Math.PI*2);else{const points=morphContour(item.deltas.morph,node.shape);for(const[i,[x,y]]of points.entries()){if(i===0)ctx.moveTo(x*node.geometry.width/100,y*node.geometry.height/100);else ctx.lineTo(x*node.geometry.width/100,y*node.geometry.height/100);}ctx.closePath();}if(node.generator)ctx.clip();}
      if(node.generator){const g=node.generator,k=Math.min(1,1280/node.geometry.width,720/node.geometry.height);ctx.filter=[ctx.filter==='none'?'':ctx.filter,`hue-rotate(${g.hue}deg)`].filter(Boolean).join(' ');const image=renderShader(g.shaderId,node.geometry.width*k,node.geometry.height*k,state.frame*project.fps.den/project.fps.num*g.speed,g.params);ctx.drawImage(image,0,0,node.geometry.width,node.geometry.height);break;}
      if(!item.deltas.morph){ctx.beginPath();
       if (node.shape === 'rect') ctx.rect(0, 0, node.geometry.width, node.geometry.height);
       else ctx.ellipse(node.geometry.width / 2, node.geometry.height / 2, node.geometry.width / 2, node.geometry.height / 2, 0, 0, Math.PI * 2);
      }
      ctx.fillStyle = node.fill;
      if((node.fillOpacity??1)>0){ctx.globalAlpha=item.opacity*(node.fillOpacity??1);ctx.fill();ctx.globalAlpha=item.opacity}
      if (node.stroke && (node.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth ?? 1;
        ctx.stroke();
      }
      break;
    case 'text': {
      ctx.fillStyle = node.color;
      ctx.font = `${String(node.fontSize)}px ${node.fontFamily}`;
      ctx.textBaseline = 'top';
      ctx.textAlign = node.align === 'center' ? 'center' : node.align === 'right' ? 'right' : 'left';
      const x = node.align === 'center' ? node.geometry.width / 2 : node.align === 'right' ? node.geometry.width : 0;
      const lineHeight = node.fontSize * node.lineHeight;
      const lines = node.text.split('\n');
      lines.forEach((line, i) => ctx.fillText(line, x, i * lineHeight + (lineHeight - node.fontSize) / 2));
      break;
    }
    case 'image': {
      ctx.beginPath();
      ctx.rect(0, 0, node.geometry.width, node.geometry.height);
      ctx.clip();
      const bmp = bitmaps.get(node.assetId);
      if (bmp) drawImageFitted(ctx, bmp, node.geometry.width, node.geometry.height, node.fit);
      else {
        result.missingAssets.push(node.assetId);
        drawAssetPlaceholder(ctx, node, project);
      }
      break;
    }
    case 'scene3d':
      if (threeLayer) {
        const layerCanvas = threeLayer.render(item, state);
        ctx.drawImage(layerCanvas, 0, 0, node.geometry.width, node.geometry.height);
        result.threeLayerUsed = true;
      }
      break;
    case 'group':
      break;
  }
  ctx.restore();
}

function drawImageFitted(ctx: CanvasRenderingContext2D, bmp: CanvasImageSource & { width: number; height: number }, w: number, h: number, fit: 'contain' | 'cover' | 'fill'): void {
  if (fit === 'fill') { ctx.drawImage(bmp, 0, 0, w, h); return; }
  const sw = bmp.width, sh = bmp.height;
  const scale = fit === 'contain' ? Math.min(w / sw, h / sh) : Math.max(w / sw, h / sh);
  const dw = sw * scale, dh = sh * scale;
  ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawAssetPlaceholder(ctx: CanvasRenderingContext2D, node: SceneNode & { kind: 'image' }, _project: Project): void {
  ctx.fillStyle = '#22282f';
  ctx.fillRect(0, 0, node.geometry.width, node.geometry.height);
  ctx.strokeStyle = '#4a5563';
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(0.5, 0.5, node.geometry.width - 1, node.geometry.height - 1);
  ctx.setLineDash([]);
  ctx.fillStyle = '#8b93a1';
  ctx.font = '16px system-ui';
  ctx.textBaseline = 'middle';
  ctx.fillText(`ассет не загружен: ${node.assetId}`, 10, node.geometry.height / 2);
}

export type RenderContext = {
  ctx: CanvasRenderingContext2D;
  project: Project;
  bitmaps: AssetBitmaps;
  threeLayer?: ThreeLayerRenderer;
  transitions?:boolean;
};

/** Нарисовать кадр. Один и тот же FrameState даёт одинаковый кадр. */
function renderPlainFrame(state: FrameState, rc: RenderContext): RenderResult {
  const { ctx, project } = rc;
  const result: RenderResult = { drawnNodeIds: [], missingAssets: [], threeLayerUsed: false };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, project.size.width, project.size.height);
  ctx.fillStyle = '#10141b';
  ctx.fillRect(0, 0, project.size.width, project.size.height);

  for (const item of state.items) {
    drawNode(ctx, item, project, rc.bitmaps, result, state, rc.threeLayer);
    result.drawnNodeIds.push(item.node.id);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return result;
}

/** Рамка выбранного объекта в экранных координатах (для оверлея инспектора). */
export function selectionQuad(state: FrameState, nodeId: string): Array<{ x: number; y: number }> | null {
  const item = state.items.find(i => i.node.id === nodeId);
  if (!item) return null;
  const m = item.screen;
  return [
    applyMatrix(m, 0, 0),
    applyMatrix(m, item.bounds.width, 0),
    applyMatrix(m, item.bounds.width, item.bounds.height),
    applyMatrix(m, 0, item.bounds.height),
  ];
}

const transitionSurfaces=new WeakMap<CanvasRenderingContext2D,{from:HTMLCanvasElement;to:HTMLCanvasElement}>();
/** Both scene textures use the same renderer and frozen frame times. */
export function renderFrame(state:FrameState,rc:RenderContext):RenderResult{
 const blend=rc.transitions===false?null:transitionAtFrame(rc.project,state.frame);if(!blend)return renderPlainFrame(state,rc);
 let buffers=transitionSurfaces.get(rc.ctx);if(!buffers){buffers={from:document.createElement('canvas'),to:document.createElement('canvas')};transitionSurfaces.set(rc.ctx,buffers);}for(const c of [buffers.from,buffers.to]){if(c.width!==rc.project.size.width||c.height!==rc.project.size.height){c.width=rc.project.size.width;c.height=rc.project.size.height;}}
 const fromState=evaluateFrame(rc.project,blend.fromSourceFrame),toState=evaluateFrame(rc.project,blend.toSourceFrame),a=renderPlainFrame(fromState,{...rc,ctx:buffers.from.getContext('2d')!}),b=renderPlainFrame(toState,{...rc,ctx:buffers.to.getContext('2d')!});
 try{const image=blend.progress<=0?buffers.from:blend.progress>=1?buffers.to:renderShader(blend.transition.shaderId,rc.project.size.width,rc.project.size.height,state.frame*rc.project.fps.den/rc.project.fps.num,blend.transition.params,buffers.from,buffers.to,blend.progress);rc.ctx.setTransform(1,0,0,1,0,0);rc.ctx.globalAlpha=1;rc.ctx.filter='none';rc.ctx.clearRect(0,0,rc.project.size.width,rc.project.size.height);rc.ctx.drawImage(image,0,0,rc.project.size.width,rc.project.size.height);return{drawnNodeIds:[...new Set([...a.drawnNodeIds,...b.drawnNodeIds])],missingAssets:[...new Set([...a.missingAssets,...b.missingAssets])],threeLayerUsed:a.threeLayerUsed||b.threeLayerUsed};}
 finally{if(rc.threeLayer)for(const item of state.items)if(item.node.kind==='scene3d')rc.threeLayer.render(item,state);}
}
