// Выбор объекта по координате. Использует те же матрицы, что и рендер:
// после pan/zoom/поворота камеры и трансформации групп рамка совпадает с изображением.
// Явное правило: эффекты, сдвигающие объект (reveal-deal), учитываются; частичная
// маска reveal не скрывает объект от выбора; невидимые узлы (visible=false, opacity=0,
// другая последовательность) не выбираются.

import type { FrameState, FrameItem } from './evaluate.ts';
import { toLocal } from '../domain/matrix.ts';
import {morphContour,nativeContourShape,pointInRing,distanceToRing,type Point} from '../effects/contours.ts';

export type PickResult = {
  nodeId: string;
  /** Локальные координаты точки внутри геометрии узла. */
  local: { x: number; y: number };
  item: FrameItem;
};

export function hitTest(state: FrameState, screenX: number, screenY: number): PickResult | null {
  // Верхние в z-порядке рисуются позже — проверяем с конца.
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i]!;
    if (item.node.kind === 'group') continue; // группа — контейнер; выбираются её дети
    const local = toLocal(item.screen, screenX, screenY);
    const inBounds =
      local.x >= -0.5 && local.y >= -0.5 &&
      local.x <= item.bounds.width + 0.5 && local.y <= item.bounds.height + 0.5;
    // Stroke-only shapes do not intercept clicks in their transparent interior.
    if(item.node.kind==='shape'){
      const w=item.bounds.width,h=item.bounds.height,fill=(item.node.fillOpacity??1)>0&&item.node.fill!=='transparent'&&!/^#[0-9a-f]{6}00$/i.test(item.node.fill),stroke=!!item.node.stroke&&(item.node.strokeWidth??0)>0,half=(item.node.strokeWidth??0)/2;
      const native=item.deltas.morph?nativeContourShape(item.deltas.morph,item.node.shape):item.node.shape;
      if(item.deltas.morph&&!native){const points=morphContour(item.deltas.morph,item.node.shape).map(([x,y])=>[x*w/100,y*h/100] as Point);if(!(fill&&pointInRing(points,local.x,local.y))&&!(stroke&&distanceToRing(points,local.x,local.y)<=half+.5))continue;return{nodeId:item.node.id,local,item};}
      if(native==='ellipse'){
        const dx=local.x-w/2,dy=local.y-h/2,inside=(dx/(w/2))**2+(dy/(h/2))**2<=1;
        const outer=(dx/(w/2+half))**2+(dy/(h/2+half))**2<=1,inner=w/2>half&&h/2>half&&(dx/(w/2-half))**2+(dy/(h/2-half))**2<1;
        if(!(fill&&inside)&&!(stroke&&outer&&!inner))continue;
      }else{const edge=local.x>=-half&&local.x<=w+half&&local.y>=-half&&local.y<=h+half&&(local.x<=half||local.x>=w-half||local.y<=half||local.y>=h-half);if(!(fill&&inBounds)&&!(stroke&&edge))continue;}
      return {nodeId:item.node.id,local,item};
    }
    if (inBounds) return { nodeId: item.node.id, local, item };
  }
  return null;
}
