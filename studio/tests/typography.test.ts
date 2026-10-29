import test from 'node:test';import assert from 'node:assert/strict';
import {letterGeometry,typographyErrors,unsupportedLetters,typographyCacheSize,type LetterMorph} from '../effects/typography.ts';
import {pointInRing} from '../effects/contours.ts';import {REGISTRY,defaultParams,validateEffectParams} from '../effects/registry.ts';
import {buildEffectFixture} from '../effects/fixtures.ts';import {applyOperations} from '../domain/operations.ts';import {addEffectOperation} from '../effects/catalog.ts';import {evaluateFrame} from '../render/evaluate.ts';
const spec=(progress:number,toText='В'):LetterMorph=>({toText,progress,bend:0,stagger:0,colorize:false,hue:160});
const area=(r:number[][])=>Math.abs(r.reduce((n,p,i)=>{const q=r[(i+1)%r.length]!;return n+p[0]!*q[1]!-q[0]!*p[1]!},0)/2);
test('letters keep counters at endpoints: О has one hole, В has two; even-odd does not fill the center',()=>{
 const a=letterGeometry('О',spec(0),500,100,1.1,'center')[0]!,b=letterGeometry('О',spec(1),500,100,1.1,'center')[0]!;
 const rings=a.shape.filter(r=>area(r)>.01);assert.equal(rings.length,2);assert.equal(b.shape.filter(r=>area(r)>.01).length,3);
 const p=rings.flat(),x=(Math.min(...p.map(p=>p[0]))+Math.max(...p.map(p=>p[0])))/2,y=(Math.min(...p.map(p=>p[1]))+Math.max(...p.map(p=>p[1])))/2;
 assert.equal(rings.filter(r=>pointInRing(r,x,y)).length%2,0);
});
test('Cyrillic, Latin, multiline and different-length words have finite deterministic geometry at reverse seeks',()=>{
 const source='ГРАНКА)))\nЯ и ИИ',target='ВКУСНО!\nOnest 750';assert.deepEqual(unsupportedLetters(source+target),[]);
 const before=JSON.stringify(spec(.5,target));for(const p of [0,.2,.5,.9,1]){const g=letterGeometry(source,{...spec(p,target),bend:.6,stagger:.3},1200,120,1.1,'center');assert.ok(g.flatMap(l=>l.shape.flat()).every(p=>p.every(Number.isFinite)));}
 const first=letterGeometry(source,spec(.5,target),1200,120,1.1,'center');letterGeometry(source,spec(.9,target),1200,120,1.1,'center');assert.deepEqual(letterGeometry(source,spec(.5,target),1200,120,1.1,'center'),first);assert.equal(JSON.stringify(spec(.5,target)),before);
 for(let i=0;i<40;i++)letterGeometry('A'+i,spec(.4,'B'+i),500,80,1,'left');assert.ok(typographyCacheSize()<=24);
});
test('native operations reject unsupported glyphs, oversized text and unsafe palettes atomically',()=>{
 const p=buildEffectFixture('letter-morph'),snapshot=JSON.stringify(p);
 for(const toText of ['😀','A'.repeat(121),'A\nB\nC\nD'])assert.throws(()=>applyOperations(p,[{op:'updateEffect',targetId:p.effects[0]!.id,values:{params:{toText}}}]));
 assert.throws(()=>applyOperations(p,[{op:'updateNode',targetId:'subject',values:{text:'😀'}}]));assert.equal(JSON.stringify(p),snapshot);
 const ascii=REGISTRY.get('ascii-screen')!;for(const ramp of ['','x','😀ab','a'.repeat(65)])assert.ok(validateEffectParams(ascii,{...defaultParams(ascii),ramp}).length);
 assert.ok(typographyErrors('ascii-screen',{ink:'url(javascript:bad)'}).length);assert.deepEqual(typographyErrors('ascii-screen',{ramp:' .+#@',ink:'#abcdef'}),[]);
});
test('overlapping replacements are rejected, ASCII composes with letter morph and uses exact absolute time',()=>{
 const p=buildEffectFixture('letter-morph');assert.throws(()=>applyOperations(p,[addEffectOperation(p,'subject','letter-morph',{},0,120,'second')]),/не должны пересекаться/);
 const a=applyOperations(p,[addEffectOperation(p,'subject','ascii-screen',{mode:'waves',speed:2},0,120,'ascii')]);const item=evaluateFrame(a,45).items.find(n=>n.node.id==='subject')!;assert.ok(item.deltas.letterMorph);assert.equal(item.deltas.ascii!.seconds,3);
 assert.throws(()=>applyOperations(a,[addEffectOperation(a,'subject','ascii-screen',{},60,119,'second-ascii')]),/не должны пересекаться/);
 const effect=REGISTRY.get('letter-morph')!,params={...defaultParams(effect),delay:0,span:1};assert.equal(effect.evaluate(0,0,params,{fromFrame:0,toFrame:120,fps:30}).letterMorph!.progress,0);assert.equal(effect.evaluate(.99,119,params,{fromFrame:0,toFrame:120,fps:30}).letterMorph!.progress,1);
});
