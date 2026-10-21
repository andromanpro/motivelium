import type {Project} from '../../domain/schema.ts';
import {evaluateFrame} from '../../render/evaluate.ts';
import {renderFrame,type AssetBitmaps} from '../../render/renderFrame.ts';
import {createThreeAdapter,type ThreeAdapter} from '../../render/threeAdapter.ts';

let project:Project,adapter:ThreeAdapter|undefined;
const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!,bitmaps:AssetBitmaps=new Map();
document.body.append(canvas);
async function prepare(snapshot:Project){
 project=snapshot;canvas.width=project.size.width;canvas.height=project.size.height;
 await document.fonts.ready;
 for(const asset of project.assets.filter(a=>a.mime.startsWith('image/'))){
  const res=await fetch(`/api/v1/projects/${project.id}/assets/${asset.id}`);
  if(!res.ok)throw Error('Изображение не загружено: '+asset.id);
  bitmaps.set(asset.id,await createImageBitmap(await res.blob()));
 }
 if(project.nodes.some(n=>n.kind==='scene3d')){adapter=createThreeAdapter(project);await adapter.layer.prepare?.(project);}
 return{width:canvas.width,height:canvas.height};
}
function frame(index:number){
 if(!Number.isInteger(index)||index<0||index>=project.durationFrames)throw Error('Кадр вне проекта');
 const result=renderFrame(evaluateFrame(project,index),{ctx,project,bitmaps,threeLayer:adapter?.layer});
 if(result.missingAssets.length)throw Error('Отсутствуют ресурсы кадра: '+result.missingAssets.join(', '));
 return canvas.toDataURL('image/png');
}
function dispose(){adapter?.dispose();bitmaps.forEach(b=>(b as ImageBitmap).close?.());bitmaps.clear();canvas.width=canvas.height=1;}
Object.assign(window,{motiveliumExport:{prepare,frame,dispose}});
