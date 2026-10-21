// Bounded, self-contained glTF 2 intake. No script, external URL or decoder fetch.
import type {PartDescriptor} from './model3d.ts';
export const MAX_MODEL_BYTES=16*1024*1024;
export type GltfInspection={json:Record<string,any>;parts:PartDescriptor[];binary:boolean};
export function inspectGltf(bytes:Uint8Array):GltfInspection{
 if(bytes.length<20||bytes.length>MAX_MODEL_BYTES)throw Error('Модель должна занимать от20байт до16МиБ.');
 let source:Uint8Array=bytes,binary=false,binLength=0,binOffset=0;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint32(0,true)===0x46546c67){binary=true;if(view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length)throw Error('Повреждённый заголовок GLB2.');let offset=12,jsonFound=false;while(offset<bytes.length){if(offset+8>bytes.length)throw Error('Оборванный блок GLB.');const len=view.getUint32(offset,true),kind=view.getUint32(offset+4,true);if(len%4||offset+8+len>bytes.length)throw Error('Повреждённая длина блока GLB.');if(kind===0x4e4f534a){if(jsonFound||offset!==12)throw Error('GLB должен начинаться одним JSON-блоком.');source=bytes.subarray(offset+8,offset+8+len);jsonFound=true}else if(kind===0x004e4942){if(binLength)throw Error('Повторный BIN-блок.');binLength=len;binOffset=offset+8}offset+=8+len;}if(!jsonFound)throw Error('В GLB отсутствует JSON.');}
 let doc:Record<string,any>;try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(source).replace(/\u0000+$/,''))}catch{throw Error('Не удалось прочитать JSON модели.');}
 if(!doc||doc.asset?.version!=='2.0')throw Error('Поддерживается glTF2.0.');
 if(doc.skins?.length||doc.animations?.length||doc.meshes?.some((m:any)=>m.primitives?.some((p:any)=>p.targets?.length)))throw Error('Пока поддерживаются статические модели без skins, morph targets и встроенных анимаций.');
 if((doc.extensionsUsed??[]).some((s:string)=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu','EXT_mesh_gpu_instancing'].includes(s)))throw Error('Сжатая/инстансная модель требует отдельного адаптера. Экспортируй обычный GLB.');
 const uri=(u:unknown,kind:'buffer'|'image')=>{if(typeof u!=='string'||!new RegExp(kind==='buffer'?'^data:application/(octet-stream|gltf-buffer);base64,[A-Za-z0-9+/]*={0,2}$':'^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$').test(u))throw Error('Есть внешний ресурс. Упакуй буферы и текстуры внутрь GLB или GLTF.');};
 if(!Array.isArray(doc.nodes)||doc.nodes.length>2048||!Array.isArray(doc.scenes))throw Error('Неверные nodes/scenes модели.');
 for(const [key,limit]of [['meshes',256],['accessors',4096],['bufferViews',4096],['buffers',16],['textures',64]]as const)if(doc[key]!==undefined&&(!Array.isArray(doc[key])||doc[key].length>limit))throw Error('Превышен лимит '+key+' модели.');
 if((doc.materials?.length??0)>256||(doc.images?.length??0)>32)throw Error('Слишком много материалов/текстур.');
 for(const [i,b] of (doc.buffers??[]).entries()){if(!Number.isInteger(b.byteLength)||b.byteLength<0||b.byteLength>MAX_MODEL_BYTES)throw Error('Неверный размер буфера.');if(b.uri!==undefined)uri(b.uri,'buffer');else if(!binary||i!==0||b.byteLength>binLength)throw Error('Отсутствует встроенный буфер.');}
 for(const img of doc.images??[]){if(img.uri!==undefined)uri(img.uri,'image');else if(!Number.isInteger(img.bufferView)||!['image/png','image/jpeg','image/webp'].includes(img.mimeType))throw Error('Неверная встроенная текстура.');}
 let vertices=0;for(const a of doc.accessors??[]){if(!Number.isInteger(a.count)||a.count<0||a.count>1_000_000)throw Error('Слишком сложная геометрия.');vertices+=a.count;if(vertices>2_000_000)throw Error('Лимит элементов геометрии:2миллиона.');}
 for(const b of doc.bufferViews??[]){const buf=doc.buffers?.[b.buffer],end=(b.byteOffset??0)+b.byteLength;if(!buf||!Number.isInteger(b.byteLength)||b.byteLength<0||!Number.isInteger(b.byteOffset??0)||(b.byteOffset??0)<0||end>buf.byteLength)throw Error('Буфер геометрии выходит за границы.');}

 const decoded=new Map<number,Uint8Array>();let pixels=0;
 const data=(uri:string)=>{try{return Uint8Array.from(atob(uri.split(',')[1]!),c=>c.charCodeAt(0))}catch{throw Error('Повреждённый data URI текстуры.')}};
 for(const image of doc.images??[]){
  let imageBytes:Uint8Array;if(image.uri)imageBytes=data(image.uri);else{const bv=doc.bufferViews?.[image.bufferView];if(!bv)throw Error('Не найден буфер текстуры.');let buffer=decoded.get(bv.buffer);if(!buffer){const b=doc.buffers[bv.buffer];buffer=b.uri?data(b.uri):bytes.subarray(binOffset,binOffset+binLength);decoded.set(bv.buffer,buffer);}imageBytes=buffer.subarray(bv.byteOffset??0,(bv.byteOffset??0)+bv.byteLength);}
  const b=imageBytes,v=new DataView(b.buffer,b.byteOffset,b.byteLength);let w=0,h=0;
  if(b.length>=24&&v.getUint32(0)===0x89504e47){w=v.getUint32(16);h=v.getUint32(20)}
  else if(b.length>=12&&b[0]===255&&b[1]===216){let i=2;while(i+8<b.length){if(b[i]!==255){i++;continue;}const marker=b[i+1]!;if(marker===216||marker===217){i+=2;continue;}const len=v.getUint16(i+2);if(len<2||i+2+len>b.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){h=v.getUint16(i+5);w=v.getUint16(i+7);break;}i+=2+len;}}
  else if(b.length>=30&&v.getUint32(0)===0x52494646&&v.getUint32(8)===0x57454250){const kind=v.getUint32(12);if(kind===0x56503858){w=1+b[24]!+(b[25]!<<8)+(b[26]!<<16);h=1+b[27]!+(b[28]!<<8)+(b[29]!<<16)}else if(kind===0x5650384c){const bits=v.getUint32(21,true);w=1+(bits&16383);h=1+((bits>>>14)&16383)}else if(kind===0x56503820){w=v.getUint16(26,true)&16383;h=v.getUint16(28,true)&16383}}
  if(w<1||h<1||w>4096||h>4096)throw Error('Текстура должна быть PNG/JPEG/WebP до4096×4096.');pixels+=w*h;if(pixels>32*1024*1024)throw Error('Суммарный бюджет текстур:32миллиона пикселей.');
 }
 const scene=doc.scenes[doc.scene??0];if(!scene||!Array.isArray(scene.nodes)||!scene.nodes.length)throw Error('Пустая сцена модели.');
 const parts:PartDescriptor[]=[],seen=new Set<number>();
 function walk(index:number,parentId:string|null,depth:number){if(depth>16||!Number.isInteger(index)||index<0||index>=doc.nodes.length||seen.has(index))throw Error('Цикл, повтор или слишком глубокая иерархия модели.');seen.add(index);if(parts.length>=128)throw Error('В сцене больше128деталей.');const n=doc.nodes[index],id='gltf-'+index;if(!n||typeof n!=='object'||Array.isArray(n))throw Error('Неверный узел модели.');if(n.camera!==undefined&&n.mesh===undefined&&!n.children?.length)return;for(const [k,length]of [['translation',3],['rotation',4],['scale',3],['matrix',16]]as const)if(n[k]!==undefined&&(!Array.isArray(n[k])||n[k].length!==length||n[k].some((v:unknown)=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e8)))throw Error('Неверная трансформация модели.');parts.push({id,name:typeof n.name==='string'&&n.name.trim()?n.name.replace(/[\u0000-\u001f]/g,'').slice(0,120)||'Деталь '+(index+1):'Деталь '+(index+1),parentId,sourceIndex:index});if(n.children!==undefined&&!Array.isArray(n.children))throw Error('Неверные дочерние узлы.');for(const c of n.children??[])walk(c,id,depth+1);}
 for(const index of scene.nodes)walk(index,null,0);
 if(!parts.some(p=>doc.nodes[p.sourceIndex!].mesh!==undefined))throw Error('В сцене нет геометрии.');
 return{json:doc,parts,binary};
}
