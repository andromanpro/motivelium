import {layerDescription,layerLockReason} from './layerLabels.ts';
import {ui,uiLabel} from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import type { Project, Scene3dNode, SceneNode } from '../../domain/schema.ts';
import { createLayer, PRESET_LABELS, type LayerKind } from '../../domain/layers.ts';
import { Icon } from './Icon.tsx';
export function LayerDialog({ project, frame, selectedId, onClose, onCreate, onImportModel }: {
    project: Project;
    frame: number;
    selectedId: string | null;
    onImportModel: () => void;
    onClose: () => void;
    onCreate: (node: SceneNode, revision: number) => Promise<boolean>;
}) {
    const ref = useRef<HTMLDialogElement | null>(null), [base, setBase] = useState(project), selected = project.nodes.find(n => n.id === selectedId), current = project.sequences.find(s => frame >= s.fromFrame && frame < s.toFrame) ?? project.sequences[0];
    const [kind, setKind] = useState<LayerKind>('text'), [sequenceId, setSequenceId] = useState(current?.id ?? ''), [parentId, setParentId] = useState<string | null>(selected?.kind === 'group' && selected.sequenceId === current?.id && !layerLockReason(project, selected.id) ? selected.id : null), [name, setName] = useState(''), [text, setText] = useState(ui("Новый текст")), [color, setColor] = useState('#72e4c3'), [assetId, setAssetId] = useState(project.assets.find(a => a.mime.startsWith('image/'))?.id ?? ''), [preset, setPreset] = useState<Scene3dNode['preset']>('neon-reactor'), [error, setError] = useState(''), [saving, setSaving] = useState(false);
    useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
    const stale = base.revision !== project.revision, images = base.assets.filter(a => a.mime.startsWith('image/')), groups = base.nodes.filter(n => n.kind === 'group' && n.sequenceId === sequenceId && !layerLockReason(base, n.id));
    async function submit(e: React.FormEvent) { e.preventDefault(); if (saving || stale)
        return; setSaving(true); setError(''); try {
        const node = createLayer(base, { kind, sequenceId, parentId, frame, name: name || ({ text: ui("Надпись"), rect: ui("Прямоугольник"), ellipse: ui("Круг"), group: ui("Новая группа"), scene3d: uiLabel(PRESET_LABELS[preset]), image: ui("Изображение") }[kind]), text, color, assetId, preset });
        if (await onCreate(node, base.revision))
            onClose();
        else
            setError(ui("Слой не сохранён. Проверь сообщение студии."));
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setSaving(false);
    } }
    return <dialog ref={ref} className="layer-dialog" aria-labelledby="layer-dialog-title" onCancel={e => { e.preventDefault(); if (!saving)
        onClose(); }}><form onSubmit={e => void submit(e)}><header><div><span className="eyebrow">{ui("НОВЫЙ СЛОЙ")}</span><h2 id="layer-dialog-title">{ui("Добавить слой")}</h2></div><button type="button" className="icon-button" aria-label={ui("Закрыть добавление слоя")} onClick={onClose} disabled={saving}><Icon name="close"/></button></header><div className="layer-dialog-body"><div className="layer-kind-options">{([['text', ui("Текст"), 'text'], ['rect', ui("Прямоугольник"), 'shape'], ['ellipse', ui("Круг"), 'circle'], ['group', ui("Группа"), 'group'], ['scene3d', '3D', 'cube'], ['image', ui("Изображение"), 'image']] as const).map(([value, label, icon]) => <button type="button" key={value} className={kind === value ? 'current' : ''} aria-pressed={kind === value} disabled={saving || value === 'image' && !images.length} title={value === 'image' && !images.length ? ui("В проекте пока нет изображений") : label} onClick={() => setKind(value)}><Icon name={icon} size={22}/>{label}</button>)}</div><button type="button" className="layer-import-model" aria-label={ui("Импортировать 3D-модель…")} onClick={onImportModel}><Icon name="cube" size={17}/>{ui("Импортировать 3D-модель…")}<small>GLB / GLTF</small></button>
 <label>{ui("Название")}<input aria-label={ui("Название нового слоя")} value={name} placeholder={ui("Необязательно")} onChange={e => setName(e.target.value)} maxLength={200}/></label>
 {kind === 'text' && <label>{ui("Текст")}<textarea aria-label={ui("Текст нового слоя")} value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={2000}/></label>}
 {['text', 'rect', 'ellipse'].includes(kind) && <label className="layer-color">{ui("Цвет")}<input type="color" aria-label={ui("Цвет нового слоя")} value={color} onChange={e => setColor(e.target.value)}/><span>{color}</span></label>}
 {kind === 'scene3d' && <label>{ui("Модель")}<select aria-label={ui("3D-модель нового слоя")} value={preset} onChange={e => setPreset(e.target.value as Scene3dNode['preset'])}>{Object.entries(PRESET_LABELS).filter(([id]) => id !== 'imported-model').map(([id, label]) => <option key={id} value={id}>{uiLabel(label)}</option>)}</select></label>}
 {kind === 'image' && <label>{ui("Изображение проекта")}<select aria-label={ui("Изображение нового слоя")} value={assetId} onChange={e => setAssetId(e.target.value)}>{images.map(a => <option key={a.id} value={a.id}>{a.title ?? a.path.split('/').at(-1)}</option>)}</select></label>}
 <div className="layer-placement"><label>{ui("Сцена")}<select aria-label={ui("Сцена нового слоя")} value={sequenceId} onChange={e => { setSequenceId(e.target.value); setParentId(null); }}>{base.sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>{ui("Расположение")}<select aria-label={ui("Группа нового слоя")} value={parentId ?? ''} onChange={e => setParentId(e.target.value || null)}><option value="">{ui("Отдельный слой")}</option>{groups.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label></div>
 {stale && <p className="field-warning">{ui("Проект изменился.") + " "}<button type="button" className="text-button" onClick={() => { setBase(project); if (!project.nodes.some(n => n.id === parentId))
        setParentId(null); if (!project.sequences.some(s => s.id === sequenceId))
        setSequenceId(project.sequences[0]?.id ?? ''); }}>{ui("Обновить контекст")}</button></p>}{error && <p className="field-warning" role="alert">{error}</p>}
 </div><footer><span>{ui("Слой появится в выбранной сцене. Можно отменить.")}</span><button className="primary" type="submit" disabled={saving || stale}>{saving ? ui("Добавляю…") : ui("Добавить слой")}<Icon name="plus" size={16}/></button></footer></form></dialog>;
}
