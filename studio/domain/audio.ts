import type {AssetRef, AudioTrack, Project} from './schema.ts';
import {accentSamples} from './synthAudio.ts';

export const AUDIO_RATE = 48000;
export type PCM = {channels: Float32Array[]; sampleRate: number};
export type AudioPlan = {duration: number; frames: number; tracks: AudioTrack[]};
/** Decode through the full edited clip, including its tail outside the film: fades depend on clip length. */
export function audioSourceEnd(tracks:AudioTrack[],assetId:string,duration:number){
  return Math.max(0,...tracks.filter(t=>t.assetId===assetId&&!t.mute&&t.gain>0&&t.offsetSeconds<duration).map(t=>t.clip?t.clip.sourceStartSeconds+t.clip.durationSeconds:duration+Math.max(0,-t.offsetSeconds)));
}
export function audioPlan(p: Project): AudioPlan {
  const duration = p.durationFrames * p.fps.den / p.fps.num;
  const tracks = p.audioTracks.filter(t => !t.mute && t.gain > 0 && (t.synth || t.assetId) && t.offsetSeconds < duration);
  if (duration > 300 || tracks.length > 64) throw Error('Звук: до 5 минут и 64 активных дорожек.');
  for (const t of tracks) if (!t.synth && !p.assets.some(a => a.id === t.assetId && a.mime.startsWith('audio/'))) throw Error('Звуковая дорожка ссылается не на аудиоресурс: ' + t.id);
  return {duration, frames: Math.ceil(duration * AUDIO_RATE), tracks};
}

/** Shared deterministic stereo mix. Both browser playback and MP4 encode this PCM. */
async function mixLegacyAudio(p: Project, load: (asset: AssetRef) => Promise<PCM>, check: () => void = () => {}) {
  const plan = audioPlan(p), left = new Float32Array(plan.frames), right = new Float32Array(plan.frames);
  const accentsL = plan.tracks.some(t => t.synth) ? new Float32Array(plan.frames) : null;
  const accentsR = accentsL ? new Float32Array(plan.frames) : null;
  for (const t of plan.tracks) {
    check();
    const pcm = t.synth ? {sampleRate: AUDIO_RATE, channels: [accentSamples(t.synth, AUDIO_RATE)]} : await load(p.assets.find(a => a.id === t.assetId)!);
    check();
    if (!pcm.channels.length || pcm.sampleRate !== AUDIO_RATE) throw Error('Нужен декодированный звук 48 кГц.');
    const targetL = t.synth ? accentsL! : left, targetR = t.synth ? accentsR! : right;
    const start = Math.round(t.offsetSeconds * AUDIO_RATE), sourceStart = Math.max(0, -start), outputStart = Math.max(0, start);
    const a = pcm.channels[0]!, b = pcm.channels[1] ?? a, length = Math.min(a.length - sourceStart, plan.frames - outputStart);
    for (let i = 0; i < length; i++) {
      targetL[outputStart + i]! += a[sourceStart + i]! * t.gain;
      targetR[outputStart + i]! += b[sourceStart + i]! * t.gain;
    }
  }
  // The accent bus uses the same envelope in browser and export, without gain makeup.
  let envelope = 0;
  const attack = Math.exp(-1 / (.003 * AUDIO_RATE)), release = Math.exp(-1 / (.25 * AUDIO_RATE)), threshold = .501187;
  for (let i = 0; i < plan.frames; i++) {
    if (accentsL && accentsR) {
      const level = Math.max(Math.abs(accentsL[i]!), Math.abs(accentsR[i]!)), coefficient = level > envelope ? attack : release;
      envelope = coefficient * envelope + (1 - coefficient) * level;
      const gain = envelope > threshold ? Math.pow(threshold / envelope, 1 - 1 / 6) : 1;
      left[i]! += accentsL[i]! * gain; right[i]! += accentsR[i]! * gain;
    }
    left[i] = Math.max(-.95, Math.min(.95, left[i]!)); right[i] = Math.max(-.95, Math.min(.95, right[i]!));
  }
  check();
  return {left, right, sampleRate: AUDIO_RATE, duration: plan.duration, tracks: plan.tracks.length};
}

