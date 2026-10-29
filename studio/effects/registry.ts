// Реестр эффектов M2: определение (данные) + evaluator (чистый код).
// В JSON-проекте хранятся только EffectInstance; исполняемый код — здесь, локально.
// Порядок композиции фиксирован: локальные трансформации → геометрия/маски → материал/свет.

import {SHADERS,SHADER_MAP,shaderParamErrors,type ShaderParams} from './shaders/library.ts';
import {CONTOUR_CHOICES,contourParamErrors,type ContourMorph,type LayerMask} from './contours.ts';
import type {Volume3d,Surface3d,Grade3d} from './lighting3d.ts';
import {typographyErrors,type LetterMorph,type AsciiStyle} from './typography.ts';
import type {GlyphMotion} from './glyphMotion.ts';
export type EffectDeltas = {
  discharge3d?:import('./discharge3d.ts').Discharge3d;
  electricArc?:import('./electricArc.ts').ArcSpec;
  stormLightning?:import('./electricArc.ts').ArcSpec;
  stage3d?:{floor:string;strength:number;isolate:boolean;lighting?:string;groundPart?:string};
  x: number;        // смещение px
  y: number;
  rotate: number;   // градусы, добавка
  scale: number;    // множитель
  opacity: number;  // множитель 0..1
  blur: number;     // px
  reveal: number;   // 0..1 маска раскрытия слева направо
  glow: number;     // 0..1 сила свечения
  stretchX?: number;
  stretchY?: number;
  chromatic?: number;
  echoes?: number;
  echoX?: number;
  echoY?: number;
  glitch?: number;
  prism?: number;
  fluid?:{seconds:number;swirl:number;retention:number;mix:number;palette:number;seed:number};
  memory?:{copies:number;spacing:number;decay:number;fromFrame:number};
  assembly?:number;
  assembly3d?:{progress:number;amount:number;stagger:number;mode:string;axis:string};
  orbit3d?:{angle:number;distance:number;elevation:number};
  volume3d?:Volume3d;
  surface3d?:Surface3d;
  grade3d?:Grade3d;
  feedback?:{pipelineId:string;fromFrame:number;mix:number;params:Record<string,number>};
  morph?:ContourMorph;
  letterMorph?:LetterMorph;
  glyphMotion?:GlyphMotion;
  ascii?:AsciiStyle;
  masks?:LayerMask[];
  shaderFilters?:Array<{id:string;params:ShaderParams;mix:number;speed:number}>;
};

export const NEUTRAL_DELTAS: EffectDeltas = { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, blur: 0, reveal: 1, glow: 0 };

export type ParamSpec = { name: string; type: 'number' | 'boolean' | 'string'; min?: number; max?: number; default: number | boolean | string;choices?:Array<{value:string;label:string}>;multiline?:boolean;hint?:string };

export type EffectDefinition = {
  id: string;
  version: number;
  name: string;
  description: string;
  category: 'object';
  targets: Array<'group' | 'text' | 'image' | 'shape' | 'scene3d'>;
  params: ParamSpec[];
  evaluate: (progress: number, frame: number, params: Record<string, number | boolean | string>, context?:{fromFrame:number;toFrame:number;fps:number}) => EffectDeltas;
  previewFixture: string; // id fixture для живого превью галереи (M3)
};

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
export const smoothstep = (x: number): number => { const t = clamp01(x); return t * t * t * (t * (t * 6 - 15) + 10); };

function num(params: Record<string, number | boolean | string>, name: string, fallback: number): number {
  const v = params[name];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Эффект объекта: карточка приходит «из стопки» — дуга, поворот, мягкая посадка. */
export const revealDeal: EffectDefinition = {
  id: 'reveal-deal',
  version: 1,
  name: 'Из стопки',
  description: 'Дуга, поворот и мягкая посадка к месту',
  category: 'object',
  targets: ['image', 'shape', 'text', 'group'],
  params: [
    { name: 'distance', type: 'number', min: 0, max: 600, default: 180 },
    { name: 'angle', type: 'number', min: -30, max: 30, default: -8 },
  ],
  evaluate: (progress, _frame, params) => {
    const p = smoothstep(progress);
    const distance = num(params, 'distance', 180);
    const angle = num(params, 'angle', -8);
    return {
      x: -distance * (1 - p),
      y: distance * 0.32 * (1 - p) - Math.sin(clamp01(progress) * Math.PI) * 70,
      rotate: angle * (1 - p),
      scale: 0.88 + 0.12 * p,
      opacity: smoothstep(progress / 0.25),
      blur: 0, reveal: 1, glow: 0,
    };
  },
  previewFixture: 'card-basic',
};

/** Эффект объекта: мягкий подъём с тенью и возвратом. */
export const softLift: EffectDefinition = {
  id: 'soft-lift',
  version: 1,
  name: 'Мягкий подъём',
  description: 'Поднять объект и мягко опустить на место',
  category: 'object',
  targets: ['image', 'shape', 'text', 'group'],
  params: [
    { name: 'height', type: 'number', min: 0, max: 400, default: 90 },
  ],
  evaluate: (progress, _frame, params) => {
    const height = num(params, 'height', 90);
    const wave = Math.sin(clamp01(progress) * Math.PI); // 0 → 1 → 0
    return {
      x: 0,
      y: -height * wave,
      rotate: 0,
      scale: 1 + 0.06 * wave,
      opacity: 1,
      blur: 0,
      reveal: 1,
      glow: 0.35 * wave,
    };
  },
  previewFixture: 'card-basic',
};

const allTargets: EffectDefinition['targets'] = ['group','text','image','shape','scene3d'];
const timing: ParamSpec[] = [
  {name:'delay',type:'number',min:0,max:.95,default:0},
  {name:'span',type:'number',min:.01,max:1,default:.3},
];
const phase = (progress:number,params:Record<string,number|boolean|string>) => clamp01((progress-num(params,'delay',0))/num(params,'span',.3));
const delta = (values:Partial<EffectDeltas>):EffectDeltas => ({...NEUTRAL_DELTAS,...values});
function motion(id:string,name:string,description:string,params:ParamSpec[],evaluate:EffectDefinition['evaluate'],targets=allTargets):EffectDefinition {
  return {id,version:1,name,description,category:'object',targets,params,evaluate,previewFixture:'showcase'};
}

/** Timing is relative to the instance, not wall time: identical seek/export. */
export const fadeSlide = motion('fade-slide','Проявление в движении','Мягкое появление из смещения, с расфокусировкой',[
  ...timing,{name:'dx',type:'number',min:-2400,max:2400,default:0},
  {name:'dy',type:'number',min:-1400,max:1400,default:90},
  {name:'blur',type:'number',min:0,max:40,default:10},
],(p,_f,v)=>{const t=phase(p,v),e=1-Math.pow(1-t,4);return delta({x:num(v,'dx',0)*(1-e),y:num(v,'dy',90)*(1-e),opacity:smoothstep(t*3),blur:num(v,'blur',10)*(1-e)})});

export const springPop = motion('spring-pop','Упругая посадка','Масштаб с одним лёгким перелётом и точной остановкой',[
  ...timing,{name:'amount',type:'number',min:0,max:2,default:.7},
],(p,_f,v)=>{const t=phase(p,v),c=1.1;const e=1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);return delta({scale:Math.max(.001,1-num(v,'amount',.7)*(1-e)),opacity:smoothstep(t*4)})});

