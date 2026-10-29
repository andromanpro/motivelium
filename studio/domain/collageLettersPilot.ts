import type{ExampleLanguage}from'./exampleLanguage.ts';
import type{Project,SceneNode,TextNode,Transform}from'./schema.ts';
import{filmTransform}from'./demoFilm.ts';

// Existing contour windows hold their cuts during flight. At rest, each letter
// hands over to an identical whole glyph, hidden until all fragments have landed.
export const LETTER_CUTS=[
 'M0 0L100 0L50 51Z',
 'M100 0L100 100L49 50Z',
 'M100 100L0 100L50 49Z',
 'M0 100L0 0L51 50Z',
];
export function buildCollageLettersPilot(language:ExampleLanguage='ru'):Project{
 const p:Project={schemaVersion:2,id:'motivelium-collage-letters-pilot',revision:1,title:'Дай идее ход · сборка букв · проба 4,5 с',size:{width:1920,height:1080},fps:{num:30,den:1},durationFrames:135,seed:291029,assets:[],nodes:[],effects:[],sequences:[{id:'letter-assembly',name:'Фрагменты → буквы → надпись',fromFrame:0,toFrame:135}],cameraTracks:[],audioTracks:[],cues:[{id:'pieces',frame:0,kind:'mark',trackId:null,label:'Разрозненные фрагменты'},{id:'attract',frame:30,kind:'mark',trackId:null,label:'Притяжение'},{id:'assemble',frame:75,kind:'mark',trackId:null,label:'Сборка'},{id:'settle',frame:105,kind:'mark',trackId:null,label:'Надпись собрана'}]};
 const base=(id:string,name:string,w:number,h:number,parentId:string|null=null)=>({id,name,sequenceId:'letter-assembly',parentId,geometry:{width:w,height:h},transform:filmTransform(),visible:true,locked:false});
 p.nodes.push({...base('paper','Тёплая бумага',1920,1080),kind:'shape',shape:'rect',fill:'#f1eadb'},
  {...base('warm-field','Тёплое поле',930,930),kind:'shape',shape:'ellipse',fill:'#f5cf5f',transform:filmTransform({x:1320,y:-535,opacity:.18})},
  {...base('cool-field','Холодное поле',1120,820),kind:'shape',shape:'ellipse',fill:'#c0d4ca',transform:filmTransform({x:-780,y:660,opacity:.36})},
  {...base('word-group','СОБЕРИ / СВОЁ',1920,1080),kind:'group'});
 const topAdv:Record<string,number>={'M':850,'A':690,'K':670,'E':610,' ':300,'I':290,'T':650,'С':710,'О':761,'Б':654,'Е':610,'Р':625,'И':732};let ordinal=0;
 for(const [row,text,font,size,y,tracking]of[[0,language==='en'?'MAKE IT':'СОБЕРИ','Onest',158,292,16],[1,language==='en'?'YOURS':'СВОЁ','Rubik Mono One',240,492,20]]as const){
  const width=[...text].reduce((s,c)=>s+(row===0?topAdv[c]!*size/1000:850*size/1000),0)+tracking*(text.length-1);let cursor=(1920-width)/2;
  for(const [index,ch]of [...text].entries()){
   const advance=row===0?topAdv[ch]!*size/1000:850*size/1000;if(ch===' '){cursor+=advance+tracking;continue}const w=advance+6,h=size*1.24,letterId=`letter-${row}-${index}`;p.nodes.push({...base(letterId,ch,w,h,'word-group'),kind:'group',transform:filmTransform({x:cursor,y})});
   for(let part=0;part<4;part++){
    const id=`${letterId}-part-${part}`,j=ordinal*4+part,startX=240+(j*337%1440),startY=300+(j*181%480),dx=startX-w/2-cursor,dy=startY-h/2-y,angle=((j*83)%131)-65,begin=12+(ordinal*7+part*4)%27,arrival=70+ordinal*2+part*3,side=j%2?1:-1;
    const pose=(x=0,y=0,rotation=0,scale=1):Transform=>filmTransform({x,y,rotation,scaleX:scale,scaleY:scale,pivotX:w/2,pivotY:h/2});
    const node:TextNode={...base(id,`${ch} · фрагмент ${part+1}`,w,h,letterId),kind:'text',text:ch,fontFamily:font,fontSize:size,fontWeight:row===0?700:400,color:row===0?'#182b2a':['#ff6248','#3158e9','#182b2a','#3158e9'][index%4]!,align:'left',lineHeight:1,transform:pose(),transformKeys:[
     {frame:0,easing:'smooth',transform:pose(dx,dy,angle,.96)},
     {frame:begin,easing:'smooth',transform:pose(dx+side*14,dy-9,angle+side*3,.96)},
     {frame:Math.round((begin+arrival)/2),easing:'smooth',transform:pose(dx*.43-side*45,dy*.43-45,angle*.4,.99)},
     {frame:arrival-4,easing:'smooth',transform:pose(-side*3,3,-side*.8,1.008)},
     {frame:arrival,easing:'smooth',transform:pose()},
     {frame:104,easing:'hold',transform:pose()},
     {frame:105,easing:'hold',transform:{...pose(),opacity:0}},
     {frame:134,easing:'hold',transform:{...pose(),opacity:0}},
    ]};p.nodes.push(node);
    p.effects.push({id:`cut-${row}-${index}-${part}`,definitionId:'contour-window',definitionVersion:1,targetId:id,fromFrame:0,toFrame:135,order:1,enabled:true,params:{from:'custom',to:'custom',fromPath:LETTER_CUTS[part]!,toPath:LETTER_CUTS[part]!,delay:.95,span:1,direction:'reverse',easing:'linear',inverse:false}});
   }
   p.nodes.push({...base(`${letterId}-settled`,`${ch} · собранная буква`,w,h,letterId),kind:'text',text:ch,fontFamily:font,fontSize:size,fontWeight:row===0?700:400,color:row===0?'#182b2a':['#ff6248','#3158e9','#182b2a','#3158e9'][index%4]!,align:'left',lineHeight:1,transform:filmTransform({opacity:0}),transformKeys:[{frame:0,easing:'hold',transform:filmTransform({opacity:0})},{frame:104,easing:'hold',transform:filmTransform({opacity:0})},{frame:105,easing:'hold',transform:filmTransform()},{frame:134,easing:'hold',transform:filmTransform()}]});
   cursor+=advance+tracking;ordinal++;
  }
 }
 return p;
}
