import type {VideoNode} from '../domain/schema.ts';
import {screenGuideAt,screenViewport} from '../domain/screenGuide.ts';

export function drawScreenGuide(ctx:CanvasRenderingContext2D,bmp:CanvasImageSource&{width:number;height:number},node:VideoNode,time:number){
 const g=node.screenGuide!,f=screenGuideAt(g,time),w=node.geometry.width,h=node.geometry.height,v=screenViewport(w,h,bmp.width,bmp.height,node.fit,f),point=v.toLocal(f.x,f.y);
 ctx.save();ctx.beginPath();ctx.rect(Math.max(0,v.left),Math.max(0,v.top),Math.min(w,v.width),Math.min(h,v.height));ctx.clip();
 ctx.drawImage(bmp,v.left-v.cropX*v.zoom,v.top-v.cropY*v.zoom,v.width*v.zoom,v.height*v.zoom);
 // The focus treatment fades in with the zoom; the overview remains unobscured.
 const strength=g.dim*(g.autoZoom?Math.min(1,(f.zoom-1)/.5):1);
 if(strength>0){const r=Math.min(v.width,v.height)*g.radius,gradient=ctx.createRadialGradient(point.x,point.y,r*.65,point.x,point.y,r*1.4);gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(1,`rgba(0,0,0,${strength})`);ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);}
 for(const click of f.clicks){const p=v.toLocal(click.x,click.y),r=(12+click.age*38)*Math.max(.7,Math.min(w,h)/720);ctx.save();ctx.globalAlpha*=Math.sin(Math.PI*Math.min(1,click.age*1.6))*(1-click.age);ctx.strokeStyle=g.color;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();ctx.restore();}
 if(g.cursor){const k=Math.max(.65,Math.min(w,h)/720);ctx.save();ctx.translate(point.x,point.y);ctx.scale(k,k);ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=5;ctx.shadowOffsetY=2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,25);ctx.lineTo(6.5,19);ctx.lineTo(12,30);ctx.lineTo(17,27.5);ctx.lineTo(11.5,17);ctx.lineTo(21,17);ctx.closePath();ctx.fillStyle='#ffffff';ctx.strokeStyle='#182b30';ctx.lineWidth=1.8;ctx.lineJoin='round';ctx.fill();ctx.stroke();ctx.restore();}
 ctx.restore();
}