export const maskWipe = motion('mask-wipe','Раскрытие маской','Проявление изображения или надписи слева направо',[
  ...timing,
],(p,_f,v)=>delta({reveal:smoothstep(phase(p,v))}),['text','image','shape']);

export const orbitMotion = motion('orbit-motion','Орбита','Объект описывает эллипс вокруг своего исходного положения',[
  {name:'radiusX',type:'number',min:0,max:800,default:80},
  {name:'radiusY',type:'number',min:0,max:800,default:50},
  {name:'cycles',type:'number',min:.1,max:12,default:1},
  {name:'phase',type:'number',min:-360,max:360,default:0},
],(p,_f,v)=>{const a=num(v,'phase',0)*Math.PI/180,t=p*Math.PI*2*num(v,'cycles',1)+a;return delta({x:num(v,'radiusX',80)*(Math.cos(t)-Math.cos(a)),y:num(v,'radiusY',50)*(Math.sin(t)-Math.sin(a))})});

export const spinTurn = motion('spin-turn','Вращение','Равномерный оборот вокруг опорной точки объекта',[
  {name:'turns',type:'number',min:-8,max:8,default:1},
],(p,_f,v)=>delta({rotate:360*p*num(v,'turns',1)}));

export const floatDrift = motion('float-drift','Плавное парение','Небольшое покачивание без случайных рывков',[
  {name:'height',type:'number',min:0,max:300,default:25},
  {name:'angle',type:'number',min:-20,max:20,default:2},
  {name:'cycles',type:'number',min:.1,max:12,default:1},
],(p,_f,v)=>{const wave=Math.sin(p*Math.PI*2*num(v,'cycles',1));return delta({y:-num(v,'height',25)*wave,rotate:num(v,'angle',2)*wave})});

export const fadeExit = motion('fade-exit','Уход из кадра','Увести объект перед концом сцены',[
  {name:'span',type:'number',min:.01,max:1,default:.2},
  {name:'dx',type:'number',min:-2400,max:2400,default:0},
  {name:'dy',type:'number',min:-1400,max:1400,default:-70},
],(p,_f,v)=>{const e=smoothstep((p-(1-num(v,'span',.2)))/num(v,'span',.2));return delta({opacity:1-e,x:num(v,'dx',0)*e,y:num(v,'dy',-70)*e})});

export const opacityHold=motion('opacity-hold','Прозрачность в интервале','Постоянная непрозрачность слоя в выбранном интервале',[{name:'opacity',type:'number',min:0,max:1,default:.25}],(_p,_f,v)=>delta({opacity:num(v,'opacity',.25)}));
export const SHOWCASE_EFFECTS = [opacityHold,fadeSlide,springPop,maskWipe,orbitMotion,spinTurn,floatDrift,fadeExit];

export const radialBurst=motion('radial-burst','Взрыв частиц','Радиальный разлёт с замедлением и падением',[
 ...timing,{name:'angle',type:'number',min:-360,max:360,default:0},
 {name:'distance',type:'number',min:0,max:2400,default:800},
 {name:'gravity',type:'number',min:-800,max:1600,default:180},
],(p,_f,v)=>{const t=phase(p,v),e=1-Math.pow(1-t,3),a=num(v,'angle',0)*Math.PI/180;return delta({x:Math.cos(a)*num(v,'distance',800)*e,y:Math.sin(a)*num(v,'distance',800)*e+num(v,'gravity',180)*t*t,scale:1-.7*t,opacity:clamp01(smoothstep(t*18)*(1-smoothstep((t-.55)/.45)))})});

export const shockWave=motion('shock-wave','Ударная волна','Кольцо быстро расширяется и растворяется',[
 ...timing,{name:'growth',type:'number',min:1,max:24,default:12},
],(p,_f,v)=>{const t=phase(p,v);return delta({scale:.06+num(v,'growth',12)*(1-Math.pow(1-t,2)),opacity:smoothstep(t*15)*(1-t)})});

