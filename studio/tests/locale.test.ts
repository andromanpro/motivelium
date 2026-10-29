import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interfaceLocale,preferredInterfaceLocale,localeTag,LOCALE_KEY,LOCALE_EVENT,installLocale,setInterfaceLocale} from '../src/editor/locale.ts';
import {sourceCatalog,sourceGroups} from '../src/editor/locales/catalog.ts';
import {ui,uiLabel} from '../src/editor/i18n.ts';
import {blankProject,projectSetup,ProjectSetupError} from '../domain/projectSetup.ts';
import {requestError} from '../src/editor/requestError.ts';
import {sceneCount,decimal} from '../src/editor/localeFormat.ts';
import {layerDescription} from '../src/editor/layerLabels.ts';
import {createLayer} from '../domain/layers.ts';

test('EN-01 catalogs have complete interpolation and consistent duplicates',()=>{
 const seen=new Map<string,string>();
 for(const group of sourceGroups)for(const [key,value]of Object.entries(group)){
  assert(value.trim(),key);assert(!/[А-Яа-яЁё]/u.test(value),key);
  assert.deepEqual(key.match(/\{\d+\}/g)?.sort()??[],value.match(/\{\d+\}/g)?.sort()??[],key);
  if(seen.has(key))assert.equal(value,seen.get(key),key);seen.set(key,value);
 }
 assert(Object.keys(sourceCatalog).length>500);
});
test('Language changes labels only, persists and syncs without a reload',()=>{
 const original={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage};
 const events=new EventTarget(),storage=new Map<string,string>([[LOCALE_KEY,'ru']]);
 try{
  Object.assign(globalThis,{document:{documentElement:{dataset:{},lang:''},title:''},window:events,localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)}});
  const off=installLocale();assert.equal(document.documentElement.lang,'ru');
  let changes=0;events.addEventListener(LOCALE_EVENT,()=>changes++);
  const content={text:'Мои скобочки)))',title:'A file named Текст.png'},before=JSON.stringify(content);
  assert.deepEqual(setInterfaceLocale('en'),{saved:true});assert.equal(storage.get(LOCALE_KEY),'en');assert.equal(ui('Проекты'),'Projects');
  assert.equal(ui('Кадр {0} сохранён в PNG',[12]),'Frame 12 saved as PNG');assert.equal(uiLabel(content.text),content.text);
  assert.equal(localeTag(),'en-US');assert.equal(JSON.stringify(content),before);assert.equal(changes,1);
  assert.equal(sceneCount(1),'1 scene');assert.equal(sceneCount(2),'2 scenes');assert.equal(decimal(1.5),'1.50');
  const project=blankProject({},'test-labels',1),node=createLayer(project,{kind:'text',sequenceId:'scene-main',parentId:null,frame:0,name:'Имя',text:'Прямоугольник'});
  assert.equal(layerDescription(project,node),'Прямоугольник');
  const conflict=requestError(409,{error:'Серверный журнал'});assert.match(conflict.message,/Reload/);assert.equal(conflict.detail,'Серверный журнал');
  const event=Object.assign(new Event('storage'),{key:LOCALE_KEY,newValue:'ru'});events.dispatchEvent(event);assert.equal(ui('Проекты'),'Проекты');
  assert.equal(sceneCount(1),'1 сцена');assert.equal(sceneCount(2),'2 сцены');assert.equal(sceneCount(5),'5 сцен');assert.equal(decimal(1.5),'1,50');
  Object.assign(globalThis,{localStorage:{getItem:()=>{throw Error('denied')},setItem:()=>{throw Error('denied')}}});assert.deepEqual(setInterfaceLocale('en'),{saved:false});assert.equal(ui('Проекты'),'Projects');off();
 }finally{Object.assign(globalThis,original)}
 for(const input of [null,undefined,'EN','de',{},false])assert.equal(interfaceLocale(input),'ru');
});

test('Fresh profiles follow browser language without changing explicit stored choices',()=>{
 assert.equal(preferredInterfaceLocale(['ru-RU','en-US']),'ru');assert.equal(preferredInterfaceLocale(['en-GB','ru']),'en');
 assert.equal(preferredInterfaceLocale(['de-DE']),'en');assert.equal(preferredInterfaceLocale([]),'ru');
});
test('Only a newly created English project gets English default content; IDs and schema are stable',()=>{
 const ru=blankProject({},'test-ru',7),en=blankProject({locale:'en'},'test-en',7);
 assert.equal(en.title,'New project');assert.equal(en.sequences[0]!.name,'Scene 1');assert.equal(en.cameraTracks[0]!.name,'Main camera');
 assert.equal(ru.title,'Новый проект');assert.equal(ru.sequences[0]!.id,en.sequences[0]!.id);assert(!Object.hasOwn(en,'locale'));
 assert.equal(blankProject({locale:'en',title:'Авторское имя'},'author',1).title,'Авторское имя');
 for(const [input,code]of [[{title:''},'title'],[{size:{width:0,height:100}},'size'],[{fps:{num:0,den:1}},'fps'],[{durationFrames:0},'duration']]as const)assert.throws(()=>projectSetup(input),e=>e instanceof ProjectSetupError&&e.code===code);
});
test('HTTP error recovery is based on status, with original diagnostics retained',()=>{
 const error=requestError(409,{error:'Raw technical detail'});assert.equal(error.status,409);assert.equal(error.detail,'Raw technical detail');assert.deepEqual(error.body,{error:'Raw technical detail'});
});
