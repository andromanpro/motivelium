import type {Project,SceneNode} from '../studio/domain/schema.ts';
import {validateProject} from '../studio/domain/schema.ts';
import {SHADER_MAP,shaderParamErrors,type ShaderParams} from '../studio/effects/shaders/library.ts';

export const TRANSITION_NOTES:Record<string,string>={
 'gl-circlecrop':'Круг обрезает кадры; пространство вне круга окрашено bgcolor. При чёрном bgcolor в середине возможен чёрный провал.',
 'gl-circleopen':'Ирис открывает следующую сцену; подходит для раскрытия содержимого без заливки фона CircleCrop.',
 'gl-crosszoom':'Приближение с размазыванием между двумя сценами. Интенсивный переход, проверьте читаемость.',
 'gl-dreamyzoom':'Поворот, увеличение и светлая вспышка в середине. Для спокойного монтажа может быть слишком ярким.',
 'gl-fade':'Обычное плавное смешивание двух кадров.',
 'gl-directionalwipe':'Направленная граница открывает следующую сцену.',
};
export function transitionSample(shaderId:string,params:ShaderParams={},width=640):Project{
 const shader=SHADER_MAP.get(shaderId);if(shader?.kind!=='transition')throw Error('Неизвестный переход: '+shaderId);
 const errors=shaderParamErrors(shader,params);if(errors.length)throw Error(errors.join('; '));
 const height=Math.round(width*9/16),nodes:SceneNode[]=[];
 for(const[index,id]of ['sample-a','sample-b'].entries()){
  const transform={x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,pivotX:0,pivotY:0};
  const base={parentId:null,sequenceId:id,transform,geometry:{width,height},visible:true,locked:false};
  nodes.push({...base,id:id+'-bg',name:'Фон '+id,kind:'shape',shape:'rect',fill:index?'#f3b45b':'#183f73'});
  for(let i=0;i<5;i++)nodes.push({...base,id:id+'-shape-'+i,name:'Фигура',kind:'shape',shape:index?'ellipse':'rect',fill:index?'#14243a':'#66d8e4',geometry:{width:width*.16,height:height*.3},transform:{...transform,x:width*(.04+i*.2),y:height*.55}});
  nodes.push({...base,id:id+'-title',name:'Подпись сцены',kind:'text',text:index?'B / СЛЕДУЮЩАЯ':'A / ПРЕДЫДУЩАЯ',fontFamily:'Arial Black',fontSize:Math.round(width*.055),color:index?'#14243a':'#ffffff',align:'center',lineHeight:1.1,transform:{...transform,x:width*.05,y:height*.18},geometry:{width:width*.9,height:height*.22}});
 }
 const p:Project={schemaVersion:2,id:'transition-sample',revision:1,title:'Проба '+shader.name,size:{width,height},fps:{num:24,den:1},durationFrames:72,seed:20261022,assets:[],nodes,
  sequences:[{id:'sample-a',name:'A',fromFrame:0,toFrame:36},{id:'sample-b',name:'B',fromFrame:36,toFrame:72,transition:{shaderId,durationFrames:36,params}}],effects:[],cameraTracks:[],audioTracks:[],cues:[]};
 validateProject(p);return p;
}
