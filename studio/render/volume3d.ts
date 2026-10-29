import * as THREE from 'three';
import {quality3d,beautySize3d,bloomSize3d,samples3d,type Volume3d,type Surface3d,type Grade3d,type RenderStats3d} from '../effects/lighting3d.ts';

const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const scatter=`
varying vec2 vUv;uniform sampler2D depthMap,shadowMap;
uniform mat4 invProjection,worldCamera,lightMatrix;uniform vec3 eye,lightPos,lightDir,lightColor;
uniform float density,strength,coneCos,occlusion;
uniform int steps;
#include <packing>
float hash(vec2 p){uvec2 q=uvec2(p);uint n=q.x*1664525u+q.y*1013904223u;n^=n>>16;n*=2246822519u;n^=n>>13;return float(n&65535u)/65535.;}
float shadow(vec3 p){if(occlusion<.5)return 1.;vec4 q=lightMatrix*vec4(p,1.);vec3 uv=q.xyz/q.w*.5+.5;if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return 0.;float d=unpackRGBAToDepth(texture2D(shadowMap,uv.xy));return uv.z<=d+.0025?1.:.04;}
void main(){
 float depth=texture2D(depthMap,vUv).r;
 vec4 view=invProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);vec3 end=(worldCamera*vec4(view.xyz/view.w,1.)).xyz;
 vec3 ray=normalize(end-eye);float distance=min(length(end-eye),18.);float stride=distance/float(steps),transmit=1.;vec3 scatterColor=vec3(0.);float fogAlpha=0.;
 float jitter=hash(gl_FragCoord.xy);
 for(int i=0;i<56;i++){if(i>=steps)break;vec3 p=eye+ray*(float(i)+jitter)*stride;
  // Bounded medium: no rectangular haze over the entire 2D composition.
  float medium=(1.-smoothstep(4.,6.,length(p-vec3(0.,.5,0.))))*density;
  float extinction=exp(-medium*stride),weight=transmit*(1.-extinction);
  vec3 l=p-lightPos;float dist=length(l),cone=smoothstep(coneCos,min(.9999,coneCos+.09),dot(normalize(l),lightDir));
  float illumination=cone*shadow(p)*strength*4./(1.+dist*dist*.18);
  scatterColor+=weight*(vec3(.12,.16,.19)+lightColor*illumination);fogAlpha+=weight*.23;transmit*=extinction;
 }
 float edge=smoothstep(0.,.12,vUv.x)*smoothstep(0.,.12,1.-vUv.x)*smoothstep(0.,.12,vUv.y)*smoothstep(0.,.12,1.-vUv.y);
 gl_FragColor=vec4(scatterColor*edge,1.-(1.-transmit)*edge);
}
`;
const composite=`
varying vec2 vUv;uniform sampler2D beauty,volumeMap,glowMap;
uniform float glow,contrast,vignette;uniform bool hasVolume;
void main(){
 vec4 base=texture2D(beauty,vUv),fog=hasVolume?texture2D(volumeMap,vUv):vec4(0.,0.,0.,1.);
 float edge=smoothstep(0.,.12,vUv.x)*smoothstep(0.,.12,1.-vUv.x)*smoothstep(0.,.12,vUv.y)*smoothstep(0.,.12,1.-vUv.y);
 vec3 scatterColor=fog.rgb,bloom=vec3(0.);float transmit=fog.a,fogAlpha=(1.-transmit)*.23;
 if(glow>0.)bloom=texture2D(glowMap,vUv).rgb*glow*edge;
 vec3 rgb=base.rgb*transmit+scatterColor+bloom;
 float alpha=clamp(base.a+fogAlpha+dot(scatterColor,vec3(.2126,.7152,.0722))*.32+max(max(bloom.r,bloom.g),bloom.b)*.12,0.,1.);
 rgb=mix(vec3(.18)*alpha,rgb,contrast);rgb*=1.-vignette*smoothstep(.18,.75,length(vUv-.5));
 // Render-target blending and MSAA resolve produce premultiplied radiance.
 // Tone-map straight color, then premultiply once for the transparent canvas.
 gl_FragColor=vec4(max(rgb,vec3(0.))/max(alpha,.00001),alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 gl_FragColor.rgb*=gl_FragColor.a;
}
`;
// Prefilter the footprint before reducing resolution. Sparse taps directly in the
// full-resolution beauty image repeat narrow highlights as little rectangles.
const bright=`varying vec2 vUv;uniform sampler2D image;uniform vec2 footprint;uniform float threshold;void main(){vec3 sum=vec3(0.);for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 s=texture2D(image,vUv+vec2(float(x),float(y))*footprint).rgb;float l=max(max(s.r,s.g),s.b);sum+=s*smoothstep(threshold,threshold+.35,l);}gl_FragColor=vec4(sum/9.,1.);}`;
const blur=`varying vec2 vUv;uniform sampler2D image;uniform vec2 direction;void main(){vec3 sum=vec3(0.);float a=0.;for(int i=-4;i<=4;i++){float w=exp(-float(i*i)/7.);sum+=texture2D(image,vUv+float(i)*direction).rgb*w;a+=w;}gl_FragColor=vec4(sum/a,1.);}`;