export const elasticWave=motion('elastic-wave','Пружинная деформация','Сжатие и растяжение с сохранением объёма',[
 {name:'amount',type:'number',min:0,max:.85,default:.35},
 {name:'cycles',type:'number',min:1,max:8,default:3},
],(p,_f,v)=>{const s=1+num(v,'amount',.35)*Math.sin(p*Math.PI*2*num(v,'cycles',3))*Math.pow(1-p,2);return delta({stretchX:s,stretchY:1/s})});

export const chromaticSplit=motion('chromatic-split','Цветовое расслоение','Раздвинутые цветовые отражения по краям объекта',[
 {name:'amount',type:'number',min:0,max:80,default:14},
],(p,_f,v)=>delta({chromatic:num(v,'amount',14)*Math.pow(Math.sin(p*Math.PI),2)}),['image','text','shape','scene3d']);

export const echoTrail=motion('echo-trail','Шлейф отражений','Несколько полупрозрачных следов за объектом',[
 {name:'copies',type:'number',min:1,max:8,default:4},
 {name:'distance',type:'number',min:0,max:160,default:28},
 {name:'angle',type:'number',min:-180,max:180,default:-25},
],(_p,_f,v)=>{const a=num(v,'angle',-25)*Math.PI/180;return delta({echoes:Math.round(num(v,'copies',4)),echoX:Math.cos(a)*num(v,'distance',28),echoY:Math.sin(a)*num(v,'distance',28)})},['image','text','shape','scene3d']);

export const sliceGlitch=motion('slice-glitch','Глитч-срезы','Короткие горизонтальные сдвиги, вычисленные по кадру',[
 {name:'amount',type:'number',min:0,max:140,default:40},
],(p,_f,v)=>delta({glitch:num(v,'amount',40)*Math.pow(Math.sin(p*Math.PI),4)}),['image','text','shape','scene3d']);

export const prismFold=motion('prism-fold','Призма','Калейдоскоп из зеркальных секторов одного слоя',[
 {name:'copies',type:'number',min:3,max:12,default:6},
],(_p,_f,v)=>delta({prism:Math.round(num(v,'copies',6))}),['image','text','shape','scene3d']);

export const neonAura=motion('neon-aura','Неоновое свечение','Свет вокруг настоящего силуэта объекта',[
 {name:'strength',type:'number',min:0,max:1,default:.65},
],(p,_f,v)=>delta({glow:num(v,'strength',.65)*(.85+.15*Math.sin(p*Math.PI*2))}),['image','text','shape','scene3d']);

export const ENERGY_EFFECTS=[radialBurst,shockWave,elasticWave,chromaticSplit,echoTrail,sliceGlitch,prismFold,neonAura];
export const shaderFilter:EffectDefinition={id:'shader-filter',version:1,name:'Шейдерный фильтр',description:'Фильтр из библиотеки ISF. shaderId выбирается в библиотеке, settings содержит JSON его параметров.',category:'object',targets:['text','image','shape','scene3d'],params:[{name:'shaderId',type:'string',default:SHADERS.find(s=>s.kind==='filter')?.id??''},{name:'settings',type:'string',default:'{}'},{name:'mix',type:'number',min:0,max:1,default:1},{name:'speed',type:'number',min:0,max:4,default:1}],evaluate:(_p,_f,v)=>{let params:ShaderParams={};try{params=JSON.parse(String(v.settings??'{}'))}catch{}return{...NEUTRAL_DELTAS,shaderFilters:[{id:String(v.shaderId),params,mix:num(v,'mix',1),speed:num(v,'speed',1)}]};},previewFixture:'showcase'};

export const fluidInk:EffectDefinition={id:'fluid-ink',version:1,name:'Жидкие чернила',description:'Потоки цвета с переносом, вихрями и памятью состояния. Скорость и оттенок настраиваются; перемотка воспроизводима.',category:'object',targets:['shape','text','image','scene3d'],previewFixture:'fluid',params:[{name:'mix',type:'number',min:0,max:1,default:1},{name:'speed',type:'number',min:0,max:2,default:1},{name:'swirl',type:'number',min:0,max:3,default:1.4},{name:'retention',type:'number',min:.9,max:.999,default:.985},{name:'palette',type:'number',min:-180,max:180,default:0},{name:'seed',type:'number',min:1,max:99999,default:415}],evaluate:(p,f,v,c)=>delta({fluid:{seconds:(c?(f-c.fromFrame)/c.fps:p*4)*num(v,'speed',1),swirl:num(v,'swirl',1.4),retention:num(v,'retention',.985),mix:num(v,'mix',1),palette:num(v,'palette',0),seed:Math.round(num(v,'seed',415))}})};
export const lightShafts=motion('light-shafts','Световые лучи','Рассеяние света от ярких участков настоящего силуэта',[
 {name:'strength',type:'number',min:0,max:2,default:1},{name:'lightX',type:'number',min:0,max:1,default:.5},{name:'lightY',type:'number',min:0,max:1,default:.5},{name:'spread',type:'number',min:.1,max:1,default:.9},{name:'decay',type:'number',min:.9,max:.999,default:.975},{name:'threshold',type:'number',min:0,max:1,default:.45}
],(_p,_f,v)=>delta({shaderFilters:[{id:'motivelium-light-shafts',params:{strength:num(v,'strength',1),lightX:num(v,'lightX',.5),lightY:num(v,'lightY',.5),spread:num(v,'spread',.9),decay:num(v,'decay',.975),threshold:num(v,'threshold',.45)},mix:1,speed:1}]}),['shape','text','image','scene3d']);
export const motionMemory:EffectDefinition={id:'motion-memory',version:1,name:'Память движения',description:'След из прошлых поз объекта: учитывает ключи, эффекты и камеру. Не копии со сдвигом.',category:'object',targets:['shape','text','image','scene3d'],previewFixture:'memory',params:[{name:'copies',type:'number',min:1,max:8,default:5},{name:'spacing',type:'number',min:1,max:12,default:4},{name:'decay',type:'number',min:.1,max:.9,default:.68}],evaluate:(_p,_f,v,c)=>delta({memory:{copies:Math.round(num(v,'copies',5)),spacing:Math.round(num(v,'spacing',4)),decay:num(v,'decay',.68),fromFrame:c?.fromFrame??0}})};
export const assemblySpread=motion('assembly-spread','Разобрать и собрать','Раскрывает устройство, удерживает разбор и собирает обратно',[
 {name:'amount',type:'number',min:0,max:1,default:1},{name:'delay',type:'number',min:0,max:.4,default:.05},{name:'span',type:'number',min:.1,max:1,default:.8}
],(p,_f,v)=>{const t=phase(p,v),a=smoothstep(t/.28)*(1-smoothstep((t-.7)/.3));return delta({assembly:a*num(v,'amount',1)})},['scene3d']);
export const ATMOSPHERE_EFFECTS=[fluidInk,lightShafts,motionMemory,assemblySpread];

