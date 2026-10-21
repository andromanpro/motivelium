import type {Project} from '../../domain/schema.ts';
import type {FrameState} from '../../render/evaluate.ts';
import type {ThreeLayerRenderer} from '../../render/renderFrame.ts';
import {applyMatrix} from '../../domain/matrix.ts';
export function drawPartSelection(canvas:HTMLCanvasElement,project:Project,state:FrameState,nodeId:string,partId:string,layer?:ThreeLayerRenderer){
 const item=state.items.find(i=>i.node.id===nodeId);if(!item||!layer?.projectPart)return;const rect=layer.projectPart(item,state,partId);if(!rect?.visible)return;const c=canvas.getContext('2d');if(!c)return;
 const points=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x+rect.width,rect.y+rect.height],[rect.x,rect.y+rect.height]].map(([x,y])=>applyMatrix(item.screen,x!,y!));
 c.save();c.setTransform(1,0,0,1,0,0);c.strokeStyle='#8fffe0';c.lineWidth=Math.max(1.5,project.size.width/750);c.setLineDash([6,4]);c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.stroke();c.setLineDash([]);const size=Math.max(12,project.size.width/85);c.font=`600 ${size}px Arial`;const text=rect.name,w=c.measureText(text).width+20,x=Math.max(8,Math.min(project.size.width-w-8,points[0]!.x)),y=Math.max(size+12,Math.min(project.size.height-8,points[0]!.y-8));c.fillStyle='rgba(13,31,40,.96)';c.fillRect(x,y-size-6,w,size+12);c.fillStyle='#c2ffec';c.fillText(text,x+10,y);c.restore();
}
