import type {Project,SceneNode,EffectInstance,Transform} from './schema.ts';
import {ENERGY_AUDIO_ID} from './energy.ts';
const tr=(v:Partial<Transform>={}):Transform=>({x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,pivotX:0,pivotY:0,...v});
/** A native editable specimen: four contrasting faces, glyph choreography and ink. */
export function buildLetterShow(meta:{sha256:string;bytes:number}):Project{
 const sequences=['Буквы вышли из себя','У каждого — характер','Краска внутри букв','Живой контур'].map((name,i)=>({id:'letters-'+i,name,fromFrame:i*160,toFrame:(i+1)*160,...(i?{transition:{shaderId:i===2?'gl-directionalwarp':'gl-dreamy',durationFrames:12,params:{}}}:{})}));
 const nodes:SceneNode[]=[],effects:EffectInstance[]=[];let s=sequences[0]!;
 const base=(id:string,x:number,y:number,w:number,h:number)=>({id,name:id,sequenceId:s.id,parentId:null,geometry:{width:w,height:h},transform:tr({x,y}),visible:true,locked:false});
 const text=(id:string,value:string,x:number,y:number,w:number,h:number,size:number,color:string,font='Unbounded',align:'left'|'center'|'right'='left')=>{nodes.push({...base(id,x,y,w,h),kind:'text',text:value,fontFamily:font,fontSize:size,fontWeight:font==='Unbounded'?700:400,color,lineHeight:1.12,align});return id};
 const rect=(id:string,x:number,y:number,w:number,h:number,color:string)=>{nodes.push({...base(id,x,y,w,h),kind:'shape',shape:'rect',fill:color});return id};
 const fx=(id:string,definitionId:string,params:EffectInstance['params'],from=s.fromFrame,to=s.toFrame)=>{effects.push({id:'fx-'+id+'-'+definitionId,definitionId,definitionVersion:1,targetId:id,fromFrame:from,toFrame:to,params,order:effects.length+1,enabled:true})};
 const glyph=(id:string,mode='wave',amplitude=40,rotation=9)=>fx(id,'glyph-motion',{mode,amplitude,rotation,cycles:1.5,stagger:.48});
 const label=(i:number,color:string)=>{text('folio-'+i,`M / TYPE STUDIES       0${i+1}`,112,76,1300,55,23,color,'Onest');text('brand-'+i,'motivelium.',1430,76,380,55,24,color,'Onest','right');};
 rect('bg-0',-600,-400,3120,1880,'#101c37');label(0,'#8295be');
 // An orbital field of tiny typographic details, behind the reading plane.
 for(let i=0;i<30;i++){const a=i/30*Math.PI*2,id=text('satellite-'+i,'АБВЁЖЗФЯ'[i%8]!,960+Math.cos(a)*810,535+Math.sin(a)*365,70,90,30+i%3*9,i%3?'#364879':'#ba83f1','Literata Italic');fx(id,'orbit-motion',{radiusX:18,radiusY:12,cycles:1,phase:i*12});fx(id,'float-drift',{height:12,angle:8,cycles:2})}
 text('quiet','Тише. Кажется, они ожили.',140,208,1600,110,59,'#ffe3d8','Literata Italic');
 text('hero','БУКВЫ',132,365,1680,235,218,'#dfff8f','Rubik Mono One','center');glyph('hero','wave',48,9);fx('hero','chromatic-split',{amount:9});
 text('hero-sub','вышли из себя.',190,705,1540,120,81,'#f2f0e7','Unbounded','center');glyph('hero-sub','assemble',48,22);
 rect('acid-rule',145,899,1630,3,'#a9d56c');
 text('caption-0','Каждый знак — со своей траекторией. Текст остаётся текстом.',145,948,1640,60,27,'#b3c4da','Onest');
 s=sequences[1]!;rect('bg-1',-600,-400,3120,1880,'#f4e7d1');label(1,'#93654c');
 const amp=text('ampersand','&',1280,120,650,830,480,'#e2bd9f','Literata Italic');nodes.at(-1)!.transform.rotation=12;fx(amp,'float-drift',{height:22,angle:4,cycles:1});
 text('editorial-small','ОДИН ТЕКСТ. ЧЕТЫРЕ НАЧЕРТАНИЯ.',140,235,1640,70,25,'#8d523f','Onest');
 text('character','Характер',130,372,1640,280,212,'#6c2536','Literata Italic');glyph('character','orbit',32,7);
 text('character-sub','не выбирают по умолчанию.',150,713,1550,120,52,'#332b32','Unbounded');fx('character-sub','mask-wipe',{span:.4});
 for(let i=0;i<8;i++){const id=text('specimen-'+i,'Aa Бб 0'+i,145+i*210,892,200,65,28,i%2?'#a65e45':'#6c2536',['Onest','Literata Italic','Rubik Mono One','Unbounded'][i%4]!);glyph(id,'wave',8,3)}
 s=sequences[2]!;rect('bg-2',-600,-400,3120,1880,'#091a22');label(2,'#7fa8aa');
 text('ink-label','КРАСКА — В БУКВАХ.',145,220,1600,70,32,'#8af8de','Onest');
 text('ink-title','НЕ PNG.',130,367,1660,270,236,'#9debd5','Unbounded','center');glyph('ink-title','wave',32,5);effects.find(e=>e.targetId==='ink-title'&&e.definitionId==='glyph-motion')!.params={mode:'wave',amplitude:32,rotation:5,cycles:1.5,stagger:.48,colorize:true,hue:145};fx('ink-title','fluid-ink',{speed:.8,swirl:1.8,retention:.985,palette:38,seed:504,mix:.42});fx('ink-title','echo-trail',{copies:2,distance:8,angle:70});
 text('ink-sub','Меняй шрифт. Двигай знаки. Крась светом.',145,799,1630,90,38,'#9ddacc','Onest','center');
 text('ink-detail','{ type: "editable", attitude: "alive" }',145,950,1630,60,26,'#658e93','Onest','center');
 s=sequences[3]!;rect('bg-3',-600,-400,3120,1880,'#28153b');label(3,'#bb9bcc');
 for(let i=0;i<22;i++){const id=text('confetti-'+i,'+×*:·'[i%5]!,140+(i*373)%1620,185+(i*193)%700,80,80,24+i%4*9,i%2?'#72517e':'#b68b93','Onest');fx(id,'float-drift',{height:18,angle:18,cycles:1.5})}
 text('contour-label','А ЕСЛИ ПОМЕНЯТЬ САМУ ФОРМУ?',145,220,1630,70,30,'#ddc6e9','Onest');
 text('contour-title','БУКВЫ',145,390,1630,280,230,'#fcdda9','Onest','center');fx('contour-title','letter-morph',{style:'puffy',fromText:'БУКВЫ',toText:'ЖИВЫЕ',bend:.18,stagger:.18,colorize:true,hue:5,span:.36});
 text('contour-sub','Всё это можно поправить руками.',145,774,1630,100,40,'#f7eadf','Literata Italic','center');
 text('contour-note','КОНТУРЫ ONEST / МОРФИНГ  •  НИ ОДНОЙ ЗАПЕЧЁННОЙ НАДПИСИ',145,950,1630,60,22,'#bb9bcc','Onest','center');
 return{schemaVersion:2,id:'motivelium-letter-show',revision:1,title:'Буквы вышли из себя — типографическая лаборатория',size:{width:1920,height:1080},fps:{num:30,den:1},durationFrames:640,seed:20261028,nodes,effects,sequences,
 assets:[{id:ENERGY_AUDIO_ID,path:'assets/razryad-180.wav',mime:'audio/wav',sha256:meta.sha256,bytes:meta.bytes,durationSeconds:640/30,origin:'generated',title:'Разряд · 180 BPM'}],audioTracks:[{id:'letters-score',kind:'music',assetId:ENERGY_AUDIO_ID,gain:.55,offsetSeconds:0,mute:false}],
 cues:sequences.map((v,i)=>({id:'letters-chapter-'+i,trackId:null,frame:v.fromFrame,kind:'mark',label:v.name})),
 cameraTracks:[{id:'letters-camera',name:'Крупность и проходы',keys:sequences.flatMap((v,i)=>[{frame:v.fromFrame,cx:960,cy:540,zoom:i===1?1.025:1,rotation:0},{frame:v.toFrame-1,cx:i===1?982:960,cy:530,zoom:1.035,rotation:i===2?-.5:0}])}]};
}