const feedbackParams:ParamSpec[]=[
 {name:'retention',type:'number',min:.7,max:.995,default:.96},
 {name:'driftX',type:'number',min:-240,max:240,default:0},
 {name:'driftY',type:'number',min:-240,max:240,default:-24},
 {name:'turbulence',type:'number',min:0,max:4,default:.15},
 {name:'spread',type:'number',min:0,max:4,default:1.2},
 {name:'glow',type:'number',min:0,max:3,default:1.15},
 {name:'emission',type:'number',min:.01,max:1,default:.65},
 {name:'seed',type:'number',min:0,max:99999,default:415},
 {name:'mix',type:'number',min:0,max:1,default:1},
];
function feedbackMotion(id:string,name:string,description:string,pipelineId:string,params:ParamSpec[]){return motion(id,name,description,params,(_p,_f,v,c)=>delta({feedback:{pipelineId,fromFrame:c?.fromFrame??0,mix:num(v,'mix',1),params:Object.fromEntries(params.filter(p=>p.name!=='mix').map(p=>[p.name,num(v,p.name,Number(p.default))]))}}),['text','image','shape','scene3d']);}
export const FEEDBACK_EFFECTS=[
 feedbackMotion('feedback-trail','Световая память','Накопление настоящих прошлых поз, два прохода размытия и свечение','feedback-light',feedbackParams),
 feedbackMotion('feedback-smoke','Дымное растекание','Силуэт оставляет вихревой след; фиксированные шаги и восстановление при перемотке','feedback-smoke',feedbackParams.map(p=>({...p,default:({retention:.982,turbulence:1.8,spread:1.7,glow:.65,emission:.18} as Record<string,number>)[p.name]??p.default}))),
 feedbackMotion('comet-tails','Кометный след','Накопление ярких участков по алгоритму VIDVOX Comet Tails','vidvox-comet-tails',[
  {name:'absorptionRate',type:'number',min:.05,max:1,default:.5},{name:'dischargeRate',type:'number',min:.01,max:.5,default:.08},{name:'mix',type:'number',min:0,max:1,default:1},
 ]),
];

const contourParams:ParamSpec[]=[{name:'from',type:'string',default:'source',choices:CONTOUR_CHOICES},{name:'to',type:'string',default:'star',choices:CONTOUR_CHOICES},...['fromPath','toPath'].map(name=>({name,type:'string' as const,default:'',multiline:true,hint:'Один замкнутый контур M/L/H/V/C/Q/Z. Координаты 0–100, до 24 команд.'}))];
const shapeTiming:ParamSpec[]=[...timing.map(s=>({...s,default:s.name==='delay'?.08:.8})),{name:'direction',type:'string',default:'forward',choices:[{value:'forward',label:'Вперёд'},{value:'reverse',label:'Назад'},{value:'ping-pong',label:'Туда и обратно'}]},{name:'easing',type:'string',default:'smooth',choices:[{value:'smooth',label:'Плавно'},{value:'linear',label:'Равномерно'}]}];
function geometryProgress(p:number,frame:number,v:Record<string,number|boolean|string>,c?:{fromFrame:number;toFrame:number;fps:number}){const progress=c?(c.toFrame-c.fromFrame<=1?1:(frame-c.fromFrame)/(c.toFrame-c.fromFrame-1)):p;let t=clamp01((progress-num(v,'delay',.08))/num(v,'span',.8));if(v.direction==='ping-pong')t=1-Math.abs(t*2-1);else if(v.direction==='reverse')t=1-t;return v.easing==='linear'?t:smoothstep(t);}
function contour(v:Record<string,number|boolean|string>,progress:number):ContourMorph{return{from:String(v.from??'source'),to:String(v.to??'star'),fromPath:String(v.fromPath??''),toPath:String(v.toPath??''),progress};}
function layerMask(kind:LayerMask['kind'],p:number,v:Record<string,number|boolean|string>):LayerMask{return{kind,progress:p,inverse:v.inverse===true,centerX:num(v,'centerX',.5),centerY:num(v,'centerY',.5),seed:num(v,'seed',415),detail:num(v,'detail',kind==='dissolve'?42:3),softness:num(v,'softness',.07),...(kind==='contour'?{contour:contour({from:'circle',to:'source',...v},p)}:{})};}
const maskTargets:EffectDefinition['targets']=['text','image','shape','scene3d'];
export const GEOMETRY_EFFECTS=[
 motion('contour-morph','Превращение контура','Фигура меняет геометрию между двумя контурами; Flubber, без подмены кадров',[...contourParams,...shapeTiming],(p,f,v,c)=>delta({morph:contour(v,geometryProgress(p,f,v,c))}),['shape']),
 motion('contour-window','Контурное окно','Растущее окно меняет форму и раскрывает настоящий слой',[...contourParams.map(s=>({...s,default:s.name==='from'?'circle':s.name==='to'?'source':s.default})),...shapeTiming,{name:'inverse',type:'boolean',default:false}],(p,f,v,c)=>delta({masks:[layerMask('contour',geometryProgress(p,f,v,c),v)]}),maskTargets),
 motion('organic-reveal','Живое раскрытие','Неровная волна открывает текст, изображение или 3D-слой',[...shapeTiming,{name:'centerX',type:'number',min:0,max:1,default:.5},{name:'centerY',type:'number',min:0,max:1,default:.5},{name:'detail',type:'number',min:0,max:6,default:3},{name:'seed',type:'number',min:0,max:99999,default:415},{name:'inverse',type:'boolean',default:false}],(p,f,v,c)=>delta({masks:[layerMask('organic',geometryProgress(p,f,v,c),v)]}),maskTargets),
 motion('noise-dissolve','Шумовое растворение','Слой проявляется через поле мелких островков; чистые начало и конец',[...shapeTiming,{name:'detail',type:'number',min:8,max:120,default:42},{name:'softness',type:'number',min:.005,max:.25,default:.07},{name:'seed',type:'number',min:0,max:99999,default:415},{name:'inverse',type:'boolean',default:false}],(p,f,v,c)=>delta({masks:[layerMask('dissolve',geometryProgress(p,f,v,c),v)]}),maskTargets),
];

