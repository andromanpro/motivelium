/** Bounded local analysis, inspired by onset/tempo/phase separation in librosa. No model or network. */
export type MusicAnalysis={durationSeconds:number;bpm:number|null;firstBeatSeconds:number;confidence:number;beatsSeconds:number[];waveform:number[];peakSeconds:number;rms:number;warnings:string[]};
function fft(real:Float64Array,imag:Float64Array){const n=real.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j]!,real[i]!];[imag[i],imag[j]]=[imag[j]!,imag[i]!]}}for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle);for(let i=0;i<n;i+=len){let ur=1,ui=0;for(let j=0;j<len/2;j++){const a=i+j,b=a+len/2,tr=real[b]!*ur-imag[b]!*ui,ti=real[b]!*ui+imag[b]!*ur;real[b]=real[a]!-tr;imag[b]=imag[a]!-ti;real[a]!+=tr;imag[a]!+=ti;const next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next}}}}
export function analyzeMusic(samples:Float32Array,sampleRate=11025):MusicAnalysis{
 if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>48000||samples.length>sampleRate*300)throw Error('Анализ: моно, до 5 минут, 8–48 кГц.');
 const durationSeconds=samples.length/sampleRate,waveform:number[]=[],buckets=360;let maximum=0,peakIndex=0,sum=0;
 for(let i=0;i<samples.length;i++){const x=samples[i]!;if(!Number.isFinite(x))throw Error('Анализ: повреждённые PCM-данные.');sum+=x*x;if(Math.abs(x)>maximum){maximum=Math.abs(x);peakIndex=i}}
 for(let b=0;b<buckets;b++){let p=0;for(let i=Math.floor(b*samples.length/buckets);i<Math.floor((b+1)*samples.length/buckets);i++)p=Math.max(p,Math.abs(samples[i]!));waveform.push(Math.round(p*10000)/10000)}
 const base={durationSeconds,bpm:null,firstBeatSeconds:0,confidence:0,beatsSeconds:[],waveform,peakSeconds:peakIndex/sampleRate,rms:Math.sqrt(sum/Math.max(1,samples.length)),warnings:[] as string[]};
 if(durationSeconds<3||maximum<.002)return{...base,warnings:[durationSeconds<3?'Для поиска темпа нужен фрагмент от 3 секунд.':'Тишина или слишком тихий фрагмент.']};
 const size=1024,hop=256,count=Math.floor((samples.length-size)/hop)+1,raw=new Float64Array(count),previous=new Float64Array(size/2),re=new Float64Array(size),im=new Float64Array(size);
 for(let f=0;f<count;f++){for(let i=0;i<size;i++){re[i]=samples[f*hop+i]!*(.5-.5*Math.cos(2*Math.PI*i/(size-1)));im[i]=0}fft(re,im);let flux=0;for(let k=Math.ceil(80*size/sampleRate);k<Math.min(size/2,Math.floor(6500*size/sampleRate));k++){const magnitude=Math.log1p(10*Math.hypot(re[k]!,im[k]!));flux+=Math.max(0,magnitude-previous[k]!);previous[k]=magnitude}raw[f]=flux;}
 const env=new Float64Array(count);let total=0;for(let i=0;i<count;i++){let local=0,n=0;for(let j=Math.max(0,i-8);j<=Math.min(count-1,i+8);j++){local+=raw[j]!;n++}env[i]=Math.max(0,raw[i]!-local/n*.65);total+=env[i]!;}
 if(total<.01)return{...base,warnings:['Выраженных атак не найдено. Задайте BPM вручную.']};
 const hz=sampleRate/hop,candidates:Array<{lag:number;score:number}>=[];
 for(let lag=Math.floor(hz*60/190);lag<=Math.ceil(hz*60/60);lag++){let a=0,b=0,c=0;for(let i=lag;i<count;i++){a+=env[i]!*env[i-lag]!;b+=env[i]!**2;c+=env[i-lag]!**2}candidates.push({lag,score:a/Math.sqrt(Math.max(1e-9,b*c))})}
 candidates.sort((a,b)=>b.score-a.score);let best=candidates[0]!;
 // Close half-tempo alternatives are offered at the faster pulse; the user can choose the bar division.
 const faster=candidates.find(c=>c.lag<best.lag*.6&&c.score>=best.score*.92);if(faster)best=faster;
 const coarse=hz*60/best.lag;let bestBpm=coarse,bestPhase=0,bestScore=-1;
 for(const centerBpm of[coarse,coarse*2,coarse/2].filter(x=>x>=60&&x<=190))for(let bpm=centerBpm-3;bpm<=centerBpm+3;bpm+=.1){const period=hz*60/bpm;for(let phase=0;phase<period;phase+=.5){let score=0,n=0;for(let at=phase;at<count;at+=period){const center=Math.round(at);let v=0;for(let j=Math.max(0,center-1);j<=Math.min(count-1,center+1);j++)v=Math.max(v,env[j]!);score+=v;n++}score=score/Math.max(1,n)*(bpm/120)**.35;if(score>bestScore){bestScore=score;bestBpm=bpm;bestPhase=phase}}}
 const beatsSeconds:number[]=[];const firstBeatSeconds=(bestPhase*hop+size*.2)/sampleRate;
 for(let t=firstBeatSeconds;t<durationSeconds;t+=60/bestBpm)beatsSeconds.push(Math.round(t*10000)/10000);
 const confidence=Math.max(0,Math.min(1,best.score));return{...base,bpm:Math.round(bestBpm*10)/10,firstBeatSeconds,confidence,beatsSeconds,warnings:[confidence<.25?'Слабый ритм: обязательно проверьте сетку.':'Это предложение сетки. Первую долю такта и границы фраз выбираете вы.']};
}
