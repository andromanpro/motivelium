import type {Project} from './schema.ts';

/** Compare on a shared clock, not on equal frame numbers (FPS may differ). */
export const comparisonDuration=(p:Project)=>p.durationFrames*p.fps.den/p.fps.num;
export function comparisonFrame(p:Project,seconds:number){
 return Math.max(0,Math.min(p.durationFrames-1,Math.floor(Math.max(0,seconds)*p.fps.num/p.fps.den+1e-7)));
}
function changed<T extends{id:string}>(a:T[],b:T[]){
 const left=new Map(a.map(v=>[v.id,v])),right=new Map(b.map(v=>[v.id,v]));
 return {added:b.filter(v=>!left.has(v.id)).length,removed:a.filter(v=>!right.has(v.id)).length,changed:b.filter(v=>left.has(v.id)&&JSON.stringify(left.get(v.id))!==JSON.stringify(v)).length};
}
export function comparisonChanges(before:Project,after:Project){
 return {nodes:changed(before.nodes,after.nodes),effects:changed(before.effects,after.effects),scenes:changed(before.sequences,after.sequences),audio:changed(before.audioTracks,after.audioTracks),camera:JSON.stringify(before.cameraTracks)!==JSON.stringify(after.cameraTracks)};
}
