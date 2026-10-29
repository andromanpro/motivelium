import{currentLocale}from'./locale.ts';import{uiLabel}from'./i18n.ts';
export const DETAIL_SEPARATOR='\n[details]\n';
export function errorSummary(summary:string,error:unknown):string{
 const detail=(error as {detail?:unknown})?.detail;
 return typeof detail==='string'&&detail?summary+DETAIL_SEPARATOR+detail:summary;
}
export function errorText(error:unknown):string{
 const value=error as {message?:unknown;detail?:unknown},raw=typeof value?.message==='string'?value.message:String(error);
 if(currentLocale()==='ru')return raw;
 const translated=uiLabel(raw);
 if(translated!==raw)return translated;
 if(typeof value?.detail==='string'&&value.detail!==raw)return raw+DETAIL_SEPARATOR+value.detail;
 return /[А-Яа-яЁё]/u.test(raw)?'Could not complete the action.'+DETAIL_SEPARATOR+raw:raw;
}
