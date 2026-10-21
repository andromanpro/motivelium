import {useEffect,useRef,useState} from 'react';
import type {Project,SceneNode} from '../../domain/schema.ts';
import type {Transaction} from '../../domain/transaction.ts';
import {REGISTRY,defaultParams} from '../../effects/registry.ts';
import {Icon} from './Icon.tsx';
import {effectStack,moveEffectOperations,parameterLabel} from '../../effects/catalog.ts';
import {keyAt} from '../../domain/animation.ts';
import {layerLockReason} from '../../domain/layers.ts';
import {SHADER_MAP} from '../../effects/shaders/library.ts';
import {EffectParamField} from './EffectParamField.tsx';
type Values=Record<string,string>;
const effectKey=(id:string,key:string)=>'effect:'+id+':'+key;
function read(n:SceneNode,project:Project,keyMode=false):Values {
 const values:Values={name:n.name,x:String(n.transform.x),y:String(n.transform.y),rotation:String(n.transform.rotation),opacity:String(n.transform.opacity),scaleX:String(n.transform.scaleX),scaleY:String(n.transform.scaleY),width:String(n.geometry.width*(keyMode?n.transform.scaleX:1)),height:String(n.geometry.height*(keyMode?n.transform.scaleY:1)),...(n.kind==='text'?{text:n.text,fontSize:String(n.fontSize),color:n.color}:{}),...(n.kind==='shape'?{fill:n.fill,fillOpacity:String(n.fillOpacity??1)}:{}),...(n.kind==='scene3d'?{spin:String(n.spin),explode:String(n.explode)}:{})};
 for(const e of project.effects.filter(e=>e.targetId===n.id)){
  values[effectKey(e.id,'enabled')]=String(e.enabled);
  const def=REGISTRY.get(e.definitionId);if(!def)continue;
  for(const spec of def.params)values[effectKey(e.id,spec.name)]=String(e.params[spec.name]??spec.default);
 }
 if(n.kind==='shape'&&n.generator){values.shaderSpeed=String(n.generator.speed);values.shaderHue=String(n.generator.hue);}
 return values;
}
export function Inspector({project,node,onCommit,onClose,onDirty,onAddEffect,onEditAI,onModel,interactionBusy=false,frame=0,recordKeys=false}:{frame?:number;recordKeys?:boolean;interactionBusy?:boolean;project:Project;node:SceneNode|null;onCommit:(description:string,ops:Transaction['operations'],expectedRevision?:number)=>Promise<boolean>;onClose:()=>void;onDirty:(dirty:boolean)=>void;onAddEffect:()=>void;onEditAI:()=>void;onModel:()=>void}){
 const lockReason=node?layerLockReason(project,node.id):'';
 const [values,setValues]=useState<Values>({}),[dirty,setDirty]=useState(false),[baseRevision,setBaseRevision]=useState(project.revision),[error,setError]=useState(''),[saving,setSaving]=useState(false);const active=useRef<string|null>(null),content=useRef<HTMLDivElement|null>(null);const [baseFrame,setBaseFrame]=useState(frame),[baseKeyMode,setBaseKeyMode]=useState(recordKeys);
 const load=()=>{if(node)setValues(read(node,project,recordKeys));setBaseFrame(frame);setBaseKeyMode(recordKeys);setDirty(false);setBaseRevision(project.revision);setError('')};
 useEffect(()=>{if(active.current!==node?.id){active.current=node?.id??null;load()}else if(!dirty)load()},[node?.id,project.revision,dirty,frame,recordKeys]);
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false)},[dirty,onDirty]);
 useEffect(()=>{if(content.current)content.current.scrollTop=0},[node?.id]);
 const change=(key:string,value:string)=>{setValues(prev=>{const next={...prev,[key]:value};if(baseKeyMode&&node&&value.trim()&&Number.isFinite(Number(value))){if(key==='width')next.scaleX=String(Number(value)/node.geometry.width);if(key==='height')next.scaleY=String(Number(value)/node.geometry.height);if(key==='scaleX')next.width=String(Number(value)*node.geometry.width);if(key==='scaleY')next.height=String(Number(value)*node.geometry.height);}return next;});setDirty(true);setError('')};
 async function apply(){
  if(!node||!dirty||saving||interactionBusy)return;setError('');if(lockReason){setError(lockReason);return;}
  try{
   const next:Record<string,unknown>={},transform={...node.transform},geometry={...node.geometry};let changedTransform=false,changedGeometry=false;
   const numeric=(key:string)=>{if(!values[key]?.trim()||!Number.isFinite(Number(values[key])))throw Error('Проверь числовые значения');return Number(values[key])};
   for(const key of ['x','y','rotation','opacity','scaleX','scaleY']as const){const value=numeric(key);if(value!==node.transform[key]){transform[key]=value;changedTransform=true}}
   for(const key of ['width','height']as const){const value=numeric(key);if(baseKeyMode){const axis=key==='width'?'scaleX':'scaleY';if(value!==node.geometry[key]*node.transform[axis]){transform[axis]=value/node.geometry[key];changedTransform=true;}}else if(value!==node.geometry[key]){geometry[key]=value;changedGeometry=true;}}
   if(changedTransform&&!baseKeyMode)next.transform=transform;if(changedGeometry)next.geometry=geometry;
   if(values.name!==node.name)next.name=values.name;
   if(node.kind==='text'){if(values.text!==node.text)next.text=values.text;if(numeric('fontSize')!==node.fontSize)next.fontSize=numeric('fontSize');if(values.color!==node.color)next.color=values.color}
   if(node.kind==='shape'){if(values.fill!==node.fill)next.fill=values.fill;if(numeric('fillOpacity')!==(node.fillOpacity??1))next.fillOpacity=numeric('fillOpacity')}
   if(node.kind==='shape'&&node.generator){const speed=numeric('shaderSpeed'),hue=numeric('shaderHue');if(speed!==node.generator.speed||hue!==node.generator.hue)next.generator={...node.generator,speed,hue};}
   if(node.kind==='scene3d'){if(numeric('spin')!==node.spin)next.spin=numeric('spin');if(numeric('explode')!==node.explode)next.explode=numeric('explode')}
   const ops:Transaction['operations']=[];if(changedTransform&&baseKeyMode)ops.push({op:'setNodeKey',targetId:node.id,key:keyAt(project.nodes.find(n=>n.id===node.id)!,baseFrame,transform)});
   if(Object.keys(next).length)ops.push({op:'updateNode',targetId:node.id,values:next as never});
   for(const effect of project.effects.filter(e=>e.targetId===node.id)){
    const def=REGISTRY.get(effect.definitionId);if(!def)continue;
    const params={...defaultParams(def),...effect.params},changedParams={...params};
    for(const spec of def.params){const value=values[effectKey(effect.id,spec.name)]??String(params[spec.name]);changedParams[spec.name]=spec.type==='number'?numeric(effectKey(effect.id,spec.name)):spec.type==='boolean'?value==='true':value}
    const enabled=values[effectKey(effect.id,'enabled')]==='true';
    if(enabled!==effect.enabled||JSON.stringify(params)!==JSON.stringify(changedParams))ops.push({op:'updateEffect',targetId:effect.id,values:{enabled,params:changedParams}});
   }
   if(!ops.length){setDirty(false);return}setSaving(true);
   const ok=await onCommit('Свойства: '+node.name,ops,baseRevision);if(ok)setDirty(false);
  }catch(e){setError((e as Error).message)}finally{setSaving(false)}
 }
 const number=(key:string,label:string,step=1,min?:number,max?:number)=><label key={key}>{label}<input aria-label={label} type="number" value={values[key]??''} step={step} min={min} max={max} onChange={e=>change(key,e.target.value)}/></label>;
 const kindNames:Record<string,string>={group:'Группа',shape:'Фигура',text:'Текст',image:'Изображение',scene3d:'3D-сцена'};
 const nodeEffects=node?effectStack(project,node.id):[];
 return <aside className="inspector">
  <div className="panel-title"><span>Свойства</span><button className="icon-button" onClick={onClose} aria-label="Закрыть свойства"><Icon name="close" size={15}/></button></div>
  {node?<><div className="inspector-content" ref={content}>
   <div className="selection-heading"><span className="eyebrow">{kindNames[node.kind]}</span><h2>{node.name}</h2></div>
   {lockReason&&<p className="field-warning">{lockReason} Разблокируй его в панели слоёв.</p>}<fieldset className="layer-property-fields" disabled={!!lockReason||interactionBusy||saving}>
   <div className="object-tools">{node.kind==='scene3d'&&<button className="object-model-edit" disabled={dirty||saving} onClick={onModel}><Icon name="cube" size={15}/>Детали и камера 3D</button>}<button className="ai-object-edit" disabled={dirty||saving} onClick={onEditAI}><Icon name="wand" size={15}/>Изменить через ИИ</button>
   <button className="add-object-effect" disabled={dirty||saving} onClick={onAddEffect}><Icon name="sparkles" size={15}/>Добавить эффект</button>
   </div>

   <label>Название<input aria-label="Название объекта" value={values.name??''} onChange={e=>change('name',e.target.value)}/></label>
   <div className="property-group"><h3>Положение</h3><div className="field-grid">{number('x','X')}{number('y','Y')}</div></div>
   <details className="property-group" open><summary>Размер и поворот</summary><div className="field-grid">{number('width','Ширина',1,1)}{number('height','Высота',1,1)}{number('scaleX','Масштаб X',.05,.001,1000)}{number('scaleY','Масштаб Y',.05,.001,1000)}{number('rotation','Поворот, °',.5)}{number('opacity','Непрозрачность',.05,0,1)}</div></details>
   {node.kind==='text'&&<div className="property-group"><h3>Текст</h3><label className="sr-only" htmlFor="content-text">Текст объекта</label><textarea id="content-text" rows={3} value={values.text??''} onChange={e=>change('text',e.target.value)}/><div className="field-grid">{number('fontSize','Размер шрифта',1,6,480)}<label>Цвет<input aria-label="Цвет текста" type="color" value={values.color??'#ffffff'} onChange={e=>change('color',e.target.value)}/></label></div></div>}
   {node.kind==='shape'&&(node.generator?<div className="property-group"><h3>Процедурный фон</h3><p>{SHADER_MAP.get(node.generator.shaderId)?.name}</p><div className="field-grid">{number('shaderSpeed','Скорость фона',.1,0,4)}{number('shaderHue','Оттенок фона, °',5,-360,360)}</div>{number('fillOpacity','Непрозрачность фона',.05,0,1)}</div>:<div className="property-group"><label className="color-row">Заливка<input aria-label="Заливка" type="color" value={values.fill??'#ffffff'} onChange={e=>change('fill',e.target.value)}/></label>{number('fillOpacity','Непрозрачность заливки',.05,0,1)}</div>)}
   {node.kind==='scene3d'&&<div className="property-group"><h3>{node.preset==='gear-cluster'?'Механизм':'3D-сцена'}</h3><div className="field-grid">{number('spin','Скорость вращения',1,-100,100)}{number('explode','Разнесение',.05,0,1)}</div></div>}
{nodeEffects.length>0&&<div className="property-group effect-editor"><h3>Эффекты <small>{nodeEffects.length}</small></h3>{nodeEffects.map((e,index)=>{
    const def=REGISTRY.get(e.definitionId);return <details className="effect-card" key={e.id}>
     <summary><Icon name="motion" size={14}/><span>{def?.name??e.definitionId}</span><small>{e.enabled?'вкл':'выкл'}</small></summary>
     <p>{def?.description}</p><div className="effect-stack-actions"><span>В стеке: {index+1}</span><button className="icon-button" aria-label={'Поднять эффект '+(def?.name??e.definitionId)} disabled={dirty||saving||index===0} onClick={()=>void onCommit('Порядок эффектов',moveEffectOperations(project,e.id,-1),project.revision)}><Icon name="up" size={14}/></button><button className="icon-button" aria-label={'Опустить эффект '+(def?.name??e.definitionId)} disabled={dirty||saving||index===nodeEffects.length-1} onClick={()=>void onCommit('Порядок эффектов',moveEffectOperations(project,e.id,1),project.revision)}><Icon name="down" size={14}/></button><button className="icon-button remove-effect" aria-label={'Удалить эффект '+(def?.name??e.definitionId)} disabled={dirty||saving} onClick={()=>void onCommit('Удалить эффект: '+(def?.name??e.definitionId),[{op:'removeEffect',targetId:e.id}],project.revision)}><Icon name="trash" size={14}/></button></div><label className="effect-enabled"><input aria-label={'Включён эффект '+(def?.name??e.definitionId)} type="checkbox" checked={values[effectKey(e.id,'enabled')]==='true'} onChange={v=>change(effectKey(e.id,'enabled'),String(v.target.checked))}/>Эффект включён</label>
     <div className="field-grid">{def?.params.filter(spec=>e.definitionId!=='shader-filter'||spec.type==='number').map(spec=><EffectParamField key={spec.name} definitionId={e.definitionId} spec={spec} value={values[effectKey(e.id,spec.name)]??spec.default} params={Object.fromEntries(def.params.map(s=>[s.name,values[effectKey(e.id,s.name)]??s.default]))} onChange={value=>change(effectKey(e.id,spec.name),String(value))}/>)}</div>
     <small className="effect-range">Кадры {e.fromFrame}–{e.toFrame-1}</small>
    </details>;
   })}</div>}
   {dirty&&baseRevision!==project.revision&&<p className="field-warning">Проект изменился. Твой черновик сохранён; перед применением нужно сверить изменения.</p>}
   {baseKeyMode&&<small className="key-property-note">Трансформация — ключ на кадре {baseFrame}. Оформление и эффекты применяются ко всему слою.</small>}{dirty&&baseFrame!==frame&&<p className="field-warning">Черновик относится к кадру {baseFrame}. Вернись к нему или сбрось черновик.</p>}{error&&<p className="field-warning">{error}</p>}</fieldset>
  </div><div className="apply-row">{dirty?<><span className="draft-label">Изменения ещё не применены</span><button className="primary" disabled={saving||!!lockReason||interactionBusy} onClick={()=>void apply()}>{saving?'Сохранение…':'Применить изменения'}<Icon name="check" size={15}/></button><button className="text-button" disabled={saving} onClick={load}>Сбросить изменения</button></>:<span className="properties-saved"><Icon name="check" size={14}/>Нет неприменённых изменений</span>}</div></>:<div className="empty-properties"><Icon name="sliders" size={28}/><h2>Выбери объект</h2><p>Щёлкни по нему в кадре или открой список объектов.</p></div>}
 </aside>;
}
