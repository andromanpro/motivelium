import type{Project,AudioTrack,AudioClip,AssetRef,SoundCredit,Cue}from'./schema.ts';
import type{Operation}from'./operations.ts';import{transformAtFrame}from'./animation.ts';
export type SoundEntry={id:string;title:string;category:string;categoryLabel?:string;tags:string[];file:string;sha256:string;bytes:number;durationSeconds:number;peakSeconds:number;suggestedGain:number;credit:SoundCredit};
export const clipDefaults=(durationSeconds:number):AudioClip=>({sourceStartSeconds:0,durationSeconds:Math.max(.001,Math.min(300,durationSeconds)),fadeInSeconds:.005,fadeOutSeconds:.025,pan:0,duckMusicDb:0});
export function placeSound(p:Project,a:AssetRef,frame:number,align:'start'|'peak'|'end',peakSeconds:number,id:string,entry?:SoundEntry):AudioTrack{
 if(!Number.isInteger(frame)||frame<0||frame>=p.durationFrames)throw Error('Звук: выберите кадр внутри проекта.');
 const duration=Math.min(a.durationSeconds??1,300),relative=align==='end'?duration:align==='peak'?peakSeconds:0;
 if(!Number.isFinite(relative)||relative<0||relative>duration)throw Error('Неверное положение пика звука.');
 return{id,kind:'sfx',assetId:a.id,gain:entry?.suggestedGain??.45,offsetSeconds:frame*p.fps.den/p.fps.num-relative,mute:false,name:entry?.title??a.title??'Звуковой эффект',clip:{...clipDefaults(duration),duckMusicDb:3},...(entry?{credit:entry.credit}:{})};
}
export function gridCues(p:Project,trackId:string,bpm:number,firstSeconds:number,every:number,fromFrame:number,toFrame:number,prefix:string):Cue[]{
 if(!p.audioTracks.some(t=>t.id===trackId))throw Error('Выберите музыкальную дорожку.');
 if(!Number.isFinite(bpm)||bpm<30||bpm>300||!Number.isFinite(firstSeconds)||Math.abs(firstSeconds)>3600||![1,2,4,8,16].includes(every)||!Number.isInteger(fromFrame)||!Number.isInteger(toFrame)||fromFrame<0||toFrame>=p.durationFrames||toFrame<fromFrame)throw Error('Сетка: BPM 30–300, корректный интервал и шаг.');
 const fps=p.fps.num/p.fps.den,step=60/bpm*every,from=fromFrame/fps,output:Cue[]=[];
 for(let i=Math.max(0,Math.ceil((from-firstSeconds)/step-1e-8));;i++){const frame=Math.round((firstSeconds+i*step)*fps);if(frame>toFrame)break;if(frame>=fromFrame&&frame>=0)output.push({id:prefix+'-'+i,trackId,frame,kind:every>=4?'bar':'beat',label:(every>=4?'Такт ':'Доля ')+(i+1)});if(output.length>160)throw Error('Больше 160 меток: увеличьте шаг или сократите интервал.');}
 return output;
}
export function gridOperations(p:Project,trackId:string,cues:Cue[],replace:boolean):Operation[]{const old=replace?p.cues.filter(c=>c.trackId===trackId&&c.id.startsWith('musicgrid-')):[];return[...old.map(c=>({op:'removeCue' as const,targetId:c.id})),...cues.map(c=>({op:'addCue' as const,cue:c}))]}
export function snapPose(p:Project,nodeId:string,fromFrame:number,toFrame:number):Operation[]{
 const node=p.nodes.find(n=>n.id===nodeId);if(!node||node.locked)throw Error('Выберите незаблокированный объект.');const scene=p.sequences.find(s=>s.id===node.sequenceId)!;
 if(!Number.isInteger(toFrame)||toFrame<scene.fromFrame||toFrame>=scene.toFrame)throw Error('Метка должна находиться в сцене объекта.');
 if(node.transformKeys?.some(k=>k.frame===toFrame)&&toFrame!==fromFrame)throw Error('На этой метке уже есть ключ. Выберите другую или отредактируйте его.');
 return[...(fromFrame!==toFrame&&node.transformKeys?.some(k=>k.frame===fromFrame)?[{op:'removeNodeKey' as const,targetId:nodeId,frame:fromFrame}]:[]),{op:'setNodeKey',targetId:nodeId,key:{frame:toFrame,transform:transformAtFrame(node,fromFrame),easing:'smooth'}}];
}
