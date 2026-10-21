// Схема Project v2: строгие типы и валидация. Раздел 4.2 Плана-развития.
// Неизвестные поля, дубли ID, циклы вложенности и некорректные диапазоны отклоняются
// с понятной ошибкой. Домен не знает про DOM/Canvas/WebGL.

import { isValidId } from './ids.ts';
import { validFps, type Fps } from './time.ts';
import { REGISTRY, type EffectDefinition } from '../effects/registry.ts';
import {SHADER_MAP,shaderParamErrors,type ShaderParams} from '../effects/shaders/library.ts';
import {contourParamErrors} from '../effects/contours.ts';
import {validate3d,type ModelRef,type PartEdit,type CameraPose3d,type CameraKey3d} from './model3d.ts';

export type Vec2 = { x: number; y: number };

export type Transform = {
  x: number; y: number;              // смещение верхнего левого угла до поворота; pivot задаётся отдельно (px)
  rotation: number;                  // градусы, вокруг pivot
  scaleX: number; scaleY: number;    // > 0
  opacity: number;                   // 0..1
  pivotX: number; pivotY: number;    // точка внутри geometry (px, 0..width/height)
};

export type Geometry = { width: number; height: number };
export type TransformKey = {frame:number;transform:Transform;easing:'smooth'|'linear'|'hold'};

export type NodeKind = 'group' | 'text' | 'image' | 'shape' | 'scene3d';

export type NodeBase = {
  id: string;
  name: string;
  kind: NodeKind;
  parentId: string | null;
  sequenceId: string;
  transform: Transform;
  transformKeys?: TransformKey[];
  geometry: Geometry;
  visible: boolean;
  locked: boolean;
  metadata?: Record<string, string | number | boolean>;
};

export type TextNode = NodeBase & { kind: 'text'; text: string; fontFamily: string; fontSize: number; color: string; align: 'left' | 'center' | 'right'; lineHeight: number };
export type ImageNode = NodeBase & { kind: 'image'; assetId: string; fit: 'contain' | 'cover' | 'fill' };
export type ShapeNode = NodeBase & { kind: 'shape'; shape: 'rect' | 'ellipse'; fill: string; fillOpacity?: number; stroke?: string; strokeWidth?: number; generator?:{shaderId:string;params:ShaderParams;speed:number;hue:number} };
export type GroupNode = NodeBase & { kind: 'group' };
export type Scene3dNode = NodeBase & { kind: 'scene3d'; adapter: 'three'; preset: 'gear-cluster' | 'logo-monolith' | 'neon-reactor' | 'ribbon-tunnel' | 'anatomy-device' | 'imported-model'; spin: number; explode: number;model?:ModelRef;parts3d?:PartEdit[];camera3d?:CameraPose3d;camera3dKeys?:CameraKey3d[];cameraTargetPart?:string };

export type SceneNode = TextNode | ImageNode | ShapeNode | GroupNode | Scene3dNode;

export type AssetOrigin = 'photo' | 'diagram' | 'staged' | 'generated';
export type AssetRef = {
  id: string; path: string; mime: string; bytes: number; sha256: string;
  width?: number; height?: number; durationSeconds?: number;
  origin: AssetOrigin; title?: string;
};

export type SceneTransition={shaderId:string;durationFrames:number;params:ShaderParams};
export type Sequence = { id: string; name: string; fromFrame: number; toFrame: number;transition?:SceneTransition };

export type EffectInstance = {
  id: string;
  definitionId: string;
  definitionVersion: number;
  targetId: string;
  fromFrame: number;   // включительно
  toFrame: number;     // исключительно
  params: Record<string, number | boolean | string>;
  enabled: boolean;
  order: number;
};

export type CameraKey = { frame: number; cx: number; cy: number; zoom: number; rotation: number };
export type CameraTrack = { id:string;name:string;keys:CameraKey[];scope?:{sequenceId:string;fromFrame:number;toFrame:number};enabled?:boolean };
export type SynthAccent = {voice:'impact'|'chime'|'sweep';durationSeconds:number;pitch:number;seed:number};

