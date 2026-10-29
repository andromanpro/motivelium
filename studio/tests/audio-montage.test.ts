import test from'node:test';import assert from'node:assert/strict';
import{buildEffectFixture}from'../effects/fixtures.ts';import{applyOperations}from'../domain/operations.ts';import{mixProjectAudio,AUDIO_RATE,audioSourceEnd}from'../domain/audio.ts';import{analyzeMusic}from'../domain/musicAnalysis.ts';import{clipDefaults,placeSound,gridCues,gridOperations,snapPose}from'../domain/audioEditing.ts';
const asset={id:'sound-source',path:'assets/test.wav',mime:'audio/wav',bytes:100,sha256:'a'.repeat(64),durationSeconds:2,origin:'staged' as const,title:'Проба'};
function project(){const p=buildEffectFixture('letter-morph');p.assets=[asset];p.audioTracks=[{id:'music',kind:'music',assetId:asset.id,gain:.2,offsetSeconds:0,mute:false}];return p}
test('export decode includes source trim and full fade tail; mono is duplicated without rematrix attenuation',async()=>{
 const p=project();p.durationFrames=60;p.sequences[0]!.toFrame=60;p.effects=[];p.audioTracks[0]!.offsetSeconds=.5;p.audioTracks[0]!.gain=1;p.audioTracks[0]!.clip={...clipDefaults(3),sourceStartSeconds:4,fadeInSeconds:0,fadeOutSeconds:1};
 assert.equal(audioSourceEnd(p.audioTracks,asset.id,2),7);
 const a=new Float32Array(AUDIO_RATE*7);a.fill(.25,AUDIO_RATE*4);const m=await mixProjectAudio(p,async()=>({sampleRate:AUDIO_RATE,channels:[a]}));assert.equal(m.left[48000],.25);assert.equal(m.right[48000],.25);assert.equal(m.left.at(-1),.25);
 assert.equal(audioSourceEnd([...p.audioTracks,{id:'legacy',kind:'sfx',assetId:asset.id,offsetSeconds:-6,gain:1,mute:false}],asset.id,2),8);
 assert.equal(audioSourceEnd([{...p.audioTracks[0]!,mute:true}],asset.id,2),0);
});
test('clip timing, source trim, fades and pan share exact source samples; music ducking recovers',async()=>{
 const p=project();p.durationFrames=90;p.sequences[0]!.toFrame=90;p.effects=[];
 p.audioTracks.push({id:'hit',kind:'sfx',assetId:asset.id,gain:1,offsetSeconds:.5,mute:false,clip:{sourceStartSeconds:.2,durationSeconds:.5,fadeInSeconds:.02,fadeOutSeconds:.03,pan:1,duckMusicDb:12}});
 const source=new Float32Array(AUDIO_RATE*2).fill(.3),mix=await mixProjectAudio(p,async()=>({sampleRate:AUDIO_RATE,channels:[source]}));
 assert.ok(Math.abs(mix.left[100]!-.06)<1e-6);assert.ok(mix.right[30000]!>mix.left[30000]!+.1);assert.ok(mix.left[35000]!<.025);assert.ok(mix.left[85000]!>.05);assert.ok([...mix.right].every(Number.isFinite));
 const only=structuredClone(p);only.audioTracks=only.audioTracks.slice(1);const isolated=await mixProjectAudio(only,async()=>({sampleRate:AUDIO_RATE,channels:[source]}));assert.equal(isolated.left[30000],0);assert.equal(isolated.right[24000],0);assert.equal(isolated.right[48000],0);
});
test('new limiter has bounded peaks and never raises quiet clips; negative offset retains source position',async()=>{
 const p=project();p.audioTracks[0]!.clip=clipDefaults(2);p.audioTracks[0]!.gain=4;const a=new Float32Array(AUDIO_RATE*2).fill(.7);a[2000]=1;
 const mixed=await mixProjectAudio(p,async()=>({sampleRate:AUDIO_RATE,channels:[a]}));assert.ok(Math.max(...mixed.left.slice(0,3000))<=.840001);
 p.audioTracks[0]!.gain=.1;p.audioTracks[0]!.offsetSeconds=-.25;p.audioTracks[0]!.clip!.fadeInSeconds=0;p.audioTracks[0]!.clip!.fadeOutSeconds=0;const quiet=await mixProjectAudio(p,async()=>({sampleRate:AUDIO_RATE,channels:[a]}));assert.ok(Math.abs(quiet.left[0]!-.07)<1e-6);
});
test('placement and generated grid are bounded, preserve author markers and exact fractional FPS',()=>{
 const p=project();p.fps={num:30000,den:1001};const track=placeSound(p,asset,30,'peak',.2,'effect');assert.ok(Math.abs(track.offsetSeconds-.801)<1e-9);
 const cues=gridCues(p,'music',120,.1,1,0,119,'musicgrid-check');assert.equal(cues[0]!.frame,3);assert.equal(cues[1]!.frame,18);p.cues=[{id:'author',trackId:'music',frame:7,kind:'phrase',label:'Пауза'},...cues];const updated=applyOperations(p,gridOperations(p,'music',[],true));assert.equal(updated.cues.length,1);assert.equal(updated.cues[0]!.id,'author');
 assert.throws(()=>gridCues(p,'music',NaN,0,1,0,119,'x'));assert.throws(()=>placeSound(p,asset,-1,'peak',.2,'x'));
});
test('audio clip/credit validation and operation Undo state reject malformed values atomically',()=>{
 const p=project(),snapshot=JSON.stringify(p);for(const patch of [{pan:5},{sourceStartSeconds:-1},{fadeInSeconds:Infinity},{duckMusicDb:25}])assert.throws(()=>applyOperations(p,[{op:'updateAudioTrack',targetId:'music',values:{clip:{...clipDefaults(2),...patch}}}]));
 assert.throws(()=>applyOperations(p,[{op:'updateAudioTrack',targetId:'music',values:{credit:{author:'x',license:'CC0',source:'javascript:alert(1)'}}}]));assert.equal(JSON.stringify(p),snapshot);
 const n=p.nodes.find(n=>n.id==='subject')!;const result=applyOperations(p,snapPose(p,n.id,20,30));assert.equal(result.nodes.find(x=>x.id===n.id)!.transformKeys!.at(-1)!.frame,30);n.locked=true;assert.throws(()=>snapPose(p,n.id,20,30));
});
test('beat analysis recovers pulse with silence, offset and a quiet offbeat; determinism and no false silence grid',()=>{
 const rate=11025,samples=new Float32Array(rate*12);for(let t=.25;t<12;t+=.5){const start=Math.round(t*rate);for(let j=0;j<500&&start+j<samples.length;j++)samples[start+j]!+=Math.sin(j*.43)*Math.exp(-j/75)*.65;}
 const result=analyzeMusic(samples,rate);assert.ok(result.bpm&&Math.abs(result.bpm-120)<2,JSON.stringify({bpm:result.bpm}));assert.ok(result.beatsSeconds.length>15);assert.ok(Math.min(...result.beatsSeconds.slice(0,3).map(t=>Math.abs(t-.25)))<.09);assert.deepEqual(analyzeMusic(samples,rate),result);
 const silent=analyzeMusic(new Float32Array(rate*4),rate);assert.equal(silent.bpm,null);assert.equal(silent.beatsSeconds.length,0);assert.throws(()=>analyzeMusic(new Float32Array([NaN]),rate));
});
