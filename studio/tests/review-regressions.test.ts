import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDemo} from '../domain/demo.ts';
import {evaluateFrame} from '../render/evaluate.ts';
import {renderFrame} from '../render/renderFrame.ts';
const demo=()=>buildDemo({sha256:'a'.repeat(64),bytes:100,width:3440,height:1334});
test('скрытая группа скрывает детей, сохраняя их собственный visible',()=>{
 const p=demo();p.effects=[];p.nodes.find(n=>n.id==='cards-m2')!.visible=false;
 const frame=evaluateFrame(p,30);assert.equal(frame.items.some(x=>x.node.id==='card-a'),false);assert.equal(frame.items.some(x=>x.node.id==='card-b'),false);assert.equal(p.nodes.find(n=>n.id==='card-a')!.visible,true);
});
test('непрозрачность эффекта группы наследуется детьми',()=>{
 const p=demo();p.effects=[{id:'group-enter',definitionId:'reveal-deal',definitionVersion:1,targetId:'cards-m2',fromFrame:0,toFrame:45,params:{},enabled:true,order:1}];
 assert.equal(evaluateFrame(p,0).items.some(x=>x.node.id==='card-a'),false);
 const middle=evaluateFrame(p,5);const group=middle.items.find(x=>x.node.id==='cards-m2')!;assert.ok(group.opacity>0&&group.opacity<1);assert.equal(middle.items.find(x=>x.node.id==='card-a')!.opacity,group.opacity);
});
function context(){const imageCalls:Array<{alpha:number;args:unknown[]}>=[];const operations:string[]=[];const object:Record<string,unknown>={globalAlpha:1,drawImage(...args:unknown[]){imageCalls.push({alpha:object.globalAlpha as number,args});operations.push('drawImage')},setTransform(){operations.push('transform')},rect(){operations.push('rect')},clip(){operations.push('clip')}};const ctx=new Proxy(object,{get(target,key){return key in target?target[key as string]:()=>{}},set(target,key,value){target[key as string]=value;return true}});return{ctx:ctx as unknown as CanvasRenderingContext2D,imageCalls,operations}}
test('3D соблюдает порядок документа: последующая 2D-подпись рисуется поверх',()=>{
 const p=demo(),st=evaluateFrame(p,200),c=context();const r=renderFrame(st,{ctx:c.ctx,project:p,bitmaps:new Map(),threeLayer:{render:()=>({}as HTMLCanvasElement),raycast:()=>null,dispose(){}}});
 assert.deepEqual(r.drawnNodeIds,['mech-m2','note-m2']);assert.equal(r.threeLayerUsed,true);
});
test('3D-композит учитывает непрозрачность узла',()=>{
 const p=demo();p.nodes.find(n=>n.id==='mech-m2')!.transform.opacity=.35;const c=context();renderFrame(evaluateFrame(p,200),{ctx:c.ctx,project:p,bitmaps:new Map(),threeLayer:{render:()=>({}as HTMLCanvasElement),raycast:()=>null,dispose(){}}});assert.equal(c.imageCalls[0]!.alpha,.35);
});
test('cover-изображение ограничивается собственной геометрией до drawImage',()=>{
 const p=demo();const node=p.nodes.find(n=>n.id==='shot-m2')!;if(node.kind!=='image')throw Error('fixture');node.fit='cover';const c=context();renderFrame(evaluateFrame(p,100),{ctx:c.ctx,project:p,bitmaps:new Map([['asset-monitor-frame',{width:3440,height:1334}as HTMLCanvasElement]])});assert.ok(c.operations.indexOf('clip')>=0);assert.ok(c.operations.indexOf('clip')<c.operations.indexOf('drawImage'));
});
