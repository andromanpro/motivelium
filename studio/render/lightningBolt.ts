import * as THREE from 'three';
import {BOLT_VERTEX,BOLT_FRAGMENT} from './lightning/shaders.ts';
import type {ArcSpec} from '../effects/electricArc.ts';

// Transparent deterministic adapter for the pinned MIT Storm Lance ribbon shaders.
// The original scene-depth fade is disabled: this is a composited effect layer.
let layer:ReturnType<typeof createLightning>|undefined;
export function drawLightningBolt(ctx:CanvasRenderingContext2D,s:ArcSpec,w:number,h:number){
 if(s.power<=0)return;layer??=createLightning();const canvas=layer.frame(s,w,h);
 ctx.save();ctx.globalCompositeOperation='screen';ctx.drawImage(canvas,0,0,w,h);ctx.restore();
}
export function disposeLightningBolt(){layer?.dispose();layer=undefined;}
function createLightning(){
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.toneMapping=THREE.NoToneMapping;
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-5,5,3,-3,.1,100);camera.position.z=10;
 const depth=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);depth.needsUpdate=true;
 let geometry:THREE.BufferGeometry|undefined;const materials:THREE.ShaderMaterial[]=[],meshes:THREE.Mesh[]=[];let strands=0;
 for(const glow of [true,false]){
  const u:Record<string,THREE.IUniform>={};
  const values={uTime:0,uSag:0,uSeed:73,uRestrike:13,uProgress:1,uFade:1,uStrands:7,uSpread:.035,uSpreadNear:0,uSpreadCurve:1.6,uTwist:.3,uTwistSpeed:.1,uBranchDim:.5,uJitter:.24,uJitterScale:2.1,uOctaves:5,uJitterFalloff:.46,uCrawl:1.1,uPinch:.16,uConverge:1,uWidth:.018,uWidthTip:.55,uWidthCurve:1,uCoreWidth:1.8,uCoreSharp:3.4,uGlowFalloff:2.2,uWidthScale:glow?10:1,uPassOpacity:glow?.24:1,uSoftFade:0,uFlicker:.15,uFlickerSpeed:27,uStrandFlash:.27,uTipGlow:1.5,uTipLength:.035,uOpacity:1,uGlow:1.3,uGlobalGlow:1,uCameraNear:.1,uCameraFar:100};
  for(const [key,value]of Object.entries(values))u[key]={value};
  Object.assign(u,{uOrigin:{value:new THREE.Vector3()},uTarget:{value:new THREE.Vector3()},uSide:{value:new THREE.Vector3(0,1,0)},uColorCore:{value:new THREE.Color(1,1,1)},uColorInner:{value:new THREE.Color(.78,.92,1)},uColorOuter:{value:new THREE.Color(.12,.42,1)},uColorHalo:{value:new THREE.Color(.015,.07,.22)},uResolution:{value:new THREE.Vector2()},uSceneDepth:{value:depth}});
  const m=new THREE.ShaderMaterial({vertexShader:BOLT_VERTEX,fragmentShader:BOLT_FRAGMENT,defines:glow?{BOLT_GLOW:''}:{},uniforms:u,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false});materials.push(m);
  const mesh=new THREE.Mesh(new THREE.BufferGeometry(),m);mesh.frustumCulled=false;mesh.renderOrder=meshes.length;meshes.push(mesh);scene.add(mesh);
 }
 function build(count:number){
  geometry?.dispose();geometry=new THREE.BufferGeometry();const steps=256,positions:number[]=[],ids:number[]=[],indices:number[]=[];
  for(let j=0;j<count;j++)for(let i=0;i<=steps;i++){
   const n=positions.length/3;positions.push(i/steps,-1,0,i/steps,1,0);ids.push(j,j);
   if(i<steps)indices.push(n,n+1,n+2,n+1,n+3,n+2);
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('aStrand',new THREE.Float32BufferAttribute(ids,1));geometry.setIndex(indices);
  for(const mesh of meshes){if(mesh.geometry!==geometry&&mesh.geometry!==undefined&&strands===0)mesh.geometry.dispose();mesh.geometry=geometry;}strands=count;
 }
 return{frame(s:ArcSpec,w:number,h:number){
  const width=Math.max(1,Math.min(2048,Math.round(w))),height=Math.max(1,Math.min(2048,Math.round(h))),aspect=h/w,halfH=5*aspect,count=Math.max(1,Math.min(11,Math.round(s.branches)+1));
  if(strands!==count)build(count);renderer.setSize(width,height,false);camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();
  const rise=Math.min(1,s.progress/.018),fade=Math.min(1,(1-s.progress)/.045);
  for(const m of materials){const u=m.uniforms;
   u.uTime!.value=s.seconds*s.speed;u.uSeed!.value=s.seed;u.uStrands!.value=count;u.uOrigin!.value.set((s.startX-.5)*10,(.5-s.startY)*10*aspect,0);u.uTarget!.value.set((s.endX-.5)*10,(.5-s.endY)*10*aspect,0);
   u.uProgress!.value=rise;u.uFade!.value=Math.max(0,fade)*s.power;u.uWidth!.value=s.width*10/w;u.uJitter!.value=.07+s.roughness*.28;u.uResolution!.value.set(width,height);
   if(s.palette==='violet'){u.uColorInner!.value.setRGB(.88,.75,1);u.uColorOuter!.value.setRGB(.45,.12,1);u.uColorHalo!.value.setRGB(.08,.01,.2)}
   else if(s.palette==='amber'){u.uColorInner!.value.setRGB(1,.86,.6);u.uColorOuter!.value.setRGB(1,.29,.04);u.uColorHalo!.value.setRGB(.2,.025,0)}
   else{u.uColorInner!.value.setRGB(.78,.92,1);u.uColorOuter!.value.setRGB(.12,.42,1);u.uColorHalo!.value.setRGB(.015,.07,.22)}
  }
  renderer.render(scene,camera);return renderer.domElement;
 },dispose(){geometry?.dispose();materials.forEach(m=>m.dispose());depth.dispose();renderer.dispose();renderer.forceContextLoss();}};
}
