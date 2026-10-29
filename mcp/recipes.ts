import type {Project} from '../studio/domain/schema.ts';
import type {Operation} from '../studio/domain/operations.ts';

export type TimingItem={nodeId:string;showAtFrame?:number;hideAtFrame?:number|'scene-end';fadeInFrames?:number;fadeOutFrames?:number};
export function timingOperations(project:Project,items:TimingItem[]){
 if(!Array.isArray(items)||!items.length||items.length>24)throw Error('Рецепт времени: от 1 до 24 объектов.');
 const seen=new Set<string>(),operations:Operation[]=[],details=[];
 for(const item of items){
  const node=project.nodes.find(n=>n.id===item.nodeId),scene=project.sequences.find(s=>s.id===node?.sequenceId);
  if(!node||!scene)throw Error('Рецепт: объект/сцена не найдены: '+item.nodeId);
  if(seen.has(node.id))throw Error('Объект повторяется: '+node.id);seen.add(node.id);
  if(node.transformKeys?.length)throw Error(`У ${node.id} уже есть ключи: рецепт их не перезапишет. Используйте готовый образец transformKeys из capabilities и сознательно объедините движение/opacity.`);
  if(project.effects.some(e=>e.targetId===node.id&&e.enabled&&['opacity-hold','fade-slide','fade-exit','spring-pop','mask-wipe','noise-dissolve'].includes(e.definitionId)))throw Error(`У ${node.id} есть эффект прозрачности/появления. Уберите конфликтующий эффект явной операцией или настройте его по рецепту из capabilities.`);
  const show=item.showAtFrame??scene.fromFrame,hide=item.hideAtFrame==='scene-end'?scene.toFrame-1:item.hideAtFrame;
  const fadeIn=item.fadeInFrames??0,fadeOut=hide===undefined?0:(item.fadeOutFrames??0);
  if(![show,fadeIn,fadeOut,...(hide===undefined?[]:[hide])].every(x=>Number.isInteger(x)&&x>=0)||show<scene.fromFrame||show>=scene.toFrame||hide!==undefined&&(hide<=show||hide>=scene.toFrame)||show+fadeIn>=(hide??scene.toFrame)||hide!==undefined&&hide-fadeOut<show+fadeIn)throw Error(`Рецепт ${node.id}: кадры должны лежать внутри [${scene.fromFrame},${scene.toFrame}), появление и уход не перекрываются.`);
  const opacity=node.transform.opacity,keys=new Map<number,{opacity:number;easing:'hold'|'smooth'}>();
  keys.set(scene.fromFrame,{opacity:show>scene.fromFrame?0:fadeIn?0:opacity,easing:'hold'});
  if(fadeIn){keys.set(show,{opacity:0,easing:'smooth'});keys.set(show+fadeIn,{opacity,easing:'hold'});}else keys.set(show,{opacity,easing:'hold'});
  if(hide!==undefined){if(fadeOut)keys.set(hide-fadeOut,{opacity,easing:'smooth'});keys.set(hide,{opacity:0,easing:'hold'});keys.set(scene.toFrame-1,{opacity:0,easing:'hold'});}
  for(const[frame,key]of [...keys].sort((a,b)=>a[0]-b[0]))operations.push({op:'setNodeKey',targetId:node.id,key:{frame,transform:{...node.transform,opacity:key.opacity},easing:key.easing}});
  details.push({nodeId:node.id,showAtFrame:show,fullyVisibleAt:show+fadeIn,hiddenAtFrame:hide??null,lastSceneFrame:scene.toFrame-1});
 }
 return{operations,details};
}

export const TIME_RECIPES={
 principles:[
  'Сцена/эффект имеют интервал [fromFrame,toFrame): последний кадр сцены — toFrame-1.',
  'Эффект — временная дельта. До его fromFrame и после toFrame объект возвращается к базовому состоянию. fade-exit не удерживает невидимость после окончания эффекта.',
  'Ключи transformKeys сохраняют первый/последний transform за своими границами. Для постоянного ухода поставьте opacity=0 на нужном кадре и сохраняйте до последнего кадра сцены.',
  'Координаты ребёнка группы локальные. Группа (100,200) + ребёнок (20,30) даёт (120,230) без масштабов/поворотов. Ключ ребёнка тоже локальный.',
  'Все поля transform обязательны в ключе; easing описывает участок от этого ключа к следующему. hold — держать, linear — прямо, smooth — плавно.',
 ],
 showHideExample:{scene:{fromFrame:0,toFrame:180},baseTransform:{x:80,y:140,rotation:0,scaleX:1,scaleY:1,opacity:1,pivotX:0,pivotY:0},
  keys:[{frame:0,opacity:0,easing:'hold'},{frame:30,opacity:0,easing:'smooth'},{frame:45,opacity:1,easing:'hold'},{frame:105,opacity:1,easing:'smooth'},{frame:120,opacity:0,easing:'hold'},{frame:179,opacity:0,easing:'hold'}],
  instruction:'При создании node задайте transformKeys: для каждого элемента keys скопируйте baseTransform и замените opacity. Либо вызовите propose_timing для списка статичных узлов. До30 скрыт, 30..45 появляется, 45..105 виден, 105..120 уходит, до179 не возвращается.'},
 delayedEffect:'Если сохраняете существующие ключи движения: opacity-hold {opacity:0} от начала сцены до начала входящего эффекта. Для ухода держите нулевую opacity до toFrame сцены. Не назначайте неподдерживаемые эффекты группе — проверьте targets.',
 checks:['Проверьте первый и последний кадры каждой сцены.','Для движения получите render_clip, PNG не доказывают плавность.','Проверяйте декодированный MP4, а не только отсутствие ошибок экспорта.'],
};
