/** Stored parameters are small data; GPU state and caches never enter a project. */
export type Volume3d={density:number;strength:number;angle:number;lightX:number;lightY:number;lightZ:number;palette:string;quality:string;occlusion:boolean};
export type Surface3d={finish:string;roughness:number;metalness:number;tint:number};
export type Grade3d={glow:number;threshold:number;exposure:number;contrast:number;vignette:number};
export const QUALITY3D={draft:{scale:.5,maxSize:640,steps:16,shadow:256},balanced:{scale:.75,maxSize:1024,steps:32,shadow:512},high:{scale:1,maxSize:1600,steps:56,shadow:1024}} as const;
export function quality3d(name:string,width:number,height:number){const key=Object.hasOwn(QUALITY3D,name)?name as keyof typeof QUALITY3D:'balanced',p=QUALITY3D[key],scale=Math.min(p.scale,p.maxSize/Math.max(width,height));return{...p,name:key,width:Math.max(32,Math.round(width*scale)),height:Math.max(32,Math.round(height*scale))}}
/** Beauty is independent of the raymarch budget. Bound oversized offscreen layers. */
export function beautySize3d(width:number,height:number,maxSide=4096){
 const scale=Math.min(1,maxSide/Math.max(width,height),Math.sqrt(8_847_360/(width*height)));
 return{width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),limited:scale<1};
}
export function samples3d(supported:readonly number[]){return Math.max(0,...supported.filter(n=>Number.isInteger(n)&&n>0&&n<=4))}
/** Bloom resolves bright edges independently of the much smaller raymarch budget. */
export function bloomSize3d(width:number,height:number){const scale=Math.min(.5,1024/Math.max(width,height));return{width:Math.max(32,Math.round(width*scale)),height:Math.max(32,Math.round(height*scale))}}
export type RenderStats3d={quality:string;width:number;height:number;volumeWidth?:number;volumeHeight?:number;samples?:number;beautyLimited?:boolean;steps:number;passes:number;cpuMs:number;hdr:boolean;occlusion:boolean};
