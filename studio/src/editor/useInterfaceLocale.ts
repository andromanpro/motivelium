import {useSyncExternalStore} from 'react';
import {currentLocale, LOCALE_EVENT} from './locale.ts';
const subscribe = (changed:()=>void) => {window.addEventListener(LOCALE_EVENT,changed);return()=>window.removeEventListener(LOCALE_EVENT,changed);};
export function useInterfaceLocale() {return useSyncExternalStore(subscribe,currentLocale,()=> 'ru' as const);}