export type AudioTrack = { id: string; kind: 'music' | 'voice' | 'sfx'; assetId: string | null; gain: number; offsetSeconds: number; mute: boolean; synth?:SynthAccent };
export type Cue = { id: string; trackId: string | null; frame: number; kind: 'beat' | 'bar' | 'accent' | 'drop' | 'phrase' | 'mark'; label: string };

export type Project = {
  schemaVersion: 2;
  id: string;
  revision: number;
  title: string;
  size: { width: number; height: number };
  fps: Fps;
  durationFrames: number;
  seed: number;
  assets: AssetRef[];
  sequences: Sequence[];
  nodes: SceneNode[];
  effects: EffectInstance[];
  cameraTracks: CameraTrack[];
  audioTracks: AudioTrack[];
  cues: Cue[];
};

export const CURRENT_SCHEMA_VERSION = 2;

/** Ошибка валидации с полным списком проблем (для отклонения пакета целиком). */
export class ValidationError extends Error {
  details: string[];
  constructor(details: string[]) {
    super('Проект не прошёл валидацию: ' + details.join('; '));
    this.name = 'ValidationError';
    this.details = details;
  }
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const TOP_KEYS = new Set(['schemaVersion','id','revision','title','size','fps','durationFrames','seed','assets','sequences','nodes','effects','cameraTracks','audioTracks','cues']);

function fin(v: unknown, min: number, max: number, what: string, errors: string[], integer = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
    errors.push(`${what}: ожидается ${integer ? 'целое ' : ''}число в [${min}, ${max}], получено ${String(v)}`);
    return NaN;
  }
  return v;
}

function str(v: unknown, maxLen: number, what: string, errors: string[]): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > maxLen) {
    errors.push(`${what}: ожидается строка 1..${maxLen} символов`);
    return '';
  }
  return v;
}

function checkUnknown(obj: Record<string, unknown>, allowed: Set<string>, what: string, errors: string[]): void {
  for (const k of Object.keys(obj)) if (!allowed.has(k)) errors.push(`${what}: неизвестное поле "${k}"`);
}

function validateTransform(t: unknown, what: string, errors: string[]): void {
  if (typeof t !== 'object' || t === null) { errors.push(`${what}.transform: ожидается объект`); return; }
  const o = t as Record<string, unknown>;
  checkUnknown(o, new Set(['x','y','rotation','scaleX','scaleY','opacity','pivotX','pivotY']), `${what}.transform`, errors);
  fin(o.x, -1e6, 1e6, `${what}.transform.x`, errors);
  fin(o.y, -1e6, 1e6, `${what}.transform.y`, errors);
  fin(o.rotation, -3600, 3600, `${what}.transform.rotation`, errors);
  fin(o.scaleX, 0.001, 1000, `${what}.transform.scaleX`, errors);
  fin(o.scaleY, 0.001, 1000, `${what}.transform.scaleY`, errors);
  fin(o.opacity, 0, 1, `${what}.transform.opacity`, errors);
  fin(o.pivotX, 0, 100000, `${what}.transform.pivotX`, errors);
  fin(o.pivotY, 0, 100000, `${what}.transform.pivotY`, errors);
}

const NODE_KIND_KEYS: Record<NodeKind, Set<string>> = {
  group: new Set(['kind']),
  text: new Set(['kind','text','fontFamily','fontSize','color','align','lineHeight']),
  image: new Set(['kind','assetId','fit']),
  shape: new Set(['kind','shape','fill','fillOpacity','stroke','strokeWidth','generator']),
  scene3d: new Set(['kind','adapter','preset','spin','explode','model','parts3d','camera3d','camera3dKeys','cameraTargetPart']),
};
const NODE_BASE_KEYS = new Set(['id','name','kind','parentId','sequenceId','transform','transformKeys','geometry','visible','locked','metadata']);

