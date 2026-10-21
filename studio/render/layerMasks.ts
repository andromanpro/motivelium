import {morphContour,organicContour,type LayerMask,type Point} from '../effects/contours.ts';
import {renderShader} from './shaderRenderer.ts';
let buffers:HTMLCanvasElement[]|null=null;
function path(ctx:CanvasRenderingContext2D,points:Point[]){if(!points.length)return;ctx.moveTo(...points[0]!);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();}
/** Two scratch surfaces; no history. Each call consumes its result synchronously. */
export function maskLayer(source:HTMLCanvasElement,masks:LayerMask[],sourceShape:'rect'|'ellipse'):HTMLCanvasElement{
 if(!buffers)buffers=[document.createElement('canvas'),document.createElement('canvas')];let image=source;
 for(const mask of masks){const w=source.width,h=source.height,p=mask.progress,effective=mask.inverse?1-p:p;
  if(mask.kind!=='contour'&&effective>=1)continue;
  if(mask.kind==='contour'&&p<=0&&mask.inverse)continue;
  const fullContour=mask.kind==='contour'&&p>=1&&mask.contour?.to==='source';if(fullContour&&!mask.inverse)continue;
  const destination=image===buffers[0]?buffers[1]!:buffers[0]!;if(destination.width!==w||destination.height!==h){destination.width=w;destination.height=h;}
  const ctx=destination.getContext('2d',{willReadFrequently:true})!;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.shadowBlur=0;
  if((mask.kind!=='contour'&&effective<=0)||(mask.kind==='contour'&&p<=0&&!mask.inverse)||(fullContour&&mask.inverse)){image=destination;continue;}
  if(mask.kind==='dissolve'){ctx.drawImage(renderShader('motivelium-dissolve-mask',w,h,0,{revealProgress:p,invert:mask.inverse?1:0,detail:mask.detail,softness:mask.softness,seed:mask.seed},image),0,0,w,h);}
  else{ctx.save();ctx.beginPath();if(mask.inverse)ctx.rect(0,0,w,h);
   const points=mask.kind==='contour'?morphContour(mask.contour!,sourceShape).map(([x,y])=>[(50+(x-50)*p)*w/100,(50+(y-50)*p)*h/100] as Point):organicContour(mask,w,h);
   path(ctx,points);ctx.clip(mask.inverse?'evenodd':'nonzero');ctx.drawImage(image,0,0);ctx.restore();}
  image=destination;
 }return image;
}