export const TYPOGRAPHY_EFFECTS:EffectDefinition[]=[
 motion('letter-morph','Морфинг леттеринга','Пластичные контуры букв Onest: русский и латиница, отверстия и раздельные части',[...shapeTiming,{name:'style',type:'string',default:'onest',choices:[{value:'onest',label:'Onest · чистый контур'},{value:'puffy',label:'Bouffont · пухлый'}]},{name:'fromText',type:'string',default:'',multiline:true,hint:'Пусто — исходный текст объекта. Для цепочки можно указать предыдущий результат.'},{name:'toText',type:'string',default:'ВКУСНО',multiline:true,hint:'До 120 знаков, 3 строки. Встроенный Onest; обычный шрифт объекта здесь не используется.'},{name:'bend',type:'number',min:0,max:1,default:.35},{name:'stagger',type:'number',min:0,max:.8,default:.2},{name:'colorize',type:'boolean',default:false},{name:'hue',type:'number',min:0,max:360,default:160}],(p,f,v,c)=>delta({letterMorph:{style:String(v.style??'onest'),fromText:String(v.fromText??''),toText:String(v.toText??'ВКУСНО'),progress:geometryProgress(p,f,v,c),bend:num(v,'bend',.35),stagger:num(v,'stagger',.2),colorize:v.colorize===true,hue:num(v,'hue',160)}}),['text']),
 motion('ascii-screen','ASCII · изображение и поля','Пиксели слоя становятся символами; живые волны, вихрь и дождь вычисляются по времени',[{name:'mode',type:'string',default:'layer',choices:[{value:'layer',label:'Изображение слоя'},{value:'waves',label:'Символьные волны'},{value:'vortex',label:'Вихрь'},{value:'rain',label:'Дождь'},{value:'fish',label:'Рыбка'}]},{name:'cell',type:'number',min:4,max:40,default:12},{name:'ramp',type:'string',default:' .,:;irsXA253hMHGS#9B&@',hint:'От 2 до 64 ASCII-символов: от пустого к плотному.'},{name:'color',type:'boolean',default:true},{name:'ink',type:'string',default:'#9de5c9'},{name:'mix',type:'number',min:0,max:1,default:1},{name:'speed',type:'number',min:0,max:4,default:1},{name:'seed',type:'number',min:0,max:99999,default:415},{name:'hue',type:'number',min:0,max:360,default:160}],(_p,f,v,c)=>delta({ascii:{mode:String(v.mode??'layer'),cell:num(v,'cell',12),ramp:String(v.ramp??' .,:;irsXA253hMHGS#9B&@'),color:v.color!==false,ink:String(v.ink??'#9de5c9'),mix:num(v,'mix',1),seconds:f/(c?.fps??30)*num(v,'speed',1),seed:num(v,'seed',415),hue:num(v,'hue',160)}}),['text','image','shape','scene3d']),
];

