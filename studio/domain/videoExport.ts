import type {Project,AudioTrack} from './schema.ts';

export type VideoExportStatus='preparing'|'rendering'|'mixing'|'verifying'|'ready'|'cancelling'|'cancelled'|'failed';
export type VideoExportJob={id:string;projectId:string;title:string;revision:number;snapshotHash:string;requestId:string;status:VideoExportStatus;progress:number;renderedFrames:number;totalFrames:number;createdAt:string;updatedAt:string;size:{width:number;height:number};fps:Project['fps'];durationSeconds:number;withAudio:boolean;error?:string;bytes?:number;sha256?:string;downloadUrl?:string;posterUrl?:string;encoder?:string;renderer?:string;audioTracks?:number};
export const exportTerminal=(status:VideoExportStatus)=>['ready','cancelled','failed'].includes(status);
export function videoExportSamples(p:Project){return new Set([0,p.durationFrames-1,Math.floor(p.durationFrames/2),...p.sequences.flatMap(s=>[s.fromFrame,Math.floor((s.fromFrame+s.toFrame)/2)]),...p.cues.map(c=>c.frame)].filter(f=>Number.isInteger(f)&&f>=0&&f<p.durationFrames).slice(0,64));}
export function videoExportPlan(p:Project){
 const duration=p.durationFrames*p.fps.den/p.fps.num;
 if(!Number.isInteger(p.size.width)||!Number.isInteger(p.size.height)||p.size.width>4096||p.size.height>4096||p.size.width*p.size.height>8_847_360)throw Error('MP4: размер кадра — целые числа до 4096 по стороне и до 8,8 млн пикселей.');
 if(duration>300||p.durationFrames>36_000||p.fps.num/p.fps.den>120)throw Error('MP4: первая версия поддерживает ролики до 5 минут, 36 000 кадров и 120 fps.');
 const audio=p.audioTracks.filter(t=>!t.mute&&t.gain>0&&(!!t.synth||!!t.assetId)&&t.offsetSeconds<duration);
 for(const t of audio){if(!t.synth&&!p.assets.find(a=>a.id===t.assetId&&a.mime.startsWith('audio/')))throw Error('Звуковая дорожка ссылается не на аудиоресурс: '+t.id);}
 if(audio.length>64)throw Error('MP4: не более 64 активных звуковых дорожек.');
 return{duration,width:Math.ceil(p.size.width/2)*2,height:Math.ceil(p.size.height/2)*2,audio};
}
/** Sample-accurate placement, including negative offsets. No automatic gain normalisation. */
export function audioPlacement(t:AudioTrack,input:number,duration:number){
 const trim=Math.max(0,-t.offsetSeconds),delay=Math.max(0,Math.round(t.offsetSeconds*48000));
 return`[${input}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=start=${trim},asetpts=PTS-STARTPTS,volume=${t.gain},adelay=${delay}S:all=1,apad=whole_dur=${duration},atrim=duration=${duration}[a${input}]`;
}
export function audioMixGraph(tracks:AudioTrack[],duration:number){
 const graph=tracks.map((t,i)=>audioPlacement(t,i+1,duration));
 const synth=tracks.flatMap((t,i)=>t.synth?[i+1]:[]),external=tracks.flatMap((t,i)=>!t.synth?[i+1]:[]);
 const buses=external.map(i=>`[a${i}]`);
 if(synth.length){graph.push(synth.map(i=>`[a${i}]`).join('')+`amix=inputs=${synth.length}:normalize=0,acompressor=threshold=0.501187:ratio=6:attack=3:release=250:knee=8[accents]`);buses.push('[accents]');}
 if(!buses.length)return'';
 graph.push(buses.join('')+`amix=inputs=${buses.length}:normalize=0,alimiter=limit=0.95:level=0:latency=1,apad=whole_dur=${duration},atrim=duration=${duration}[mix]`);
 return graph.join(';');
}
