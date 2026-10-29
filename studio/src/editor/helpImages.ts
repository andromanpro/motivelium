import{useSyncExternalStore}from'react';import{LOCALE_EVENT,currentLocale}from'./locale.ts';import{APPEARANCE_EVENT}from'./appearance.ts';
const changed=(notify:()=>void)=>{window.addEventListener(LOCALE_EVENT,notify);window.addEventListener(APPEARANCE_EVENT,notify);return()=>{window.removeEventListener(LOCALE_EVENT,notify);window.removeEventListener(APPEARANCE_EVENT,notify)}};
const imageSet=()=>currentLocale()+'/'+(document.documentElement.dataset.theme==='dark'?'dark':'light');
export const useHelpImageSet=()=>useSyncExternalStore(changed,imageSet,()=> 'ru/light');