export const MODEL3D_EFFECTS:EffectDefinition[]=[
 {id:'3d-volume-light',version:1,name:'Свет в объёме',description:'Рассеяние в 3D-конусе: глубина кадра и отдельная карта перекрытий от источника света. Однократное рассеяние, без накопления кадров.',category:'object',targets:['scene3d'],previewFixture:'assembly',params:[{name:'density',type:'number',min:0,max:.25,default:.065},{name:'strength',type:'number',min:0,max:4,default:1.4},{name:'angle',type:'number',min:10,max:65,default:32},{name:'lightX',type:'number',min:-8,max:8,default:-3},{name:'lightY',type:'number',min:-2,max:10,default:5},{name:'lightZ',type:'number',min:-8,max:8,default:3},{name:'palette',type:'string',default:'cool',choices:[{value:'warm',label:'Тёплый янтарь'},{value:'cool',label:'Холодный свет'},{value:'violet',label:'Сиреневый'}]},{name:'quality',type:'string',default:'balanced',choices:[{value:'draft',label:'Черновое · 16 шагов'},{value:'balanced',label:'Среднее · 32 шага'},{value:'high',label:'Высокое · 56 шагов'}]},{name:'occlusion',type:'boolean',default:true}],evaluate:(_p,_f,v)=>delta({volume3d:{density:num(v,'density',.065),strength:num(v,'strength',1.4),angle:num(v,'angle',32),lightX:num(v,'lightX',-3),lightY:num(v,'lightY',5),lightZ:num(v,'lightZ',3),palette:String(v.palette??'cool'),quality:String(v.quality??'balanced'),occlusion:v.occlusion!==false}})},
 {id:'3d-surface',version:1,name:'Материал предмета',description:'Металл, керамика или перламутр на настоящих материалах модели. Карты цвета, нормалей и исходный ресурс сохраняются.',category:'object',targets:['scene3d'],previewFixture:'assembly',params:[{name:'finish',type:'string',default:'titanium',choices:[{value:'titanium',label:'Титан'},{value:'ceramic',label:'Керамика'},{value:'pearl',label:'Перламутр'}]},{name:'roughness',type:'number',min:.04,max:1,default:.26},{name:'metalness',type:'number',min:0,max:1,default:.75},{name:'tint',type:'number',min:0,max:1,default:.4}],evaluate:(_p,_f,v)=>delta({surface3d:{finish:String(v.finish??'titanium'),roughness:num(v,'roughness',.26),metalness:num(v,'metalness',.75),tint:num(v,'tint',.4)}})},
 {id:'3d-finish',version:1,name:'Предметный свет и свечение',description:'Свечение ярких участков в линейном цвете, экспозиция, контраст и виньетка. Обработка остаётся внутри прозрачного 3D-слоя.',category:'object',targets:['scene3d'],previewFixture:'assembly',params:[{name:'glow',type:'number',min:0,max:2,default:.4},{name:'threshold',type:'number',min:.1,max:2,default:.85},{name:'exposure',type:'number',min:.3,max:2.5,default:1.05},{name:'contrast',type:'number',min:.5,max:1.6,default:1.04},{name:'vignette',type:'number',min:0,max:1,default:.2}],evaluate:(_p,_f,v)=>delta({grade3d:{glow:num(v,'glow',.4),threshold:num(v,'threshold',.85),exposure:num(v,'exposure',1.05),contrast:num(v,'contrast',1.04),vignette:num(v,'vignette',.2)}})},
 {id:'3d-assembly-wave',version:1,name:'Разборка волной',description:'Отдельные детали расходятся последовательно и возвращаются. Порядок, направление и задержка управляемы.',category:'object',targets:['scene3d'],previewFixture:'assembly',params:[{name:'amount',type:'number',min:0,max:4,default:1.6},{name:'stagger',type:'number',min:0,max:.6,default:.3},{name:'mode',type:'string',default:'cycle',choices:[{value:'cycle',label:'Разобрать и собрать'},{value:'explode',label:'Разобрать'},{value:'assemble',label:'Собрать'}]},{name:'axis',type:'string',default:'vertical',choices:[{value:'vertical',label:'По вертикали'},{value:'radial',label:'От центра'}]}],evaluate:(_,frame,p,c)=>({...NEUTRAL_DELTAS,assembly3d:{progress:c?clamp01((frame-c.fromFrame)/Math.max(1,c.toFrame-c.fromFrame-1)):_,amount:Number(p.amount??1.6),stagger:Number(p.stagger??.3),mode:String(p.mode??'cycle'),axis:String(p.axis??'vertical')}})},
 {id:'3d-camera-orbit',version:1,name:'Камера вокруг устройства',description:'Настоящая 3D-камера обходит модель. Детали и свет остаются в одном пространстве.',category:'object',targets:['scene3d'],previewFixture:'assembly',params:[{name:'angle',type:'number',min:-360,max:360,default:150},{name:'distance',type:'number',min:2,max:14,default:6.5},{name:'elevation',type:'number',min:-4,max:8,default:2.6}],evaluate:(_,frame,p,c)=>({...NEUTRAL_DELTAS,orbit3d:{angle:35+Number(p.angle??150)*smoothstep(c?clamp01((frame-c.fromFrame)/Math.max(1,c.toFrame-c.fromFrame-1)):_),distance:Number(p.distance??6.5),elevation:Number(p.elevation??2.6)}})},
];
export const glyphMotion=motion('glyph-motion','Хореография букв','Волна, хоровод или сборка отдельных знаков. Сохраняет выбранный шрифт, кириллицу и переносы.',[
 {name:'mode',type:'string',default:'wave',choices:[{value:'wave',label:'Волна'},{value:'orbit',label:'Хоровод'},{value:'assemble',label:'Собрать слово'}]},
 {name:'amplitude',type:'number',min:0,max:240,default:38},
 {name:'cycles',type:'number',min:.1,max:12,default:2},
 {name:'stagger',type:'number',min:0,max:.8,default:.4},
 {name:'rotation',type:'number',min:0,max:60,default:12},
 {name:'colorize',type:'boolean',default:false},{name:'hue',type:'number',min:0,max:360,default:160},
],(p,_f,v)=>delta({glyphMotion:{mode:String(v.mode??'wave'),progress:p,amplitude:num(v,'amplitude',38),cycles:num(v,'cycles',2),stagger:num(v,'stagger',.4),rotation:num(v,'rotation',12),colorize:v.colorize===true,hue:num(v,'hue',160)}}),['text']);
export const electricArc:EffectDefinition={id:'electric-arc',version:1,name:'Электрический разряд',description:'Живой ветвящийся канал между двумя точками: пробой, белое ядро, цветная корона и затухание. Геометрия воспроизводится по времени и seed.',category:'object',targets:['shape'],previewFixture:'electric',params:[
 {name:'startX',type:'number',min:.04,max:.96,default:.12},{name:'startY',type:'number',min:.04,max:.96,default:.5},{name:'endX',type:'number',min:.04,max:.96,default:.88},{name:'endY',type:'number',min:.04,max:.96,default:.5},
 {name:'branches',type:'number',min:0,max:10,default:6},{name:'roughness',type:'number',min:0,max:1,default:.8},{name:'width',type:'number',min:.5,max:8,default:2.2},{name:'power',type:'number',min:0,max:1,default:1},{name:'speed',type:'number',min:0,max:4,default:1},{name:'seed',type:'number',min:0,max:9999,default:73},
 {name:'palette',type:'string',default:'ion',choices:[{value:'ion',label:'Ионный голубой'},{value:'violet',label:'Фиолетовый'},{value:'amber',label:'Янтарный'}]},
 ],evaluate:(p,f,v,c)=>delta({electricArc:{startX:num(v,'startX',.12),startY:num(v,'startY',.5),endX:num(v,'endX',.88),endY:num(v,'endY',.5),branches:Math.round(num(v,'branches',6)),roughness:num(v,'roughness',.8),width:num(v,'width',2.2),power:num(v,'power',1),speed:num(v,'speed',1),seed:num(v,'seed',73),palette:String(v.palette??'ion'),progress:p,seconds:(f-(c?.fromFrame??0))/(c?.fps??30)}})};
