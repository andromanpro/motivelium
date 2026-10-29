import{englishFilm}from'../studio/domain/contentVariants.ts';
import {exampleLanguage,type ExampleLanguage} from '../studio/domain/exampleLanguage.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildShowcase} from '../studio/domain/showcase.ts';
import {buildEnergy} from '../studio/domain/energy.ts';
import {buildMatter} from '../studio/domain/matter.ts';
import {buildLetterShow} from '../studio/domain/letterShow.ts';
import {refreshExhibit} from '../studio/domain/exhibitRefresh.ts';
import {StoreError} from './storage.ts';
import {loadExampleFilm,FILM_PRESETS} from './exampleContent.ts';
type ExampleDefinition={id:string;title:string;description:string;file:string;mime:string;preset:string;coverUrl?:string};
const definitions:ExampleDefinition[]=[
 {id:'letters',title:'Буквы вышли из себя',description:'Четыре шрифта, хореография знаков, краска внутри букв и пластичный контур',file:'www/energy/assets/razryad-180.wav',mime:'audio/wav',preset:'letters-v1'},
 {id:'energy',title:'Разряд',description:'Металл и керамика крупным планом, электрический разряд и свет на предмете. Оригинальная музыка и звуковые акценты.',file:'www/examples/assets/one-strike-bed.wav',mime:'audio/wav',preset:'discharge-film-v1',coverUrl:'/examples/covers-v5/energy.webp'},
 {id:'matter',title:'Материя',description:'Детальный Car Concept: предметный свет, разборка, пролёты к двигателю и тормозному диску',file:'www/matter/assets/matter-150.wav',mime:'audio/wav',preset:'matter-v4'},
 {id:'showcase',title:'Дай идее ход',description:'Буквы из обрезков, пролёт по бумажному холсту, складывающийся самолётик и оттиск «СВОЁ». Оригинальная музыка.',file:'www/examples/assets/collage-score.wav',mime:'audio/wav',preset:'collage-paper-v1',coverUrl:'/examples/covers-v5/showcase.webp'},
];
export function createExamples(root:string){
 function selected(id:string,value:unknown='ru'){
  const language=exampleLanguage(value);if(!language)throw new StoreError(400,'Unsupported example language. Use ru or en.');
  const source=definitions.find(d=>d.id===id);if(!source)throw new StoreError(404,'Пример не найден.');
  const availableLanguages:ExampleLanguage[]=['ru','en'];
  const contentLanguage:ExampleLanguage=availableLanguages.includes(language)?language:'ru';
  const variants:Record<string,{preset:string;title:string;description:string;coverUrl:string}>={
   energy:{preset:'discharge-film-en-v1',title:'One Strike',description:'Metal, ceramic and a single electric strike. Original music and editable sound accents.',coverUrl:'/examples/covers-v5/energy.webp'},
   letters:{preset:'letters-en-v1',title:'Type Unleashed',description:'Four typefaces, glyph choreography, liquid ink and living outlines. Every word stays editable.',coverUrl:'/examples/covers-en/letters.webp'},
   matter:{preset:'matter-film-en-v1',title:'Matter',description:'A detailed Car Concept: product lighting, disassembly and camera flights to the engine and brake disc.',coverUrl:'/examples/covers-en/matter.webp'},
   showcase:{preset:'collage-paper-en-v1',title:'Set Ideas in Motion',description:'Letters from paper scraps, a camera flight across one canvas, a folded plane and a printed YOURS seal.',coverUrl:'/examples/covers-en/showcase.webp'},
  };
  return{...source,...(contentLanguage==='en'?variants[source.id]:{}),contentLanguage,availableLanguages};
 }
 async function load(id:string,language:ExampleLanguage='ru'){const d=selected(id,language);if(FILM_PRESETS.includes(d.preset)){try{return{...d,...await loadExampleFilm(root,d.preset)}}catch(e){throw new StoreError(404,'В комплекте отсутствует или повреждён ресурс примера. '+(e as Error).message)}}let b:Buffer;try{b=await fs.readFile(path.join(root,d.file))}catch{throw new StoreError(404,'В комплекте отсутствует ресурс примера. Восстановите полный комплект программы.');}const meta={sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length};const project=id==='letters'?(d.contentLanguage==='en'?englishFilm(buildLetterShow(meta),'letters'):buildLetterShow(meta)):refreshExhibit(id==='showcase'?buildShowcase({...meta,width:b.readUInt32BE(16),height:b.readUInt32BE(20)}):id==='energy'?buildEnergy(meta):buildMatter(meta));return{...d,project};}
 return{load,async list(language:ExampleLanguage='ru'){
  if(!exampleLanguage(language))throw new StoreError(400,'Unsupported example language. Use ru or en.');
  return Promise.all(definitions.map(async source=>{const d=selected(source.id,language),coverUrl=d.coverUrl??'/examples/covers-v4/'+d.id+'.webp';
   const summary={id:d.id,coverUrl,preset:d.preset,title:d.title,description:d.description,contentLanguage:d.contentLanguage,availableLanguages:d.availableLanguages};
   try{const p=(await load(d.id,d.contentLanguage)).project;return{...summary,ready:true,reason:undefined,durationSeconds:p.durationFrames*p.fps.den/p.fps.num}}
   catch(e){return{...summary,ready:false,reason:(e as Error).message,durationSeconds:0}}
  }));
 },async asset(id:string,assetId:string){const d=await load(id),a=d.project.assets.find(a=>a.id===assetId);if(!a)throw new StoreError(404,'Ресурс примера не найден.');const resource='resources'in d?d.resources?.get(assetId):null;return resource?{file:resource.file,mime:resource.mime}:{file:path.join(root,d.file),mime:d.mime};}};
}
