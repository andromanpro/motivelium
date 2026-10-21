import type {ShaderDefinition} from '../effects/shaders/library.ts';
// Project-owned image-space scattering. The source alpha is the emission mask;
// 64 radial samples approximate shafts, not physically traced 3D fog.
export const LIGHT_SHAFTS:ShaderDefinition={id:'motivelium-light-shafts',name:'Световые лучи',kind:'filter',family:'Motivelium',license:'MIT',sourceUrl:'studio/render/builtinShaders.ts',format:'raw',inputs:[],source:`
uniform sampler2D sourceImage;uniform vec2 resolution;uniform float lightX;uniform float lightY;uniform float strength;uniform float spread;uniform float decay;uniform float threshold;
varying vec2 vUv;
void main(){vec2 pos=vUv;vec2 delta=(pos-vec2(lightX,1.-lightY))*spread/64.;vec3 rays=vec3(0.);float illumination=1.;
 for(int i=0;i<64;i++){pos-=delta;vec4 c=texture2D(sourceImage,clamp(pos,vec2(0.),vec2(1.)));float lum=max(max(c.r,c.g),c.b);float inside=step(0.,pos.x)*step(pos.x,1.)*step(0.,pos.y)*step(pos.y,1.);rays+=c.rgb*c.a*smoothstep(threshold,threshold+.25,lum)*illumination*inside;illumination*=decay;}
 vec4 original=texture2D(sourceImage,vUv);float edge=smoothstep(0.,.035,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y)));vec3 glow=(1.-exp(-rays*strength/64.))*edge;float a=max(original.a,clamp(max(max(glow.r,glow.g),glow.b),0.,1.));gl_FragColor=vec4(original.rgb*original.a+glow*(1.-original.a*.75),a);if(a>.001)gl_FragColor.rgb/=a;
}`};
export const INK_SURFACE:ShaderDefinition={id:'motivelium-ink-surface',name:'Фактура чернил',kind:'filter',family:'Motivelium',license:'MIT',sourceUrl:'studio/render/builtinShaders.ts',format:'raw',inputs:[],source:`
uniform sampler2D sourceImage;uniform vec2 resolution;uniform float u_time;varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.1)*.15;}
void main(){vec2 uv=vUv;float t=u_time;vec2 warp=vec2(fbm(uv*12.+vec2(t*.04,0.)),fbm(uv*13.+vec2(5.,-t*.03)))-.5;
 vec3 c=texture2D(sourceImage,clamp(uv+warp*.012,vec2(0.),vec2(1.))).rgb;float strand=sin(uv.y*280.+fbm(uv*19.+warp*2.)*28.+t*.45);float density=max(max(c.r,c.g),c.b);c*=.92+.08*strand;c+=vec3(.68,.9,1.)*pow(max(0.,strand),24.)*.1*density;
 gl_FragColor=vec4(c,1.);
}`};
export const DISSOLVE_MASK:ShaderDefinition={id:'motivelium-dissolve-mask',name:'Шумовая маска',kind:'filter',family:'Motivelium',license:'MIT',sourceUrl:'studio/render/builtinShaders.ts',format:'raw',inputs:[],source:`
uniform sampler2D sourceImage;uniform float revealProgress;uniform float detail;uniform float seed;uniform float softness;uniform float invert;varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+seed*.71)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
void main(){vec4 c=texture2D(sourceImage,vUv);float field=noise(vUv*detail)*.73+noise(vUv*detail*2.03)*.27;float alpha=smoothstep(field-softness,field+softness,revealProgress);if(invert>.5)alpha=1.-alpha;gl_FragColor=vec4(c.rgb,c.a*alpha);}
`};
export const BUILTIN_SHADERS=new Map([[LIGHT_SHAFTS.id,LIGHT_SHAFTS],[INK_SURFACE.id,INK_SURFACE],[DISSOLVE_MASK.id,DISSOLVE_MASK]]);