export const stormLightning:EffectDefinition={...electricArc,id:'storm-lightning',name:'Молния · Storm Lance',description:'Шейдерные электрические каналы с острыми изломами, повторными ударами и отдельными ядром/ореолом. Адаптация MIT LinearAbiltyCastingThreeJS.',evaluate:(p,f,v,c)=>delta({stormLightning:electricArc.evaluate(p,f,v,c).electricArc!})};
export const REGISTRY: ReadonlyMap<string, EffectDefinition> = new Map([
 ['3d-discharge',{id:'3d-discharge',version:1,name:'Один удар · 3D',description:'Разряд в пространстве предмета: предвестники, удар, повтор, след и настоящий свет на модели/полу. Время задано относительно интервала.',category:'object',targets:['scene3d'],previewFixture:'assembly',params:[{name:'impact',type:'number',min:.1,max:10,default:1.2},{name:'strength',type:'number',min:.1,max:2,default:1},{name:'reach',type:'number',min:.5,max:4,default:2.3},{name:'seed',type:'number',min:0,max:9999,default:2910},{name:'sourcePart',type:'string',default:'',hint:'ID детали-источника; пустое значение — верх модели'},{name:'lightScene',type:'boolean',default:true}],evaluate:(_p,f,v,c)=>delta({discharge3d:{seconds:(f-(c?.fromFrame??0))/(c?.fps??30),impact:num(v,'impact',1.2),strength:num(v,'strength',1),reach:num(v,'reach',2.3),seed:Math.round(num(v,'seed',2910)),sourcePart:String(v.sourcePart??''),lightScene:v.lightScene!==false}})}],
  [stormLightning.id,stormLightning],
  ['3d-studio-stage',{id:'3d-studio-stage',version:1,name:'Предметная площадка',description:'Плоскость, контактная тень и предметный свет: мягкая студия или направленный свет с полосой отражения.',category:'object',targets:['scene3d'],previewFixture:'assembly',params:[{name:'floor',type:'string',default:'graphite',choices:[{value:'graphite',label:'Графит'},{value:'paper',label:'Светлая студия'}]},{name:'lighting',type:'string',default:'neutral',choices:[{value:'neutral',label:'Мягкая студия'},{value:'dramatic',label:'Направленный свет'}]},{name:'groundPart',type:'string',default:'',hint:'ID детали, нижняя граница которой задаёт высоту пола. Пусто — вся модель. Берётся исходная поза, чтобы пол не двигался вместе с анимацией.'},{name:'strength',type:'number',min:.2,max:2,default:1},{name:'isolate',type:'boolean',default:false}],evaluate:(_p,_f,v)=>delta({stage3d:{floor:String(v.floor??'graphite'),strength:num(v,'strength',1),isolate:v.isolate===true,lighting:String(v.lighting??'neutral'),groundPart:String(v.groundPart??'')}})}],
  [electricArc.id,electricArc],
  [glyphMotion.id,glyphMotion],
  [revealDeal.id, revealDeal],
  [softLift.id, softLift],
  ...SHOWCASE_EFFECTS.map(def => [def.id,def] as [string,EffectDefinition]),
  ...ENERGY_EFFECTS.map(def => [def.id,def] as [string,EffectDefinition]),
  [shaderFilter.id,shaderFilter],
  ...ATMOSPHERE_EFFECTS.map(def=>[def.id,def] as [string,EffectDefinition]),
  ...FEEDBACK_EFFECTS.map(def=>[def.id,def] as [string,EffectDefinition]),
  ...GEOMETRY_EFFECTS.map(def=>[def.id,def] as [string,EffectDefinition]),
  ...TYPOGRAPHY_EFFECTS.map(def=>[def.id,def] as [string,EffectDefinition]),
  ...MODEL3D_EFFECTS.map(def=>[def.id,def] as [string,EffectDefinition]),
]);

/** Значения параметров по умолчанию для определения. */
export function defaultParams(def: EffectDefinition): Record<string, number | boolean | string> {
  const out: Record<string, number | boolean | string> = {};
  for (const p of def.params) out[p.name] = p.default;
  return out;
}

