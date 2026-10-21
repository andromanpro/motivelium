import {MULTIPASS_MAP,type MultiPassDefinition} from '../effects/multipass.ts';
import {StateReplay,FEEDBACK_HZ,feedbackTick} from './stateReplay.ts';

type Target={texture:WebGLTexture;framebuffer:WebGLFramebuffer;width:number;height:number};
type Pair={read:Target;write:Target;persistent:boolean};
type Program={program:WebGLProgram;uniforms:Map<string,{location:WebGLUniformLocation;type:number}>};
type Snapshot=Map<string,Uint8Array>;
export type FeedbackRequest={key:string;pipelineId:string;frame:number;fromFrame:number;fps:number;width:number;height:number;params:Record<string,number>;source:(frame:number,width:number,height:number)=>CanvasImageSource};
let runtime:ReturnType<typeof createRuntime>|null=null;
export function renderFeedback(request:FeedbackRequest):HTMLCanvasElement{if(!runtime||runtime.lost()){runtime?.dispose();runtime=createRuntime();}return runtime.render(request);}
export function disposeFeedbackRenderer(){runtime?.dispose();runtime=null;}
export function feedbackRendererStats(){return runtime?.stats()??{timelines:0,snapshotBytes:0,entries:[]};}

function glsl(d:MultiPassDefinition){
 const names=d.passes.flatMap(p=>p.target?[p.target]:[]),source=d.source.replace(/^\s*#version[^\n]*\n/gm,'').replace(/\bgl_FragColor\b/g,'motiveliumColor').replace(/\btexture2D\b/g,'texture');
 return `#version 300 es
precision highp float;precision highp int;in vec2 isf_FragNormCoord;out vec4 motiveliumColor;
uniform sampler2D inputImage;uniform vec2 RENDERSIZE;uniform float TIME;uniform float TIMEDELTA;uniform int FRAMEINDEX;uniform int PASSINDEX;
${names.map(n=>'uniform sampler2D '+n+';').join('\n')}
${Object.keys(d.inputs).map(n=>'uniform float '+n+';').join('\n')}
#define IMG_NORM_PIXEL(img,coord) texture(img,coord)
#define IMG_PIXEL(img,coord) texture(img,(coord)/vec2(textureSize(img,0)))
#define IMG_THIS_PIXEL(img) texture(img,isf_FragNormCoord)
#define IMG_THIS_NORM_PIXEL(img) texture(img,isf_FragNormCoord)
#define IMG_SIZE(img) vec2(textureSize(img,0))
${source}`;
}

function createRuntime(){
 const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('Для накопления изображения нужен WebGL 2.');
 const gpu=gl,programs=new Map<string,Program>(),buffer=gpu.createBuffer()!;
 gpu.bindBuffer(gpu.ARRAY_BUFFER,buffer);gpu.bufferData(gpu.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gpu.STATIC_DRAW);gpu.disable(gpu.BLEND);gpu.disable(gpu.DEPTH_TEST);
 const vertex='#version 300 es\nprecision highp float;in vec2 position;out vec2 isf_FragNormCoord;void main(){gl_Position=vec4(position,0.,1.);isf_FragNormCoord=position*.5+.5;}';
 function compile(type:number,text:string){const shader=gpu.createShader(type)!;gpu.shaderSource(shader,text);gpu.compileShader(shader);if(!gpu.getShaderParameter(shader,gpu.COMPILE_STATUS)){const error=gpu.getShaderInfoLog(shader);gpu.deleteShader(shader);throw Error(error??'Ошибка GLSL');}return shader;}
 function program(d:MultiPassDefinition):Program{const known=programs.get(d.id);if(known)return known;const vs=compile(gpu.VERTEX_SHADER,vertex),fs=compile(gpu.FRAGMENT_SHADER,glsl(d)),p=gpu.createProgram()!;gpu.attachShader(p,vs);gpu.attachShader(p,fs);gpu.linkProgram(p);gpu.deleteShader(vs);gpu.deleteShader(fs);if(!gpu.getProgramParameter(p,gpu.LINK_STATUS)){const error=gpu.getProgramInfoLog(p);gpu.deleteProgram(p);throw Error(error??'Ошибка link');}const uniforms:Program['uniforms']=new Map();for(let i=0;i<gpu.getProgramParameter(p,gpu.ACTIVE_UNIFORMS);i++){const u=gpu.getActiveUniform(p,i)!,location=gpu.getUniformLocation(p,u.name);if(location)uniforms.set(u.name,{location,type:u.type});}const result={program:p,uniforms};programs.set(d.id,result);return result;}
 function target(width:number,height:number):Target{const texture=gpu.createTexture()!,framebuffer=gpu.createFramebuffer()!;gpu.bindTexture(gpu.TEXTURE_2D,texture);gpu.texParameteri(gpu.TEXTURE_2D,gpu.TEXTURE_MIN_FILTER,gpu.LINEAR);gpu.texParameteri(gpu.TEXTURE_2D,gpu.TEXTURE_MAG_FILTER,gpu.LINEAR);gpu.texParameteri(gpu.TEXTURE_2D,gpu.TEXTURE_WRAP_S,gpu.CLAMP_TO_EDGE);gpu.texParameteri(gpu.TEXTURE_2D,gpu.TEXTURE_WRAP_T,gpu.CLAMP_TO_EDGE);gpu.texImage2D(gpu.TEXTURE_2D,0,gpu.RGBA8,width,height,0,gpu.RGBA,gpu.UNSIGNED_BYTE,null);gpu.bindFramebuffer(gpu.FRAMEBUFFER,framebuffer);gpu.framebufferTexture2D(gpu.FRAMEBUFFER,gpu.COLOR_ATTACHMENT0,gpu.TEXTURE_2D,texture,0);if(gpu.checkFramebufferStatus(gpu.FRAMEBUFFER)!==gpu.FRAMEBUFFER_COMPLETE){gpu.deleteFramebuffer(framebuffer);gpu.deleteTexture(texture);throw Error('Не удалось создать буфер feedback');}gpu.viewport(0,0,width,height);gpu.clearColor(0,0,0,0);gpu.clear(gpu.COLOR_BUFFER_BIT);return{texture,framebuffer,width,height};}
 function drop(t:Target){gpu.deleteFramebuffer(t.framebuffer);gpu.deleteTexture(t.texture);}
 function clear(t:Target){gpu.bindFramebuffer(gpu.FRAMEBUFFER,t.framebuffer);gpu.viewport(0,0,t.width,t.height);gpu.clearColor(0,0,0,0);gpu.clear(gpu.COLOR_BUFFER_BIT);}
 function read(t:Target){const pixels=new Uint8Array(t.width*t.height*4);gpu.bindFramebuffer(gpu.FRAMEBUFFER,t.framebuffer);gpu.readPixels(0,0,t.width,t.height,gpu.RGBA,gpu.UNSIGNED_BYTE,pixels);return pixels;}
 function restore(t:Target,pixels:Uint8Array){gpu.bindTexture(gpu.TEXTURE_2D,t.texture);gpu.pixelStorei(gpu.UNPACK_FLIP_Y_WEBGL,false);gpu.texSubImage2D(gpu.TEXTURE_2D,0,0,0,t.width,t.height,gpu.RGBA,gpu.UNSIGNED_BYTE,pixels);}
 function check(){const error=gpu.getError();if(error!==gpu.NO_ERROR)throw Error('Feedback WebGL error '+error);}
 type Timeline={replay:StateReplay<Snapshot>;pairs:Map<string,Pair>;output:Target;source:Target;request:FeedbackRequest;dispose:()=>void;snapshotSize:number};
 const timelines=new Map<string,Timeline>();
 function createTimeline(r:FeedbackRequest,d:MultiPassDefinition,w:number,h:number):Timeline{
  const pairs=new Map<string,Pair>();for(const pass of d.passes)if(pass.target){const width=Math.max(1,Math.round(w*(pass.scale??1))),height=Math.max(1,Math.round(h*(pass.scale??1)));pairs.set(pass.target,{read:target(width,height),write:target(width,height),persistent:!!pass.persistent});}
  const output=target(w,h),input=target(w,h),p=program(d),snapshotSize=w*h*4+[...pairs.values()].filter(p=>p.persistent).reduce((n,p)=>n+p.read.width*p.read.height*4,0);
  const timeline:Timeline={pairs,output,source:input,request:r,snapshotSize,replay:null!,dispose:()=>{for(const pair of pairs.values()){drop(pair.read);drop(pair.write);}drop(output);drop(input);}};
  const draw=(pass:number,destination:Target,tick:number)=>{
   gpu.bindFramebuffer(gpu.FRAMEBUFFER,destination.framebuffer);gpu.viewport(0,0,destination.width,destination.height);gpu.useProgram(p.program);gpu.bindBuffer(gpu.ARRAY_BUFFER,buffer);const pos=gpu.getAttribLocation(p.program,'position');gpu.enableVertexAttribArray(pos);gpu.vertexAttribPointer(pos,2,gpu.FLOAT,false,0,0);let unit=0;
   for(const[name,u]of p.uniforms){
    if(u.type===gpu.SAMPLER_2D){const texture=name==='inputImage'?input.texture:pairs.get(name)?.read.texture;if(!texture||texture===destination.texture)throw Error('Недопустимая обратная связь '+name);gpu.activeTexture(gpu.TEXTURE0+unit);gpu.bindTexture(gpu.TEXTURE_2D,texture);gpu.uniform1i(u.location,unit++);continue;}
    if(name==='RENDERSIZE')gpu.uniform2f(u.location,destination.width,destination.height);
    else if(name==='PASSINDEX')gpu.uniform1i(u.location,pass);
    else if(name==='FRAMEINDEX')gpu.uniform1i(u.location,tick);
    else gpu.uniform1f(u.location,name==='TIME'?tick/FEEDBACK_HZ:name==='TIMEDELTA'?1/FEEDBACK_HZ:timeline.request.params[name]??d.inputs[name]??0);
   }gpu.drawArrays(gpu.TRIANGLES,0,3);check();
  };
  const copy=(from:Target,to:Target)=>{gpu.bindFramebuffer(gpu.READ_FRAMEBUFFER,from.framebuffer);gpu.bindFramebuffer(gpu.DRAW_FRAMEBUFFER,to.framebuffer);gpu.blitFramebuffer(0,0,from.width,from.height,0,0,to.width,to.height,gpu.COLOR_BUFFER_BIT,gpu.NEAREST);};
  timeline.replay=new StateReplay<Snapshot>({
   reset:()=>{for(const pair of pairs.values()){clear(pair.read);clear(pair.write);}clear(output);},
   step:tick=>{
    const current=timeline.request,frame=current.fromFrame+Math.floor(tick*current.fps/FEEDBACK_HZ+1e-7),image=current.source(frame,w,h);
    gpu.activeTexture(gpu.TEXTURE0);gpu.bindTexture(gpu.TEXTURE_2D,input.texture);gpu.pixelStorei(gpu.UNPACK_FLIP_Y_WEBGL,true);gpu.pixelStorei(gpu.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gpu.texImage2D(gpu.TEXTURE_2D,0,gpu.RGBA,gpu.RGBA,gpu.UNSIGNED_BYTE,image as TexImageSource);gpu.pixelStorei(gpu.UNPACK_FLIP_Y_WEBGL,false);
    for(const pair of pairs.values())if(!pair.persistent){clear(pair.read);clear(pair.write);}
    for(const [i,pass]of d.passes.entries()){if(pass.target){const pair=pairs.get(pass.target)!;draw(i,pair.write,tick);[pair.read,pair.write]=[pair.write,pair.read];}else draw(i,output,tick);}
    const last=d.passes.at(-1)!;if(last.target)copy(pairs.get(last.target)!.read,output);check();
   },
   capture:()=>{const snapshot:Snapshot=new Map([['$output',read(output)]]);for(const[name,pair]of pairs)if(pair.persistent)snapshot.set(name,read(pair.read));check();return snapshot;},
   restore:snapshot=>{for(const[name,pair]of pairs){clear(pair.write);if(pair.persistent)restore(pair.read,snapshot.get(name)!);else clear(pair.read);}restore(output,snapshot.get('$output')!);check();},
  });return timeline;
 }
 function render(r:FeedbackRequest){
  const d=MULTIPASS_MAP.get(r.pipelineId);if(!d)throw Error('Неподдерживаемый multipass: '+r.pipelineId);
  if(!Number.isFinite(r.width)||!Number.isFinite(r.height)||r.width<=0||r.height<=0)throw Error('Неверный размер feedback');
  const k=Math.min(1,640/r.width,400/r.height),w=Math.max(1,Math.round(r.width*k)),h=Math.max(1,Math.round(r.height*k)),tick=feedbackTick(r.frame,r.fromFrame,r.fps);
  const key=JSON.stringify([r.key,r.pipelineId,d.version,w,h,r.fromFrame,r.fps,r.params]);let timeline=timelines.get(key);
  if(timeline){timelines.delete(key);timelines.set(key,timeline);timeline.request=r;}else{timeline=createTimeline(r,d,w,h);timelines.set(key,timeline);while(timelines.size>6){const first=timelines.keys().next().value!;timelines.get(first)!.dispose();timelines.delete(first);}}
  try{timeline.replay.at(tick);while(timelines.size>1&&[...timelines.values()].reduce((n,t)=>n+t.snapshotSize*t.replay.stats().snapshots,0)>48*1024*1024){const first=[...timelines.keys()].find(k=>k!==key)!;timelines.get(first)!.dispose();timelines.delete(first);}if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gpu.bindFramebuffer(gpu.READ_FRAMEBUFFER,timeline.output.framebuffer);gpu.bindFramebuffer(gpu.DRAW_FRAMEBUFFER,null);gpu.blitFramebuffer(0,0,w,h,0,0,w,h,gpu.COLOR_BUFFER_BIT,gpu.NEAREST);check();return canvas;}
  catch(error){timeline.dispose();timelines.delete(key);throw error;}
 }
 return{render,lost:()=>gpu.isContextLost(),stats:()=>({timelines:timelines.size,snapshotBytes:[...timelines.values()].reduce((n,t)=>n+t.snapshotSize*t.replay.stats().snapshots,0),entries:[...timelines.values()].map(t=>t.replay.stats())}),dispose:()=>{for(const t of timelines.values())t.dispose();timelines.clear();for(const p of programs.values())gpu.deleteProgram(p.program);gpu.deleteBuffer(buffer);gpu.getExtension('WEBGL_lose_context')?.loseContext();canvas.width=canvas.height=1;}};
}
