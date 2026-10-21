import {validateProject,type Project} from './schema.ts';

export const PACKAGE_MAX_BYTES=256*1024*1024,PACKAGE_FILE_MAX=64*1024*1024,PACKAGE_MAX_ASSETS=256;
export type PackageManifest={format:'motivelium-project';version:1;createdAt:string;project:{entry:'project.json';bytes:number;sha256:string;id:string;revision:number};assets:Array<{id:string;entry:string;bytes:number;sha256:string}>};
export type PackagePreview={id:string;status:'validated'|'imported';title:string;sourceProjectId:string;sourceRevision:number;durationSeconds:number;size:Project['size'];fps:Project['fps'];nodes:number;effects:number;sequences:number;models:number;images:number;audio:number;other:number;assetBytes:number;archiveBytes:number;assets:Array<{id:string;title:string;mime:string;bytes:number;sha256:string}>;projectId?:string;projectTitle?:string};
export type PackageExport={id:string;revision:number;title:string;bytes:number;sha256:string;assets:number;assetBytes:number;downloadUrl:string;createdAt:string};

export function safeAssetPath(value:string){
 if(typeof value!=='string'||value.length>240||!value.startsWith('assets/')||/[\\:<>"|?*\x00-\x1f\x7f]/.test(value))throw Error('Недопустимый путь ресурса проекта.');
 for(const part of value.split('/'))if(!part||part==='.'||part==='..'||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))throw Error('Недопустимый путь ресурса проекта.');
 return value;
}
export function packageProject(input:unknown):Project{
 const p=validateProject(input);if(p.assets.length>PACKAGE_MAX_ASSETS)throw Error('Архив: не более 256 ресурсов.');
 let total=0;const paths=new Map<string,string>();
 for(const a of p.assets){safeAssetPath(a.path);if(!/^[a-f0-9]{64}$/.test(a.sha256)||!Number.isSafeInteger(a.bytes)||a.bytes>PACKAGE_FILE_MAX)throw Error('Ресурс должен иметь SHA256 и размер не более 64 МиБ.');
  const key=a.path.toLowerCase().normalize('NFC'),previous=paths.get(key);if(previous&&previous!==a.sha256)throw Error('Разные ресурсы используют один путь.');paths.set(key,a.sha256);total+=a.bytes;
 }
 if(total>PACKAGE_MAX_BYTES)throw Error('Общий размер ресурсов превышает 256 МиБ.');return p;
}
export function packageManifest(input:unknown):PackageManifest{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('В архиве нет manifest.json.');const m=input as PackageManifest;
 if(m.format!=='motivelium-project'||m.version!==1)throw Error('Неподдерживаемая версия архива Motivelium.');
 if(!m.project||m.project.entry!=='project.json'||!Number.isSafeInteger(m.project.bytes)||m.project.bytes<1||m.project.bytes>8*1024*1024||!/^[a-f0-9]{64}$/.test(m.project.sha256)||!Array.isArray(m.assets)||m.assets.length>PACKAGE_MAX_ASSETS)throw Error('Некорректный состав архива.');
 const ids=new Set<string>();let total=m.project.bytes;
 for(const a of m.assets){if(!a||typeof a.id!=='string'||ids.has(a.id)||a.entry!=='assets/'+a.sha256||!/^[a-f0-9]{64}$/.test(a.sha256)||!Number.isSafeInteger(a.bytes)||a.bytes<0||a.bytes>PACKAGE_FILE_MAX)throw Error('Некорректный ресурс manifest.');ids.add(a.id);total+=a.bytes;}
 if(total>PACKAGE_MAX_BYTES)throw Error('Распакованный архив превышает 256 МиБ.');return m;
}
export function packageSummary(id:string,p:Project,archiveBytes:number):PackagePreview{
 const count=(prefix:string)=>p.assets.filter(a=>a.mime.startsWith(prefix)).length,models=count('model/'),images=count('image/'),audio=count('audio/');
 return{id,status:'validated',title:p.title,sourceProjectId:p.id,sourceRevision:p.revision,durationSeconds:p.durationFrames*p.fps.den/p.fps.num,size:p.size,fps:p.fps,nodes:p.nodes.length,effects:p.effects.length,sequences:p.sequences.length,models,images,audio,other:p.assets.length-models-images-audio,assetBytes:p.assets.reduce((n,a)=>n+a.bytes,0),archiveBytes,assets:p.assets.map(a=>({id:a.id,title:a.title??a.path.split('/').at(-1)??a.id,mime:a.mime,bytes:a.bytes,sha256:a.sha256}))};
}
