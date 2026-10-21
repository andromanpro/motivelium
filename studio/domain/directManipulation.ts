import type {Project,Transform} from './schema.ts';
import type {FrameState} from '../render/evaluate.ts';
import {applyMatrix,compose,invert,type Mat2d} from './matrix.ts';
import {layerLockReason,layerQuad,subtreeIds} from './layers.ts';
import {keyAt,transformAtFrame,upsertTransformKey} from './animation.ts';
import type {Operation} from './operations.ts';

export type Point={x:number;y:number};
export type Corner=0|1|2|3;
export type CanvasGesture={projectId:string;revision:number;nodeId:string;frame:number;mode:'move'|'resize';keyframe:boolean;keyEasing:'smooth'|'linear'|'hold';corner:Corner;start:Point;transform:Transform;screen:Mat2d;parentInverse:Mat2d;local:Mat2d;box:Point[];anchor:Point;gripOffset:Point};

export function beginCanvasGesture(project:Project,state:FrameState,nodeId:string,start:Point,corner?:Corner,recordKey=false):CanvasGesture{
 const node=project.nodes.find(n=>n.id===nodeId),item=state.items.find(i=>i.node.id===nodeId),reason=layerLockReason(project,nodeId);
 if(reason)throw Error(reason);if(!node||!item)throw Error('Слой не виден на этом кадре.');
 if(node.kind==='group'&&project.nodes.some(n=>subtreeIds(project,nodeId).has(n.id)&&n.locked))throw Error('В группе есть заблокированные слои. Сначала разблокируй их.');
 const parent=node.parentId?state.items.find(i=>i.node.id===node.parentId)?.screen:state.cameraMatrix;if(!parent)throw Error('Группа не видна на этом кадре.');
 const parentInverse=invert(parent),local=compose(parentInverse,item.screen),quad=layerQuad(project,state,nodeId);if(!quad)throw Error('Нет видимой рамки слоя.');
 const box=quad.map(p=>applyMatrix(invert(item.screen),p.x,p.y)),c=corner??0,anchor=box[(c+2)%4]!,grip=box[c]!,pointer=applyMatrix(invert(item.screen),start.x,start.y);
 return{projectId:project.id,revision:project.revision,nodeId,frame:state.frame,mode:corner===undefined?'move':'resize',keyframe:recordKey||!!node.transformKeys?.length,keyEasing:node.transformKeys?.find(k=>k.frame===state.frame)?.easing??'smooth',corner:c,start,transform:{...transformAtFrame(node,state.frame)},screen:item.screen,parentInverse,local,box,anchor,gripOffset:{x:pointer.x-grip.x,y:pointer.y-grip.y}};
}

/** Gesture math uses the frozen frame, including camera, ancestors and effect transforms. */
export function transformForPointer(g:CanvasGesture,point:Point,keepAspect=false):Transform{
 const t={...g.transform};
 if(g.mode==='move'){
  const a=applyMatrix(g.parentInverse,g.start.x,g.start.y),b=applyMatrix(g.parentInverse,point.x,point.y);t.x+=b.x-a.x;t.y+=b.y-a.y;
 }else{
  const p=applyMatrix(invert(g.screen),point.x,point.y),grip=g.box[g.corner]!,anchor=g.anchor;
  let rx=(p.x-g.gripOffset.x-anchor.x)/(grip.x-anchor.x),ry=(p.y-g.gripOffset.y-anchor.y)/(grip.y-anchor.y);
  if(keepAspect){const ratio=Math.abs(rx-1)>=Math.abs(ry-1)?rx:ry;rx=ry=ratio;}
  // Crossing the anchor stops at a positive size; no accidental mirroring/singular matrix.
  const minX=.001/t.scaleX,maxX=1000/t.scaleX,minY=.001/t.scaleY,maxY=1000/t.scaleY;
  if(keepAspect){rx=ry=Math.max(Math.max(minX,minY),Math.min(Math.min(maxX,maxY),rx));}else{rx=Math.max(minX,Math.min(maxX,rx));ry=Math.max(minY,Math.min(maxY,ry));}
  t.scaleX*=rx;t.scaleY*=ry;
  const dx=(anchor.x-t.pivotX)*(1-rx),dy=(anchor.y-t.pivotY)*(1-ry);
  t.x+=g.local.a*dx+g.local.c*dy;t.y+=g.local.b*dx+g.local.d*dy;
 }
 if(!Object.values(t).every(Number.isFinite)||Math.abs(t.x)>1e6||Math.abs(t.y)>1e6)throw Error('Достигнут предел координат.');
 return t;
}
export function gestureOperations(g:CanvasGesture,transform:Transform):Operation[]{return ['x','y','scaleX','scaleY'].some(k=>Math.abs(transform[k as keyof Transform]-g.transform[k as keyof Transform])>1e-7)?(g.keyframe?[{op:'setNodeKey',targetId:g.nodeId,key:{frame:g.frame,transform,easing:g.keyEasing}}]:[{op:'updateNode',targetId:g.nodeId,values:{transform}}]):[];}
export function gestureProject(project:Project,g:CanvasGesture,transform:Transform):Project{return{...project,nodes:project.nodes.map(n=>n.id===g.nodeId?(g.keyframe?{...n,transformKeys:upsertTransformKey(n.transformKeys,keyAt(n,g.frame,transform))}:{...n,transform}):n)};}
export function cornerAt(quad:Point[]|null,point:Point,tolerance:number):Corner|undefined{if(!quad)return;const index=quad.findIndex(p=>Math.hypot(p.x-point.x,p.y-point.y)<=tolerance);return index<0?undefined:index as Corner;}
export function pointInQuad(quad:Point[]|null,p:Point){if(!quad)return false;let sign=0;for(let i=0;i<4;i++){const a=quad[i]!,b=quad[(i+1)%4]!,cross=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);if(Math.abs(cross)<1e-8)continue;const s=Math.sign(cross);if(sign&&s!==sign)return false;sign=s;}return true;}
