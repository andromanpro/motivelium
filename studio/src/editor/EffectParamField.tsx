import type {ParamSpec} from '../../effects/registry.ts';
import {parameterLabel} from '../../effects/catalog.ts';
export function EffectParamField({definitionId,spec,value,params,onChange,prefix=''}:{definitionId:string;spec:ParamSpec;value:number|boolean|string;params:Record<string,number|boolean|string>;onChange:(value:number|boolean|string)=>void;prefix?:string}){
 if(spec.name.endsWith('Path')&&params[spec.name.slice(0,-4)]!=='custom')return null;
 const label=parameterLabel(definitionId,spec.name),aria=prefix+label;
 if(spec.type==='boolean')return <label className="effect-param-checkbox"><input aria-label={aria} type="checkbox" checked={value===true||value==='true'} onChange={e=>onChange(e.target.checked)}/>{label}</label>;
 return <label className={spec.multiline?'effect-param-long':undefined}>{label}{spec.choices?<select aria-label={aria} value={String(value)} onChange={e=>onChange(e.target.value)}>{spec.choices.map(choice=><option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>:spec.multiline?<textarea aria-label={aria} rows={3} maxLength={1024} spellCheck={false} value={String(value)} onChange={e=>onChange(e.target.value)}/>:<input aria-label={aria} type={spec.type==='number'?'number':'text'} min={spec.min} max={spec.max} step={(spec.max??10)<=2?.01:1} value={String(value)} onChange={e=>onChange(spec.type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value)}/>} {spec.hint&&<small className="effect-param-hint">{spec.hint}</small>}</label>;
}
