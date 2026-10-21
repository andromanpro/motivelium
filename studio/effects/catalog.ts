import type {Project,SceneNode,EffectInstance} from '../domain/schema.ts';
import type {Operation} from '../domain/operations.ts';
import {REGISTRY,defaultParams,validateEffectParams} from './registry.ts';

export const CATEGORIES=['Все','Появление','Движение','Деформация','Свет и цвет','Частицы','Уход'] as const;
type Category=Exclude<typeof CATEGORIES[number],'Все'>;
export type EffectCard={id:string;category:Category;tag:string;color:string;words:string;recipe:string};
export const CATALOG:EffectCard[]=[
 {id:'opacity-hold',category:'Свет и цвет',tag:'ПРОЗРАЧНОСТЬ',color:'#b7c8ad',words:'скрыть спрятать слой непрозрачность прозрачность hide visibility',recipe:'Задать постоянную прозрачность в интервале. В сочетаниях скрывает прежние надписи на время показа.'},
 {id:'3d-volume-light',category:'Свет и цвет',tag:'ОБЪЁМ 3D',color:'#9fd9f7',words:'объем свет туман глубина лучи occlusion shadow объемный fog',recipe:'Настоящий конус света в тумане, перекрываемый геометрией. Выбери положение, плотность и качество.'},
 {id:'3d-surface',category:'Свет и цвет',tag:'МАТЕРИАЛ 3D',color:'#cfbda7',words:'материал титан керамика металл перламутр поверхность roughness',recipe:'Титан, керамика или перламутр на материалах модели. Карты и исходник остаются целыми.'},
 {id:'3d-finish',category:'Свет и цвет',tag:'ОБРАБОТКА 3D',color:'#b6a3ed',words:'свечение bloom экспозиция контраст виньетка предметный свет',recipe:'Свечение ярких участков, экспозиция и контраст. Настройки применяются внутри выбранного 3D-слоя.'},
 {id:'3d-assembly-wave',category:'Деформация',tag:'ДЕТАЛИ 3D',color:'#d8b58e',words:'разборка сборка детали волна механизм импорт glb gltf anatomy',recipe:'Детали расходятся волной. Выбери направление, задержку и режим: разобрать, собрать или полный цикл.'},
 {id:'3d-camera-orbit',category:'Движение',tag:'КАМЕРА 3D',color:'#8fe5d5',words:'камера пролет орбита обзор ракурс механизм 3d',recipe:'Камера обходит устройство в пространстве. Настрой угол, дистанцию и высоту; пролёт к конкретной детали — в мастерской 3D.'},
 {id:'contour-morph',category:'Деформация',tag:'КОНТУР',color:'#f4c884',words:'morph flubber svg контур превращение форма буква звезда молния',recipe:'Фигура плавно меняет настоящий контур. Выбери начало, конец или свой SVG-путь.'},
 {id:'contour-window',category:'Появление',tag:'ОКНО',color:'#8fe5d5',words:'маска окно контур portal ирис раскрытие svg',recipe:'Окно растёт и меняет форму, открывая реальное содержимое выбранного слоя.'},
 {id:'organic-reveal',category:'Появление',tag:'ЖИВАЯ МАСКА',color:'#c8aff7',words:'organic маска органика жидкость волна проявление',recipe:'Неровный фронт раскрывает слой от выбранной точки; форма волны задаётся вариантом.'},
 {id:'noise-dissolve',category:'Появление',tag:'РАСТВОРЕНИЕ',color:'#96c6fc',words:'noise dissolve шум растворение пиксели маска появление',recipe:'Мелкие островки собираются в изображение. Можно сменить направление и инвертировать маску.'},
 {id:'feedback-trail',category:'Свет и цвет',tag:'НАКОПЛЕНИЕ',color:'#77f0df',words:'feedback multipass накопление свет память шлейф проходы',recipe:'Прошлые положения слоя накапливают свет. Четыре прохода, точная перемотка.'},
 {id:'feedback-smoke',category:'Деформация',tag:'РАСТЕКАНИЕ',color:'#c2a0fa',words:'feedback smoke дым вихри растекание накопление multipass',recipe:'Движущийся силуэт оставляет дымный вихревой след. Это стилизованный эффект изображения.'},
 {id:'comet-tails',category:'Движение',tag:'VIDVOX',color:'#f1c779',words:'comet trails tails комета след накопление vidvox isf',recipe:'Открытый алгоритм VIDVOX: яркие участки дольше сохраняются в памяти изображения.'},
 {id:'fluid-ink',category:'Деформация',tag:'ПОТОК',color:'#7de8ce',words:'жидкость fluid чернила дым вихри вода',recipe:'Цветные потоки переносятся полем скоростей. Память симуляции сохраняется для перемотки.'},
 {id:'light-shafts',category:'Свет и цвет',tag:'ЛУЧИ',color:'#f5d399',words:'свет лучи рассеяние god rays объем',recipe:'Яркие части силуэта становятся источниками лучей.'},
 {id:'motion-memory',category:'Движение',tag:'ПАМЯТЬ',color:'#a9adff',words:'след шлейф прошлые кадры память движение',recipe:'След из предыдущих поз: двигается вместе с настоящей траекторией объекта.'},
 {id:'assembly-spread',category:'Деформация',tag:'РАЗБОР',color:'#eeb38a',words:'анатомия anatomy разбор сборка устройство детали 3d',recipe:'Устройство раскрывается на детали, удерживает позу и собирается.'},
 {id:'reveal-deal',category:'Появление',tag:'ДУГА',color:'#e6b781',words:'карточка появление поворот',recipe:'Карточка приходит по дуге и занимает своё место.'},
 {id:'fade-slide',category:'Появление',tag:'ВХОД',color:'#94b6fc',words:'слайд смещение размытие',recipe:'Сначала движение и расфокусировка, затем чёткая посадка.'},
 {id:'spring-pop',category:'Появление',tag:'ПРУЖИНА',color:'#d4a1ff',words:'масштаб упругость увеличение',recipe:'Короткое увеличение с перелётом и возвращением.'},
 {id:'mask-wipe',category:'Появление',tag:'МАСКА',color:'#a3d7a1',words:'раскрытие шторка маска',recipe:'Изображение или надпись открываются слева направо.'},
 {id:'soft-lift',category:'Движение',tag:'ПОДЪЁМ',color:'#e8c285',words:'поднять опустить плавно',recipe:'Мягкий подъём, немного света и возвращение.'},
 {id:'orbit-motion',category:'Движение',tag:'ОРБИТА',color:'#73dfda',words:'круг эллипс траектория',recipe:'Объект проходит эллиптическую орбиту.'},
 {id:'spin-turn',category:'Движение',tag:'ОБОРОТ',color:'#b3b1ff',words:'крутить вращать поворот',recipe:'Поворот вокруг опорной точки объекта.'},
 {id:'float-drift',category:'Движение',tag:'ПАРЕНИЕ',color:'#a0d9c6',words:'дрейф качание плавно',recipe:'Небольшое покачивание для живого спокойного кадра.'},
 {id:'elastic-wave',category:'Деформация',tag:'ИНЕРЦИЯ',color:'#df9bf4',words:'буквы желе сжатие растяжение упругость',recipe:'Сжатие и растяжение с затухающей упругостью.'},
 {id:'echo-trail',category:'Деформация',tag:'ЭХО',color:'#a0b2ff',words:'шлейф след отражение копии',recipe:'Полупрозрачные отражения подчёркивают направление.'},
 {id:'slice-glitch',category:'Деформация',tag:'СБОЙ',color:'#f3a18d',words:'глитч glitch помехи полосы',recipe:'Короткие горизонтальные сдвиги изображения.'},
 {id:'prism-fold',category:'Деформация',tag:'ПРИЗМА',color:'#bd9eff',words:'зеркало калейдоскоп призма',recipe:'Зеркальные сектора превращают слой в калейдоскоп.'},
 {id:'chromatic-split',category:'Свет и цвет',tag:'RGB',color:'#77e3da',words:'цвет хроматика rgb расслоение',recipe:'Цветные края расходятся и возвращаются.'},
 {id:'neon-aura',category:'Свет и цвет',tag:'НЕОН',color:'#9af8d5',words:'неон сияние glow свечение',recipe:'Свет повторяет настоящий силуэт объекта.'},
 {id:'radial-burst',category:'Частицы',tag:'РАЗЛЁТ',color:'#ffc18b',words:'взрыв искры частицы баллистика',recipe:'Разлёт по траектории. К одному объекту применяется одна траектория; поле частиц собирается из нескольких объектов.'},
 {id:'shock-wave',category:'Частицы',tag:'ИМПУЛЬС',color:'#f5a4d2',words:'волна удар кольцо взрыв',recipe:'Быстрый рост и растворение. Для кольца выбери контурную фигуру.'},
 {id:'fade-exit',category:'Уход',tag:'ВЫХОД',color:'#c8cda8',words:'уход исчезновение выход',recipe:'Объект уходит в конце выбранного интервала.'},
];
const materialOnly=new Set(['chromatic-split','echo-trail','slice-glitch','prism-fold','neon-aura']);
export function compatibilityReason(project:Project,node:SceneNode|null,definitionId:string):string|null {
 if(!node)return 'Выбери объект для эффекта.';
 const def=REGISTRY.get(definitionId);if(!def)return 'Эффект не найден.';
 if(def.targets.length===1&&def.targets[0]==='scene3d'&&node.kind!=='scene3d')return 'Этот эффект применяется к 3D-слою. Выбери устройство или импортированную модель.';
 if(definitionId==='contour-morph'&&node.kind!=='shape')return 'Превращение контура применяется к фигуре. Для текста, изображения или 3D выбери маску раскрытия.';
 if(!def.targets.includes(node.kind)||(node.kind==='group'&&materialOnly.has(definitionId)))return 'Этот эффект применяется к тексту, изображению, фигуре или 3D-слою. Для группы выбери движение.';
 let current:SceneNode|undefined=node;while(current){if(current.locked)return 'Объект или его группа заблокированы.';current=current.parentId?project.nodes.find(n=>n.id===current!.parentId):undefined}
 return null;
}
export function effectRange(project:Project,node:SceneNode|null):{fromFrame:number;toFrame:number} {
 const s=project.sequences.find(s=>s.id===node?.sequenceId);return{fromFrame:s?.fromFrame??0,toFrame:s?.toFrame??project.durationFrames};
}
export function addEffectOperation(project:Project,targetId:string,definitionId:string,params:EffectInstance['params'],fromFrame:number,toFrame:number,id:string):Operation {
 const node=project.nodes.find(n=>n.id===targetId)??null,reason=compatibilityReason(project,node,definitionId);if(reason)throw Error(reason);
 const range=effectRange(project,node);
 if(!Number.isInteger(fromFrame)||!Number.isInteger(toFrame)||fromFrame<range.fromFrame||toFrame>range.toFrame||fromFrame>=toFrame)throw Error(`Выбери кадры внутри сцены: ${range.fromFrame}–${range.toFrame-1}.`);
 const def=REGISTRY.get(definitionId)!,values={...defaultParams(def),...params},errors=validateEffectParams(def,values);if(errors.length)throw Error(errors.join('; '));
 const order=Math.max(0,...project.effects.filter(e=>e.targetId===targetId).map(e=>e.order))+1;
 return{op:'addEffect',effect:{id,definitionId,definitionVersion:def.version,targetId,fromFrame,toFrame,params:values,enabled:true,order}};
}
export function filterCatalog(query:string,category:string,ids?:readonly string[]):EffectCard[] {
 const terms=query.toLocaleLowerCase('ru').trim().split(/\s+/).filter(Boolean);
 return CATALOG.filter(c=>(category==='Все'||c.category===category)&&(!ids||ids.includes(c.id))&&terms.every(t=>`${REGISTRY.get(c.id)?.name} ${c.category} ${c.words} ${c.recipe}`.toLocaleLowerCase('ru').includes(t)));
}
export function effectStack(project:Project,targetId:string){return project.effects.filter(e=>e.targetId===targetId).sort((a,b)=>a.order-b.order)}
export function moveEffectOperations(project:Project,id:string,direction:-1|1):Operation[] {
 const effect=project.effects.find(e=>e.id===id);if(!effect)throw Error('Эффект не найден.');
 const sorted=effectStack(project,effect.targetId),i=sorted.findIndex(e=>e.id===id),j=i+direction;if(j<0||j>=sorted.length)return[];
 [sorted[i],sorted[j]]=[sorted[j]!,sorted[i]!];return sorted.flatMap((e,index)=>e.order===index+1?[]:[{op:'updateEffect' as const,targetId:e.id,values:{order:index+1}}]);
}
const parameterNames:Record<string,string>={delay:'Задержка, доля интервала',span:'Длительность, доля интервала',dx:'Сдвиг X, px',dy:'Сдвиг Y, px',blur:'Расфокусировка',amount:'Сила масштаба',radiusX:'Радиус X',radiusY:'Радиус Y',cycles:'Циклов',phase:'Начальная фаза, °',turns:'Оборотов',height:'Высота',angle:'Угол, °',distance:'Расстояние',growth:'Рост волны',gravity:'Падение',opacity:'Непрозрачность',copies:'Копий',strength:'Сила свечения'};
const amountNames:Record<string,string>={'elastic-wave':'Сила деформации','chromatic-split':'Разнос цвета, px','slice-glitch':'Сдвиг полос, px'};
export function parameterLabel(id:string,name:string){if(['3d-volume-light','3d-surface','3d-finish'].includes(id)){const names:Record<string,string>={density:'Плотность тумана',strength:'Яркость источника',angle:'Угол конуса, °',lightX:'Источник X',lightY:'Источник Y',lightZ:'Источник Z',palette:'Оттенок света',quality:'Качество 3D',occlusion:'Детали перекрывают свет',finish:'Поверхность',roughness:'Шероховатость',metalness:'Металличность',tint:'Оттенок материала',glow:'Свечение ярких участков',threshold:'Порог свечения',exposure:'Экспозиция',contrast:'Контраст',vignette:'Виньетка'};if(names[name])return names[name];}if(id==='3d-assembly-wave'){const labels:Record<string,string>={amount:'Разнесение деталей',stagger:'Задержка между деталями',mode:'Режим сборки',axis:'Направление разборки'};if(labels[name])return labels[name];}if(id==='3d-camera-orbit'&&name==='elevation')return 'Высота камеры';if(['contour-morph','contour-window','organic-reveal','noise-dissolve'].includes(id)){const labels:Record<string,string>={from:'Начальный контур',to:'Конечный контур',fromPath:'Начальный SVG-контур',toPath:'Конечный SVG-контур',direction:'Направление',easing:'Плавность',inverse:'Инвертировать маску',centerX:'Центр раскрытия X',centerY:'Центр раскрытия Y',detail:id==='noise-dissolve'?'Размерность шумового поля':'Неровность края',softness:'Мягкость растворения',seed:'Вариант маски'};if(labels[name])return labels[name];}if(id==='light-shafts'&&name==='strength')return 'Яркость лучей';if(['feedback-trail','feedback-smoke','comet-tails'].includes(id)){const names:Record<string,string>={retention:'Сохранение следа',driftX:'Поток X, px/с',driftY:'Поток Y, px/с',turbulence:'Завихрение',spread:'Размытие следа',glow:'Свечение следа',emission:'Плотность следа',seed:'Вариант вихрей',absorptionRate:'Накопление яркости',dischargeRate:'Скорость угасания'};if(names[name])return names[name];}const special:Record<string,string>={mix:'Сила обработки',speed:'Скорость потока',swirl:'Вихри',retention:'Сохранение чернил',palette:'Поворот палитры, °',seed:'Вариант потока',spacing:'Шаг следа, кадров',decay:'Затухание',lightX:'Источник света X',lightY:'Источник света Y',spread:'Протяжённость лучей',threshold:'Порог яркости'};if(special[name])return special[name];if(id==='assembly-spread'&&name==='amount')return 'Разнесение деталей';return(name==='amount'&&amountNames[id])||parameterNames[name]||name}
export function readEffectIds(text:string|null):string[]{try{const ids:unknown=JSON.parse(text??'[]');return Array.isArray(ids)?[...new Set(ids.filter((id):id is string=>typeof id==='string'&&REGISTRY.has(id)))]:[]}catch{return[]}}
