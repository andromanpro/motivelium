// Расчёт кадра: чистая функция проекта и номера кадра. Не зависит от истории
// проигрывания, DOM и WebGL. Один и тот же FrameState для предпросмотра,
// hit-test и экспорта.

import type { Project, SceneNode, Sequence, EffectInstance, CameraKey } from '../domain/schema.ts';
import {transformAtFrame} from '../domain/animation.ts';
import { compose, localMatrix, type Mat2d } from '../domain/matrix.ts';
import { REGISTRY, NEUTRAL_DELTAS, combineDeltas, clamp01, smoothstep, type EffectDeltas, type EffectDefinition } from '../effects/registry.ts';

export type FrameItem = {
  node: SceneNode;
  /** Матрица узла в координатах композиции (без камеры). */
  world: Mat2d;
  /** Матрица узла в экранных координатах (включая камеру). */
  screen: Mat2d;
  /** Итоговая непрозрачность с учётом родителей и эффектов. */
  opacity: number;
  /** Сложенные дельты активных эффектов. */
  deltas: EffectDeltas;
  /** Прямоугольник геометрии узла в его локальных координатах (0,0,w,h). */
  bounds: { x: number; y: number; width: number; height: number };
};

export type FrameCamera = { cx: number; cy: number; zoom: number; rotation: number };

export type FrameState = {
  frame: number;
  sequence: Sequence | null;
  camera: FrameCamera;
  /** Матрица камеры: композиция → экран. */
  cameraMatrix: Mat2d;
  items: FrameItem[];
  /** Идентификаторы узлов, невидимых на этом кадре (другая последовательность, visible=false, opacity=0). */
  hiddenNodeIds: string[];
};

export function cameraAtFrame(keys: CameraKey[], frame: number): FrameCamera {
  if (keys.length === 0) return { cx: 0, cy: 0, zoom: 1, rotation: 0 };
  const sorted = [...keys].sort((a, b) => a.frame - b.frame);
  if (frame <= sorted[0]!.frame) return camOf(sorted[0]!);
  const last = sorted[sorted.length - 1]!;
  if (frame >= last.frame) return camOf(last);
  let hi = 1;
  while (hi < sorted.length && sorted[hi]!.frame < frame) hi++;
  const a = sorted[hi - 1]!, b = sorted[hi]!;
  const t = (frame - a.frame) / (b.frame - a.frame);
  const e = smoothstep(t);
  return {
    cx: a.cx + (b.cx - a.cx) * e,
    cy: a.cy + (b.cy - a.cy) * e,
    zoom: a.zoom + (b.zoom - a.zoom) * e,
    rotation: a.rotation + (b.rotation - a.rotation) * e,
  };
}

function camOf(k: CameraKey): FrameCamera {
  return { cx: k.cx, cy: k.cy, zoom: k.zoom, rotation: k.rotation };
}

/** Матрица камеры: T(центр экрана) · (R·S) · T(-c). Экран = композиция × эта матрица. */
export function cameraMatrix(cam: FrameCamera, size: { width: number; height: number }): Mat2d {
  const rad = (cam.rotation * Math.PI) / 180;
  const a = Math.cos(rad) * cam.zoom, b = Math.sin(rad) * cam.zoom;
  const c = -Math.sin(rad) * cam.zoom, d = Math.cos(rad) * cam.zoom;
  const w = size.width / 2, h = size.height / 2;
  return {
    a, b, c, d,
    e: w - (a * cam.cx + c * cam.cy),
    f: h - (b * cam.cx + d * cam.cy),
  };
}

function activeEffects(project: Project, nodeId: string, frame: number, registry: ReadonlyMap<string, EffectDefinition>): EffectDeltas {
  const list: EffectDeltas[] = [];
  const instances = project.effects
    .filter(e => e.targetId === nodeId && e.enabled && frame >= e.fromFrame && frame < e.toFrame)
    .sort((a, b) => a.order - b.order);
  for (const e of instances) {
    const def = registry.get(e.definitionId);
    if (!def || def.version !== e.definitionVersion) continue; // неизвестная версия не применяется молча
    const progress = clamp01((frame - e.fromFrame) / (e.toFrame - e.fromFrame));
    list.push(def.evaluate(progress, frame, e.params,{fromFrame:e.fromFrame,toFrame:e.toFrame,fps:project.fps.num/project.fps.den}));
  }
  return list.length ? combineDeltas(list) : { ...NEUTRAL_DELTAS };
}

