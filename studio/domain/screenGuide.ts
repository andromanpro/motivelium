import type {Project,VideoNode} from './schema.ts';
import type {Operation} from './operations.ts';

/** Time and coordinates belong to the original recording, not the edited scene. */
export type ScreenPoint={time:number;x:number;y:number;zoom:number;click:boolean};
export type ScreenGuide={points:ScreenPoint[];cursor:boolean;clicks:boolean;autoZoom:boolean;dim:number;radius:number;color:string};
export const screenGuideDefaults=():ScreenGuide=>({points:[],cursor:true,clicks:true,autoZoom:true,dim:.32,radius:.18,color:'#8fe5ce'});
export function screenGuideErrors(value:unknown,duration=3600):string[]{
 if(value===null||value===undefined)return[];
 const errors:string[]=[];
 if(!value||typeof value!=='object'||Array.isArray(value))return['screenGuide: expected an object or null'];
 const g=value as Record<string,unknown>;
 for(const k of Object.keys(g))if(!['points','cursor','clicks','autoZoom','dim','radius','color'].includes(k))errors.push('screenGuide: unknown '+k);
 for(const k of ['cursor','clicks','autoZoom'])if(typeof g[k]!=='boolean')errors.push('screenGuide.'+k+': boolean required');
 const number=(v:unknown,min:number,max:number,label:string)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)errors.push(label+`: expected ${min}..${max}`);};
 number(g.dim,0,.7,'screenGuide.dim');number(g.radius,.05,.5,'screenGuide.radius');
 if(typeof g.color!=='string'||!/^#[0-9a-f]{6}$/i.test(g.color))errors.push('screenGuide.color: #rrggbb required');
 if(!Array.isArray(g.points)||g.points.length<1||g.points.length>80)return[...errors,'screenGuide.points: 1..80 points required'];
 let previous=-1;
 for(const [i,raw]of g.points.entries()){
  const label=`screenGuide.points[${i}]`;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){errors.push(label+': object required');continue;}
  const p=raw as Record<string,unknown>;
  for(const k of Object.keys(p))if(!['time','x','y','zoom','click'].includes(k))errors.push(label+': unknown '+k);
  number(p.time,0,Math.max(0,duration-1e-7),label+'.time');number(p.x,0,1,label+'.x');number(p.y,0,1,label+'.y');number(p.zoom,1,3,label+'.zoom');
  if(typeof p.click!=='boolean')errors.push(label+'.click: boolean required');
  if(Number(p.time)<=previous)errors.push(label+': times must be strictly increasing');previous=Number(p.time);
 }
 return errors;
}
export function screenGuideAt(g:ScreenGuide,time:number){
 const points=g.points,first=points[0]!,last=points.at(-1)!;
 let p=first;
 if(time>=last.time)p=last;
 else if(time>first.time){const hi=points.findIndex(p=>p.time>time),a=points[hi-1]!,b=points[hi]!,t=(time-a.time)/(b.time-a.time),e=t*t*(3-2*t);p={time,x:a.x+(b.x-a.x)*e,y:a.y+(b.y-a.y)*e,zoom:a.zoom+(b.zoom-a.zoom)*e,click:false};}
 return{x:p.x,y:p.y,zoom:g.autoZoom?p.zoom:1,clicks:g.clicks?points.filter(p=>p.click&&time>=p.time&&time-p.time<.55).map(p=>({...p,age:(time-p.time)/.55})):[]};
}
export function videoSourceTime(p:Project,n:VideoNode,frame:number){
 const scene=p.sequences.find(s=>s.id===n.sequenceId)!,a=p.assets.find(a=>a.id===n.assetId)!;
 return Math.min(n.sourceOut-1e-7,Math.max(n.sourceIn,n.sourceIn+(frame-scene.fromFrame)*p.fps.den/p.fps.num*n.speed),a.durationSeconds!-1e-7);
}
export function screenGuideOperations(p:Project,nodeId:string,guide:ScreenGuide|null):Operation[]{
 const n=p.nodes.find(n=>n.id===nodeId);if(n?.kind!=='video')throw Error('Select a video layer.');
 if(n.locked)throw Error('The video layer is locked.');
 const errors=screenGuideErrors(guide,p.assets.find(a=>a.id===n.assetId)?.durationSeconds);if(errors.length)throw Error(errors.join('; '));
 return[{op:'updateNode',targetId:nodeId,values:{screenGuide:structuredClone(guide)}}];
}
/** Source image -> local fitted rectangle, including its own bounded camera. */
export function screenViewport(w:number,h:number,sw:number,sh:number,fit:VideoNode['fit'],focus:{x:number;y:number;zoom:number}){
 const scale=fit==='fill'?1:fit==='contain'?Math.min(w/sw,h/sh):Math.max(w/sw,h/sh);
 const width=fit==='fill'?w:sw*scale,height=fit==='fill'?h:sh*scale,left=(w-width)/2,top=(h-height)/2,z=focus.zoom;
 const cropX=Math.max(0,Math.min(width-width/z,focus.x*width-width/(2*z))),cropY=Math.max(0,Math.min(height-height/z,focus.y*height-height/(2*z)));
 return{left,top,width,height,zoom:z,cropX,cropY,toLocal:(x:number,y:number)=>({x:left+(x*width-cropX)*z,y:top+(y*height-cropY)*z}),toSource:(x:number,y:number)=>({x:Math.max(0,Math.min(1,((x-left)/z+cropX)/width)),y:Math.max(0,Math.min(1,((y-top)/z+cropY)/height))})};
}
