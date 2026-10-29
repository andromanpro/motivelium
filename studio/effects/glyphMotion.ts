export type GlyphMotion = { mode:string; progress:number; amplitude:number; cycles:number; stagger:number; rotation:number; colorize:boolean; hue:number };
const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t)};
/** Pure glyph trajectories. Grapheme indices include whitespace and line breaks. */
export function glyphPose(spec:GlyphMotion,index:number,count:number){
 const phase=spec.progress*Math.PI*2*spec.cycles-index*spec.stagger;
 const wave=Math.sin(phase),amp=spec.amplitude;
 if(spec.mode==='assemble'){
  const q=ease((spec.progress-index/Math.max(1,count-1)*spec.stagger)/(1-spec.stagger));
  return{x:Math.sin(index*2.399)*amp*3*(1-q),y:Math.cos(index*2.399)*amp*2*(1-q),rotation:spec.rotation*Math.sin(index*4.1)*(1-q),scale:.45+.55*q,opacity:q};
 }
 return{x:spec.mode==='orbit'?Math.cos(phase)*amp*.45:0,y:wave*amp,rotation:Math.cos(phase)*spec.rotation,scale:1+(spec.mode==='wave'?wave*.055:0),opacity:1};
}
