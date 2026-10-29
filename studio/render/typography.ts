import {letterGeometry,type LetterMorph,type AsciiStyle} from '../effects/typography.ts';
import type {TextNode} from '../domain/schema.ts';
import {glyphPose,type GlyphMotion} from '../effects/glyphMotion.ts';
const canvasCache=new Map<string,HTMLCanvasElement>();
function surface(key:string,w:number,h:number){let c=canvasCache.get(key);if(!c){c=document.createElement('canvas');canvasCache.set(key,c);if(canvasCache.size>8){const k=canvasCache.keys().next().value!;const old=canvasCache.get(k)!;old.width=old.height=1;canvasCache.delete(k)}}if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;return c}
export function drawLetterMorph(ctx:CanvasRenderingContext2D,node:TextNode,spec:LetterMorph,motion?:GlyphMotion){
 const shapes=letterGeometry(spec.fromText||node.text,spec,node.geometry.width,node.fontSize,node.lineHeight,node.align);
 for(const glyph of shapes){ctx.save();if(motion){const points=glyph.shape.flat();if(points.length){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2,pose=glyphPose(motion,glyph.index,shapes.length);ctx.translate(cx+pose.x,cy+pose.y);ctx.rotate(pose.rotation*Math.PI/180);ctx.scale(pose.scale,pose.scale);ctx.translate(-cx,-cy);ctx.globalAlpha*=pose.opacity;}}ctx.beginPath();for(const ring of glyph.shape){if(ring.length<3)continue;const last=ring.at(-1)!,first=ring[0]!;ctx.moveTo((last[0]+first[0])/2,(last[1]+first[1])/2);for(let i=0;i<ring.length;i++){const a=ring[i]!,b=ring[(i+1)%ring.length]!;ctx.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2)}ctx.closePath()}if(spec.colorize){const color=ctx.createLinearGradient(0,0,0,node.geometry.height);color.addColorStop(0,`hsl(${(spec.hue+glyph.index*13)%360} 82% 83%)`);color.addColorStop(1,`hsl(${(spec.hue+glyph.index*13+25)%360} 66% 49%)`);ctx.fillStyle=color;ctx.lineWidth=node.fontSize*.018;ctx.strokeStyle='#0c2028';ctx.stroke()}else ctx.fillStyle=node.color;ctx.fill('evenodd');if(spec.colorize){const alpha=ctx.globalAlpha;ctx.globalAlpha=alpha*.32;ctx.lineWidth=Math.max(.65,node.fontSize*.004);ctx.strokeStyle='#eafffa';ctx.stroke();ctx.globalAlpha=alpha}ctx.restore()}
}
const hash=(n:number,seed:number)=>{const t=Math.sin(n*127.1+seed*311.7)*43758.5453;return t-Math.floor(t)};
const FISH_POSES=[['    /\\  ','><(((o> ','    \\/  '],['     /\\ ','}<(((o> ','     \\/ '],['    /\\  ','><(( o> ','    \\/  '],['   /\\   ','}<(((o> ','   \\/   ']];
/** A stateless ASCII pass. Procedural modes are sampled by absolute time, never RAF history. */
export function asciiLayer(input:HTMLCanvasElement,spec:AsciiStyle,key:string):HTMLCanvasElement{
 if(spec.mix<=0)return input;
 const w=input.width,h=input.height,cell=Math.max(spec.cell,w/160,h/100),cols=Math.max(1,Math.ceil(w/cell)),rows=Math.max(1,Math.ceil(h/cell));
 const sample=surface(key+':ascii-sample',cols,rows),sc=sample.getContext('2d',{willReadFrequently:true})!;sc.clearRect(0,0,cols,rows);sc.drawImage(input,0,0,cols,rows);const pixels=sc.getImageData(0,0,cols,rows).data;
 const out=surface(key+':ascii-result',w,h),ctx=out.getContext('2d')!;ctx.clearRect(0,0,w,h);ctx.globalAlpha=1;ctx.font=`${cell*1.15}px Consolas, monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
 const ramp=[...spec.ramp],time=spec.seconds;
 const fishPose=FISH_POSES[Math.floor(time*7)%4]!,fishX=(time*7+hash(spec.seed,77)*cols)%(cols+10)-10,fishY=rows*.5+Math.sin(time*.8)*rows*.2;
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  const i=(y*cols+x)*4,alpha=pixels[i+3]!/255;if(alpha<.02)continue;let level=(pixels[i]!*.2126+pixels[i+1]!*.7152+pixels[i+2]!*.0722)/255;
  if(spec.mode==='waves')level=(Math.sin(Math.hypot(x-cols*.5,y-rows*.5)*.40-time*3)+Math.sin(x*.18+y*.31+time*1.7)+2)/4;
  if(spec.mode==='vortex'){const dx=x-cols*.5,dy=y-rows*.5;level=(Math.sin(Math.atan2(dy,dx)*4-Math.hypot(dx,dy)*.26+time*2.5)+1)/2;}
  if(spec.mode==='rain'){const head=(time*(6+hash(x,spec.seed)*9)+hash(x+91,spec.seed)*rows)% (rows+18),d=(head-y+rows+18)%(rows+18);level=Math.max(0,1-d/15)*(.65+.35*hash(x+y*13,spec.seed));}
  let char=ramp[Math.min(ramp.length-1,Math.max(0,Math.floor(level*(ramp.length-.001))))]!;
  if(spec.mode==='fish'){const rx=Math.floor(x-fishX),ry=Math.floor(y-fishY);char=fishPose[ry]?.[rx]??' ';for(let b=0;b<3;b++){const bx=Math.floor(fishX+8+b*2),by=Math.floor(fishY-((time*4+b*4)%12));if(x===bx&&y===by)char=b%2?'.':'o'}level=1;}
  if(char===' ')continue;
  ctx.globalAlpha=alpha;if(spec.color){ctx.fillStyle=spec.mode==='layer'?`rgb(${pixels[i]} ${pixels[i+1]} ${pixels[i+2]})`:`hsl(${(spec.hue+level*60)%360} 72% ${37+level*43}%)`;}else ctx.fillStyle=spec.ink;
  ctx.fillText(char,(x+.5)*cell,(y+.5)*cell);
 }
 ctx.globalAlpha=1;
 if(spec.mix<1){const mixed=surface(key+':ascii-mix',w,h),mc=mixed.getContext('2d')!;mc.clearRect(0,0,w,h);mc.globalAlpha=1-spec.mix;mc.drawImage(input,0,0);mc.globalAlpha=spec.mix;mc.drawImage(out,0,0);mc.globalAlpha=1;return mixed}
 return out;
}
