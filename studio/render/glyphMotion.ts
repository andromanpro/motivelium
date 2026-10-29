import type {TextNode} from '../domain/schema.ts';
import {glyphPose,type GlyphMotion} from '../effects/glyphMotion.ts';
const segmenter=new Intl.Segmenter('ru',{granularity:'grapheme'});
const layouts=new Map<string,Array<{segment:string;x:number;advance:number}>>();
function layout(ctx:CanvasRenderingContext2D,line:string){
 const key=ctx.font+'|'+line;let result=layouts.get(key);if(result)return result;
 result=[];let prefix='',width=0;for(const{segment}of segmenter.segment(line)){const next=prefix+segment,w=ctx.measureText(next).width;result.push({segment,x:width,advance:w-width});prefix=next;width=w}
 layouts.set(key,result);if(layouts.size>64)layouts.delete(layouts.keys().next().value!);return result;
}
export function drawGlyphMotion(ctx:CanvasRenderingContext2D,node:TextNode,spec:GlyphMotion){
 ctx.font=`${node.fontWeight??400} ${node.fontSize}px ${node.fontFamily}`;
 ctx.textBaseline='top';ctx.textAlign='left';
 const count=[...segmenter.segment(node.text)].length;let index=0;
 for(const[lineIndex,line]of node.text.split('\n').entries()){
  const width=ctx.measureText(line).width,origin=node.align==='center'?(node.geometry.width-width)/2:node.align==='right'?node.geometry.width-width:0;
  for(const{segment,x:offset,advance}of layout(ctx,line)){
   const x=origin+offset,y=lineIndex*node.fontSize*node.lineHeight+(node.fontSize*node.lineHeight-node.fontSize)/2;
   const pose=glyphPose(spec,index,count);index++;
   if(!segment.trim())continue;
   ctx.save();ctx.translate(x+advance/2+pose.x,y+node.fontSize*.5+pose.y);ctx.rotate(pose.rotation*Math.PI/180);ctx.scale(pose.scale,pose.scale);ctx.globalAlpha*=pose.opacity;
   ctx.fillStyle=spec.colorize?`hsl(${spec.hue+index*19} 88% 73%)`:node.color;
   ctx.fillText(segment,-advance/2,-node.fontSize*.5);ctx.restore();
  }
  index++;
 }
}
