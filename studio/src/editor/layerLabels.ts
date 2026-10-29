import type {Project,SceneNode} from '../../domain/schema.ts';
import {PRESET_LABELS} from '../../domain/layers.ts';
import {ui,uiLabel} from './i18n.ts';
import {countLabel} from './localeFormat.ts';
export function layerDescription(project:Project,node:SceneNode):string{
 if(node.kind==='text')return node.text.replace(/\s+/g,' ').trim()||ui('Пустой текст');
 if(node.kind==='shape')return ui(node.shape==='ellipse'?'Круг / эллипс':'Прямоугольник')+' · '+node.fill;
 if(node.kind==='image')return project.assets.find(a=>a.id===node.assetId)?.title??ui('Изображение');
 if(node.kind==='scene3d')return '3D · '+uiLabel(PRESET_LABELS[node.preset]);
 return ui('Группа')+' · '+countLabel(project.nodes.filter(n=>n.parentId===node.id).length,{en:['layer','layers'],ru:['слой','слоя','слоёв']});
}
export function layerLockReason(project:Project,id:string,includeSelf=true):string{
 let node=project.nodes.find(n=>n.id===id);if(!node)return ui('Слой удалён.');
 if(!includeSelf)node=node.parentId?project.nodes.find(n=>n.id===node!.parentId):undefined;
 while(node){if(node.locked)return ui('Заблокирован слой «{0}».',[node.name]);node=node.parentId?project.nodes.find(n=>n.id===node!.parentId):undefined}return '';
}
