import crypto from 'node:crypto';
import type {VisualFrame,VisualReceipt} from '../../studio/agent/visual.ts';
import type {ModelMessage} from './provider.ts';
function dimensions(b:Buffer):{width:number;height:number}{
 if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.toString('ascii',12,16)==='IHDR')return{width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
 if(b[0]===255&&b[1]===216){let p=2;while(p+4<b.length){if(b[p++]!==255)throw Error('Повреждён JPEG.');while(b[p]===255)p++;const marker=b[p++]!;if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const length=b.readUInt16BE(p);if(length<2||p+length>b.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8)return{height:b.readUInt16BE(p+3),width:b.readUInt16BE(p+5)};p+=length;}}
 throw Error('Не удалось прочитать PNG/JPEG кадра.');
}
export function validateVisualFrames(raw:unknown,duration:number,mode:'source'|'comparison'|'refinement'):{frames:VisualFrame[];receipts:VisualReceipt[]}{
 if(!Array.isArray(raw)||!raw.length||raw.length>6)throw Error('Нужно от1до6 снимков кадра.');
 const frames:VisualFrame[]=[],receipts:VisualReceipt[]=[],seen=new Set<string>();let total=0;
 for(const entry of raw){
  if(!entry||typeof entry!=='object')throw Error('Неверный снимок кадра.');const v=entry as VisualFrame;
  if(!Number.isInteger(v.frame)||v.frame<0||v.frame>=duration||!['before','after'].includes(v.role))throw Error('Неверный номер или роль кадра.');
  if(mode==='source'&&v.role!=='before')throw Error('Для первой правки нужен исходный кадр.');
  const key=v.role+':'+v.frame;if(seen.has(key))throw Error('Повтор снимка кадра.');seen.add(key);
  if(typeof v.image!=='string'||v.image.length>1500000)throw Error('Снимок слишком большой.');const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(v.image);if(!match)throw Error('Допустим только встроенный PNG/JPEG, без внешних URL.');
  const bytes=Buffer.from(match[2]!,'base64');if(!bytes.length||bytes.length>1024*1024||bytes.toString('base64')!==match[2])throw Error('Неверный размер или Base64 снимка.');total+=bytes.length;if(total>4*1024*1024)throw Error('Суммарно снимки больше4МБ.');
  if((match[1]==='png')!==(bytes[0]===137))throw Error('Формат снимка не совпадает с MIME.');
  const d=dimensions(bytes);if(d.width<1||d.height<1||d.width>1280||d.height>1280||d.width!==v.width||d.height!==v.height)throw Error('Снимок должен быть до1280px с верными размерами.');
  const target=v.target;if(!target||typeof target.visible!=='boolean'||(target.quad!==null&&(!Array.isArray(target.quad)||target.quad.length!==4||target.quad.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e7||Math.abs(p.y)>1e7))))throw Error('Неверная область выбранного объекта.');
  const frame={frame:v.frame,role:v.role,image:v.image,...d,target:{visible:target.visible,quad:target.quad?.map(p=>({x:p.x,y:p.y}))??null}};frames.push(frame);const{image,...meta}=frame;receipts.push({...meta,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 if(mode!=='source')for(const f of frames){const other=frames.find(v=>v.frame===f.frame&&v.role!==f.role);if(!other||other.width!==f.width||other.height!==f.height)throw Error('Нужны одинаковые пары до/после для каждого кадра.');}
 return{frames,receipts};
}
export function imageMessage(text:unknown,frames:VisualFrame[]):ModelMessage{
 const parts:Exclude<ModelMessage['content'],string>=[{type:'text',text:JSON.stringify(text)}];
 for(const f of frames){parts.push({type:'text',text:`${f.role==='before'?'ДО':'ПОСЛЕ'} · кадр ${f.frame} · ${f.width}×${f.height}`},{type:'image_url',image_url:{url:f.image}});}
 return{role:'user',content:parts};
}