/** Clip edits and ducking share this exact PCM path in preview and export. Old projects retain their previous samples. */
export async function mixProjectAudio(p:Project,load:(asset:AssetRef)=>Promise<PCM>,check:()=>void=()=>{}){
 if(!p.audioTracks.some(t=>t.clip))return mixLegacyAudio(p,load,check);
 const plan=audioPlan(p),musicL=new Float32Array(plan.frames),musicR=new Float32Array(plan.frames),left=new Float32Array(plan.frames),right=new Float32Array(plan.frames),duck=new Float32Array(plan.frames);
 const decoded=new Map<string,PCM>();
 for(const t of plan.tracks){
  check();let pcm:PCM;
  if(t.synth)pcm={sampleRate:AUDIO_RATE,channels:[accentSamples(t.synth,AUDIO_RATE)]};
  else{const a=p.assets.find(a=>a.id===t.assetId)!;pcm=decoded.get(a.id)??await load(a);decoded.set(a.id,pcm);}
  if(!pcm.channels.length||pcm.sampleRate!==AUDIO_RATE)throw Error('Нужен декодированный звук 48 кГц.');
  const c=t.clip,start=Math.round(t.offsetSeconds*AUDIO_RATE),source=Math.round((c?.sourceStartSeconds??0)*AUDIO_RATE),available=Math.max(0,pcm.channels[0]!.length-source),count=Math.min(available,c?Math.round(c.durationSeconds*AUDIO_RATE):available);
  const a=pcm.channels[0]!,b=pcm.channels[1]??a,targetL=t.kind==='music'?musicL:left,targetR=t.kind==='music'?musicR:right,pan=c?.pan??0,panL=pan>0?1-pan:1,panR=pan<0?1+pan:1;
  const fadeIn=Math.min(count/2,(c?.fadeInSeconds??0)*AUDIO_RATE),fadeOut=Math.min(count/2,(c?.fadeOutSeconds??0)*AUDIO_RATE);
  for(let j=Math.max(0,-start);j<count&&start+j<plan.frames;j++){
   const k=start+j,fade=Math.min(fadeIn?Math.sin(Math.min(1,j/fadeIn)*Math.PI/2):1,fadeOut?Math.sin(Math.min(1,(count-1-j)/fadeOut)*Math.PI/2):1),gain=t.gain*Math.max(0,fade),l=a[source+j]!*gain*panL,r=b[source+j]!*gain*panR;
   targetL[k]!+=l;targetR[k]!+=r;
   if(t.kind!=='music'&&(c?.duckMusicDb??0)>0&&Math.max(Math.abs(l),Math.abs(r))>.006)duck[k]=Math.max(duck[k]!,c!.duckMusicDb);
  }
 }
 let reduction=0;const attack=Math.exp(-1/(.015*AUDIO_RATE)),release=Math.exp(-1/(.22*AUDIO_RATE));
 for(let i=0;i<plan.frames;i++){const coefficient=duck[i]!>reduction?attack:release;reduction=coefficient*reduction+(1-coefficient)*duck[i]!;const gain=10**(-reduction/20);left[i]!+=musicL[i]!*gain;right[i]!+=musicR[i]!*gain;}
 // Peak look-ahead (5 ms), no make-up gain. The limiter cannot raise a quiet mix.
 const look=240,queue=new Int32Array(plan.frames),peak=new Float32Array(plan.frames);let head=0,tail=0;
 for(let i=plan.frames-1;i>=0;i--){while(head<tail&&queue[head]!>i+look)head++;const level=Math.max(Math.abs(left[i]!),Math.abs(right[i]!));while(head<tail&&Math.max(Math.abs(left[queue[tail-1]!]!),Math.abs(right[queue[tail-1]!]!))<=level)tail--;queue[tail++]=i;peak[i]=Math.max(level,head<tail?Math.max(Math.abs(left[queue[head]!]!),Math.abs(right[queue[head]!]!)):0);}
 let limiter=1;const recovery=Math.exp(-1/(.1*AUDIO_RATE));
 for(let i=0;i<plan.frames;i++){const desired=Math.min(1,.84/Math.max(.000001,peak[i]!));limiter=desired<limiter?desired:recovery*limiter+(1-recovery)*desired;left[i]!*=limiter;right[i]!*=limiter;}
 check();return{left,right,sampleRate:AUDIO_RATE,duration:plan.duration,tracks:plan.tracks.length};
}

export function mixWav(mix: {left: Float32Array; right: Float32Array}): Uint8Array {
  const out = new Uint8Array(44 + mix.left.length * 8), v = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, out.length - 8, true); text(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 3, true); v.setUint16(22, 2, true); v.setUint32(24, AUDIO_RATE, true); v.setUint32(28, AUDIO_RATE * 8, true);
  v.setUint16(32, 8, true); v.setUint16(34, 32, true); text(36, 'data'); v.setUint32(40, out.length - 44, true);
  for (let i = 0; i < mix.left.length; i++) {v.setFloat32(44 + i * 8, mix.left[i]!, true); v.setFloat32(48 + i * 8, mix.right[i]!, true);}
  return out;
}
