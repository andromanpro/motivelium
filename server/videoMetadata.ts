import {spawn} from 'node:child_process';
import type {AssetRef} from '../studio/domain/schema.ts';

function probe(binary:string,args:string[]):Promise<string>{return new Promise((resolve,reject)=>{
 const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',done=false;
 const finish=(e?:Error)=>{if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve(output);};
 const timer=setTimeout(()=>{child.kill();finish(Error('Проверка временной шкалы MP4 превысила 30 секунд.'));},30000);
 child.stdout.on('data',b=>{output+=b;if(output.length>16*1024*1024){child.kill();finish(Error('Слишком большая временная шкала MP4.'));}});
 child.stderr.resume();child.on('error',()=>finish(Error('Для MP4 нужен FFprobe.')));child.on('close',c=>finish(c===0?undefined:Error('Временную шкалу MP4 не удалось прочитать.')));
});}
/** Check all packet presentation timestamps, not just the two advertised average rates. */
export async function inspectMp4(binary:string,file:string,metadata?:{streams?:Array<Record<string,any>>;format?:Record<string,any>}):Promise<Pick<AssetRef,'width'|'height'|'durationSeconds'|'video'>>{
 const data=metadata??JSON.parse(await probe(binary,['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',file]));
 const streams=data.streams??[],v=streams.find((s:Record<string,unknown>)=>s.codec_type==='video'),a=streams.find((s:Record<string,unknown>)=>s.codec_type==='audio');
 const w=Number(v?.width),h=Number(v?.height),duration=Number(v?.duration??data.format?.duration),f=String(v?.r_frame_rate).split('/').map(Number);
 if(v?.codec_name!=='h264'||![w,h].every(n=>Number.isInteger(n)&&n>0&&n<=4096)||w*h>8_847_360||!Number.isFinite(duration)||duration<=0||duration>3600||f.length!==2||!f.every(n=>Number.isSafeInteger(n)&&n>0)||f[0]!/f[1]!<1||f[0]!/f[1]!>120||a&&(a.codec_name!=='aac'||![1,2].includes(Number(a.channels)))||streams.filter((s:Record<string,unknown>)=>s.codec_type==='video').length!==1||streams.filter((s:Record<string,unknown>)=>s.codec_type==='audio').length>1||v.side_data_list?.some((s:{rotation?:number})=>s.rotation&&s.rotation!==0))throw Error('Нужен MP4 H264 до4096px/8,8Мп, fps1..120, до60мин, AAC моно/стерео, без поворота кадра.');
 const raw=await probe(binary,['-v','error','-protocol_whitelist','file,pipe','-select_streams','v:0','-show_entries','packet=pts_time','-of','csv=p=0',file]);
 const pts=raw.split(/\r?\n/).filter(s=>s.trim()).map(s=>Number(s.split(',')[0])).sort((a,b)=>a-b),step=f[1]!/f[0]!;
 if(!pts.length||Math.abs(pts[0]!-Number(data.format?.start_time??0))>.00001||pts.some((p,i)=>!Number.isFinite(p)||(i>0&&Math.abs(p-pts[i-1]!-step)>Math.max(.00001,step*.002)))||Math.abs(pts.length*step-duration)>step+.0001)throw Error('Нужен MP4 с постоянной частотой кадров (CFR) и согласованным началом дорожек. Сначала преобразуйте исходник.');
 return{width:w,height:h,durationSeconds:duration,video:{codec:'h264',fps:{num:f[0]!,den:f[1]!},hasAudio:!!a}};
}