/** Single-scattering volume. No temporal buffers: every pass is overwritten on each call. */
export function createVolume3d(renderer:THREE.WebGLRenderer,scene:THREE.Scene){
 const hdr=renderer.extensions.has('EXT_color_buffer_float'),type=hdr?THREE.HalfFloatType:THREE.UnsignedByteType;
 // Three r180 requires WebGL2, including multisample renderbuffer queries.
 const gl=renderer.getContext() as WebGL2RenderingContext,supported=gl.getInternalformatParameter(gl.RENDERBUFFER,hdr?gl.RGBA16F:gl.RGBA8,gl.SAMPLES) as Int32Array;
 const samples=samples3d(Array.from(supported??[])),maxSide=Math.min(4096,renderer.capabilities.maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
 const beauty=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:true,samples});beauty.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
 const fogTarget=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
 const shadowTarget=new THREE.WebGLRenderTarget(256,256,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
 const glowA=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false}),glowB=glowA.clone();
 const depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});depthMaterial.blending=THREE.NoBlending;
 const lightCamera=new THREE.PerspectiveCamera(64,1,.1,30),lightMatrix=new THREE.Matrix4();
 const spot=new THREE.SpotLight(0x90d8ff,0,20,Math.PI/5,.35,2);spot.visible=false;spot.target.position.set(0,.3,0);scene.add(spot,spot.target);
 const uniforms={beauty:{value:beauty.texture},depthMap:{value:beauty.depthTexture},shadowMap:{value:shadowTarget.texture},glowMap:{value:glowB.texture},invProjection:{value:new THREE.Matrix4()},worldCamera:{value:new THREE.Matrix4()},lightMatrix:{value:lightMatrix},eye:{value:new THREE.Vector3()},lightPos:{value:new THREE.Vector3()},lightDir:{value:new THREE.Vector3()},lightColor:{value:new THREE.Color()},density:{value:0},strength:{value:0},coneCos:{value:.8},occlusion:{value:0},glow:{value:0},threshold:{value:.85},contrast:{value:1},vignette:{value:0},steps:{value:32}};
 const scatterMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:scatter,uniforms,depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.NoBlending});
 const compositeUniforms={beauty:{value:beauty.texture},volumeMap:{value:fogTarget.texture},glowMap:{value:glowA.texture},hasVolume:{value:false},glow:{value:0},contrast:{value:1},vignette:{value:0}};
 const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:composite,uniforms:compositeUniforms,depthTest:false,depthWrite:false,toneMapped:true,blending:THREE.NoBlending});
 const brightMat=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:bright,uniforms:{image:{value:beauty.texture},footprint:{value:new THREE.Vector2()},threshold:{value:.85}},depthTest:false,depthWrite:false,toneMapped:false});
 const blurMat=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:blur,uniforms:{image:{value:glowA.texture},direction:{value:new THREE.Vector2()}},depthTest:false,depthWrite:false,toneMapped:false});
 const screen=new THREE.Scene(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material),screenCamera=new THREE.Camera();screen.add(quad);
 const originals=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>(),surfaces=new Map<THREE.Material,THREE.MeshPhysicalMaterial>();
 function reset(){spot.visible=false;for(const [mesh,m] of originals)mesh.material=m;originals.clear()}
 function surface(root:THREE.Object3D,p:Surface3d){root.traverse(obj=>{const mesh=obj as THREE.Mesh;if(!mesh.isMesh)return;const original=mesh.material;originals.set(mesh,original);const change=(m:THREE.Material)=>{if(!(m instanceof THREE.MeshStandardMaterial))return m;let result=surfaces.get(m);if(!result){result=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(result,m);Object.assign(result,{defines:{STANDARD:'',PHYSICAL:''}});surfaces.set(m,result)}
   result.roughness=p.roughness;result.metalness=p.finish==='ceramic'?Math.min(.18,p.metalness):p.metalness;result.clearcoat=p.finish==='titanium'?.25:.85;result.clearcoatRoughness=.14;result.iridescence=p.finish==='pearl'?.85:0;result.iridescenceIOR=1.35;result.color.copy(m.color).lerp(new THREE.Color(p.finish==='titanium'?'#b8cadb':p.finish==='ceramic'?'#e6e1d2':'#b9c4f4'),p.tint);return result;};mesh.material=Array.isArray(original)?original.map(change):change(original);})}
 function render(camera:THREE.PerspectiveCamera,w:number,h:number,volume?:Volume3d,grade?:Grade3d):RenderStats3d{
  const start=performance.now(),q=quality3d(volume?.quality??'balanced',w,h),full=beautySize3d(w,h,maxSide),savedTarget=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha(),override=scene.overrideMaterial,exposure=renderer.toneMappingExposure;
  const v=volume??{density:0,strength:0,angle:32,lightX:-3,lightY:5,lightZ:3,palette:'cool',quality:'balanced',occlusion:false};
  const g=grade??{glow:0,threshold:.85,exposure:1.05,contrast:1,vignette:0};
  const color=new THREE.Color(v.palette==='warm'?'#ffd6a0':v.palette==='violet'?'#c1a1ff':'#a6e5ff');
  spot.visible=v.strength>0;spot.color.copy(color);spot.intensity=v.strength*14;spot.position.set(v.lightX,v.lightY,v.lightZ);spot.angle=THREE.MathUtils.degToRad(v.angle);spot.updateMatrixWorld();
  let passes=1;const hidden:THREE.Object3D[]=[];
  try{
   if(renderer.domElement.width!==full.width||renderer.domElement.height!==full.height)renderer.setSize(full.width,full.height,false);
   if(beauty.width!==full.width||beauty.height!==full.height)beauty.setSize(full.width,full.height);
   if(fogTarget.width!==q.width||fogTarget.height!==q.height)fogTarget.setSize(q.width,q.height);
   const bloom=bloomSize3d(full.width,full.height);if(glowA.width!==bloom.width||glowA.height!==bloom.height){glowA.setSize(bloom.width,bloom.height);glowB.setSize(bloom.width,bloom.height)}
   lightCamera.fov=Math.min(130,v.angle*2);lightCamera.position.copy(spot.position);lightCamera.lookAt(spot.target.position);lightCamera.updateProjectionMatrix();lightCamera.updateMatrixWorld();lightMatrix.multiplyMatrices(lightCamera.projectionMatrix,lightCamera.matrixWorldInverse);
   if(v.occlusion&&v.strength>0){if(shadowTarget.width!==q.shadow)shadowTarget.setSize(q.shadow,q.shadow);scene.traverse(o=>{const m=o as THREE.Mesh;if(o.visible&&((o as THREE.Line).isLine||(o as THREE.Points).isPoints||m.isMesh&&(Array.isArray(m.material)?m.material:[m.material]).every(x=>x.transparent&&x.opacity<.5))){hidden.push(o);o.visible=false}});scene.overrideMaterial=depthMaterial;renderer.setRenderTarget(shadowTarget);renderer.setClearColor(0xffffff,1);renderer.clear();renderer.render(scene,lightCamera);for(const o of hidden)o.visible=true;hidden.length=0;scene.overrideMaterial=override;passes++}
   renderer.setRenderTarget(beauty);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);
   if(g.glow>0){quad.material=brightMat;brightMat.uniforms.threshold!.value=g.threshold;brightMat.uniforms.footprint!.value.set(.33/glowA.width,.33/glowA.height);renderer.setRenderTarget(glowA);renderer.render(screen,screenCamera);quad.material=blurMat;blurMat.uniforms.image!.value=glowA.texture;blurMat.uniforms.direction!.value.set(1/glowA.width,0);renderer.setRenderTarget(glowB);renderer.render(screen,screenCamera);blurMat.uniforms.image!.value=glowB.texture;blurMat.uniforms.direction!.value.set(0,1/glowA.height);renderer.setRenderTarget(glowA);renderer.render(screen,screenCamera);passes+=3}
   uniforms.invProjection.value.copy(camera.projectionMatrixInverse);uniforms.worldCamera.value.copy(camera.matrixWorld);uniforms.eye.value.copy(camera.position);uniforms.lightPos.value.copy(spot.position);uniforms.lightDir.value.subVectors(spot.target.position,spot.position).normalize();uniforms.lightColor.value.copy(color);
   uniforms.density.value=v.density;uniforms.strength.value=v.strength;uniforms.coneCos.value=Math.cos(spot.angle);uniforms.occlusion.value=v.occlusion?1:0;uniforms.glow.value=g.glow;uniforms.contrast.value=g.contrast;uniforms.vignette.value=g.vignette;uniforms.steps.value=q.steps;
   const hasVolume=v.density>0;
   if(hasVolume){quad.material=scatterMaterial;renderer.setRenderTarget(fogTarget);renderer.clear();renderer.render(screen,screenCamera);passes++;}
   compositeUniforms.hasVolume.value=hasVolume;compositeUniforms.glow.value=g.glow;compositeUniforms.contrast.value=g.contrast;compositeUniforms.vignette.value=g.vignette;
   quad.material=material;renderer.toneMappingExposure=g.exposure;renderer.setRenderTarget(savedTarget);renderer.setClearColor(0,0);renderer.clear();renderer.render(screen,screenCamera);passes++;
   return{quality:q.name,width:full.width,height:full.height,volumeWidth:hasVolume?q.width:0,volumeHeight:hasVolume?q.height:0,samples,beautyLimited:full.limited,steps:hasVolume?q.steps:0,passes,cpuMs:performance.now()-start,hdr,occlusion:v.occlusion&&v.strength>0};
  }finally{scene.overrideMaterial=override;for(const o of hidden)o.visible=true;renderer.setRenderTarget(savedTarget);renderer.setClearColor(clear,clearAlpha);renderer.toneMappingExposure=exposure}
 }
 function prune(){const alive=new Set<THREE.Material>();scene.traverse(o=>{const m=(o as THREE.Mesh).material;if(m)for(const v of Array.isArray(m)?m:[m])alive.add(v)});for(const [original,replacement]of surfaces)if(!alive.has(original)){replacement.dispose();surfaces.delete(original)}}
 return{reset,surface,render,prune,dispose(){reset();scene.remove(spot,spot.target);for(const m of surfaces.values())m.dispose();surfaces.clear();beauty.depthTexture?.dispose();beauty.dispose();fogTarget.dispose();shadowTarget.dispose();glowA.dispose();glowB.dispose();depthMaterial.dispose();scatterMaterial.dispose();material.dispose();brightMat.dispose();blurMat.dispose();quad.geometry.dispose();spot.dispose()}};
}
