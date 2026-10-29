// Операции Project v2. Пакет применяется на копии; сбой любой операции
// отменяет весь пакет. updateNode принимает только разрешённые поля типа узла.

import { validateProject, ValidationError, type Project, type SceneNode, type CameraKey, type AssetRef, type Sequence, type Cue } from './schema.ts';
import { newId } from './ids.ts';
import type { EffectDefinition } from '../effects/registry.ts';
import { REGISTRY } from '../effects/registry.ts';
import {keyEditReason,offsetTransformKeys,transformAtFrame,upsertTransformKey} from './animation.ts';
import {partEdit,poseAt,type PartEdit,type PartKey,type CameraKey3d} from './model3d.ts';
import {emptyStoryboard,type StoryCard,type StoryComment} from './storyboard.ts';

type NodeSpecificValues<T> = T extends SceneNode ? Partial<Omit<T, 'id' | 'kind' | 'parentId' | 'sequenceId' | 'name' | 'transform' | 'geometry' | 'visible' | 'locked' | 'metadata'>> : never;
export type UpdateNodeValues = Partial<Pick<import('./schema.ts').Scene3dNode,'model'|'parts3d'|'camera3d'|'camera3dKeys'|'cameraTargetPart'>> & Partial<Pick<SceneNode, 'name' | 'transform' | 'geometry' | 'visible' | 'locked' | 'metadata'>> & NodeSpecificValues<SceneNode>;

export type Operation =
  | {op:'setStorySynopsis';text:string}
  | {op:'upsertStoryCard';card:StoryCard}
  | {op:'updateStoryCard';targetId:string;values:Partial<Omit<StoryCard,'id'|'comments'>>}
  | {op:'removeStoryCard';targetId:string}
  | {op:'reorderStoryCard';targetId:string;index:number}
  | {op:'addStoryComment';targetId:string;comment:StoryComment}
  | {op:'updateStoryComment';targetId:string;commentId:string;values:Partial<Pick<StoryComment,'text'|'resolved'>>}
  | {op:'removeStoryComment';targetId:string;commentId:string}
  | { op: 'createNode'; node: SceneNode }
  | { op: 'updateNode'; targetId: string; values: UpdateNodeValues }
  | {op:'updatePart3d';targetId:string;partId:string;values:Partial<Omit<PartEdit,'id'|'keys'>>}
  | {op:'setPart3dKey';targetId:string;partId:string;key:PartKey}
  | {op:'removePart3dKey';targetId:string;partId:string;frame:number}
  | {op:'setCamera3dKey';targetId:string;key:CameraKey3d}
  | {op:'removeCamera3dKey';targetId:string;frame:number}
  | { op:'setNodeKey';targetId:string;key:import('./schema.ts').TransformKey }
  | { op:'removeNodeKey';targetId:string;frame:number }
  | { op:'clearNodeKeys';targetId:string;frame:number }
  | { op:'setSceneTransition';targetId:string;transition:import('./schema.ts').SceneTransition|null }
  | { op: 'deleteNode'; targetId: string; recursive?: boolean }
  | { op: 'reparentNode'; targetId: string; parentId: string | null; index?: number }
  | { op: 'reorderNode'; targetId: string; index: number }
  | { op: 'addEffect'; effect: import('./schema.ts').EffectInstance }
  | { op: 'updateEffect'; targetId: string; values: Partial<import('./schema.ts').EffectInstance> }
  | { op: 'removeEffect'; targetId: string }
  | {op:'addCameraTrack';track:import('./schema.ts').CameraTrack}
  | {op:'updateCameraTrack';targetId:string;values:Partial<Pick<import('./schema.ts').CameraTrack,'name'|'scope'|'enabled'>>}
  | {op:'removeCameraTrack';targetId:string}
  | {op:'addAudioTrack';track:import('./schema.ts').AudioTrack}
  | {op:'removeAudioTrack';targetId:string}
  | {op:'updateCue';targetId:string;values:Partial<Pick<Cue,'frame'|'label'>>}
  | { op: 'setCameraKey'; trackId: string; key: CameraKey }
  | { op: 'removeCameraKey'; trackId: string; frame: number }
  | { op: 'addSequence'; sequence: Sequence }
  | { op: 'updateSequence'; targetId: string; values: Partial<Sequence> }
  | { op: 'deleteSequence'; targetId: string }
  | { op: 'addAsset'; asset: AssetRef }
  | { op: 'removeAsset'; targetId: string }
  | { op: 'addCue'; cue: Cue }
  | { op: 'removeCue'; targetId: string }
  | { op: 'updateAudioTrack'; targetId: string; values: Partial<import('./schema.ts').AudioTrack> }
  | { op: 'updateProjectMeta'; values: Partial<Pick<Project, 'title' | 'durationFrames' | 'seed' | 'size' | 'fps'>> };