function validateNode(n: unknown, project: { durationFrames: number }, errors: string[]): void {
  if (typeof n !== 'object' || n === null) { errors.push('nodes: ожидается объект узла'); return; }
  const o = n as Record<string, unknown>;
  const id = str(o.id, 64, 'nodes.id', errors);
  if (id && !isValidId(id)) errors.push(`nodes.id "${id}": допустимы строчные латинские буквы, цифры и дефис`);
  str(o.name, 200, `nodes[${id}].name`, errors);
  const kind = o.kind as NodeKind;
  if (!NODE_KIND_KEYS[kind]) { errors.push(`nodes[${id}].kind: неизвестный тип "${String(o.kind)}"`); return; }
  checkUnknown(o, new Set([...NODE_BASE_KEYS, ...NODE_KIND_KEYS[kind]]), `nodes[${id}]`, errors);
  if (o.parentId !== null && typeof o.parentId !== 'string') errors.push(`nodes[${id}].parentId: null или id родителя`);
  str(o.sequenceId, 64, `nodes[${id}].sequenceId`, errors);
  validateTransform(o.transform, `nodes[${id}]`, errors);
  if(o.generator!==undefined){const g=o.generator as Record<string,unknown>;if(!g||typeof g!=='object'||Array.isArray(g))errors.push(`nodes[${id}].generator: ожидается объект`);else{checkUnknown(g,new Set(['shaderId','params','speed','hue']),`nodes[${id}].generator`,errors);const shader=SHADER_MAP.get(String(g.shaderId));if(shader?.kind!=='generator')errors.push(`nodes[${id}].generator: неизвестный генератор`);else errors.push(...shaderParamErrors(shader,g.params));fin(g.speed,0,4,`nodes[${id}].generator.speed`,errors);fin(g.hue,-360,360,`nodes[${id}].generator.hue`,errors);}}
  if(o.transformKeys!==undefined){if(!Array.isArray(o.transformKeys)||o.transformKeys.length>500)errors.push(`nodes[${id}].transformKeys: массив до 500 ключей`);else{const frames=new Set<number>();for(const [i,raw]of o.transformKeys.entries()){const what=`nodes[${id}].transformKeys[${i}]`;if(typeof raw!=='object'||raw===null||Array.isArray(raw)){errors.push(what+': ожидается ключ');continue;}const k=raw as Record<string,unknown>;checkUnknown(k,new Set(['frame','transform','easing']),what,errors);fin(k.frame,0,project.durationFrames-1,what+'.frame',errors,true);if(frames.has(k.frame as number))errors.push(what+': повтор кадра');frames.add(k.frame as number);if(!['smooth','linear','hold'].includes(String(k.easing)))errors.push(what+': smooth|linear|hold');validateTransform(k.transform,what,errors);}}}
  const g = o.geometry as Record<string, unknown> | undefined;
  if (typeof g !== 'object' || g === null) errors.push(`nodes[${id}].geometry: ожидается {width,height}`);
  else { fin(g.width, 1, 20000, `nodes[${id}].geometry.width`, errors); fin(g.height, 1, 20000, `nodes[${id}].geometry.height`, errors); }
  if (typeof o.visible !== 'boolean') errors.push(`nodes[${id}].visible: ожидается boolean`);
  if (typeof o.locked !== 'boolean') errors.push(`nodes[${id}].locked: ожидается boolean`);
  if (o.metadata !== undefined) {
    const m = o.metadata as Record<string, unknown>;
    if (typeof m !== 'object' || m === null) errors.push(`nodes[${id}].metadata: ожидается объект`);
    else for (const [k, v] of Object.entries(m))
      if (!['string','number','boolean'].includes(typeof v) || k.length > 100) errors.push(`nodes[${id}].metadata["${k}"]: только примитивы`);
  }
  if (kind === 'text') {
    str(o.text, 4000, `nodes[${id}].text`, errors);
    str(o.fontFamily, 200, `nodes[${id}].fontFamily`, errors);
    fin(o.fontSize, 6, 480, `nodes[${id}].fontSize`, errors);
    if (!HEX_COLOR.test(String(o.color))) errors.push(`nodes[${id}].color: формат #rrggbb`);
    if (!['left','center','right'].includes(String(o.align))) errors.push(`nodes[${id}].align: left|center|right`);
    fin(o.lineHeight, 0.5, 4, `nodes[${id}].lineHeight`, errors);
  }
  if (kind === 'image') {
    str(o.assetId, 64, `nodes[${id}].assetId`, errors);
    if (!['contain','cover','fill'].includes(String(o.fit))) errors.push(`nodes[${id}].fit: contain|cover|fill`);
  }
  if (kind === 'shape') {
    if (!['rect','ellipse'].includes(String(o.shape))) errors.push(`nodes[${id}].shape: rect|ellipse`);
    if (!HEX_COLOR.test(String(o.fill))) errors.push(`nodes[${id}].fill: формат #rrggbb`);
    if (o.fillOpacity !== undefined) fin(o.fillOpacity,0,1,`nodes[${id}].fillOpacity`,errors);
    if (o.stroke !== undefined && !HEX_COLOR.test(String(o.stroke))) errors.push(`nodes[${id}].stroke: формат #rrggbb`);
    if (o.strokeWidth !== undefined) fin(o.strokeWidth, 0, 200, `nodes[${id}].strokeWidth`, errors);
  }
  if (kind === 'scene3d') {
    if (o.adapter !== 'three') errors.push(`nodes[${id}].adapter: поддерживается "three"`);
    if (!['gear-cluster','logo-monolith','neon-reactor','ribbon-tunnel','anatomy-device','imported-model'].includes(String(o.preset))) errors.push(`nodes[${id}].preset: неизвестный пресет`);
    errors.push(...validate3d(o as unknown as Scene3dNode,project.durationFrames).map(e=>`nodes[${id}].${e}`));
    fin(o.spin, -100, 100, `nodes[${id}].spin`, errors);
    fin(o.explode, 0, 1, `nodes[${id}].explode`, errors);
  }
  void project;
}

