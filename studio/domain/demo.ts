// Демо-проект M2: сквозная проба 10 c @ 30 fps.
// Две последовательности, вложенная группа из двух карточек, текст, изображение,
// 3D-механизм, движение камеры и два настоящих эффекта реестра.

import type { Project, SceneNode, Transform, AssetRef, EffectInstance } from './schema.ts';

export const DEMO_ASSET_ID = 'asset-monitor-frame';

function tr(partial: Partial<Transform>): Transform {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, pivotX: 0, pivotY: 0, ...partial };
}

/**
 * @param assetMeta метаданные реального файла (сервер считает при копировании;
 * тесты передают детерминированную заглушку)
 */
export function buildDemo(assetMeta: { sha256: string; bytes: number; width: number; height: number }): Project {
  const asset: AssetRef = {
    id: DEMO_ASSET_ID,
    path: 'assets/monitor-frame.png',
    mime: 'image/png',
    bytes: assetMeta.bytes,
    sha256: assetMeta.sha256,
    width: assetMeta.width,
    height: assetMeta.height,
    origin: 'staged',
    title: 'исторический журнал мониторинга (сцена ИИконы мастерской)',
  };

  const nodes: SceneNode[] = [
    {
      id: 'title-m2', name: 'Заголовок', kind: 'text', parentId: null, sequenceId: 'seq-opening',
      transform: tr({ x: 240, y: 130 }), geometry: { width: 900, height: 90 }, visible: true, locked: false,
      text: 'Motivelium — программное видео', fontFamily: 'system-ui', fontSize: 54, color: '#e6e9ef', align: 'left', lineHeight: 1.2,
    },
    {
      id: 'cards-m2', name: 'Пара карточек', kind: 'group', parentId: null, sequenceId: 'seq-opening',
      transform: tr({ x: 210, y: 400 }), geometry: { width: 660, height: 220 }, visible: true, locked: false,
    },
    {
      id: 'card-a', name: 'Карточка А', kind: 'shape', parentId: 'cards-m2', sequenceId: 'seq-opening',
      transform: tr({ x: 0, y: 0 }), geometry: { width: 300, height: 180 }, visible: true, locked: false,
      shape: 'rect', fill: '#2f6fdb',
    },
    {
      id: 'card-b', name: 'Карточка Б', kind: 'shape', parentId: 'cards-m2', sequenceId: 'seq-opening',
      transform: tr({ x: 340, y: 24, rotation: 5 }), geometry: { width: 300, height: 180 }, visible: true, locked: false,
      shape: 'rect', fill: '#e2b93b',
    },
    {
      id: 'shot-m2', name: 'Кадр журнала', kind: 'image', parentId: null, sequenceId: 'seq-opening',
      transform: tr({ x: 1210, y: 330 }), geometry: { width: 460, height: 300 }, visible: true, locked: false,
      assetId: DEMO_ASSET_ID, fit: 'contain',
    },
    {
      id: 'mech-m2', name: 'Механизм', kind: 'scene3d', parentId: null, sequenceId: 'seq-detail',
      transform: tr({ x: 480, y: 220 }), geometry: { width: 960, height: 620 }, visible: true, locked: false,
      adapter: 'three', preset: 'gear-cluster', spin: 40, explode: 0.15,
    },
    {
      id: 'note-m2', name: 'Подпись деталей', kind: 'text', parentId: null, sequenceId: 'seq-detail',
      transform: tr({ x: 480, y: 900 }), geometry: { width: 960, height: 60 }, visible: true, locked: false,
      text: 'Детали механизма выбираются кликом', fontFamily: 'system-ui', fontSize: 30, color: '#aeb7c4', align: 'left', lineHeight: 1.2,
    },
  ];

  const effects: EffectInstance[] = [
    {
      id: 'fx-deal-cardb', definitionId: 'reveal-deal', definitionVersion: 1, targetId: 'card-b',
      fromFrame: 0, toFrame: 45, params: { distance: 210, angle: -10 }, enabled: true, order: 1,
    },
    {
      id: 'fx-lift-title', definitionId: 'soft-lift', definitionVersion: 1, targetId: 'title-m2',
      fromFrame: 15, toFrame: 60, params: { height: 70 }, enabled: true, order: 1,
    },
  ];

  return {
    schemaVersion: 2,
    id: 'm2-demo',
    revision: 1,
    title: 'M2 — сквозная проба: карточки, журнал, механизм',
    size: { width: 1920, height: 1080 },
    fps: { num: 30, den: 1 },
    durationFrames: 300,
    seed: 202610140,
    assets: [asset],
    sequences: [
      { id: 'seq-opening', name: 'Открытие', fromFrame: 0, toFrame: 150 },
      { id: 'seq-detail', name: 'Механизм', fromFrame: 150, toFrame: 300 },
    ],
    nodes,
    effects,
    cameraTracks: [
      { id: 'cam-main', name: 'Основная камера', keys: [
        { frame: 0, cx: 960, cy: 540, zoom: 1, rotation: 0 },
        { frame: 75, cx: 960, cy: 540, zoom: 1.12, rotation: 0 },
        { frame: 150, cx: 1080, cy: 540, zoom: 1.05, rotation: 0 },
        { frame: 225, cx: 960, cy: 520, zoom: 1.25, rotation: 0 },
        { frame: 299, cx: 960, cy: 540, zoom: 1, rotation: 0 },
      ] },
    ],
    audioTracks: [],
    cues: [],
  };
}
