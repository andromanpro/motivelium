/** Stateless branching discharge; normalized endpoints and no accumulated dt. */
export type ArcSpec={startX:number;startY:number;endX:number;endY:number;branches:number;roughness:number;width:number;power:number;speed:number;seed:number;palette:string;progress:number;seconds:number};
type Point=[number,number];
export type ArcPath={points:Point[];weight:number};
const hash=(n:number)=>{let x=(n|0)^0x9e3779b9;x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);return((x^(x>>>15))>>>0)/4294967296};
const smooth=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
function noise(seed:number,t:number){const k=Math.floor(t),p=smooth(t-k);return hash(seed+k*17)*(1-p)+hash(seed+(k+1)*17)*p}
export function arcPaths(s:ArcSpec,w:number,h:number):ArcPath[]{
 const a:Point=[s.startX*w,s.startY*h],b:Point=[s.endX*w,s.endY*h],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<.001||s.power<=0)return[];
 const nx=-dy/len,ny=dx/len,time=s.seconds*s.speed,reach=smooth(s.progress/.16),paths:ArcPath[]=[];
 const line=(from:Point,to:Point,seed:number,amount:number,count:number)=>Array.from({length:count+1},(_,i)=>{const t=i/count,envelope=Math.sin(Math.PI*t);let v=0;for(let k=0;k<4;k++)v+=(noise(seed+k*7919,time*(2+k*.73)+t*(7+k*13))-.5)*amount/Math.pow(1.85,k);return[Math.max(2,Math.min(w-2,from[0]+(to[0]-from[0])*t+nx*v*envelope)),Math.max(2,Math.min(h-2,from[1]+(to[1]-from[1])*t+ny*v*envelope))]as Point});
 const tip:Point=[a[0]+dx*reach,a[1]+dy*reach],main=line(a,tip,s.seed,len*s.roughness*.36,96);paths.push({points:main,weight:1});
 for(let i=0;i<Math.round(s.branches);i++){
  const t=.16+hash(s.seed+i*71)*.67;if(t>reach)continue;const at=main[Math.min(96,Math.floor(t/reach*96))]!,side=i%2?1:-1,spread=len*(.08+hash(s.seed+i*137)*.18),end:Point=[at[0]+dx*.08+nx*spread*side,at[1]+dy*.08+ny*spread*side];
  const points=line(at,end,s.seed+1000+i*47,spread*.5,28);paths.push({points,weight:.32+hash(i+42)*.23});
  if(i%2===0){const mid=points[17]!,fork:Point=[mid[0]+dx*.05-nx*spread*side*.3,mid[1]+dy*.05-ny*spread*side*.3];paths.push({points:line(mid,fork,s.seed+i*57,spread*.18,14),weight:.18})}
 }
 return paths;
}
export function arcEnvelope(s:ArcSpec){return s.power*smooth(s.progress/.035)*(1-smooth((s.progress-.88)/.12))*(.86+.14*Math.sin(s.seconds*s.speed*17+s.seed))}
