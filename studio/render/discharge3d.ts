import * as THREE from 'three';
import {BOLT_VERTEX,BOLT_FRAGMENT} from './lightning/shaders.ts';
import {dischargePulse,type Discharge3d} from '../effects/discharge3d.ts';

/** Storm Lance ribbons share the camera and depth buffer with the actual device. */
export function createDischarge3d(scene:THREE.Scene){
 const group=new THREE.Group();group.name='Transient discharge';scene.add(group);
 const geometry=new THREE.BufferGeometry(),positions:number[]=[],strand:number[]=[],indices:number[]=[];const count=4,steps=256;
 for(let j=0;j<count;j++)for(let i=0;i<=steps;i++){const n=positions.length/3;positions.push(i/steps,-1,0,i/steps,1,0);strand.push(j,j);if(i<steps)indices.push(n,n+1,n+2,n+1,n+3,n+2)}
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('aStrand',new THREE.Float32BufferAttribute(strand,1));geometry.setIndex(indices);
 const dummyDepth=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);dummyDepth.needsUpdate=true;
 const materials:THREE.ShaderMaterial[]=[];
 for(const glow of[true,false]){
  const uniforms:Record<string,THREE.IUniform>={};
  const values={uTime:.1,uSag:-.05,uSeed:2910,uRestrike:30,uProgress:1,uFade:0,uStrands:count,uSpread:.045,uSpreadNear:0,uSpreadCurve:1.6,uTwist:.3,uTwistSpeed:0,uBranchDim:.04,uJitter:.13,uJitterScale:1.7,uOctaves:4,uJitterFalloff:.43,uCrawl:.15,uPinch:.07,uConverge:1,uWidth:.012,uWidthTip:.55,uWidthCurve:1,uCoreWidth:1.8,uCoreSharp:3.4,uGlowFalloff:2.6,uWidthScale:glow?6:1,uPassOpacity:glow?.23:1,uSoftFade:0,uFlicker:.05,uFlickerSpeed:24,uStrandFlash:.13,uTipGlow:.4,uTipLength:.03,uOpacity:1,uGlow:1.8,uGlobalGlow:1,uCameraNear:.1,uCameraFar:100};
  for(const[k,value]of Object.entries(values))uniforms[k]={value};
  Object.assign(uniforms,{uOrigin:{value:new THREE.Vector3()},uTarget:{value:new THREE.Vector3()},uSide:{value:new THREE.Vector3(0,0,1)},uColorCore:{value:new THREE.Color(1,1,1)},uColorInner:{value:new THREE.Color(.7,.84,1)},uColorOuter:{value:new THREE.Color(.2,.31,1)},uColorHalo:{value:new THREE.Color(.025,.045,.18)},uResolution:{value:new THREE.Vector2(1920,1080)},uSceneDepth:{value:dummyDepth}});
  const m=new THREE.ShaderMaterial({vertexShader:BOLT_VERTEX,fragmentShader:BOLT_FRAGMENT,defines:glow?{BOLT_GLOW:''}:{},uniforms,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false});materials.push(m);
  const mesh=new THREE.Mesh(geometry,m);mesh.frustumCulled=false;mesh.renderOrder=glow?5:6;group.add(mesh);
 }
 const flash=new THREE.PointLight(0x9fcaff,0,9,2),hitLight=new THREE.PointLight(0x87aaff,0,6,2);group.add(flash,hitLight);
 const glowSize=64,pixels=new Uint8Array(glowSize*glowSize*4);for(let y=0;y<glowSize;y++)for(let x=0;x<glowSize;x++){const r=Math.hypot((x+.5)/glowSize*2-1,(y+.5)/glowSize*2-1),a=Math.max(0,1-r)*Math.exp(-r*r*5);pixels.set([255,255,255,Math.round(a*255)],(y*glowSize+x)*4)}const tex=new THREE.DataTexture(pixels,glowSize,glowSize);tex.needsUpdate=true;
 const tipMaterial=new THREE.SpriteMaterial({map:tex,color:0x91c8ff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),tip=new THREE.Sprite(tipMaterial);tip.scale.setScalar(.19);group.add(tip);
 const emberMaterial=new THREE.MeshBasicMaterial({map:tex,color:0xff6828,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false}),ember=new THREE.Mesh(new THREE.PlaneGeometry(1,1),emberMaterial);ember.rotation.x=-Math.PI/2;group.add(ember);
 const scorchMat=new THREE.MeshBasicMaterial({color:0x070505,transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3}),scorch=new THREE.Mesh(new THREE.CircleGeometry(.14,48),scorchMat);scorch.rotation.x=-Math.PI/2;scorch.scale.y=.65;group.add(scorch);
 return{update(spec:Discharge3d|undefined,origin:THREE.Vector3,floorY:number,w:number,h:number){
  group.visible=!!spec;if(!spec){flash.intensity=0;hitLight.intensity=0;return}
  const p=dischargePulse(spec.seconds,spec.impact),target=new THREE.Vector3(origin.x-spec.reach,floorY+.012,origin.z+.4);
  // Frame-derived shader time changes the channel on each 30fps frame and remains seekable.
  const shaderTime=(Math.floor(spec.seconds*30+1e-6)+.5)/30;
  for(const m of materials){const u=m.uniforms;u.uTime!.value=shaderTime;u.uOrigin!.value.copy(origin);u.uTarget!.value.copy(target);u.uSeed!.value=spec.seed;u.uFade!.value=p.channel*spec.strength;u.uProgress!.value=p.age<0?.3:1;u.uWidth!.value=.005+.004*p.main;u.uResolution!.value.set(w,h);}
  flash.position.copy(origin).lerp(target,.35);flash.position.z+=.3;hitLight.position.copy(target);hitLight.position.y+=.12;
  flash.intensity=spec.lightScene?spec.strength*(22*p.flash+.06*p.ember):0;hitLight.intensity=spec.lightScene?spec.strength*(8*p.flash+.04*p.ember):0;
  tip.position.copy(origin);tipMaterial.opacity=.03+p.leader*1.6+p.channel*.6;tip.scale.setScalar(.045+p.flash*.1);
  ember.position.copy(target);ember.position.y=floorY+.006;emberMaterial.opacity=Math.min(1,.8*p.flash+.3*p.ember);ember.scale.setScalar(.08+.08*p.flash);
  scorch.position.copy(target);scorch.position.y=floorY+.004;scorchMat.opacity=p.age<0?0:.16*(1-Math.exp(-p.age*5));
 },dispose(){scene.remove(group);geometry.dispose();materials.forEach(m=>m.dispose());dummyDepth.dispose();tex.dispose();tipMaterial.dispose();ember.geometry.dispose();emberMaterial.dispose();scorch.geometry.dispose();scorchMat.dispose();}};
}
