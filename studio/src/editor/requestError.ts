import {currentLocale} from './locale.ts';
/** Stable HTTP status controls the user-facing recovery advice; raw diagnostics stay attached. */
export function requestError(status:number,body:{error?:string;code?:string}):Error&{status:number;body:unknown;detail?:string}{
 const advice:Record<number,string>={400:'Check the request and selected files.',401:'Reopen the project to refresh access.',403:'Reopen the project to refresh access.',404:'The requested item is no longer available.',409:'The project has changed. Reload it and review your changes before trying again.',413:'This file is too large.',429:'Too many requests. Wait a moment and try again.',503:'The service is unavailable. Check Settings and try again.'};
 const text=currentLocale()==='en'?`Request failed (HTTP ${status}). ${advice[status]??'Try again or check the server diagnostics.'}`:body.error??`HTTP ${status}`;
 return Object.assign(new Error(text),{status,body,detail:body.error});
}