/**
 * Вычислить состояние кадра. Один вызов = полный пересчёт; seek в любое место
 * даёт тот же результат, что последовательный проигрыш.
 */
export function evaluateFrame(
  project: Project,
  frame: number,
  registry: ReadonlyMap<string, EffectDefinition> = REGISTRY,
): FrameState {
  const f = Math.max(0, Math.min(Math.trunc(frame), project.durationFrames - 1));
  const sequence = project.sequences.find(s => f >= s.fromFrame && f < s.toFrame) ?? null;

  const activeCamera=project.cameraTracks.filter(t=>t.enabled!==false&&t.scope&&t.scope.sequenceId===sequence?.id&&f>=t.scope.fromFrame&&f<t.scope.toFrame).at(-1)
    ??project.cameraTracks.find(t=>!t.scope&&t.enabled!==false);
  const cam = activeCamera?.keys.length
    ? cameraAtFrame(activeCamera.keys, f)
    : { cx: project.size.width / 2, cy: project.size.height / 2, zoom: 1, rotation: 0 };
  const camM = cameraMatrix(cam, project.size);

  const byId = new Map(project.nodes.map(n => [n.id, {...n,transform:transformAtFrame(n,f)}]));
  const effectsByTarget = new Map<string, EffectInstance[]>();
  for (const e of project.effects) {
    const arr = effectsByTarget.get(e.targetId) ?? [];
    arr.push(e);
    effectsByTarget.set(e.targetId, arr);
  }

  const items: FrameItem[] = [];
  const hiddenNodeIds: string[] = [];

  // Прямой порядок массива nodes = z-порядок отрисовки (родители раньше детей).
  for (const storedNode of project.nodes) {
    const node={...storedNode,transform:transformAtFrame(storedNode,f)};
    if (node.sequenceId !== sequence?.id || !node.visible) {
      hiddenNodeIds.push(node.id);
      continue;
    }
    const deltas = activeEffects(project, node.id, f, registry);
    let opacity = node.transform.opacity * deltas.opacity;
    // Родители: их transform и opacity влияют, координаты детей не переписываются.
    let parent = node.parentId ? byId.get(node.parentId) : undefined;
    let parentsVisible=true;
    let guard = 0;
    while (parent && guard++ < project.nodes.length) {
      const parentEffects = activeEffects(project, parent.id, f, registry);
      parentsVisible &&= parent.visible;
      opacity *= parent.visible ? parent.transform.opacity * parentEffects.opacity : 0;
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    if (!parentsVisible || (opacity <= 0.0001 && !deltas.feedback)) {
      hiddenNodeIds.push(node.id);
      continue;
    }

    // world = parentWorld ∘ local(node + эффектовые дельты); координаты детей не переписываются.
    const localWithEffects = localMatrix({
      x: node.transform.x + deltas.x,
      y: node.transform.y + deltas.y,
      rotation: (node.transform.rotation + deltas.rotate) * Math.PI / 180,
      scaleX: node.transform.scaleX * deltas.scale * (deltas.stretchX??1),
      scaleY: node.transform.scaleY * deltas.scale * (deltas.stretchY??1),
      pivotX: node.transform.pivotX,
      pivotY: node.transform.pivotY,
    });
    let world = localWithEffects;
    parent = node.parentId ? byId.get(node.parentId) : undefined;
    guard = 0;
    while (parent && guard++ < project.nodes.length) {
      const pd = activeEffects(project, parent.id, f, registry);
      const parentLocal = localMatrix({
        x: parent.transform.x + pd.x,
        y: parent.transform.y + pd.y,
        rotation: (parent.transform.rotation + pd.rotate) * Math.PI / 180,
        scaleX: parent.transform.scaleX * pd.scale * (pd.stretchX??1),
        scaleY: parent.transform.scaleY * pd.scale * (pd.stretchY??1),
        pivotX: parent.transform.pivotX,
        pivotY: parent.transform.pivotY,
      });
      // Внешний родитель применяется ПОСЛЕ вложенного: world = parentLocal ∘ world.
      world = compose(parentLocal, world);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    // Видимость и непрозрачность всей родительской цепочки учтены выше.

    items.push({
      node,
      world,
      screen: compose(camM, world),
      opacity,
      deltas,
      bounds: { x: 0, y: 0, width: node.geometry.width, height: node.geometry.height },
    });
  }

  return { frame: f, sequence, camera: cam, cameraMatrix: camM, items, hiddenNodeIds };
}

export { clamp01 };