export const MAX_OPS = 200;

export class OpError extends Error {
  opIndex: number;
  constructor(opIndex: number, message: string) {
    super(`операция #${opIndex + 1} (${message}`);
    this.name = 'OpError';
    this.opIndex = opIndex;
  }
}

const UPDATE_NODE_ALLOWED = new Set(['name','transform','geometry','visible','locked','metadata','text','fontFamily','fontSize','fontWeight','color','align','lineHeight','assetId','fit','shape','fill','fillOpacity','stroke','strokeWidth','generator','adapter','preset','spin','explode','model','parts3d','camera3d','camera3dKeys','cameraTargetPart']);

/** Применить пакет операций к копии проекта. Бросает OpError/ValidationError. */
export function applyOperations(project: Project, operations: unknown, registry: ReadonlyMap<string, EffectDefinition> = REGISTRY): Project {
  if (!Array.isArray(operations) || operations.length === 0) throw new OpError(0, 'пустой пакет операций');
  if (operations.length > MAX_OPS) throw new OpError(0, `слишком много операций (${operations.length} > ${MAX_OPS})`);
  const p = structuredClone(project);

  for (let i = 0; i < operations.length; i++) {
    const raw = operations[i];
    if (typeof raw !== 'object' || raw === null) throw new OpError(i, 'ожидается объект операции');
    const o = raw as Record<string, unknown>;
    const op = o.op as string;
    const find = (id: string): SceneNode => {
      const n = p.nodes.find(x => x.id === id);
      if (!n) throw new OpError(i, `объект не найден: ${id}`);
      return n;
    };

    switch (op) {
      case 'setStorySynopsis': {p.storyboard??=emptyStoryboard();p.storyboard.synopsis=o.text as string;break;}
      case 'upsertStoryCard': {const card=o.card as StoryCard;if(!card||typeof card!=='object')throw new OpError(i,'Нужна карточка');p.storyboard??=emptyStoryboard();const at=p.storyboard.cards.findIndex(c=>c.id===card.id);if(at<0)p.storyboard.cards.push(structuredClone(card));else p.storyboard.cards[at]=structuredClone(card);break;}
      case 'removeStoryCard':
      case 'updateStoryCard':
      case 'reorderStoryCard':
      case 'addStoryComment':
      case 'updateStoryComment':
      case 'removeStoryComment': {
        const cards=p.storyboard?.cards,at=cards?.findIndex(c=>c.id===o.targetId)??-1;if(!cards||at<0)throw new OpError(i,'Карточка раскадровки не найдена');const card=cards[at]!;
        if(op==='updateStoryCard'){const v=o.values;if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['title','description','durationFrames','camera','transition','sound','sources','status','sequenceId','nodeIds','image'].includes(k)))throw new OpError(i,'Недопустимые свойства карточки');Object.assign(card,structuredClone(v));}
        else if(op==='removeStoryCard')cards.splice(at,1);
        else if(op==='reorderStoryCard'){if(!Number.isInteger(o.index)||Number(o.index)<0||Number(o.index)>=cards.length)throw new OpError(i,'Позиция карточки вне списка');cards.splice(at,1);cards.splice(Number(o.index),0,card);}
        else if(op==='addStoryComment'){if(!o.comment||typeof o.comment!=='object')throw new OpError(i,'Нужно замечание');card.comments.push(structuredClone(o.comment)as StoryComment);}
        else{const ci=card.comments.findIndex(c=>c.id===o.commentId);if(ci<0)throw new OpError(i,'Замечание не найдено');if(op==='removeStoryComment')card.comments.splice(ci,1);else{const v=o.values;if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['text','resolved'].includes(k)))throw new OpError(i,'Недопустимая правка замечания');Object.assign(card.comments[ci]!,structuredClone(v));}}
        break;
      }
      case 'updatePart3d':
      case 'setPart3dKey':
      case 'removePart3dKey': {
        const node=find(String(o.targetId));if(node.kind!=='scene3d')throw new OpError(i,'Нужна 3D-сцена');
        if(keyEditReason(p,node.id))throw new OpError(i,keyEditReason(p,node.id));
        const edit=structuredClone(partEdit(node,String(o.partId)));
        if(op==='updatePart3d'){
          const values=o.values as Record<string,unknown>;if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(k=>!['name','visible','label','position','rotation','scale'].includes(k)))throw new OpError(i,'Недопустимые свойства детали');
          Object.assign(edit,structuredClone(values));
        }else if(op==='setPart3dKey'){
          const key=o.key as PartKey;if(!key||typeof key!=='object')throw new OpError(i,'Нужен ключ детали');edit.keys=[...(edit.keys??[]).filter(k=>k.frame!==key.frame),structuredClone(key)].sort((a,b)=>a.frame-b.frame);
        }else{
          const key=edit.keys?.find(k=>k.frame===o.frame);if(!key)throw new OpError(i,'Ключ детали не найден');const frozen=poseAt(edit,Number(o.frame));edit.keys=edit.keys!.filter(k=>k.frame!==o.frame);if(!edit.keys.length){Object.assign(edit,frozen);delete edit.keys;}
        }
        node.parts3d=[...(node.parts3d??[]).filter(e=>e.id!==edit.id),edit];break;
      }
      case 'setCamera3dKey':
      case 'removeCamera3dKey': {
        const node=find(String(o.targetId));if(node.kind!=='scene3d')throw new OpError(i,'Нужна 3D-сцена');if(keyEditReason(p,node.id))throw new OpError(i,keyEditReason(p,node.id));
        if(op==='setCamera3dKey'){const key=o.key as CameraKey3d;if(!key||typeof key!=='object')throw new OpError(i,'Нужен ключ камеры');node.camera3dKeys=[...(node.camera3dKeys??[]).filter(k=>k.frame!==key.frame),structuredClone(key)].sort((a,b)=>a.frame-b.frame);}
        else{const old=node.camera3dKeys?.find(k=>k.frame===o.frame);if(!old)throw new OpError(i,'Ключ камеры не найден');node.camera3dKeys=node.camera3dKeys!.filter(k=>k.frame!==o.frame);if(!node.camera3dKeys.length){node.camera3d={position:old.position,target:old.target,fov:old.fov};delete node.camera3dKeys;}}break;
      }
      case 'createNode': {
        const node = o.node as SceneNode | undefined;
        if (!node || typeof node !== 'object') throw new OpError(i, 'createNode: нет node');
        if (p.nodes.some(x => x.id === node.id)) throw new OpError(i, `createNode: id "${node.id}" уже занят`);
        if (node.parentId && !p.nodes.some(x => x.id === node.parentId)) throw new OpError(i, `createNode: родитель ${node.parentId} не найден`);
        p.nodes.push(node);
        break;
      }
      case 'updateNode': {
        const n = find(String(o.targetId));
        const values = o.values as Record<string, unknown> | undefined;
        if (!values || typeof values !== 'object') throw new OpError(i, 'updateNode: нет values');
        if(n.transformKeys?.length&&values.transform)n.transformKeys=offsetTransformKeys(n,values.transform as import('./schema.ts').Transform);
        for (const k of Object.keys(values)) {
          if (!UPDATE_NODE_ALLOWED.has(k)) throw new OpError(i, `updateNode: свойство "${k}" не разрешено для правки`);
          if (k === 'metadata') {
            (n as Record<string, unknown>)[k] = structuredClone(values[k]);
          } else {
            (n as unknown as Record<string, unknown>)[k] = structuredClone(values[k]);
          }
        }
        break;
      }
      case 'setNodeKey': {const n=find(String(o.targetId)),key=o.key as import('./schema.ts').TransformKey;if(!key||typeof key!=='object'||!Number.isInteger(key.frame))throw new OpError(i,'setNodeKey: требуется ключ с кадром');if(keyEditReason(p,n.id))throw new OpError(i,keyEditReason(p,n.id));n.transformKeys=upsertTransformKey(n.transformKeys,structuredClone(key));break;}
      case 'removeNodeKey': {const n=find(String(o.targetId)),key=n.transformKeys?.find(k=>k.frame===o.frame);if(!key)throw new OpError(i,'removeNodeKey: ключ не найден');if(keyEditReason(p,n.id))throw new OpError(i,keyEditReason(p,n.id));n.transformKeys=n.transformKeys!.filter(k=>k.frame!==o.frame);if(!n.transformKeys.length){n.transform={...key.transform};delete n.transformKeys;}break;}
      case 'clearNodeKeys': {const n=find(String(o.targetId));if(keyEditReason(p,n.id))throw new OpError(i,keyEditReason(p,n.id));const scene=p.sequences.find(s=>s.id===n.sequenceId);if(!Number.isInteger(o.frame)||!scene||(o.frame as number)<scene.fromFrame||(o.frame as number)>=scene.toFrame)throw new OpError(i,'clearNodeKeys: кадр вне сцены');n.transform={...transformAtFrame(n,o.frame as number)};delete n.transformKeys;break;}
      case 'deleteNode': {
        const id = String(o.targetId);
        find(id);
        const children = p.nodes.filter(x => x.parentId === id);
        if (children.length && !o.recursive) throw new OpError(i, `deleteNode: у "${id}" есть дочерние узлы; нужен recursive`);
        const doomed = new Set<string>([id]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const n of p.nodes) if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) { doomed.add(n.id); grew = true; }
        }
        p.nodes = p.nodes.filter(n => !doomed.has(n.id));
        p.effects = p.effects.filter(e => !doomed.has(e.targetId));
        break;
      }
      case 'setSceneTransition':{const scene=p.sequences.find(s=>s.id===String(o.targetId));if(!scene)throw new OpError(i,'Сцена не найдена');if(o.transition===null)delete scene.transition;else scene.transition=structuredClone(o.transition)as import('./schema.ts').SceneTransition;break;}
      case 'reparentNode': {
        const id = String(o.targetId);
        const n = find(id);
        const parentId = o.parentId === null ? null : String(o.parentId);
        if (parentId) {
          if (parentId === id) throw new OpError(i, 'reparentNode: родитель = сам узел');
          const parent = find(parentId);
          if (parent.kind !== 'group') throw new OpError(i, `reparentNode: "${parentId}" не группа`);
          if (parent.sequenceId !== n.sequenceId) throw new OpError(i, `reparentNode: последовательность "${parent.sequenceId}" отличается от "${n.sequenceId}"`);
          // Цикл: подъём от нового родителя не должен встретить переносимый узел.
          let cur: SceneNode | undefined = parent;
          let depth = 0;
          while (cur) {
            if (cur.id === id) throw new OpError(i, 'reparentNode: получился цикл вложенности');
            cur = cur.parentId ? p.nodes.find(x => x.id === cur?.parentId) : undefined;
            if (++depth > p.nodes.length) throw new OpError(i, 'reparentNode: цикл вложенности');
          }
        }
        n.parentId = parentId;
        if (typeof o.index === 'number') reorderSiblings(p, n, o.index, i);
        break;
      }
      case 'reorderNode': {
        const n = find(String(o.targetId));
        if (typeof o.index !== 'number') throw new OpError(i, 'reorderNode: нет index');
        reorderSiblings(p, n, o.index, i);
        break;
      }
      case 'addEffect': {
        const e = o.effect as import('./schema.ts').EffectInstance | undefined;
        if (!e) throw new OpError(i, 'addEffect: нет effect');
        if (p.effects.some(x => x.id === e.id)) throw new OpError(i, `addEffect: id "${e.id}" уже занят`);
        if (!p.nodes.some(x => x.id === e.targetId)) throw new OpError(i, `addEffect: цель ${e.targetId} не найдена`);
        p.effects.push(structuredClone(e));
        break;
      }
      case 'updateEffect': {
        const e = p.effects.find(x => x.id === String(o.targetId));
        if (!e) throw new OpError(i, `updateEffect: эффект ${String(o.targetId)} не найден`);
        const values = o.values as Record<string, unknown> | undefined;
        if (!values) throw new OpError(i, 'updateEffect: нет values');
        for (const k of Object.keys(values)) {
          if (!['definitionId','definitionVersion','targetId','fromFrame','toFrame','params','enabled','order'].includes(k))
            throw new OpError(i, `updateEffect: свойство "${k}" не разрешено`);
          (e as unknown as Record<string, unknown>)[k] = structuredClone(values[k]);
        }
        break;
      }
      case 'removeEffect': {
        const before = p.effects.length;
        p.effects = p.effects.filter(x => x.id !== String(o.targetId));
        if (p.effects.length === before) throw new OpError(i, `removeEffect: эффект ${String(o.targetId)} не найден`);
        break;
      }
      case 'addCameraTrack':
      case 'addAudioTrack': {
        const track=o.track as import('./schema.ts').CameraTrack&import('./schema.ts').AudioTrack;
        const list=op==='addCameraTrack'?p.cameraTracks:p.audioTracks;
        if(!track||typeof track!=='object'||list.some(t=>t.id===track.id))throw new OpError(i,'Дорожка отсутствует или ID занят');
        if(op==='addCameraTrack')p.cameraTracks.push(structuredClone(track));else p.audioTracks.push(structuredClone(track));break;
      }
      case 'updateCameraTrack': {
        const t=p.cameraTracks.find(t=>t.id===o.targetId),v=o.values as Record<string,unknown>;
        if(!t||!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['name','scope','enabled'].includes(k)))throw new OpError(i,'Недопустимая правка камеры');Object.assign(t,structuredClone(v));break;
      }
      case 'removeCameraTrack':
      case 'removeAudioTrack': {
        const id=String(o.targetId),list=op==='removeCameraTrack'?p.cameraTracks:p.audioTracks;
        if(!list.some(t=>t.id===id))throw new OpError(i,'Дорожка не найдена');
        if(op==='removeCameraTrack')p.cameraTracks=p.cameraTracks.filter(t=>t.id!==id);else{p.audioTracks=p.audioTracks.filter(t=>t.id!==id);p.cues=p.cues.filter(c=>c.trackId!==id);}break;
      }
      case 'updateCue': {
        const c=p.cues.find(c=>c.id===o.targetId),v=o.values as Record<string,unknown>;
        if(!c||!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['frame','label'].includes(k)))throw new OpError(i,'Недопустимая правка метки');Object.assign(c,structuredClone(v));break;
      }
      case 'setCameraKey': {
        const t = p.cameraTracks.find(x => x.id === String(o.trackId));
        if (!t) throw new OpError(i, `setCameraKey: дорожка ${String(o.trackId)} не найдена`);
        const key = o.key as CameraKey | undefined;
        if (!key) throw new OpError(i, 'setCameraKey: нет key');
        const existing = t.keys.findIndex(k => k.frame === key.frame);
        if (existing >= 0) t.keys[existing] = structuredClone(key);
        else t.keys.push(structuredClone(key));
        t.keys.sort((a, b) => a.frame - b.frame);
        break;
      }
      case 'removeCameraKey': {
        const t = p.cameraTracks.find(x => x.id === String(o.trackId));
        if (!t) throw new OpError(i, `removeCameraKey: дорожка ${String(o.trackId)} не найдена`);
        const before = t.keys.length;
        t.keys = t.keys.filter(k => k.frame !== o.frame);
        if (t.keys.length === before) throw new OpError(i, `removeCameraKey: кадра ${String(o.frame)} нет`);
        break;
      }
      case 'addSequence': {
        const s = o.sequence as Sequence | undefined;
        if (!s) throw new OpError(i, 'addSequence: нет sequence');
        if (p.sequences.some(x => x.id === s.id)) throw new OpError(i, `addSequence: id "${s.id}" уже занят`);
        p.sequences.push(structuredClone(s));
        break;
      }
      case 'updateSequence': {
        const s = p.sequences.find(x => x.id === String(o.targetId));
        if (!s) throw new OpError(i, `updateSequence: последовательность ${String(o.targetId)} не найдена`);
        const values = o.values as Record<string, unknown> | undefined;
        if (!values) throw new OpError(i, 'updateSequence: нет values');
        for (const k of Object.keys(values)) {
          if (!['name','fromFrame','toFrame'].includes(k)) throw new OpError(i, `updateSequence: свойство "${k}" не разрешено`);
          (s as unknown as Record<string, unknown>)[k] = structuredClone(values[k]);
        }
        break;
      }
      case 'deleteSequence': {
        const id = String(o.targetId);
        if (!p.sequences.some(x => x.id === id)) throw new OpError(i, `deleteSequence: ${id} не найдена`);
        if (p.nodes.some(n => n.sequenceId === id)) throw new OpError(i, `deleteSequence: в "${id}" есть узлы`);
        p.sequences = p.sequences.filter(x => x.id !== id);
        break;
      }
      case 'addAsset': {
        const a = o.asset as AssetRef | undefined;
        if (!a) throw new OpError(i, 'addAsset: нет asset');
        if (p.assets.some(x => x.id === a.id)) throw new OpError(i, `addAsset: id "${a.id}" уже занят`);
        p.assets.push(structuredClone(a));
        break;
      }
      case 'removeAsset': {
        const id = String(o.targetId);
        if (!p.assets.some(x => x.id === id)) throw new OpError(i, `removeAsset: ассет ${id} не найден`);
        if (p.nodes.some(n => n.kind === 'image' && n.assetId === id)) throw new OpError(i, `removeAsset: ассет ${id} используется узлом image`);
        if (p.audioTracks.some(t => t.assetId === id)) throw new OpError(i, `removeAsset: ассет ${id} используется звуковой дорожкой`);
        if(p.storyboard?.cards.some(c=>c.image?.assetId===id))throw new OpError(i,'Изображение используется в раскадровке');
        p.assets = p.assets.filter(x => x.id !== id);
        break;
      }
      case 'addCue': {
        const c = o.cue as Cue | undefined;
        if (!c) throw new OpError(i, 'addCue: нет cue');
        if (p.cues.some(x => x.id === c.id)) throw new OpError(i, `addCue: id "${c.id}" уже занят`);
        p.cues.push(structuredClone(c));
        break;
      }
      case 'removeCue': {
        const before = p.cues.length;
        p.cues = p.cues.filter(x => x.id !== String(o.targetId));
        if (p.cues.length === before) throw new OpError(i, `removeCue: метка ${String(o.targetId)} не найдена`);
        break;
      }
      case 'updateAudioTrack': {
        const t = p.audioTracks.find(x => x.id === String(o.targetId));
        if (!t) throw new OpError(i, `updateAudioTrack: дорожка ${String(o.targetId)} не найдена`);
        const values = o.values as Record<string, unknown> | undefined;
        if (!values) throw new OpError(i, 'updateAudioTrack: нет values');
        for (const k of Object.keys(values)) {
          if (!['kind','assetId','gain','offsetSeconds','mute','synth','name','clip','credit'].includes(k)) throw new OpError(i, `updateAudioTrack: свойство "${k}" не разрешено`);
          (t as unknown as Record<string, unknown>)[k] = structuredClone(values[k]);
        }
        break;
      }
      case 'updateProjectMeta': {
        const values = o.values as Record<string, unknown> | undefined;
        if (!values) throw new OpError(i, 'updateProjectMeta: нет values');
        for (const k of Object.keys(values)) {
          if (!['title','durationFrames','seed','size','fps'].includes(k)) throw new OpError(i, `updateProjectMeta: свойство "${k}" не разрешено`);
          if (k === 'size' || k === 'fps') (p as unknown as Record<string, unknown>)[k] = structuredClone(values[k]);
          else (p as unknown as Record<string, unknown>)[k] = values[k];
        }
        break;
      }
      default:
        throw new OpError(i, `неизвестная операция "${String(op)}"`);
    }
  }

  // Полная валидация результата пакета (включая реестр эффектов): атомарность
  // гарантирует, что при ошибке вызывающий получит исходный проект без частичных изменений.
  validateProject(p, registry);
  return p;
}

