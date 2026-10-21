/** Stored parameters are small data; GPU state and caches never enter a project. */
export type Volume3d={density:number;strength:number;angle:number;lightX:number;lightY:number;lightZ:number;palette:string;quality:string;occlusion:boolean};
export type Surface3d={finish:string;roughness:number;metalness:number;tint:number};
export type Grade3d={glow:number;threshold:number;exposure:number;contrast:number;vignette:number};
export const QUALITY3D={draft:{scale:.5,maxSize:640,steps:16,shadow:256},balanced:{scale:.75,maxSize:1024,steps:32,shadow:512},high:{scale:1,maxSize:1600,steps:56,shadow:1024}} as const;
export function quality3d(name:string,width:number,height:number){const key=Object.hasOwn(QUALITY3D,name)?name as keyof typeof QUALITY3D:'balanced',p=QUALITY3D[key],scale=Math.min(p.scale,p.maxSize/Math.max(width,height));return{...p,name:key,width:Math.max(32,Math.round(width*scale)),height:Math.max(32,Math.round(height*scale))}}
export type RenderStats3d={quality:string;width:number;height:number;steps:number;passes:number;cpuMs:number;hdr:boolean;occlusion:boolean};
