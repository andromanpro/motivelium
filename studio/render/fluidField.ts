// Fixed-step, semi-Lagrangian ink simulation. Own implementation of advection,
// pressure projection and vorticity confinement; no clock/DOM/random globals.
// Numerical basis: Stam, Stable Fluids (1999); NVIDIA GPU Gems ch.38.
export type FluidOptions={seed:number;swirl:number;retention:number};
export type FluidState={step:number;u:Float32Array;v:Float32Array;r:Float32Array;g:Float32Array;b:Float32Array};
export const FLUID_W=128,FLUID_H=72,FLUID_MAX_STEPS=3600;
const W=FLUID_W,H=FLUID_H,N=W*H,clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export function cloneFluid(s:FluidState):FluidState{return{step:s.step,u:s.u.slice(),v:s.v.slice(),r:s.r.slice(),g:s.g.slice(),b:s.b.slice()};}
function blank():FluidState{return{step:0,u:new Float32Array(N),v:new Float32Array(N),r:new Float32Array(N),g:new Float32Array(N),b:new Float32Array(N)};}
function sample(a:Float32Array,x:number,y:number){x=clamp(x,0,W-1.001);y=clamp(y,0,H-1.001);const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy,i=iy*W+ix;return(a[i]!*(1-tx)+a[i+1]!*tx)*(1-ty)+(a[i+W]!*(1-tx)+a[i+W+1]!*tx)*ty;}
function source(s:FluidState,o:FluidOptions,initial=false){
 const t=s.step/30,phase=(o.seed%997)/997*Math.PI*2;
 for(let j=0;j<3;j++){
  const a=t*(.34+j*.07)+phase+j*Math.PI*2/3,cx=W*(.5+.25*Math.cos(a)),cy=H*(.5+.27*Math.sin(a*1.13+j*.8)),radius=initial?19:4.5;
  const vx=-Math.sin(a)*1.8,vy=Math.cos(a*1.13+j*.8)*1.4;
  for(let y=Math.max(1,Math.floor(cy-radius*2));y<Math.min(H-1,Math.ceil(cy+radius*2));y++)for(let x=Math.max(1,Math.floor(cx-radius*2));x<Math.min(W-1,Math.ceil(cx+radius*2));x++){
   const i=y*W+x,dx=x-cx,dy=y-cy,k=Math.exp(-(dx*dx+dy*dy)/(radius*radius)),ink=k*(initial?1.2:.19);
   s.u[i]=s.u[i]!+(k*(vx-dy*.11)*o.swirl);s.v[i]=s.v[i]!+(k*(vy+dx*.11)*o.swirl);
   s.r[i]=s.r[i]!+(ink*[1,.05,.55][j]!);s.g[i]=s.g[i]!+(ink*[.12,.95,.05][j]!);s.b[i]=s.b[i]!+(ink*[.02,1,.9][j]!);
  }
 }
}
export function createFluid(o:FluidOptions):FluidState{const s=blank();source(s,o,true);return s;}
type Scratch={u:Float32Array;v:Float32Array;r:Float32Array;g:Float32Array;b:Float32Array;p:Float32Array;q:Float32Array;div:Float32Array;curl:Float32Array};
function scratch():Scratch{return{u:new Float32Array(N),v:new Float32Array(N),r:new Float32Array(N),g:new Float32Array(N),b:new Float32Array(N),p:new Float32Array(N),q:new Float32Array(N),div:new Float32Array(N),curl:new Float32Array(N)};}
function advect(out:Float32Array,input:Float32Array,u:Float32Array,v:Float32Array,damping:number){for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;out[i]=sample(input,x-u[i]!*.48,y-v[i]!*.48)*damping;}}
export function stepFluid(s:FluidState,o:FluidOptions,tmp:Scratch=scratch()):void{
 source(s,o);const{u,v,p,q,div,curl}=tmp;
 for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;curl[i]=.5*(s.v[i+1]!-s.v[i-1]!-s.u[i+W]!+s.u[i-W]!);}
 for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){const i=y*W+x,nx=Math.abs(curl[i+W]!)-Math.abs(curl[i-W]!),ny=Math.abs(curl[i+1]!)-Math.abs(curl[i-1]!),k=.12*o.swirl/(Math.hypot(nx,ny)+.001);s.u[i]=s.u[i]!+(nx*k*curl[i]!);s.v[i]=s.v[i]!-(ny*k*curl[i]!);}
 advect(u,s.u,s.u,s.v,.985);advect(v,s.v,s.u,s.v,.985);p.fill(0);q.fill(0);div.fill(0);
 for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;div[i]=-.5*(u[i+1]!-u[i-1]!+v[i+W]!-v[i-W]!);}
 let a=p,b=q;
 for(let pass=0;pass<10;pass++){for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;b[i]=(div[i]!+a[i-1]!+a[i+1]!+a[i-W]!+a[i+W]!)*.25;}[a,b]=[b,a];}
 for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;s.u[i]=clamp(u[i]!+.5*(a[i-1]!-a[i+1]!),-12,12);s.v[i]=clamp(v[i]!+.5*(a[i-W]!-a[i+W]!),-12,12);}
 advect(tmp.r,s.r,s.u,s.v,o.retention);advect(tmp.g,s.g,s.u,s.v,o.retention);advect(tmp.b,s.b,s.u,s.v,o.retention);
 s.r.set(tmp.r);s.g.set(tmp.g);s.b.set(tmp.b);s.step++;
}
export class FluidTimeline {
 readonly options:FluidOptions;private state:FluidState;private tmp=scratch();private checkpoints=new Map<number,FluidState>();
 constructor(o:FluidOptions){if(!Number.isFinite(o.seed)||!Number.isFinite(o.swirl)||!Number.isFinite(o.retention)||o.swirl<0||o.swirl>3||o.retention<.9||o.retention>1)throw Error('Некорректные параметры жидкости.');this.options={...o};this.state=createFluid(o);this.checkpoints.set(0,cloneFluid(this.state));}
 at(step:number):FluidState{
  if(!Number.isInteger(step)||step<0||step>FLUID_MAX_STEPS)throw Error('Жидкость: недопустимый шаг.');
  if(step<this.state.step){const key=Math.max(...[...this.checkpoints.keys()].filter(k=>k<=step));this.state=cloneFluid(this.checkpoints.get(key)!);}
  while(this.state.step<step){stepFluid(this.state,this.options,this.tmp);if(this.state.step%30===0){this.checkpoints.set(this.state.step,cloneFluid(this.state));if(this.checkpoints.size>14){const key=[...this.checkpoints.keys()].filter(k=>k!==0).sort((a,b)=>a-b)[0]!;this.checkpoints.delete(key);}}}
  return this.state;
 }
 stats(){return{step:this.state.step,checkpoints:this.checkpoints.size,bytes:(this.checkpoints.size+1)*N*5*4};}
}
// The cache is an acceleration only: a new timeline produces the same result.
const cache=new Map<string,FluidTimeline>();
export function fluidAt(o:FluidOptions,step:number){const key=JSON.stringify(o);let timeline=cache.get(key);if(timeline)cache.delete(key);else timeline=new FluidTimeline(o);cache.set(key,timeline);if(cache.size>4)cache.delete(cache.keys().next().value!);return timeline.at(step);}
export function clearFluidCache(){cache.clear();}
export function fluidPixels(s:FluidState,palette:number):Uint8ClampedArray {
 const out=new Uint8ClampedArray(N*4),angle=palette*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,R=s.r[i]!,G=s.g[i]!,B=s.b[i]!,density=R+G+B,dx=(s.r[Math.min(N-1,i+1)]!+s.g[Math.min(N-1,i+1)]!+s.b[Math.min(N-1,i+1)]!-density),dy=(s.r[Math.min(N-1,i+W)]!+s.g[Math.min(N-1,i+W)]!+s.b[Math.min(N-1,i+W)]!-density),light=clamp(.5+(dx-dy)*3,.1,1.25),shine=Math.pow(clamp(1-Math.abs(dx*4+dy*3-.25),0,1),18)*Math.min(1,density)*.36;
  const k=1.9/(1+density*.35),r=R*k,g=G*k,b=B*k,Y=.299*r+.587*g+.114*b,I=.596*r-.274*g-.322*b,Q=.211*r-.523*g+.312*b,ii=I*co-Q*si,qq=I*si+Q*co;
  out[i*4]=255*clamp((Y+.956*ii+.621*qq)*light+shine,0,1);out[i*4+1]=255*clamp((Y-.272*ii-.647*qq)*light+shine,0,1);out[i*4+2]=255*clamp((Y-1.106*ii+1.703*qq)*light+shine,0,1);out[i*4+3]=255;
 }
 return out;
}
