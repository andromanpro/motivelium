import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
type Part={mesh:THREE.Object3D;home:THREE.Vector3;direction:THREE.Vector3;turn:THREE.Vector3};
export function createAnatomyDevice(){
 const group=new THREE.Group(),parts:Part[]=[],metal=new THREE.MeshStandardMaterial({color:0x263444,metalness:.94,roughness:.23}),gold=new THREE.MeshStandardMaterial({color:0xc59152,metalness:1,roughness:.2}),pcb=new THREE.MeshStandardMaterial({color:0x123d36,metalness:.55,roughness:.3}),white=new THREE.MeshPhysicalMaterial({color:0xb5d2cd,metalness:.8,roughness:.18,clearcoat:1}),core=new THREE.MeshStandardMaterial({color:0x90fff0,emissive:0x33ffe0,emissiveIntensity:2.4,metalness:.1,roughness:.18}),glass=new THREE.MeshPhysicalMaterial({color:0x8de9dc,metalness:.15,roughness:.1,transparent:true,opacity:.2,depthWrite:false,clearcoat:1});
 function part(mesh:THREE.Object3D,name:string,x:number,y:number,z:number,dx:number,dy:number,dz:number,rx=0,ry=0,rz=0){mesh.name=name;mesh.position.set(x,y,z);group.add(mesh);parts.push({mesh,home:mesh.position.clone(),direction:new THREE.Vector3(dx,dy,dz),turn:new THREE.Vector3(rx,ry,rz)});return mesh;}
 function box(w:number,h:number,d:number,mat:THREE.Material){const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(w,h,d)*.17),mat);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:mat===pcb?0x276f5d:0x55706c,transparent:true,opacity:.28}));mesh.add(edges);return mesh;}
 part(box(2.75,.18,1.95,metal),'base',0,-.55,0,0,-1.35,0);
 // Machined feet, separated screw heads and risers.
 for(const x of [-1.12,1.12])for(const z of [-.72,.72]){
  const foot=new THREE.Mesh(new THREE.CylinderGeometry(.12,.14,.22,16),metal);part(foot,'foot',x,-.74,z,x*.2,-1.45,z*.2);
  const screw=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.4,12),gold);part(screw,'fastener',x,.26,z,x*.3,1.7,z*.3);
  const slot=box(.09,.012,.017,metal);slot.position.y=.205;screw.add(slot);
 }
 const board=part(box(2.43,.065,1.65,pcb),'board',0,-.2,0,0,-.15,0) as THREE.Mesh;
 // Real geometry for copper traces and contact points on the printed board.
 for(let side of [-1,1])for(let i=0;i<11;i++){
  const trace=box(.022,.008,.42+(i%3)*.08,gold);trace.position.set(side*(.35+i*.07),.043,side*(.38+(i%2)*.08));board.add(trace);
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(.027,.027,.01,8),gold);pad.position.set(side*(.35+i*.07),.047,side*(.62+(i%3)*.08));board.add(pad);
 }
 part(box(.86,.13,.86,metal),'processor',0,-.04,0,0,.8,0,0,.16,0);
 const chip=part(box(.61,.055,.61,core),'core',0,.065,0,0,1.25,0);
 for(let i=0;i<9;i++){const line=box(.025,.01,.48,white);line.position.set(-.24+i*.06,.034,0);chip.add(line);}
 for(let side of [-1,1])for(let i=0;i<5;i++){const capacitor=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.18,16),white);part(capacitor,'capacitor',side*.83,-.06,-.5+i*.25,side*.8,.25,(-.5+i*.25)*.5);}
 for(let i=0;i<8;i++){const fin=part(box(1.1,.065,.9,white),'heatsink',0,.21+i*.085,0,0,1.7+i*.1,0,0,i*.015,0);for(let k=0;k<4;k++){const slit=box(.018,.007,.9,metal);slit.position.set(-.42+k*.28,.036,0);fin.add(slit);}}
 part(box(2.7,.055,1.9,glass),'cover',0,1.02,0,.25,3.05,.1,-.1,0,-.08);
 for(let i=0;i<6;i++){const socket=part(box(.25,.12,.32,metal),'port',-1.21,-.1,-.6+i*.24,-1.1,.08,(-.6+i*.24)*.35);const connector=box(.013,.05,.2,gold);connector.position.x=-.135;socket.add(connector);}
 const point=new THREE.PointLight(0x4effde,3,4);point.position.set(0,.2,0);group.add(point);
 return{group,update:(seconds:number,spread:number)=>{for(const p of parts){p.mesh.position.copy(p.home).addScaledVector(p.direction,spread);p.mesh.rotation.set(p.turn.x*spread,p.turn.y*spread,p.turn.z*spread);}point.position.y=.2+spread*1.3;point.intensity=3+Math.sin(seconds*.8)*.35;group.rotation.set(.15,Math.PI*.15+Math.sin(seconds*.22)*.16,0);},parts:parts.map(p=>p.mesh)};
}
