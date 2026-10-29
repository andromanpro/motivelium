/** Catalog identities are independent of labels and interface language. */
export const EFFECT_CATEGORIES=[
 {id:'all',label:'Все'}, {id:'entrance',label:'Появление'},
 {id:'motion',label:'Движение'}, {id:'distortion',label:'Деформация'},
 {id:'light-color',label:'Свет и цвет'}, {id:'particles',label:'Частицы'},
 {id:'exit',label:'Уход'},
] as const;
export const SOUND_CATEGORIES=[
 {id:'all',label:'Все'}, {id:'motion',label:'Движение'},
 {id:'interface',label:'Интерфейс'}, {id:'impacts',label:'Удары'},
 {id:'clicks',label:'Щелчки'},
] as const;
export type EffectCategoryId=typeof EFFECT_CATEGORIES[number]['id'];
export type SoundCategoryId=typeof SOUND_CATEGORIES[number]['id'];
function normalized<T extends {id:string;label:string}>(definitions:readonly T[],value:unknown):T['id']|null{
 if(typeof value!=='string')return null;
 const raw=value.trim().toLocaleLowerCase('ru');
 return definitions.find(d=>d.id===raw||d.label.toLocaleLowerCase('ru')===raw)?.id??null;
}
/** Russian values are accepted at the compatibility boundary, never written by new UI filters. */
export const effectCategoryId=(value:unknown):EffectCategoryId|null=>normalized(EFFECT_CATEGORIES,value);
export const soundCategoryId=(value:unknown):SoundCategoryId|null=>normalized(SOUND_CATEGORIES,value);
export const effectCategoryLabel=(id:EffectCategoryId)=>EFFECT_CATEGORIES.find(d=>d.id===id)!.label;
export const soundCategoryLabel=(id:string)=>SOUND_CATEGORIES.find(d=>d.id===id)?.label??id;
