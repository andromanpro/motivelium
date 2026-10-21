/** Fixed-clock replay is independent of RAF, playback speed and cached frames. */
export const FEEDBACK_HZ=30, FEEDBACK_MAX_SECONDS=60, FEEDBACK_MAX_TICK=FEEDBACK_HZ*FEEDBACK_MAX_SECONDS-1;
export type ReplayBackend<T>={reset:()=>void;step:(tick:number)=>void;capture:()=>T;restore:(value:T)=>void};
export class StateReplay<T>{
 private tick=-1;
 private snapshots=new Map<number,T>();
 private backend:ReplayBackend<T>;private capacity:number;private interval:number;
 constructor(backend:ReplayBackend<T>,capacity=8,interval=30){if(capacity<2||!Number.isInteger(capacity)||interval<1||!Number.isInteger(interval))throw Error('Неверные границы snapshots');this.backend=backend;this.capacity=capacity;this.interval=interval;backend.reset();}
 at(target:number):void{
  if(!Number.isInteger(target)||target<0||target>FEEDBACK_MAX_TICK)throw Error('Неверный шаг feedback');
  if(target<this.tick){const previous=[...this.snapshots.keys()].filter(k=>k<=target).sort((a,b)=>b-a)[0];if(previous===undefined){this.backend.reset();this.tick=-1;}else{this.backend.restore(this.snapshots.get(previous)!);this.tick=previous;}}
  while(this.tick<target){const next=this.tick+1;this.backend.step(next);this.tick=next;if(next%this.interval===0){this.snapshots.set(next,this.backend.capture());while(this.snapshots.size>this.capacity){const victim=[...this.snapshots.keys()].find(k=>k!==0)!;this.snapshots.delete(victim);}}}
 }
 stats(){return{tick:this.tick,snapshots:this.snapshots.size,steps:[...this.snapshots.keys()]};}
}
export function feedbackTick(frame:number,fromFrame:number,fps:number):number{
 if(!Number.isFinite(frame)||!Number.isFinite(fromFrame)||!Number.isFinite(fps)||fps<=0||frame<fromFrame)throw Error('Неверное время feedback');
 const tick=Math.floor((frame-fromFrame)*FEEDBACK_HZ/fps+1e-7);if(tick>FEEDBACK_MAX_TICK)throw Error('Feedback ограничен 60 секундами');return tick;
}
