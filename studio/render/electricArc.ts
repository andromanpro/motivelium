import{arcPaths,arcEnvelope,type ArcSpec}from'../effects/electricArc.ts';
export function drawElectricArc(ctx:CanvasRenderingContext2D,s:ArcSpec,w:number,h:number){
 const power=arcEnvelope(s);if(power<=0)return;const paths=arcPaths(s,w,h),colors=s.palette==='amber'?['#ff842b','#ffd38b']:s.palette==='violet'?['#a452ff','#e6b7ff']:['#278cff','#a4f8ff'];
 ctx.save();const alpha=ctx.globalAlpha;ctx.globalCompositeOperation='screen';ctx.lineCap='round';ctx.lineJoin='round';
 for(const {points,weight}of paths){
  const trace=()=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y))};
  ctx.shadowBlur=0;ctx.strokeStyle=colors[0]!;ctx.globalAlpha=alpha*power*weight*.13;ctx.lineWidth=s.width*weight*15;trace();ctx.stroke();
  ctx.globalAlpha=alpha*power*weight*.7;ctx.lineWidth=s.width*weight*3;ctx.shadowColor=colors[0]!;ctx.shadowBlur=s.width*8;trace();ctx.stroke();
  ctx.strokeStyle=colors[1]!;ctx.lineWidth=Math.max(.55,s.width*weight);ctx.globalAlpha=alpha*power;ctx.shadowBlur=s.width*3;trace();ctx.stroke();
  ctx.strokeStyle='#f1ffff';ctx.lineWidth=Math.max(.35,s.width*weight*.38);ctx.shadowBlur=0;trace();ctx.stroke();
 }
 const main=paths[0]?.points;if(main)for(const at of[main[0]!,main.at(-1)!]){const r=s.width*19,g=ctx.createRadialGradient(at[0],at[1],0,at[0],at[1],r);g.addColorStop(0,'#e5ffff');g.addColorStop(.08,colors[1]!);g.addColorStop(.24,colors[0]+'88');g.addColorStop(1,colors[0]+'00');ctx.globalAlpha=alpha*power*.75;ctx.fillStyle=g;ctx.beginPath();ctx.arc(...at,r,0,Math.PI*2);ctx.fill()}
 ctx.restore();
}