/** Проверка параметров против схемы определения (для валидации операций на M3 и для UI). */
export function validateEffectParams(def: EffectDefinition, params: Record<string, number | boolean | string>): string[] {
  const errors: string[] = [];
  errors.push(...contourParamErrors(def.id,{...defaultParams(def),...params}));
  errors.push(...typographyErrors(def.id,{...defaultParams(def),...params}));
  if(def.id==='shader-filter'){const shader=SHADER_MAP.get(String(params.shaderId??defaultParams(def).shaderId));if(shader?.kind!=='filter')errors.push('Неизвестный шейдерный фильтр.');else try{const text=String(params.settings??'{}');if(text.length>8192)errors.push('Слишком много параметров фильтра.');else errors.push(...shaderParamErrors(shader,JSON.parse(text)));}catch{errors.push('Параметры фильтра: нужен JSON-объект.');}}
  if(def.id==='3d-volume-light'){const p={...defaultParams(def),...params};if(Math.hypot(Number(p.lightX),Number(p.lightY)-.3,Number(p.lightZ))<.1)errors.push('Источник света совпал с целью: измени положение.');}
  const names = new Set(def.params.map(p => p.name));
  for (const k of Object.keys(params)) if (!names.has(k)) errors.push(`параметр "${k}" не существует у эффекта ${def.id}`);
  for (const p of def.params) {
    const v = params[p.name];
    if (v === undefined) continue;
    if (p.type === 'number' && (typeof v !== 'number'||!Number.isFinite(v))) errors.push(`параметр "${p.name}": ожидается конечное число`);
    if (p.type === 'number' && typeof v === 'number' && p.min !== undefined && p.max !== undefined && (v < p.min || v > p.max))
      errors.push(`параметр "${p.name}": вне [${String(p.min)}, ${String(p.max)}]`);
    if (p.type === 'boolean' && typeof v !== 'boolean') errors.push(`параметр "${p.name}": ожидается boolean`);
    if (p.type === 'string' && typeof v !== 'string') errors.push(`параметр "${p.name}": ожидается строка`);
    if(p.choices&&!p.choices.some(c=>c.value===v))errors.push(`параметр "${p.name}": выбери значение из списка`);
  }
  return errors;
}

/** Свернуть дельты нескольких активных эффектов одного объекта. */
export function combineDeltas(list: EffectDeltas[]): EffectDeltas {
  return list.reduce((a, b) => ({
    x: a.x + b.x,
    y: a.y + b.y,
    rotate: a.rotate + b.rotate,
    scale: a.scale * b.scale,
    opacity: a.opacity * b.opacity,
    blur: a.blur + b.blur,
    reveal: Math.min(a.reveal, b.reveal),
    glow: Math.max(a.glow, b.glow),
    ...(a.discharge3d||b.discharge3d?{discharge3d:b.discharge3d??a.discharge3d}:{}),
    ...(a.stormLightning||b.stormLightning?{stormLightning:b.stormLightning??a.stormLightning}:{}),
    ...(a.electricArc||b.electricArc?{electricArc:b.electricArc??a.electricArc}:{}),
    ...(a.stage3d||b.stage3d?{stage3d:b.stage3d??a.stage3d}:{}),
    ...(a.stretchX!==undefined||b.stretchX!==undefined?{stretchX:(a.stretchX??1)*(b.stretchX??1)}:{}),
    ...(a.stretchY!==undefined||b.stretchY!==undefined?{stretchY:(a.stretchY??1)*(b.stretchY??1)}:{}),
    ...(a.chromatic!==undefined||b.chromatic!==undefined?{chromatic:Math.max(a.chromatic??0,b.chromatic??0)}:{}),
    ...(a.echoes!==undefined||b.echoes!==undefined?{echoes:Math.max(a.echoes??0,b.echoes??0),echoX:b.echoX??a.echoX??0,echoY:b.echoY??a.echoY??0}:{}),
    ...(a.glitch!==undefined||b.glitch!==undefined?{glitch:Math.max(a.glitch??0,b.glitch??0)}:{}),
    ...(a.prism!==undefined||b.prism!==undefined?{prism:Math.max(a.prism??0,b.prism??0)}:{}),
    ...(a.fluid||b.fluid?{fluid:b.fluid??a.fluid}:{}),
    ...(a.memory||b.memory?{memory:b.memory??a.memory}:{}),
    ...(a.assembly!==undefined||b.assembly!==undefined?{assembly:Math.max(a.assembly??0,b.assembly??0)}:{}),
    ...(a.assembly3d||b.assembly3d?{assembly3d:b.assembly3d??a.assembly3d}:{}),
    ...(a.orbit3d||b.orbit3d?{orbit3d:b.orbit3d??a.orbit3d}:{}),
    ...(a.volume3d||b.volume3d?{volume3d:b.volume3d??a.volume3d}:{}),
    ...(a.surface3d||b.surface3d?{surface3d:b.surface3d??a.surface3d}:{}),
    ...(a.grade3d||b.grade3d?{grade3d:b.grade3d??a.grade3d}:{}),
    ...(a.feedback||b.feedback?{feedback:b.feedback??a.feedback}:{}),
    ...(a.morph||b.morph?{morph:b.morph??a.morph}:{}),
    ...(a.letterMorph||b.letterMorph?{letterMorph:b.letterMorph??a.letterMorph}:{}),
    ...(a.glyphMotion||b.glyphMotion?{glyphMotion:b.glyphMotion??a.glyphMotion}:{}),
    ...(a.ascii||b.ascii?{ascii:b.ascii??a.ascii}:{}),
    ...(a.masks||b.masks?{masks:[...(a.masks??[]),...(b.masks??[])]}:{}),
    ...(a.shaderFilters||b.shaderFilters?{shaderFilters:[...(a.shaderFilters??[]),...(b.shaderFilters??[])]}:{}),
  }), { ...NEUTRAL_DELTAS });
}