/** Полная структурная валидация проекта. Бросает ValidationError.
 *  Обязательные коллекции должны присутствовать и быть массивами объектов;
 *  эффекты проверяются по реестру определений (без DOM-зависимостей). */
export function validateProject(input: unknown, registry: ReadonlyMap<string, EffectDefinition> = REGISTRY): Project {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) throw new ValidationError(['ожидается объект проекта']);
  const p = input as Record<string, unknown>;
  checkUnknown(p, TOP_KEYS, 'project', errors);
  if (p.schemaVersion !== CURRENT_SCHEMA_VERSION) errors.push(`schemaVersion: поддерживается только ${CURRENT_SCHEMA_VERSION}, получено ${String(p.schemaVersion)}`);
  str(p.id, 64, 'project.id', errors);
  fin(p.revision, 0, 1e9, 'project.revision', errors, true);
  str(p.title, 300, 'project.title', errors);
  const size = p.size as Record<string, unknown> | undefined;
  if (typeof size !== 'object' || size === null) errors.push('project.size: ожидается {width,height}');
  else { fin(size.width, 16, 16384, 'project.size.width', errors); fin(size.height, 16, 16384, 'project.size.height', errors); }
  let fps: Fps | null = null;
  try { fps = validFps(p.fps); } catch (e) { errors.push((e as Error).message); }
  const dur = fin(p.durationFrames, 1, 1_000_000, 'project.durationFrames', errors, true);
  fin(p.seed, 0, 1e12, 'project.seed', errors, true);

  const project = input as unknown as Project;
  const allIds = new Set<string>();
  const claim = (id: string, what: string) => { if (allIds.has(id)) errors.push(`дубль id "${id}" (${what})`); allIds.add(id); };

  // Обязательные коллекции: отсутствие поля, неверный тип и элементы-примитивы
  // дают ValidationError с точным путём — до любых обращений .map/.some.
  function requireArray(field: keyof Project): Array<Record<string, unknown>> {
    const value = p[field as string];
    if (!Array.isArray(value)) {
      errors.push(`project.${String(field)}: обязательное поле-массив отсутствует или не массив (${typeof value})`);
      return [];
    }
    value.forEach((el, i) => {
      if (typeof el !== 'object' || el === null || Array.isArray(el)) {
        errors.push(`project.${String(field)}[${String(i)}]: ожидается объект, получено ${el === null ? 'null' : typeof el}`);
      }
    });
    return value.filter((el): el is Record<string, unknown> => typeof el === 'object' && el !== null && !Array.isArray(el));
  }

  const assetsRaw = requireArray('assets');
  const sequencesRaw = requireArray('sequences');
  const nodesRaw = requireArray('nodes');
  const effectsRaw = requireArray('effects');
  const cameraRaw = requireArray('cameraTracks');
  const audioRaw = requireArray('audioTracks');
  const cuesRaw = requireArray('cues');
  if (errors.length > 0) {
    // Структурные проблемы коллекций: дальше идти нельзя — выходим с точным списком путей.
    throw new ValidationError(errors);
  }

  for (const ao of assetsRaw) {
    checkUnknown(ao, new Set(['id','path','mime','bytes','sha256','width','height','durationSeconds','origin','title']), `assets[${String(ao.id)}]`, errors);
    claim(str(ao.id, 64, 'assets.id', errors), 'asset');
    str(ao.path, 500, `assets[${String(ao.id)}].path`, errors);
    str(ao.mime, 100, `assets[${String(ao.id)}].mime`, errors);
    fin(ao.bytes, 0, 1e12, `assets[${String(ao.id)}].bytes`, errors);
    str(ao.sha256, 64, `assets[${String(ao.id)}].sha256`, errors);
    if (!['photo','diagram','staged','generated'].includes(String(ao.origin))) errors.push(`assets[${String(ao.id)}].origin: photo|diagram|staged|generated`);
  }
  const assetIds = new Set(assetsRaw.map(a => String(a.id)));

  for (const so of sequencesRaw) {
    checkUnknown(so, new Set(['id','name','fromFrame','toFrame','transition']), `sequences[${String(so.id)}]`, errors);
    claim(str(so.id, 64, 'sequences.id', errors), 'sequence');
    str(so.name, 200, `sequences[${String(so.id)}].name`, errors);
    const from = so.fromFrame, to = so.toFrame;
    if (!Number.isInteger(from) || !Number.isInteger(to) || (from as number) < 0 || (to as number) <= (from as number) || (to as number) > dur)
      errors.push(`sequences[${String(so.id)}]: требуется 0 ≤ fromFrame < toFrame ≤ ${String(dur)}`);
    if(so.transition!==undefined){const t=so.transition as Record<string,unknown>,what=`sequences[${String(so.id)}].transition`;if(!t||typeof t!=='object'||Array.isArray(t))errors.push(what+': ожидается объект');else{checkUnknown(t,new Set(['shaderId','durationFrames','params']),what,errors);const shader=SHADER_MAP.get(String(t.shaderId));if(shader?.kind!=='transition')errors.push(what+': неизвестный переход');else errors.push(...shaderParamErrors(shader,t.params));fin(t.durationFrames,2,600,what+'.durationFrames',errors,true);const prev=sequencesRaw.find(s=>s.toFrame===so.fromFrame);if(!prev)errors.push(what+': нужна соседняя предыдущая сцена');else if(typeof t.durationFrames==='number'&&t.durationFrames>2*Math.min(Number(so.toFrame)-Number(so.fromFrame),Number(prev.toFrame)-Number(prev.fromFrame)))errors.push(what+': длительность выходит за соседние сцены');}}
  }
  const windows=sequencesRaw.flatMap(s=>{const t=s.transition as SceneTransition|undefined;if(!t||!Number.isInteger(t.durationFrames))return[];const start=Number(s.fromFrame)-Math.floor(t.durationFrames/2);return[{start,end:start+t.durationFrames-1}];}).sort((a,b)=>a.start-b.start);for(let i=1;i<windows.length;i++)if(windows[i]!.start<=windows[i-1]!.end)errors.push('Переходы соседних сцен перекрываются.');
  const sequenceIds = new Set(sequencesRaw.map(s => String(s.id)));

  for (const no of nodesRaw) {
    validateNode(no, { durationFrames: dur }, errors);
    claim(str(no.id, 64, 'nodes.id', errors), 'node');
  }
  const nodesTyped = project.nodes;
  const nodeIds = new Set(nodesTyped.map(n => n.id));
  const nodeById = new Map(nodesTyped.map(n => [n.id, n]));

  for (const n of nodesTyped) {
    if (!sequenceIds.has(n.sequenceId)) errors.push(`nodes[${n.id}].sequenceId "${n.sequenceId}": последовательность не найдена`);
    if (n.parentId !== null && !nodeIds.has(n.parentId)) errors.push(`nodes[${n.id}].parentId "${n.parentId}": родитель не найден`);
    if (n.parentId === n.id) errors.push(`nodes[${n.id}]: родитель не может совпадать с самим узлом`);
    if (n.parentId !== null) {
      const parent = nodeById.get(n.parentId);
      if (parent && parent.kind !== 'group') errors.push(`nodes[${n.id}]: родитель ${parent.id} не является группой`);
      if (parent && parent.sequenceId !== n.sequenceId) errors.push(`nodes[${n.id}]: последовательность отличается от родительской ${parent.sequenceId}`);
    }
    if (n.kind === 'image' && !assetIds.has(n.assetId)) errors.push(`nodes[${n.id}].assetId "${n.assetId}": ассет не найден`);
    if(n.kind==='scene3d'&&n.model){const asset=assetsRaw.find(a=>a.id===n.model!.assetId);if(!asset||!['model/gltf-binary','model/gltf+json'].includes(String(asset.mime)))errors.push(`nodes[${n.id}].model: ресурс GLB/GLTF не найден`);}
    const sequence=project.sequences.find(s=>s.id===n.sequenceId);if(sequence&&Array.isArray(n.transformKeys))for(const k of n.transformKeys)if(k&&typeof k==='object'&&(k.frame<sequence.fromFrame||k.frame>=sequence.toFrame))errors.push(`nodes[${n.id}].transformKeys: кадр ${k.frame} вне сцены`);
  }
  // Циклы: подъём от каждого узла с ограничением глубины.
  for (const n of nodesTyped) {
    let cur: SceneNode | undefined = n, depth = 0;
    while (cur?.parentId !== null && cur !== undefined) {
      cur = nodeById.get(cur.parentId as string);
      if (++depth > nodesTyped.length) { errors.push(`nodes[${n.id}]: цикл вложенности`); break; }
      if (cur === n) { errors.push(`nodes[${n.id}]: цикл вложенности`); break; }
    }
  }

  for (const eo of effectsRaw) {
    const fxId = String(eo.id);
    checkUnknown(eo, new Set(['id','definitionId','definitionVersion','targetId','fromFrame','toFrame','params','enabled','order']), `effects[${fxId}]`, errors);
    claim(str(eo.id, 64, 'effects.id', errors), 'effect');
    str(eo.definitionId, 100, `effects[${fxId}].definitionId`, errors);
    fin(eo.definitionVersion, 1, 1e6, `effects[${fxId}].definitionVersion`, errors, true);
    if (!nodeIds.has(String(eo.targetId))) errors.push(`effects[${fxId}].targetId "${String(eo.targetId)}": объект не найден`);
    const from = eo.fromFrame, to = eo.toFrame;
    if (!Number.isInteger(from) || !Number.isInteger(to) || (from as number) < 0 || (to as number) <= (from as number) || (to as number) > dur)
      errors.push(`effects[${fxId}]: требуется 0 ≤ fromFrame < toFrame ≤ ${String(dur)}`);
    if (typeof eo.params !== 'object' || eo.params === null || Array.isArray(eo.params)) errors.push(`effects[${fxId}].params: ожидается объект`);
    else for (const v of Object.values(eo.params as Record<string, unknown>))
      if (!['number','boolean','string'].includes(typeof v)) errors.push(`effects[${fxId}].params: только примитивы`);
    if (typeof eo.enabled !== 'boolean') errors.push(`effects[${fxId}].enabled: boolean`);
    fin(eo.order, 0, 1e6, `effects[${fxId}].order`, errors, true);
    // Соответствие реестру определений: единая проверка для загрузки проекта,
    // addEffect/updateEffect и ИИ-транзакций. Неизвестный эффект не принимается.
    if(eo.definitionId==='fluid-ink'&&Number(to)-Number(from)>60*project.fps.num/project.fps.den)errors.push('Жидкие чернила: интервал ограничен60секундами.');
    if(['feedback-trail','feedback-smoke','comet-tails'].includes(String(eo.definitionId))&&Number(to)-Number(from)>60*project.fps.num/project.fps.den)errors.push('Накопление изображения: интервал ограничен 60 секундами.');
    const def = registry.get(String(eo.definitionId));
    if (!def) {
      errors.push(`effects[${fxId}].definitionId "${String(eo.definitionId)}": неизвестный эффект реестра`);
    } else {
      if (def.version !== eo.definitionVersion) errors.push(`effects[${fxId}].definitionVersion: реестр поддерживает ${String(def.version)}, получено ${String(eo.definitionVersion)}`);
      const target = nodeById.get(String(eo.targetId));
      if (target && !def.targets.includes(target.kind)) errors.push(`effects[${fxId}]: тип цели ${target.kind} не поддерживается эффектом ${def.id} (${def.targets.join('|')})`);
      const params = eo.params as Record<string, unknown> | undefined;
      if (params && typeof params === 'object' && !Array.isArray(params)) {
        errors.push(...contourParamErrors(def.id,params).map(message=>`effects[${fxId}]: ${message}`));
        const specNames = new Set(def.params.map(pp => pp.name));
        for (const k of Object.keys(params)) if (!specNames.has(k)) errors.push(`effects[${fxId}].params["${k}"]: параметра нет у эффекта ${def.id}`);
        for (const pp of def.params) {
          const v = params[pp.name];
          if (v === undefined) continue;
          if(pp.choices&&!pp.choices.some(c=>c.value===v))errors.push(`effects[${fxId}].params["${pp.name}"]: выбери значение из списка`);
          if (pp.type === 'number') {
            if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`effects[${fxId}].params["${pp.name}"]: ожидается конечное число`);
            else if (pp.min !== undefined && pp.max !== undefined && (v < pp.min || v > pp.max)) errors.push(`effects[${fxId}].params["${pp.name}"]: вне [${String(pp.min)}, ${String(pp.max)}]`);
          } else if (typeof v !== pp.type) {
            errors.push(`effects[${fxId}].params["${pp.name}"]: ожидается ${pp.type}`);
          }
        }
      }
    }
  }

  for(const node of nodesTyped){const feedback=effectsRaw.filter(e=>e.enabled&&e.targetId===node.id&&['feedback-trail','feedback-smoke','comet-tails'].includes(String(e.definitionId))).sort((a,b)=>Number(a.fromFrame)-Number(b.fromFrame));for(let i=1;i<feedback.length;i++)if(Number(feedback[i]!.fromFrame)<Number(feedback[i-1]!.toFrame))errors.push(`effects[${node.id}]: интервалы накопления изображения не должны пересекаться.`);}
  for(const node of nodesTyped){const morph=effectsRaw.filter(e=>e.enabled&&e.targetId===node.id&&e.definitionId==='contour-morph').sort((a,b)=>Number(a.fromFrame)-Number(b.fromFrame));for(let i=1;i<morph.length;i++)if(Number(morph[i]!.fromFrame)<Number(morph[i-1]!.toFrame))errors.push(`effects[${node.id}]: интервалы превращения контура не должны пересекаться.`);}

  for (const t of cameraRaw) {
    checkUnknown(t, new Set(['id','name','keys','scope','enabled']), `cameraTracks[${String(t.id)}]`, errors);
    claim(str(t.id, 64, 'cameraTracks.id', errors), 'cameraTrack');
    str(t.name, 200, `cameraTracks[${String(t.id)}].name`, errors);
    if(t.enabled!==undefined&&typeof t.enabled!=='boolean')errors.push('cameraTracks.enabled: boolean');
    if(t.scope!==undefined){const s=t.scope as Record<string,unknown>;
      if(!s||typeof s!=='object'||Array.isArray(s))errors.push('cameraTracks.scope: требуется интервал');
      else {checkUnknown(s,new Set(['sequenceId','fromFrame','toFrame']),'cameraTracks.scope',errors);const scene=project.sequences.find(q=>q.id===s.sequenceId);
        if(!scene||!Number.isInteger(s.fromFrame)||!Number.isInteger(s.toFrame)||Number(s.fromFrame)<scene.fromFrame||Number(s.toFrame)>scene.toFrame||Number(s.toFrame)<=Number(s.fromFrame))errors.push('cameraTracks.scope: интервал вне сцены');
        if(Array.isArray(t.keys)&&t.keys.some(k=>k&&typeof k==='object'&&((k as CameraKey).frame<Number(s.fromFrame)||(k as CameraKey).frame>=Number(s.toFrame))))errors.push('cameraTracks.scope: ключ вне интервала');
      }
    }
    if (!Array.isArray(t.keys)) { errors.push(`cameraTracks[${String(t.id)}].keys: ожидается массив`); continue; }
    const frames = new Set<number>();
    let ki = 0;
    for (const k of t.keys) {
      const label = `cameraTracks[${String(t.id)}].keys[${String(ki++)}]`;
      if (typeof k !== 'object' || k === null) { errors.push(`${label}: ожидается объект`); continue; }
      const ko = k as Record<string, unknown>;
      checkUnknown(ko, new Set(['frame','cx','cy','zoom','rotation']), label, errors);
      if (!Number.isInteger(ko.frame) || (ko.frame as number) < 0 || (ko.frame as number) >= dur) errors.push(`${label}.frame: кадр вне [0, ${String(dur - 1)}]`);
      if (frames.has(ko.frame as number)) errors.push(`cameraTracks[${String(t.id)}].keys: дубль кадра ${String(ko.frame)}`);
      frames.add(ko.frame as number);
      fin(ko.cx, -1e6, 1e6, `${label}.cx`, errors);
      fin(ko.cy, -1e6, 1e6, `${label}.cy`, errors);
      fin(ko.zoom, 0.05, 40, `${label}.zoom`, errors);
      fin(ko.rotation, -360, 360, `${label}.rotation`, errors);
    }
  }

  for (const t of audioRaw) {
    checkUnknown(t, new Set(['id','kind','assetId','gain','offsetSeconds','mute','synth']), `audioTracks[${String(t.id)}]`, errors);
    claim(str(t.id, 64, 'audioTracks.id', errors), 'audioTrack');
    if (!['music','voice','sfx'].includes(String(t.kind))) errors.push(`audioTracks[${String(t.id)}].kind: music|voice|sfx`);
    if (t.assetId !== null && !assetIds.has(String(t.assetId))) errors.push(`audioTracks[${String(t.id)}].assetId: ассет не найден`);
    if(t.synth!==undefined){const s=t.synth as Record<string,unknown>;
      if(!s||typeof s!=='object'||Array.isArray(s))errors.push('audioTracks.synth: требуется синтезатор');
      else{checkUnknown(s,new Set(['voice','durationSeconds','pitch','seed']),'audioTracks.synth',errors);if(!['impact','chime','sweep'].includes(String(s.voice)))errors.push('audioTracks.synth.voice: impact|chime|sweep');fin(s.durationSeconds,.05,4,'audioTracks.synth.durationSeconds',errors);fin(s.pitch,40,2000,'audioTracks.synth.pitch',errors);fin(s.seed,0,4294967295,'audioTracks.synth.seed',errors,true);}
      if(t.kind!=='sfx'||t.assetId!==null)errors.push('audioTracks.synth: только sfx без внешнего ресурса');
    }
    fin(t.gain, 0, 4, `audioTracks[${String(t.id)}].gain`, errors);
    fin(t.offsetSeconds, -3600, 3600, `audioTracks[${String(t.id)}].offsetSeconds`, errors);
    if (typeof t.mute !== 'boolean') errors.push(`audioTracks[${t.id}].mute: boolean`);
  }

  for (const c of cuesRaw) {
    checkUnknown(c, new Set(['id','trackId','frame','kind','label']), `cues[${String(c.id)}]`, errors);
    claim(str(c.id, 64, 'cues.id', errors), 'cue');
    if (!Number.isInteger(c.frame) || (c.frame as number) < 0 || (c.frame as number) >= dur) errors.push(`cues[${String(c.id)}].frame: кадр вне [0, ${String(dur - 1)}]`);
    if (!['beat','bar','accent','drop','phrase','mark'].includes(String(c.kind))) errors.push(`cues[${String(c.id)}].kind: недопустимый тип`);
    if(c.trackId!==null&&!audioRaw.some(t=>t.id===c.trackId))errors.push('cues.trackId: дорожка не найдена');
    str(c.label, 300, `cues[${String(c.id)}].label`, errors);
  }

  if (errors.length > 0) throw new ValidationError(errors);
  return project;
}

/** Поверхностная проверка того, что узел подходит под типы своей kind (для операций). */
export function nodeKindOf(n: SceneNode): NodeKind { return n.kind; }
