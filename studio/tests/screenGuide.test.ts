import {test} from 'node:test';
import assert from 'node:assert/strict';
import {screenGuideDefaults,screenGuideAt,screenGuideErrors,screenViewport,screenGuideOperations,videoSourceTime} from '../domain/screenGuide.ts';
import {validateProject} from '../domain/schema.ts';
import {applyOperations} from '../domain/operations.ts';
import {packageFeatures} from '../domain/projectPackage.ts';
import {blankProject} from '../domain/projectSetup.ts';
import type {VideoNode,AssetRef} from '../domain/schema.ts';

test('screen guide source mapping survives trim/speed; holds do not oscillate and clicks are transient',()=>{
 const g={...screenGuideDefaults(),points:[{time:10,x:.5,y:.5,zoom:1,click:false},{time:11,x:.8,y:.3,zoom:2,click:true},{time:12,x:.8,y:.3,zoom:2,click:false},{time:14,x:.5,y:.5,zoom:1,click:false}]};
 assert.deepEqual(screenGuideAt(g,11.8),{x:.8,y:.3,zoom:2,clicks:[]});
 assert.equal(screenGuideAt(g,11.2).clicks.length,1);assert.equal(screenGuideAt(g,10.999).clicks.length,0);
 const center=screenGuideAt(g,10.5);assert.equal(center.zoom,1.5);assert.equal(center.x,.65);
 assert.equal(screenGuideAt({...g,autoZoom:false},11).zoom,1);
 assert.equal(screenGuideAt(g,30).zoom,1);
});
test('screen viewport stays inside edges and coordinates round-trip for contain/cover/fill',()=>{
 for(const fit of ['contain','cover','fill'] as const)for(const x of [0,.3,1])for(const y of [0,.8,1]){
  const v=screenViewport(1280,720,1920,1200,fit,{x,y,zoom:2.4});assert.ok(v.cropX>=0&&v.cropX<=v.width-v.width/v.zoom);assert.ok(v.cropY>=0&&v.cropY<=v.height-v.height/v.zoom);
  const local=v.toLocal(.42,.38),back=v.toSource(local.x,local.y);assert.ok(Math.abs(back.x-.42)<1e-10&&Math.abs(back.y-.38)<1e-10);
 }
});
test('screen guide rejects unordered, unknown, non-finite and excessive point data',()=>{
 const g={...screenGuideDefaults(),points:[{time:2,x:.5,y:.5,zoom:2,click:true}]};assert.deepEqual(screenGuideErrors(g,4),[]);
 for(const bad of [{...g,points:[...g.points,...g.points]},{...g,points:[{...g.points[0],time:4}]},{...g,points:[{...g.points[0],x:NaN}]},{...g,points:[{...g.points[0],zoom:4}]},{...g,points:Array(81).fill(g.points[0])},{...g,html:'unsafe'}])assert.ok(screenGuideErrors(bad,4).length);
 assert.deepEqual(screenGuideErrors(null),[]);
});
test('screen guide is a validated undoable node property with source timing and reader feature',()=>{
 const p=blankProject({size:{width:1280,height:720},durationFrames:180},'screen-test',1);
 const a:AssetRef={id:'source',path:'assets/screen.mp4',mime:'video/mp4',bytes:1,sha256:'a'.repeat(64),width:1920,height:1080,durationSeconds:20,origin:'staged',video:{codec:'h264',fps:{num:30,den:1},hasAudio:false}};
 const n:VideoNode={id:'screen',name:'Screen',kind:'video',sequenceId:'scene-main',parentId:null,geometry:p.size,transform:{x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,pivotX:0,pivotY:0},visible:true,locked:false,assetId:a.id,fit:'contain',sourceIn:10,sourceOut:14,speed:2,endBehavior:'hold'};
 p.assets=[a];p.nodes=[n];const g={...screenGuideDefaults(),points:[{time:11,x:.8,y:.3,zoom:2,click:true}]};
 const next=applyOperations(p,screenGuideOperations(p,n.id,g));validateProject(next);assert.equal((p.nodes[0] as VideoNode).screenGuide,undefined);assert.deepEqual((next.nodes[0] as VideoNode).screenGuide,g);
 assert.ok(packageFeatures(next).includes('screen-guide-v1'));assert.equal(videoSourceTime(p,n,15),11);assert.ok(videoSourceTime(p,n,179)<14);
 assert.equal((applyOperations(next,screenGuideOperations(next,n.id,null)).nodes[0] as VideoNode).screenGuide,null);
 assert.throws(()=>screenGuideOperations(p,n.id,{...g,points:[{...g.points[0]!,time:20}]}),/time/);
});
