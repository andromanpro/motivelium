import{REGISTRY as sourceRegistry,type EffectDefinition}from'../../effects/registry.ts';
import{filterCatalog as sourceFilter,parameterLabel as sourceParameterLabel}from'../../effects/catalog.ts';
import{uiLabel}from'./i18n.ts';import{currentLocale,type InterfaceLocale}from'./locale.ts';
const caches:Record<InterfaceLocale,Map<string,EffectDefinition>>={ru:new Map(),en:new Map()};
/** A presentation view. IDs, defaults, evaluators and the source registry are never modified. */
export const UI_REGISTRY={get(id:string){const def=sourceRegistry.get(id);if(!def)return undefined;const locale=currentLocale();if(locale==='ru')return def;const cache=caches[locale];if(!cache.has(id))cache.set(id,{...def,name:uiLabel(def.name),description:uiLabel(def.description),params:def.params.map(p=>({...p,...(p.hint?{hint:uiLabel(p.hint)}:{}),...(p.choices?{choices:p.choices.map(c=>({...c,label:uiLabel(c.label)}))}:{})}))});return cache.get(id)}};
export const parameterLabel=(id:string,name:string)=>uiLabel(sourceParameterLabel(id,name));
export function filterCatalog(query:string,category:string,ids?:readonly string[]){
 const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return sourceFilter('',category,ids).filter(c=>{const d=UI_REGISTRY.get(c.id);const text=[d?.name,d?.description,uiLabel(c.tag),uiLabel(c.recipe),sourceRegistry.get(c.id)?.name,c.recipe,c.words,c.id].join(' ').toLocaleLowerCase();return terms.every(t=>text.includes(t))});
}
