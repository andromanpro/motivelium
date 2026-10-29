import {currentLocale,localeTag} from './locale.ts';
export const decimal=(n:number,digits=2)=>new Intl.NumberFormat(localeTag(),{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:false}).format(n);
export function countLabel(n:number,forms:{en:readonly[string,string];ru:readonly[string,string,string]}){
 const category=new Intl.PluralRules(localeTag()).select(n),word=currentLocale()==='en'?forms.en[category==='one'?0:1]:forms.ru[category==='one'?0:category==='few'?1:2];
 return new Intl.NumberFormat(localeTag()).format(n)+' '+word;
}
export const sceneCount=(n:number)=>countLabel(n,{en:['scene','scenes'],ru:['сцена','сцены','сцен']});
export const objectCount=(n:number)=>countLabel(n,{en:['object','objects'],ru:['объект','объекта','объектов']});
export const effectCount=(n:number)=>countLabel(n,{en:['effect','effects'],ru:['эффект','эффекта','эффектов']});
export const layerCount=(n:number)=>countLabel(n,{en:['layer','layers'],ru:['слой','слоя','слоёв']});
