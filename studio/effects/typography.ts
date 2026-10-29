/// <reference path="./flubber.d.ts" />
import flubber from 'flubber';
import {LETTER_ATLAS,PUFFY_ATLAS} from './letterAtlas.ts';
export type LetterMorph={fromText?:string;style?:string;toText:string;progress:number;bend:number;stagger:number;colorize:boolean;hue:number};
export type AsciiStyle={mode:string;cell:number;ramp:string;color:boolean;ink:string;mix:number;seconds:number;seed:number;hue:number};
type Point=[number,number];type Shape=Point[][];
export type LetterGeometry={shape:Shape;index:number};
const cache=new Map<string,Array<Array<(t:number)=>Point[]>>>();
const clamp=(t:number)=>Math.max(0,Math.min(1,t));
const area=(r:Point[])=>Math.abs(r.reduce((a,p,i)=>{const q=r[(i+1)%r.length]!;return a+p[0]*q[1]-q[0]*p[1]},0)/2);
export function unsupportedLetters(text:string){return [...new Set([...text].filter(c=>c!=='\n'&&!LETTER_ATLAS[c]))]}
export function typographyErrors(id:string,p:Record<string,unknown>):string[]{
 if(id==='letter-morph')for(const value of [p.fromText??'',p.toText??'ВКУСНО']){if(typeof value!=='string'||[...value].length>120||value.split('\n').length>3)return ['Морфинг: текст — до 120 знаков, 3 строки.'];const bad=unsupportedLetters(value);if(bad.length)return ['Морфинг: нет контуров для '+bad.slice(0,8).join(' ')];}
 if(id==='ascii-screen'){if(p.ramp!==undefined&&(typeof p.ramp!=='string'||p.ramp.length<2||p.ramp.length>64||!/^[\x20-\x7e]+$/.test(p.ramp)))return ['ASCII: от 2 до 64 печатных ASCII-символов в палитре.'];if(p.ink!==undefined&&(typeof p.ink!=='string'||!/^#[0-9a-f]{6}$/i.test(p.ink)))return ['ASCII: цвет в формате #RRGGBB.'];}
 return [];
}
function layout(text:string,width:number,fontSize:number,lineHeight:number,align:string,style='onest'):Shape[]{
 const atlas=style==='puffy'?PUFFY_ATLAS:LETTER_ATLAS,lines=text.split('\n'),adv=lines.map(s=>[...s].reduce((n,c)=>n+(atlas[c]?.advance??35),0));
 const scale=Math.min(fontSize/100,width/Math.max(1,...adv));let out:Shape[]=[];
 lines.forEach((line,li)=>{let x=align==='center'?(width-adv[li]!*scale)/2:align==='right'?width-adv[li]!*scale:0;for(const c of line){const g=atlas[c];out.push((g?.shape??[]).map(r=>r.map(([px,py])=>[x+px*scale,fontSize*.82+li*fontSize*lineHeight+py*scale] as Point)));x+=(g?.advance??35)*scale;}});return out;
}
function center(shape:Shape):Point{const p=shape.flat();if(!p.length)return[0,0];return[p.reduce((s,v)=>s+v[0],0)/p.length,p.reduce((s,v)=>s+v[1],0)/p.length]}
function tiny([x,y]:Point):Point[]{return[[x-.001,y-.001],[x+.001,y-.001],[x,y+.001]]}
/** Pure, bounded vector interpolation. Separate contours and counters retain even-odd fill. */
export function letterGeometry(text:string,spec:LetterMorph,width:number,fontSize:number,lineHeight:number,align:string):LetterGeometry[]{
 const key=JSON.stringify([text,spec.toText,width,fontSize,lineHeight,align,spec.style??'onest']);let fns=cache.get(key);
 if(!fns){const a=layout(text,width,fontSize,lineHeight,align,spec.style),b=layout(spec.toText,width,fontSize,lineHeight,align,spec.style);fns=Array.from({length:Math.max(a.length,b.length)},(_,i)=>{const aa=[...(a[i]??[])].sort((a,b)=>area(b)-area(a)),bb=[...(b[i]??[])].sort((a,b)=>area(b)-area(a)),ca=center(aa.length?aa:bb),cb=center(bb.length?bb:aa);return Array.from({length:Math.max(aa.length,bb.length)},(_,j)=>flubber.interpolate(aa[j]??tiny(ca),bb[j]??tiny(cb),{string:false,maxSegmentLength:4}) as (t:number)=>Point[])});cache.set(key,fns);if(cache.size>24)cache.delete(cache.keys().next().value!);}
 const n=fns.length;
 return fns.map((loops,index)=>{const delay=n>1?index/(n-1)*spec.stagger:0,p=clamp((spec.progress-delay)/(1-spec.stagger)),wave=Math.sin(p*Math.PI)*spec.bend*fontSize*.10;return{index,shape:loops.map(fn=>fn(p).map(([x,y])=>[x,y+Math.sin(x/fontSize*2.8+p*Math.PI*2+index*.35)*wave] as Point))}});
}
export function typographyCacheSize(){return cache.size}
