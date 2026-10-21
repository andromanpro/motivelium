import type {SynthAccent,AudioTrack} from './schema.ts';
/** Deterministic PCM shared by preview and a future offline mix. No assets/network. */
export function accentSamples(s:SynthAccent,sampleRate=48000):Float32Array{
 const n=Math.ceil(s.durationSeconds*sampleRate),out=new Float32Array(n);let seed=(s.seed||1)>>>0,phase=0,low=0;
 for(let i=0;i<n;i++){const t=i/sampleRate,u=t/s.durationSeconds;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const noise=(seed>>>0)/2147483648-1;low+=.08*(noise-low);const attack=Math.min(1,t/.008),tail=Math.pow(1-u,2);
  if(s.voice==='impact'){phase+=2*Math.PI*s.pitch*(.55+1.8*Math.exp(-t*20))/sampleRate;out[i]=attack*tail*(Math.sin(phase)*Math.exp(-t*4)*.65+low*Math.exp(-t*16)*.4);}
  else if(s.voice==='chime'){const freq=s.pitch;out[i]=attack*tail*(Math.sin(2*Math.PI*freq*t)*.35+Math.sin(2*Math.PI*freq*1.5*t)*.19+Math.sin(2*Math.PI*freq*2*t)*.09)*Math.exp(-t*1.2);}
  else{phase+=2*Math.PI*s.pitch*(1+u*2)/sampleRate;out[i]=Math.sin(Math.PI*u)**2*(low*.9+Math.sin(phase)*.08)*.7;}
 }
 return out;
}
export function accentSlice(track:AudioTrack,seconds:number){if(!track.synth||track.mute)return null;const offset=seconds-track.offsetSeconds;if(offset>=track.synth.durationSeconds)return null;return{delay:Math.max(0,-offset),offset:Math.max(0,offset),gain:track.gain};}
