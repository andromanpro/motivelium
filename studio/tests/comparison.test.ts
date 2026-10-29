import {test} from 'node:test';
import assert from 'node:assert/strict';
import {comparisonFrame,comparisonDuration,comparisonChanges} from '../domain/comparison.ts';
import type {Project} from '../domain/schema.ts';
const project=(num:number,den:number,frames:number)=>({fps:{num,den},durationFrames:frames,nodes:[],effects:[],audioTracks:[],cameraTracks:[],sequences:[]} as unknown as Project);
test('comparison shares seconds across frame rates, holds the end, and seeks backwards',()=>{
 const a=project(24,1,240),b=project(30000,1001,600);
 assert.equal(comparisonDuration(a),10);assert.equal(comparisonFrame(a,7.2),172);assert.equal(comparisonFrame(b,7.2),215);
 assert.equal(comparisonFrame(a,20),239);assert.equal(comparisonFrame(b,20),599);assert.equal(comparisonFrame(a,-1),0);assert.equal(comparisonFrame(a,2),48);
 assert.equal(comparisonFrame(b,1001/30000*33),33);
});
test('comparison counts changed content without counting revision or mutating either document',()=>{
 const a=project(30,1,90),b=structuredClone(a);a.revision=1;b.revision=2;
 assert.deepEqual(comparisonChanges(a,b).nodes,{added:0,removed:0,changed:0});
 a.sequences=[{id:'s',name:'First',fromFrame:0,toFrame:90}];b.sequences=[{id:'s',name:'Second',fromFrame:0,toFrame:90},{id:'new',name:'Next',fromFrame:90,toFrame:120}];
 const before=JSON.stringify([a,b]);assert.deepEqual(comparisonChanges(a,b).scenes,{added:1,removed:0,changed:1});assert.equal(JSON.stringify([a,b]),before);
});
