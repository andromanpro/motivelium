import type {Project} from './schema.ts';
import {validateProject} from './schema.ts';
import {validFps,type Fps} from './time.ts';

export type ProjectSetup={title:string;size:{width:number;height:number};fps:Fps;durationFrames:number};
export const DEFAULT_SETUP:ProjectSetup={title:'Новый проект',size:{width:1920,height:1080},fps:{num:30,den:1},durationFrames:600};
export class ProjectSetupError extends Error {
 code:'title'|'size'|'fps'|'duration';
 constructor(code:ProjectSetupError['code'],message:string){super(message);this.name='ProjectSetupError';this.code=code}
}
export function projectSetup(input:Record<string,unknown>):ProjectSetup{
 const title=typeof input.title==='string'?input.title.trim():input.locale==='en'?'New project':'Новый проект';if(!title||title.length>200)throw new ProjectSetupError('title','Название должно содержать от 1 до 200 символов.');
 const raw=(input.size??DEFAULT_SETUP.size)as{width:unknown;height:unknown};if(!raw||typeof raw!=='object')throw new ProjectSetupError('size','Проверьте размер кадра.');
 const width=Number(raw.width),height=Number(raw.height);if(typeof raw.width!=='number'||typeof raw.height!=='number'||![width,height].every(v=>Number.isInteger(v)&&v>=16&&v<=4096)||width*height>8_847_360)throw new ProjectSetupError('size','Размер кадра — от 16 до 4096 пикселей по стороне, до 8,8 Мп.');
 let fps:Fps;try{fps=validFps(input.fps??DEFAULT_SETUP.fps)}catch{throw new ProjectSetupError('fps','Проверьте частоту кадров.')}if(fps.num/fps.den>120)throw new ProjectSetupError('fps','Для этой версии частота — до 120 кадров/с.');
 const durationFrames=input.durationFrames??Math.round(20*fps.num/fps.den);if(typeof durationFrames!=='number'||!Number.isInteger(durationFrames)||durationFrames<1||durationFrames>36_000||durationFrames*fps.den/fps.num>300)throw new ProjectSetupError('duration','Длительность — до 5 минут и 36 000 кадров.');
 return{title,size:{width,height},fps,durationFrames};
}
export function blankProject(input:Record<string,unknown>,id:string,seed:number):Project{
 const setup=projectSetup(input),english=input.locale==='en',p:Project={schemaVersion:2,id,revision:1,...setup,seed,assets:[],sequences:[{id:'scene-main',name:english?'Scene 1':'Сцена 1',fromFrame:0,toFrame:setup.durationFrames}],nodes:[],effects:[],cameraTracks:[{id:'camera-main',name:english?'Main camera':'Основная камера',keys:[{frame:0,cx:setup.size.width/2,cy:setup.size.height/2,zoom:1,rotation:0}]}],audioTracks:[],cues:[]};validateProject(p);return p;
}
