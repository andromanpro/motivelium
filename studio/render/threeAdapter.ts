// Адаптер Three.js для scene3d-узлов. Один управляемый рендерер на рабочую сцену.
// Кадр вычисляется по frame (повороты/разнесение — функции времени), никаких
// накоплений dt: обратный seek даёт тот же кадр. raycast возвращает partId,
// который сцена маппит на тот же nodeId, что виден в дереве проекта.

import * as THREE from 'three';
import {createAnatomyDevice} from './anatomyDevice.ts';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { FrameItem, FrameState } from './evaluate.ts';
import type { ThreeLayerRenderer } from './renderFrame.ts';
import type { Project, Scene3dNode } from '../domain/schema.ts';
import {createModelRigs,disposeObject} from './modelRig.ts';
import {descriptors,partEdit} from '../domain/model3d.ts';
import {createVolume3d} from './volume3d.ts';
import type {RenderStats3d} from '../effects/lighting3d.ts';

export type ThreeAdapter = {
  layer: ThreeLayerRenderer;
  dispose: () => void;
  /** Части 3D-узла как выбираемые объекты: id узла + часть. */
  partIds: (nodeId: string) => string[];
};

const PART_NAMES = ['gear-a', 'gear-b', 'gear-c', 'axle'] as const;

export function createThreeAdapter(project: Project): ThreeAdapter {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 1.6, 6.2);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff2d8, 1.15);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6ea8ff, 0.35);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  // Studio reflections for curved glass/metal; generated locally, no HDR download.
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .04);
  room.dispose();pmrem.dispose();
  scene.environment = environment.texture;
  scene.add(new THREE.HemisphereLight(0xe8ffda,0x142a23,1.2));

  // Механизм: три шестерни на стойке. Геометрия детерминирована, без случайности.
  const gearGroup = new THREE.Group();
  const gearMatA = new THREE.MeshStandardMaterial({ color: 0x4f7bd9, metalness: 0.35, roughness: 0.45 });
  const gearMatB = new THREE.MeshStandardMaterial({ color: 0xe2b93b, metalness: 0.35, roughness: 0.45 });
  const gearMatC = new THREE.MeshStandardMaterial({ color: 0x9aa7b8, metalness: 0.5, roughness: 0.35 });
  const gears: Array<{ mesh: THREE.Group; radius: number; phase: number; dir: number; base: THREE.Vector3 }> = [];

  function makeGear(radius: number, thickness: number, teeth: number, material: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, 48), material);
    disk.rotation.x = Math.PI / 2;
    g.add(disk);
    const toothGeo = new THREE.BoxGeometry(radius * 0.16, radius * 0.34, thickness * 1.02);
    for (let i = 0; i < teeth; i++) {
      const tooth = new THREE.Mesh(toothGeo, material);
      const a = (i / teeth) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
      tooth.rotation.z = a;
      g.add(tooth);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.12, radius * 0.12, thickness * 2.4, 24), gearMatC);
    axle.rotation.x = Math.PI / 2;
    g.add(axle);
    return g;
  }

  const layout: Array<{ x: number; y: number; radius: number; teeth: number; mat: THREE.Material; phase: number; dir: number }> = [
    { x: -1.25, y: 0.1, radius: 1.05, teeth: 14, mat: gearMatA, phase: 0, dir: 1 },
    { x: 0.95, y: 0.62, radius: 0.72, teeth: 10, mat: gearMatB, phase: 0.31, dir: -1 },
    { x: 0.62, y: -1.05, radius: 0.5, teeth: 8, mat: gearMatC, phase: 0.79, dir: 1 },
  ];
  for (const l of layout) {
    const g = makeGear(l.radius, 0.16, l.teeth, l.mat);
    g.position.set(l.x, l.y, 0);
    gearGroup.add(g);
    gears.push({ mesh: g, radius: l.radius, phase: l.phase, dir: l.dir, base: g.position.clone() });
  }
  // Стойка: вертикальная пластина за шестернями.
  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.2, 0.08), new THREE.MeshStandardMaterial({ color: 0x232a33, metalness: 0.2, roughness: 0.7 }));
  backPlate.position.set(0, 0, -0.28);
  gearGroup.add(backPlate);
  scene.add(gearGroup);

  // The existing logo-monolith contract now has its own live sculpture preset.
  const sculpture = new THREE.Group();
  const jadeMaterial = new THREE.MeshPhysicalMaterial({color:0x68aa7a,metalness:.55,roughness:.24,clearcoat:.7,clearcoatRoughness:.18});
  const copperMaterial = new THREE.MeshStandardMaterial({color:0xe09a64,metalness:.95,roughness:.18});
  const core = new THREE.Mesh(new THREE.TorusKnotGeometry(.92,.26,144,24,2,3),jadeMaterial);
  sculpture.add(core);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.7,.025,10,160),copperMaterial);
  halo.rotation.x=.75;halo.rotation.y=.3;sculpture.add(halo);
  const halo2 = new THREE.Mesh(new THREE.TorusGeometry(1.92,.012,8,160),new THREE.MeshStandardMaterial({color:0xc3d6c2,metalness:.75,roughness:.28}));
  halo2.rotation.x=-.65;halo2.rotation.y=.7;sculpture.add(halo2);
  const satellite = new THREE.Mesh(new THREE.SphereGeometry(.16,28,20),new THREE.MeshStandardMaterial({color:0xe56f4b,roughness:.3,metalness:.2}));
  sculpture.add(satellite);
  scene.add(sculpture);

  const reactor=new THREE.Group();
  const coreGeometry=new THREE.IcosahedronGeometry(1.05,1);
  const reactorCore=new THREE.Mesh(coreGeometry,new THREE.MeshPhysicalMaterial({color:0x7c4edd,metalness:.92,roughness:.16,clearcoat:1,emissive:0x25134a,emissiveIntensity:.4}));
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(coreGeometry),new THREE.LineBasicMaterial({color:0x8cfbff,transparent:true,opacity:.75}));
  reactorCore.add(edges);reactor.add(reactorCore);
  const shards:THREE.Mesh[]=[];
  for(let i=0;i<36;i++){
    const m=new THREE.Mesh(new THREE.OctahedronGeometry(.09+(i%3)*.025),new THREE.MeshStandardMaterial({color:[0x76fff0,0xe94bff,0xffb257][i%3],metalness:.75,roughness:.23,emissive:[0x174d49,0x4b164d,0x4d3217][i%3],emissiveIntensity:.5}));
    shards.push(m);reactor.add(m);
  }
  const reactorHalo=new THREE.Mesh(new THREE.TorusGeometry(1.7,.018,8,160),new THREE.MeshBasicMaterial({color:0x87fff3}));
  reactorHalo.rotation.x=.9;reactor.add(reactorHalo);scene.add(reactor);

  const tunnel=new THREE.Group(),tunnelRings:THREE.Mesh[]=[];
  for(let i=0;i<24;i++){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(2.75,.035,8,80),new THREE.MeshBasicMaterial({color:[0x69fff1,0xc256ff,0xff775c][i%3]}));
    tunnelRings.push(ring);tunnel.add(ring);
  }
  const starGeometry=new THREE.BufferGeometry(),starPositions=new Float32Array(180*3);
  const fract=(x:number)=>x-Math.floor(x);
  for(let i=0;i<180;i++){starPositions[i*3]=(fract(Math.sin(i*12.9898+1)*43758.5453)-.5)*18;starPositions[i*3+1]=(fract(Math.sin(i*7.912+5)*27239.213)-.5)*18;starPositions[i*3+2]=-fract(Math.sin(i*13.141+8)*32768.17)*45}
  starGeometry.setAttribute('position',new THREE.BufferAttribute(starPositions,3));
  const stars=new THREE.Points(starGeometry,new THREE.PointsMaterial({color:0x9bdfff,size:.022,transparent:true,opacity:.85}));tunnel.add(stars);scene.add(tunnel);

  const device=createAnatomyDevice();scene.add(device.group);
  const controls=createModelRigs(scene,new Map([
    ['anatomy-device',{root:device.group,objects:new Map(descriptors({preset:'anatomy-device'}).map((d,i)=>[d.id,device.parts[i]!]))}],
    ['gear-cluster',{root:gearGroup,objects:new Map<string,THREE.Object3D>([['gear-a',gears[0]!.mesh],['gear-b',gears[1]!.mesh],['gear-c',gears[2]!.mesh],['axle',backPlate]])}],
    ['logo-monolith',{root:sculpture,objects:new Map<string,THREE.Object3D>([['core',core],['halo',halo],['satellite',satellite]])}],
    ['neon-reactor',{root:reactor,objects:new Map<string,THREE.Object3D>([['core',reactorCore],...shards.map((s,i)=>['shard-'+(i+1),s] as [string,THREE.Object3D])])}],
    ['ribbon-tunnel',{root:tunnel,objects:new Map([['tunnel',tunnel]])}],
  ]));
  const volume=createVolume3d(renderer,scene),renderStats=new Map<string,RenderStats3d>();
  const labelCanvas=document.createElement('canvas');
  const raycaster = new THREE.Raycaster();
  const pointers = new Map<string, THREE.Vector2>();
  for (const node of project.nodes) {
    if (node.kind !== 'scene3d') continue;
    for (const part of PART_NAMES) pointers.set(`${node.id}::${part}`, new THREE.Vector2());
  }

  const fps = project.fps.num / project.fps.den;

  function stateFor(item: FrameItem): Scene3dNode & { kind: 'scene3d' } {
    return item.node as Scene3dNode & { kind: 'scene3d' };
  }

  const layer: ThreeLayerRenderer = {
    prepare:async(p)=>{volume.reset();await controls.prepare(p);volume.prune();},
    render(item, state: FrameState) {
      volume.reset();controls.reset();camera.fov=38;
      const node = stateFor(item);
      const t = state.frame / fps;
      const isSculpture = node.preset === 'logo-monolith';
      const isReactor=node.preset==='neon-reactor',isTunnel=node.preset==='ribbon-tunnel',isDevice=node.preset==='anatomy-device';
      const expansion=item.deltas.assembly3d?0:Math.min(1,node.explode+(item.deltas.assembly??0));device.group.visible=isDevice;device.update(t,expansion);device.group.rotation.y+=t*node.spin*Math.PI/180*.13;
      gearGroup.visible = node.preset==='gear-cluster';sculpture.visible = isSculpture;reactor.visible=isReactor;tunnel.visible=isTunnel;
      camera.position.set(isDevice?3.5+expansion*1.4:0,isDevice?3+expansion*2.1:isTunnel?.1:1.6,isDevice?5.2+expansion*4.2:6.2);camera.lookAt(0,isDevice?.3+expansion*.85:0,isTunnel?-20:0);
      const turn = t * node.spin * Math.PI / 180;
      reactor.rotation.set(turn*.22,turn*.4,Math.sin(t*.4)*.2);
      reactorCore.rotation.set(turn*.35,turn*.24,turn*.18);
      for(let i=0;i<shards.length;i++){
        const a=i*2.3999632297+turn*.2,y=1-2*(i+.5)/shards.length,r=Math.sqrt(1-y*y),spread=1.8+expansion*.85+Math.sin(t*.9+i*.4)*.06;
        shards[i]!.position.set(Math.cos(a)*r*spread,y*spread,Math.sin(a)*r*spread);shards[i]!.rotation.set(turn+i,turn*.8,turn*.3);
      }
      reactorHalo.rotation.z=turn*.18;
      for(let i=0;i<tunnelRings.length;i++){const ring=tunnelRings[i]!;ring.position.z=((i*2+t*Math.abs(node.spin)/9)%48)-44;ring.rotation.z=i*.21+turn*.06;ring.rotation.x=Math.sin(t*.45+i*.17)*.08;ring.scale.setScalar(1+expansion*.15)}
      stars.rotation.z=turn*.03;
      sculpture.rotation.set(.22+Math.sin(t*.65)*.13,turn*.5,-.14);
      core.rotation.set(turn*.17,turn*.12,turn*.14);
      const spread = 1 + expansion*.25;
      halo.scale.setScalar(spread);halo2.scale.setScalar(spread);
      halo.rotation.z = turn*.14;
      satellite.position.set(Math.cos(turn)*1.72*spread,Math.sin(turn)*1.72*spread,.42);
      const spinRad = (node.spin * Math.PI) / 180;
      // Согласованное зацепление: линейная скорость на ободе одинакова.
      for (const g of gears) {
        g.mesh.rotation.z = g.dir * (t * spinRad + g.phase) * (1.05 / g.radius);
        const ex = expansion * 0.9;
        g.mesh.position.set(
          g.base.x + Math.sign(g.base.x || 1) * ex * 0.7,
          g.base.y + ex * 0.55,
          g.base.z + ex * 0.6,
        );
      }
      gearGroup.rotation.y = Math.sin(t * 0.35) * 0.28;
      controls.apply(node,state.frame,item.deltas,camera,t);
      if(item.deltas.surface3d){const root=controls.getRoot(node)??(isDevice?device.group:isSculpture?sculpture:isReactor?reactor:isTunnel?tunnel:gearGroup);volume.surface(root,item.deltas.surface3d);}
      const w = Math.max(64, Math.round(item.bounds.width));
      const h = Math.max(64, Math.round(item.bounds.height));

      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const atmosphere=item.deltas.volume3d,grade=item.deltas.grade3d,hasVolume=atmosphere&&(atmosphere.density>0||atmosphere.strength>0),hasGrade=grade&&(grade.glow>0||grade.exposure!==1.05||grade.contrast!==1||grade.vignette>0);
      if(hasVolume||hasGrade)renderStats.set(node.id,volume.render(camera,w,h,item.deltas.volume3d,item.deltas.grade3d));
      else{renderStats.delete(node.id);if(canvas.width!==w||canvas.height!==h)renderer.setSize(w,h,false);renderer.render(scene,camera);}
      const labels=node.parts3d?.filter(p=>p.label&&p.visible).slice(0,12)??[];
      if(labels.length){labelCanvas.width=w;labelCanvas.height=h;const c=labelCanvas.getContext('2d')!;c.drawImage(canvas,0,0,w,h);c.font=`500 ${Math.max(11,Math.round(w/65))}px Arial`;let lastY=-30;for(const p of labels){const box=controls.projection(node,p.id,camera,w,h);if(!box?.visible)continue;const ax=box.x+box.width/2,ay=box.y+box.height/2,tw=Math.min(w*.42,c.measureText(p.label).width+20),x=ax>w/2?12:w-tw-12,y=Math.max(lastY+30,Math.min(h-32,Math.max(12,ay-16)));if(y>h-30)continue;lastY=y;c.strokeStyle='#99e6dc';c.lineWidth=1;c.beginPath();c.moveTo(ax,ay);c.lineTo(x+tw/2,y+12);c.stroke();c.fillStyle='rgba(12,24,34,.94)';c.beginPath();c.roundRect(x,y,tw,25,5);c.fill();c.fillStyle='#d7fff7';c.fillText(p.label,x+10,y+17,tw-20);}return labelCanvas;}
      return canvas;
    },
    raycast(item, localX, localY) {
      const node = stateFor(item);
      const w = Math.max(1, item.bounds.width), h = Math.max(1, item.bounds.height);
      const ndc = new THREE.Vector2((localX / w) * 2 - 1, -((localY / h) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      const isSculpture = node.preset === 'logo-monolith';
      const model=controls.getRoot(node)??(node.preset==='anatomy-device'?device.group:isSculpture?sculpture:node.preset==='neon-reactor'?reactor:node.preset==='ribbon-tunnel'?tunnel:gearGroup);
      const hits = raycaster.intersectObjects(model.children, true);
      const precise=controls.pick(node,hits);if(precise)return precise;
      if (hits.length === 0) return null;
      const obj = hits[0]!.object;
      if(node.preset==='anatomy-device'){let p:THREE.Object3D|null=obj;while(p&&p.parent!==device.group)p=p.parent;return `${node.id}::${p?.name||'board'}`;}
      if(isSculpture) return `${node.id}::${obj===core?'core':obj===satellite?'satellite':'halo'}`;
      if(node.preset==='neon-reactor')return `${node.id}::${obj===reactorCore||obj.parent===reactorCore?'core':'shard'}`;
      if(node.preset==='ribbon-tunnel')return `${node.id}::tunnel`;
      // Найти родительскую шестерню для partId.
      let cur: THREE.Object3D | null = obj;
      while (cur && cur !== gearGroup) {
        const idx = gears.findIndex(g => g.mesh === cur);
        if (idx >= 0) return `${node.id}::${PART_NAMES[idx] ?? 'gear-a'}`;
        cur = cur.parent;
      }
      if (obj === backPlate) return `${node.id}::axle`;
      return `${node.id}::axle`;
    },
    dispose() {
      volume.dispose();controls.dispose();disposeObject(scene);
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  layer.stats=(id)=>renderStats.get(id);
  layer.parts=(node)=>descriptors(node).map(d=>({...d,name:partEdit(node,d.id).name}));
  layer.projectPart=(item,state,id)=>{layer.render(item,state);return controls.projection(stateFor(item),id,camera,Math.max(64,Math.round(item.bounds.width)),Math.max(64,Math.round(item.bounds.height)));};

  return {
    layer,
    partIds: (nodeId: string) => {const node=project.nodes.find(n=>n.id===nodeId&&n.kind==='scene3d') as Scene3dNode|undefined;if(!node)return[];if(node.model)return node.model.parts.map(p=>`${nodeId}::${p.id}`);const preset=node.preset;return(preset==='anatomy-device'?['base','board','processor','core','heatsink','cover','fastener','port']:preset==='logo-monolith'?['core','halo','satellite']:preset==='neon-reactor'?['core','shard']:preset==='ribbon-tunnel'?['tunnel']:[...PART_NAMES]).map(p=>`${nodeId}::${p}`)},
    dispose: () => layer.dispose(),
  };
}
