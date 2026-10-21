import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {inspectGltf} from '../domain/gltf.ts';
import {descriptors,partEdit,poseAt,camera3dAt,defaultCamera,type PartDescriptor} from '../domain/model3d.ts';
import type {Project,Scene3dNode} from '../domain/schema.ts';
import type {EffectDeltas} from '../effects/registry.ts';

const sourceBytes=new Map<string,Uint8Array>();
export function cacheModelBytes(hash:string,bytes:Uint8Array){sourceBytes.delete(hash);sourceBytes.set(hash,bytes);let size=[...sourceBytes.values()].reduce((a,b)=>a+b.byteLength,0);for(const [key,value]of sourceBytes){if(size<=32*1024*1024)break;sourceBytes.delete(key);size-=value.byteLength;}}
type Home={obj:THREE.Object3D;position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3;visible:boolean};
type Rig={root:THREE.Object3D;objects:Map<string,THREE.Object3D>;homes:Home[]};
export type PartProjection={id:string;name:string;x:number;y:number;width:number;height:number;center:[number,number,number];screenCenter:[number,number];radius:number;visible:boolean};
function rig(root:THREE.Object3D,objects:Map<string,THREE.Object3D>):Rig{const homes:Home[]=[];root.traverse(obj=>homes.push({obj,position:obj.position.clone(),quaternion:obj.quaternion.clone(),scale:obj.scale.clone(),visible:obj.visible}));return{root,objects,homes};}
const smooth=(p:number)=>{p=Math.max(0,Math.min(1,p));return p*p*(3-2*p)};
export function createModelRigs(scene:THREE.Scene,presets:Map<string,{root:THREE.Object3D;objects:Map<string,THREE.Object3D>}>){
 const rigs=new Map<string,Rig>([...presets].map(([key,r])=>[key,rig(r.root,r.objects)])),pending=new Map<string,Promise<void>>(),hashes=new Map<string,string>();let disposed=false;
 function get(node:Scene3dNode){return rigs.get(node.model?'asset:'+node.model.assetId:node.preset)}
 async function prepare(project:Project){const models=project.nodes.filter((n):n is Scene3dNode=>n.kind==='scene3d'&&!!n.model),wanted=new Set(models.map(n=>'asset:'+n.model!.assetId));for(const [key,r]of rigs)if(key.startsWith('asset:')&&!wanted.has(key)){scene.remove(r.root);disposeObject(r.root);rigs.delete(key);hashes.delete(key);}await Promise.all(models.map(async node=>{
  const key='asset:'+node.model!.assetId,asset=project.assets.find(a=>a.id===node.model!.assetId);if(!asset)throw Error('Ресурс модели отсутствует.');if(rigs.has(key)&&hashes.get(key)===asset.sha256)return;if(pending.has(key))return pending.get(key);const old=rigs.get(key);if(old){scene.remove(old.root);disposeObject(old.root);rigs.delete(key);}
  const promise=(async()=>{
   let bytes=sourceBytes.get(asset.sha256);if(!bytes){const res=await fetch(`/api/v1/projects/${project.id}/assets/${asset.id}`);if(!res.ok)throw Error('Не загружена модель: '+asset.title);bytes=new Uint8Array(await res.arrayBuffer());const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer))).map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==asset.sha256)throw Error('Контрольная сумма модели не совпала.');cacheModelBytes(asset.sha256,bytes);}
   const inspected=inspectGltf(bytes);if(JSON.stringify(inspected.parts)!==JSON.stringify(node.model!.parts))throw Error('Иерархия модели отличается от сохранённой.');
   const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('data:')&&!url.startsWith('blob:'))throw Error('Внешние ресурсы модели отключены.');return url;});
   const loaded=await new GLTFLoader(manager).parseAsync(bytes.slice().buffer,'');
   const root=new THREE.Group(),objects=new Map<string,THREE.Object3D>();loaded.scene.traverse(obj=>{const association=loaded.parser.associations.get(obj) as {nodes?:number}|undefined;if(association?.nodes!==undefined&&!objects.has('gltf-'+association.nodes))objects.set('gltf-'+association.nodes,obj);});
   for(const d of node.model!.parts)if(!objects.has(d.id))throw Error('Не распознана деталь '+d.name);
   loaded.scene.traverse(obj=>{if(obj instanceof THREE.Light||obj instanceof THREE.Camera)obj.visible=false;});
   root.add(loaded.scene);root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),extent=Math.max(size.x,size.y,size.z);if(!Number.isFinite(extent)||extent<1e-8||extent>1e8)throw Error('Модель имеет пустые или недопустимые размеры.');
   loaded.scene.position.sub(center);root.scale.setScalar(3/extent);root.updateMatrixWorld(true);
   if(disposed){disposeObject(root);return;}scene.add(root);root.visible=false;rigs.set(key,rig(root,objects));hashes.set(key,asset.sha256);
  })();pending.set(key,promise);try{await promise}finally{pending.delete(key)}
 }));}
 function reset(){for(const r of rigs.values())for(const h of r.homes){h.obj.position.copy(h.position);h.obj.quaternion.copy(h.quaternion);h.obj.scale.copy(h.scale);h.obj.visible=h.visible;}}
 function apply(node:Scene3dNode,frame:number,deltas:EffectDeltas,camera:THREE.PerspectiveCamera,seconds=frame/30){
  for(const [key,r]of rigs)if(key.startsWith('asset:'))r.root.visible=key==='asset:'+node.model?.assetId;
  const r=get(node);if(!r)return;const ds=descriptors(node);if(node.model)r.root.rotation.y=seconds*node.spin*Math.PI/180;else if(node.camera3d||node.camera3dKeys?.length)r.root.quaternion.copy(r.homes[0]!.quaternion);r.root.updateMatrixWorld(true);const center=new THREE.Box3().setFromObject(r.root).getCenter(new THREE.Vector3());
  const wave=deltas.assembly3d;
  const heightOrder=wave?[...ds].sort((a,b)=>{const ay=new THREE.Box3().setFromObject(r.objects.get(a.id)!).getCenter(new THREE.Vector3()).y,by=new THREE.Box3().setFromObject(r.objects.get(b.id)!).getCenter(new THREE.Vector3()).y;return by-ay||a.id.localeCompare(b.id)}):[];
  // Parent edits precede children. Offsets use scene units after model normalization.
  for(const [i,d]of ds.entries()){
   const obj=r.objects.get(d.id);if(!obj)continue;const edit=partEdit(node,d.id),pose=poseAt(edit,frame);obj.visible=edit.visible;
   if(!edit.visible)continue;
   let offset=new THREE.Vector3(...pose.position);
   if(wave){const rank=heightOrder.findIndex(p=>p.id===d.id)/Math.max(1,ds.length-1),delay=rank*wave.stagger,back=(1-rank)*wave.stagger,progress=smooth((wave.progress-delay)/(1-wave.stagger)),fallStart=.62+back*.3,level=wave.mode==='assemble'?1-smooth((wave.progress-back)/(1-wave.stagger)):wave.mode==='explode'?progress:smooth((wave.progress-delay*.5)/.28)*(1-smooth((wave.progress-fallStart)/(1-fallStart)));const v=new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()).sub(center);if(wave.axis==='vertical')v.set(0,.5+(1-rank)*2,0);else if(v.length()<.05)v.set(0,1,0);else v.normalize();if(!ds.some(x=>x.parentId===d.id))offset.addScaledVector(v,wave.amount*level);}
   obj.parent?.updateWorldMatrix(true,false);const inv=obj.parent?obj.parent.matrixWorld.clone().invert():new THREE.Matrix4(),origin=new THREE.Vector3().applyMatrix4(inv),local=offset.clone().applyMatrix4(inv).sub(origin);obj.position.add(local);
   obj.rotateX(pose.rotation[0]*Math.PI/180);obj.rotateY(pose.rotation[1]*Math.PI/180);obj.rotateZ(pose.rotation[2]*Math.PI/180);obj.scale.multiply(new THREE.Vector3(...pose.scale));obj.updateWorldMatrix(false,true);
  }
  const cam=camera3dAt(node,frame);if(cam){camera.position.set(...cam.position);camera.lookAt(new THREE.Vector3(...cam.target));camera.fov=cam.fov;}
  if(cam&&node.cameraTargetPart&&!deltas.orbit3d){const anchor=r.objects.get(node.cameraTargetPart);if(anchor){const box=new THREE.Box3().setFromObject(anchor);if(!box.isEmpty()){const at=box.getCenter(new THREE.Vector3()),delta=at.clone().sub(new THREE.Vector3(...cam.target));camera.position.add(delta);camera.lookAt(at);}}}
  const expanded=new THREE.Box3().setFromObject(r.root),expandedCenter=expanded.getCenter(new THREE.Vector3()),radius=expanded.getSize(new THREE.Vector3()).length()/2,halfFov=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*node.geometry.width/node.geometry.height)),fitDistance=radius/Math.sin(halfFov)*1.08;
  const automaticCamera=!node.camera3dKeys?.length&&!node.cameraTargetPart&&(!cam||JSON.stringify(cam)===JSON.stringify(defaultCamera()));
  if(wave&&automaticCamera&&!deltas.orbit3d){const level=wave.mode==='explode'?smooth(wave.progress):wave.mode==='assemble'?1-smooth(wave.progress):smooth(wave.progress/.28)*(1-smooth((wave.progress-.7)/.3)),target=new THREE.Vector3(...(cam?.target??[0,node.preset==='anatomy-device'?.3:0,0])),direction=camera.position.clone().sub(target),distance=direction.length(),at=target.clone().lerp(expandedCenter,level);camera.position.copy(direction.normalize().multiplyScalar(distance+(Math.max(distance,fitDistance)-distance)*level).add(at));camera.lookAt(at);}
  if(deltas.orbit3d){const o=deltas.orbit3d,a=o.angle*Math.PI/180,at=wave?expandedCenter:center,distance=wave?Math.max(o.distance,fitDistance):o.distance;camera.position.set(at.x+Math.sin(a)*distance,at.y+o.elevation,at.z+Math.cos(a)*distance);camera.lookAt(at);}
  camera.updateMatrixWorld();camera.updateProjectionMatrix();
 }
 function projection(node:Scene3dNode,id:string,camera:THREE.PerspectiveCamera,w:number,h:number):PartProjection|null{
  const r=get(node),obj=r?.objects.get(id);if(!obj)return null;let visible=true,p:THREE.Object3D|null=obj;while(p){visible&&=p.visible;p=p.parent;}const box=new THREE.Box3().setFromObject(obj);if(box.isEmpty())return null;const center=box.getCenter(new THREE.Vector3()),points=[];
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).project(camera));
  const xs=points.map(p=>(p.x+1)*w/2),ys=points.map(p=>(1-p.y)*h/2),at=center.clone().project(camera);return{id,name:partEdit(node,id).name,x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),center:center.toArray(),screenCenter:[(at.x+1)*w/2,(1-at.y)*h/2],radius:box.getSize(new THREE.Vector3()).length()/2,visible:visible&&at.z<1&&points.some(p=>p.z>-1)&&points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))};
 }
 function pick(node:Scene3dNode,hits:THREE.Intersection[]):string|null{const r=get(node);if(!r)return null;for(const hit of hits){let obj:THREE.Object3D|null=hit.object;let visible=true;for(let p:THREE.Object3D|null=obj;p;p=p.parent)visible&&=p.visible;if(!visible)continue;while(obj&&obj!==r.root){for(const [id,o]of r.objects)if(obj===o)return`${node.id}::${id}`;obj=obj.parent;}}return null;}
 return{prepare,reset,apply,projection,pick,getRoot:(node:Scene3dNode)=>get(node)?.root,dispose(){disposed=true;},};
}
export function disposeObject(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();root.traverse(obj=>{const m=obj as THREE.Mesh;if(m.geometry)geometries.add(m.geometry);for(const mat of m.material?(Array.isArray(m.material)?m.material:[m.material]):[]){materials.add(mat);for(const value of Object.values(mat))if(value instanceof THREE.Texture)textures.add(value)}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());}