/**
 * Перестановка среди соседей (тот же родитель И та же последовательность).
 * Свой текущий индекс — no-op. Поддеревья групп остаются целыми: сегмент
 * последовательности перестраивается прямым обходом, z-порядок совпадает с деревом.
 */
function reorderSiblings(p: Project, node: SceneNode, index: number, opIndex: number): void {
  if (!Number.isInteger(index)) throw new OpError(opIndex, 'reorder: index должен быть целым');
  const siblings = p.nodes.filter(n => n.parentId === node.parentId && n.sequenceId === node.sequenceId);
  if (siblings.length === 0) throw new OpError(opIndex, 'reorder: соседи не найдены');
  if (index < 0 || index >= siblings.length) throw new OpError(opIndex, `index ${String(index)} вне диапазона 0..${String(siblings.length - 1)}`);
  const current = siblings.findIndex(n => n.id === node.id);
  if (current === index) return; // перестановка на своё место — ничего не меняется

  // Новый порядок соседей этого уровня.
  const without = siblings.filter(n => n.id !== node.id);
  const newOrder = [...without];
  newOrder.splice(index, 0, node);

  // Сегмент последовательности: прямой обход. Порядок детей прочих родителей —
  // как в текущем плоском массиве; у переставляемого уровня — новый порядок.
  const seqNodes = p.nodes.filter(n => n.sequenceId === node.sequenceId);
  const position = new Map(p.nodes.map((n, i) => [n.id, i] as const));
  const childrenOf = new Map<string, SceneNode[]>();
  for (const n of seqNodes) {
    if (n.id === node.id) continue; // его уровень задаётся newOrder отдельно
    const key = n.parentId ?? '';
    const arr = childrenOf.get(key) ?? [];
    arr.push(n);
    childrenOf.set(key, arr);
  }
  for (const arr of childrenOf.values()) arr.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));

  const emitted: SceneNode[] = [];
  const levelKey = node.parentId ?? '';
  const reorderAtRoot = node.parentId === null;
  const emit = (n: SceneNode): void => {
    emitted.push(n);
    const kids = childrenOf.get(n.id);
    if (kids) for (const k of kids) emit(k);
  };
  const emitFrom = (n: SceneNode): void => {
    emitted.push(n);
    // Детей берём из обычного порядка, кроме переставляемого уровня.
    if (n.id === levelKey) { for (const k of newOrder) emit(k); return; }
    const kids = childrenOf.get(n.id);
    if (kids) for (const k of kids) emitFrom(k);
  };
  const rootKids = childrenOf.get('') ?? [];
  if (reorderAtRoot) {
    for (const root of newOrder) emitFrom(root);
  } else {
    // Перестановка вложенного уровня: обход от корней, уровень родителя — newOrder.
    for (const root of rootKids) emitFrom(root);
  }

  // Прочие узлы (другие последовательности) — в прежнем порядке, блок вставляется
  // на место первого старого члена последовательности.
  const seqIds = new Set(seqNodes.map(n => n.id));
  const firstOldPos = Math.min(...seqNodes.map(n => position.get(n.id) ?? 0));
  const out: SceneNode[] = [];
  let inserted = false;
  for (const n of p.nodes) {
    if (seqIds.has(n.id)) {
      if (!inserted) { out.push(...emitted); inserted = true; }
      continue;
    }
    if ((position.get(n.id) ?? 0) > firstOldPos && !inserted) { out.push(...emitted); inserted = true; }
    out.push(n);
  }
  if (!inserted) out.push(...emitted);
  p.nodes = out;
}

/** Быстрая генерация id внутри операций (сервер подставляет при source=manual без id). */
export { newId };
