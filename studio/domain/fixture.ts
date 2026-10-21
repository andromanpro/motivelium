// Fixture M1: группа из двух карточек, отдельный текст, изображение, 3D-слой.
// Две последовательности и дорожка камеры с ключами. Детерминированные id для тестов.

import type { Project, SceneNode, Transform } from './schema.ts';

export const FIXTURE_ASSET_ID = 'asset-card-photo';
export const FIXTURE_ASSET_SHA = '0000000000000000000000000000000000000000000000000000000000000000';

function tr(partial: Partial<Transform>): Transform {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, pivotX: 0, pivotY: 0, ...partial };
}

export function buildFixture(): Project {
  const nodes: SceneNode[] = [
    {
      id: 'group-cards', name: 'Карточки', kind: 'group', parentId: null, sequenceId: 'seq-opening',
      transform: tr({ x: 240, y: 300 }), geometry: { width: 640, height: 300 }, visible: true, locked: false,
    },
    {
      id: 'card-left', name: 'Карточка слева', kind: 'shape', parentId: 'group-cards', sequenceId: 'seq-opening',
      transform: tr({ x: 0, y: 0 }), geometry: { width: 300, height: 180 }, visible: true, locked: false,
      shape: 'rect', fill: '#2f6fdb',
    },
    {
      id: 'card-right', name: 'Карточка справа', kind: 'shape', parentId: 'group-cards', sequenceId: 'seq-opening',
      transform: tr({ x: 340, y: 20, rotation: 6 }), geometry: { width: 300, height: 180 }, visible: true, locked: false,
      shape: 'rect', fill: '#e2b93b',
    },
    {
      id: 'text-title', name: 'Заголовок', kind: 'text', parentId: null, sequenceId: 'seq-opening',
      transform: tr({ x: 240, y: 120 }), geometry: { width: 640, height: 90 }, visible: true, locked: false,
      text: 'Motivelium studio', fontFamily: 'system-ui', fontSize: 56, color: '#e6e9ef', align: 'left', lineHeight: 1.2,
    },
    {
      id: 'image-frame', name: 'Кадр', kind: 'image', parentId: null, sequenceId: 'seq-opening',
      transform: tr({ x: 960, y: 480 }), geometry: { width: 420, height: 280 }, visible: true, locked: false,
      assetId: FIXTURE_ASSET_ID, fit: 'contain',
    },
    {
      id: 'scene3d-block', name: 'Механизм', kind: 'scene3d', parentId: null, sequenceId: 'seq-detail',
      transform: tr({ x: 480, y: 540 }), geometry: { width: 960, height: 620 }, visible: true, locked: false,
      adapter: 'three', preset: 'gear-cluster', spin: 12, explode: 0,
    },
  ];

  return {
    schemaVersion: 2,
    id: 'm1-fixture',
    revision: 1,
    title: 'M1 fixture — карточки, текст, кадр, 3D',
    size: { width: 1920, height: 1080 },
    fps: { num: 30, den: 1 },
    durationFrames: 330,
    seed: 20261014,
    assets: [{
      id: FIXTURE_ASSET_ID, path: 'assets/card-photo.png', mime: 'image/png', bytes: 0,
      sha256: FIXTURE_ASSET_SHA, width: 420, height: 280, origin: 'staged', title: 'постановочный кадр для fixture',
    }],
    sequences: [
      { id: 'seq-opening', name: 'Открытие', fromFrame: 0, toFrame: 180 },
      { id: 'seq-detail', name: 'Деталь', fromFrame: 180, toFrame: 330 },
    ],
    nodes,
    effects: [],
    cameraTracks: [
      { id: 'cam-main', name: 'Основная камера', keys: [
        { frame: 0, cx: 960, cy: 540, zoom: 1, rotation: 0 },
        { frame: 180, cx: 960, cy: 540, zoom: 1.15, rotation: 0 },
        { frame: 329, cx: 960, cy: 540, zoom: 1, rotation: 0 },
      ] },
    ],
    audioTracks: [],
    cues: [],
  };
}
