/** Local allowlist only. Project/AI data never provide executable GLSL. */
import {COMET_SOURCE} from './cometSource.ts';
export type Pass={target?:string;persistent?:boolean;scale?:number};
export type MultiPassDefinition={id:string;version:number;name:string;credit:string;sourceUrl:string;source:string;inputs:Record<string,number>;passes:Pass[]};
export function validatePassDefinition(d:MultiPassDefinition):void{
 if(d.passes.length<1||d.passes.length>8)throw Error('Допустимо 1–8 проходов');
 const names=new Set<string>();for(const [i,p]of d.passes.entries()){
  if(!p.target&&(p.persistent||i!==d.passes.length-1))throw Error('Выходной проход должен быть последним');
  if(p.target&&(!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(p.target)||names.has(p.target)||['inputImage','TIME','RENDERSIZE','PASSINDEX'].includes(p.target)))throw Error('Неверная или повторная цель прохода');
  if(p.target)names.add(p.target);if(p.scale!==undefined&&(!Number.isFinite(p.scale)||p.scale<.125||p.scale>1))throw Error('Неверный масштаб прохода');
 }
}
const source=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
vec4 sampleSafe(sampler2D image,vec2 uv){if(min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y))<0.)return vec4(0.);return texture(image,uv);}
void main(){vec2 uv=isf_FragNormCoord;
 if(PASSINDEX==0){
  vec2 drift=vec2(driftX,-driftY)*TIMEDELTA/RENDERSIZE;float n=noise(uv*8.+vec2(TIME*.23,seed));
  vec2 flow=vec2(sin(uv.y*11.+n*6.+TIME*.25),cos(uv.x*9.-n*5.-TIME*.17))*turbulence*TIMEDELTA*.04;
  vec4 stale=sampleSafe(history,uv-drift-flow);vec4 fresh=texture(inputImage,uv);fresh.a*=emission;fresh.rgb*=fresh.a;
  vec4 accumulated=stale*retention;gl_FragColor=fresh+accumulated*(1.-fresh.a);gl_FragColor=clamp(gl_FragColor,0.,1.);
 }else if(PASSINDEX==1||PASSINDEX==2){
  vec2 direction=PASSINDEX==1?vec2(spread,0.):vec2(0.,spread);direction/=RENDERSIZE;
  vec4 c=vec4(0.);for(int i=-4;i<=4;i++){float weight=exp(-float(i*i)*.28);c+= (PASSINDEX==1?sampleSafe(history,uv+direction*float(i)):sampleSafe(blurX,uv+direction*float(i)))*weight;}gl_FragColor=c/3.344;
 }else{vec4 crisp=texture(history,uv),soft=texture(blurY,uv);float halo=clamp(soft.a*glow,0.,1.);vec3 rgb=crisp.rgb+soft.rgb*glow*(1.-crisp.a);float alpha=clamp(crisp.a+halo*(1.-crisp.a),0.,1.);rgb=min(rgb,vec3(alpha));gl_FragColor=vec4(alpha>.0001?rgb/alpha:vec3(0.),alpha);}
}`;
const base={version:1,credit:'Motivelium · собственные шейдеры',sourceUrl:'studio/effects/multipass.ts',source,inputs:{retention:.96,driftX:0,driftY:-24,turbulence:.15,spread:1.2,glow:1.15,emission:.65,seed:415},passes:[{target:'history',persistent:true},{target:'blurX'},{target:'blurY'},{}]} satisfies Omit<MultiPassDefinition,'id'|'name'>;
export const FEEDBACK_PIPELINES:MultiPassDefinition[]=[
 {...base,id:'feedback-light',name:'Световая память'},
 {...base,id:'feedback-smoke',name:'Дымное растекание',inputs:{...base.inputs,retention:.982,turbulence:1.8,spread:1.7,glow:.65,emission:.18}},
 {id:'vidvox-comet-tails',version:1,name:'Кометный след',credit:'VIDVOX · MIT · адаптация Motivelium',sourceUrl:'https://github.com/Vidvox/ISF-Files/blob/395072d48b3ce7351ccb20a5fda54470591324df/ISF/Comet%20Tails.fs',source:COMET_SOURCE,inputs:{absorptionRate:.5,dischargeRate:.08},passes:[{target:'feedbackBuffer',persistent:true}]},
];
export const MULTIPASS_MAP=new Map<string,MultiPassDefinition>(FEEDBACK_PIPELINES.map(d=>[d.id,d]));
export function registerBuiltinPipeline(d:MultiPassDefinition){validatePassDefinition(d);if(MULTIPASS_MAP.has(d.id))throw Error('Повтор pipeline');MULTIPASS_MAP.set(d.id,d);}
FEEDBACK_PIPELINES.forEach(validatePassDefinition);
