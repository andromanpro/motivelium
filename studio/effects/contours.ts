/// <reference path="./flubber.d.ts" />
import flubber from 'flubber';
export type Point=[number,number];
export type ContourMorph={from:string;to:string;fromPath:string;toPath:string;progress:number};
export type LayerMask={kind:'contour'|'organic'|'dissolve';progress:number;inverse:boolean;centerX:number;centerY:number;seed:number;detail:number;softness:number;contour?:ContourMorph};
export const CONTOUR_CHOICES=[{value:'source',label:'Исходная фигура'},{value:'circle',label:'Круг'},{value:'window',label:'Скруглённое окно'},{value:'hexagon',label:'Шестиугольник'},{value:'star',label:'Звезда'},{value:'bolt',label:'Молния'},{value:'play',label:'Воспроизведение'},{value:'letter-t',label:'Буква Т'},{value:'cross',label:'Крест'},{value:'custom',label:'Свой SVG-контур'}];
const circle:Point[]=Array.from({length:64},(_,i)=>[50+50*Math.cos(i/64*Math.PI*2),50+50*Math.sin(i/64*Math.PI*2)]);
const window:Point[]=[];for(let corner=0;corner<4;corner++){const centers=[[82,18],[82,82],[18,82],[18,18]],c=centers[corner]!;for(let i=0;i<=8;i++){const a=(-90+corner*90+i/8*90)*Math.PI/180;window.push([c[0]!+18*Math.cos(a),c[1]!+18*Math.sin(a)]);}}
export const CONTOURS:ReadonlyMap<string,Point[]>=new Map([
 ['rect',[[0,0],[100,0],[100,100],[0,100]]],['circle',circle],['window',window],
 ['hexagon',Array.from({length:6},(_,i)=>[50+50*Math.cos(i/6*Math.PI*2),50+50*Math.sin(i/6*Math.PI*2)] as Point)],
 ['star',Array.from({length:10},(_,i)=>{const a=i/10*Math.PI*2-Math.PI/2,r=i%2?22:50;return[50+r*Math.cos(a),50+r*Math.sin(a)] as Point;})],
 ['bolt',[[53,0],[15,58],[43,58],[32,100],[87,38],[58,38],[72,0]]],
 ['play',[[20,5],[95,50],[20,95]]],['letter-t',[[5,5],[95,5],[95,27],[62,27],[62,95],[38,95],[38,27],[5,27]]],
 ['cross',[[34,0],[66,0],[66,34],[100,34],[100,66],[66,66],[66,100],[34,100],[34,66],[0,66],[0,34],[34,34]]],
]);
const parsed=new Map<string,Point[]>(),interpolators=new Map<string,(t:number)=>Point[]>();
function boundedSet<T>(map:Map<string,T>,key:string,value:T,max=48){if(map.has(key))map.delete(key);map.set(key,value);while(map.size>max)map.delete(map.keys().next().value!);return value;}
export function customContour(path:string):Point[]{
 const known=parsed.get(path);if(known)return known.map(p=>[...p]);
 if(!path||path.length>1024||!/^[MLHVCQZ\d\s.,+\-]+$/.test(path)||!/^\s*M/.test(path)||!/Z\s*$/.test(path))throw Error('SVG-контур: один замкнутый путь M/L/H/V/C/Q/Z, координаты 0–100, до 1024 символов.');
 const groups=[...path.matchAll(/([MLHVCQZ])([^MLHVCQZ]*)/g)],counts:Record<string,number>={M:2,L:2,H:1,V:1,C:6,Q:4,Z:0};
 if(groups.length<4||groups.length>24||groups.filter(g=>g[1]==='M').length!==1||groups.filter(g=>g[1]==='Z').length!==1)throw Error('SVG-контур: от 4 до 24 команд, без отверстий и нескольких фигур.');
 for(const g of groups){const numbers=g[2]!.trim()?g[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number):[];if(numbers.length!==counts[g[1]!]||numbers.some(n=>!Number.isFinite(n)||n<0||n>100))throw Error('SVG-контур: проверь число аргументов команд и координаты 0–100.');}
 let ring:Point[];try{ring=flubber.interpolate(path,path,{string:false,maxSegmentLength:3})(.5);}catch{throw Error('Не удалось прочитать SVG-контур.');}
 if(ring.length>512||ring.length<3||ring.some(p=>p.some(n=>!Number.isFinite(n)))||Math.abs(polygonArea(ring))<.5)throw Error('SVG-контур слишком сложный или не имеет площади.');
 boundedSet(parsed,path,ring.map(p=>[...p]),32);return ring.map(p=>[...p]);
}
export function polygonArea(points:Point[]):number{return points.reduce((a,p,i)=>{const q=points[(i+1)%points.length]!;return a+p[0]*q[1]-q[0]*p[1];},0)/2;}
export function contourFor(name:string,path='',source:'rect'|'ellipse'='rect'):Point[]{
 if(name==='custom')return customContour(path);const ring=CONTOURS.get(name==='source'?(source==='ellipse'?'circle':'rect'):name);if(!ring)throw Error('Неизвестный контур: '+name);return ring.map(p=>[...p]);
}
export function morphContour(m:ContourMorph,source:'rect'|'ellipse'='rect'):Point[]{
 const a=contourFor(m.from,m.fromPath,source),b=contourFor(m.to,m.toPath,source),t=Math.max(0,Math.min(1,m.progress));
 if(t===0)return a;if(t===1)return b;
 const key=JSON.stringify([m.from,m.to,m.fromPath,m.toPath,source]),fn=interpolators.get(key)??boundedSet(interpolators,key,flubber.interpolate(a,b,{string:false,maxSegmentLength:3}));return fn(t).map(p=>[...p]);
}
export function nativeContourShape(m:ContourMorph,source:'rect'|'ellipse'):'rect'|'ellipse'|null{const name=m.progress===0?m.from:m.progress===1?m.to:null;return name==='source'?source:name==='circle'?'ellipse':null;}
export function contourParamErrors(id:string,p:Record<string,unknown>):string[]{
 if(id!=='contour-morph'&&id!=='contour-window')return[];const errors:string[]=[];
 for(const side of ['from','to']){const name=String(p[side]??(side==='from'?'source':'star')),path=p[side+'Path']??'';if(!CONTOUR_CHOICES.some(c=>c.value===name))errors.push('Неизвестный контур '+side);if(typeof path!=='string')errors.push('SVG-контур должен быть строкой.');else if(path||name==='custom')try{customContour(path)}catch(e){errors.push((e as Error).message);}}
 return errors;
}
export function pointInRing(points:Point[],x:number,y:number):boolean{let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i]!,b=points[j]!;if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function distanceToRing(points:Point[],x:number,y:number):number{let d=Infinity;for(let i=0;i<points.length;i++){const a=points[i]!,b=points[(i+1)%points.length]!,dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));d=Math.min(d,Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t));}return d;}
/** Pure organic front; same seed and frame give exactly the same contour. */
export function organicContour(mask:LayerMask,w:number,h:number):Point[]{const cx=mask.centerX*w,cy=mask.centerY*h,r=Math.hypot(Math.max(cx,w-cx),Math.max(cy,h-cy)),p=mask.progress;
 return Array.from({length:96},(_,i)=>{const a=i/96*Math.PI*2,n=Math.sin(a*5+mask.seed*.13)*.5+Math.sin(a*9-mask.seed*.071)*.3+Math.cos(a*13+mask.seed*.031)*.2,rad=r*p*(1.02+mask.detail*.08*n*(1-p));return[cx+Math.cos(a)*rad,cy+Math.sin(a)*rad] as Point;});}
export function contourCacheStats(){return{paths:parsed.size,interpolators:interpolators.size};}
export function maskIsPass(mask:LayerMask):boolean{return mask.inverse?mask.progress<=0:mask.kind==='contour'?mask.progress>=1&&mask.contour?.to==='source':mask.progress>=1;}
