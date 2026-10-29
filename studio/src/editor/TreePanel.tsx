import {layerCount,sceneCount} from './localeFormat.ts';
import {layerDescription,layerLockReason} from './layerLabels.ts';
import {ui} from './i18n.ts';
import { Fragment, useEffect, useRef, useState } from 'react';
import { descriptors, partEdit } from '../../domain/model3d.ts';
import type { Project, SceneNode } from '../../domain/schema.ts';
import type { FrameState } from '../../render/evaluate.ts';
import type { AssetBitmaps, ThreeLayerRenderer } from '../../render/renderFrame.ts';
import { moveLayerOperation } from '../../domain/layers.ts';
import type { Operation } from '../../domain/operations.ts';
import { useLayerOrder } from './useLayerOrder.ts';
import { Icon } from './Icon.tsx';
import { api } from './api.ts';
import { LayerPreview } from './LayerPreview.tsx';
function Swatch({ node, project }: {
    node: SceneNode;
    project: Project;
}) { return <span className={'layer-swatch ' + node.kind} aria-hidden="true">{node.kind === 'shape' ? <i style={{ background: node.fill, opacity: node.fillOpacity ?? 1, borderRadius: node.shape === 'ellipse' ? '50%' : '3px', border: node.stroke ? `1px solid ${node.stroke}` : undefined }}/> : node.kind === 'text' ? <b style={{ color: node.color }}>{node.text.trim().slice(0, 2) || ui("Т")}</b> : node.kind === 'image' ? <img src={api.assetUrl(project.id, node.assetId)} alt=""/> : <Icon name={node.kind === 'group' ? 'group' : 'cube'} size={19}/>}</span>; }
export function TreePanel({ project, state, selectedId, partId, onPartSelect, bitmaps, threeLayer, playing, busy, onSelect, onHover, onAdd, onDelete, onAction, onLocate, onClose, onOrderingChange }: {
    partId?: string | null;
    onPartSelect?: (nodeId: string, partId: string) => void;
    project: Project;
    state: FrameState | null;
    selectedId: string | null;
    bitmaps: AssetBitmaps;
    threeLayer?: ThreeLayerRenderer;
    playing: boolean;
    busy: boolean;
    onSelect: (id: string) => void;
    onHover: (id: string | null) => void;
    onAdd: () => void;
    onDelete: () => void;
    onAction: (description: string, ops: Operation[], revision?: number) => void;
    onOrderingChange: (value: boolean) => void;
    onLocate: () => void;
    onClose: () => void;
}) {
    const [allScenes, setAllScenes] = useState(false), [query, setQuery] = useState(''), list = useRef<HTMLDivElement | null>(null);
    const order = useLayerOrder(project, busy, list, onAction, onOrderingChange);
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(project.nodes.filter(n => n.kind === 'group' || n.kind === 'scene3d').map(n => n.id)));
    useEffect(() => { setCollapsed(new Set(project.nodes.filter(n => n.kind === 'group' || n.kind === 'scene3d').map(n => n.id))); }, [project.id]);
    useEffect(() => { if (!selectedId)
        return; const ancestors: string[] = []; let node = project.nodes.find(n => n.id === selectedId); while (node?.parentId) {
        ancestors.push(node.parentId);
        node = project.nodes.find(n => n.id === node!.parentId);
    } if (ancestors.length)
        setCollapsed(p => new Set([...p].filter(id => !ancestors.includes(id)))); }, [selectedId, project.id]);
    useEffect(() => { list.current?.querySelector('[aria-pressed="true"][data-node-id]')?.scrollIntoView({ block: 'nearest' }); }, [selectedId, collapsed]);
    useEffect(() => () => onHover(null), []);
    useEffect(() => { if (partId && selectedId)
        setCollapsed(p => new Set([...p].filter(id => id !== selectedId))); }, [selectedId, partId]);
    useEffect(() => { if (partId)
        list.current?.querySelector('.tree-part-row.current')?.scrollIntoView({ block: 'nearest' }); }, [selectedId, partId, collapsed]);
    const selected = project.nodes.find(n => n.id === selectedId), visible = project.nodes.filter(n => allScenes || n.sequenceId === state?.sequence?.id), filter = query.trim().toLowerCase(), matched = new Set(visible.filter(n => !filter || (n.name + ' ' + layerDescription(project, n)).toLowerCase().includes(filter)).map(n => n.id));
    for (const id of [...matched]) {
        let n = project.nodes.find(n => n.id === id);
        while (n?.parentId) {
            matched.add(n.parentId);
            n = project.nodes.find(p => p.id === n!.parentId);
        }
    }
    const rows: Array<{
        node: SceneNode;
        depth: number;
    }> = [];
    const walk = (parent: string | null, depth: number) => { for (const n of visible.filter(n => n.parentId === parent).reverse()) {
        if (!matched.has(n.id))
            continue;
        rows.push({ node: n, depth });
        if (filter || !collapsed.has(n.id))
            walk(n.id, depth + 1);
    } };
    walk(null, 0);
    const reason = selected ? layerLockReason(project, selected.id) : '', front = selected && !reason ? moveLayerOperation(project, selected.id, 'front') : [], back = selected && !reason ? moveLayerOperation(project, selected.id, 'back') : [];
    function toggle(id: string) { setCollapsed(p => { const next = new Set(p); if (next.has(id))
        next.delete(id);
    else
        next.add(id); return next; }); }
    return <aside className="tree" aria-label={ui("Панель слоёв")}><div className="panel-title"><span>{ui("Слои")}</span><button className="icon-button panel-close" onClick={onClose} aria-label={ui("Закрыть список объектов")}><Icon name="close" size={15}/></button></div>
 <div className="layer-toolbar"><button className="primary" aria-label={ui("Добавить новый слой")} disabled={busy} onClick={onAdd}><Icon name="plus" size={15}/>{ui("Добавить")}</button><button className="icon-button layer-delete" aria-label={ui("Удалить выбранный слой")} title={reason || ui("Удалить выбранный слой · можно отменить")} disabled={busy || !selected || !!reason} onClick={onDelete}><Icon name="trash" size={17}/></button></div>
 <div className="tree-context"><span className="live-dot"/>{state?.sequence?.name ?? ui("Вне сцены")}<small>{visible.length}</small></div>
 <div className="tree-filter" aria-label={ui("Фильтр объектов")}><button className={!allScenes ? 'current' : ''} onClick={() => setAllScenes(false)}>{ui("В этой сцене")}</button><button className={allScenes ? 'current' : ''} onClick={() => setAllScenes(true)}>{ui("Все")}</button></div>
 <label className="layer-search"><Icon name="search" size={13}/><input type="search" aria-label={ui("Поиск слоёв")} placeholder={ui("Имя или содержимое")} value={query} onChange={e => setQuery(e.target.value)}/></label><small className="layer-order-note">{order.view ? ui("Отпусти на линии · Esc — отменить") : ui("Сверху — передний план · ⋮⋮ — перетащить")}</small>
 <div className="tree-list" ref={list}>{rows.map(({ node, depth }) => {
            const inherited = layerLockReason(project, node.id, false), hidden = state?.hiddenNodeIds.includes(node.id);
            return <Fragment key={node.id}><div data-layer-row={node.id} className={'tree-row ' + (selectedId === node.id ? 'selected-row ' : '') + (order.view?.id === node.id ? 'order-source ' : '') + (order.view?.target?.id === node.id ? 'drop-' + order.view.target.edge : '')} key={node.id} style={{ paddingLeft: Math.min(depth, 5) * 12 }} onMouseEnter={() => onHover(node.id)} onMouseLeave={() => onHover(null)}>
 <button className="layer-drag-grip" aria-label={ui("Перетащить слой") + " " + node.name} title={ui("Перетащи, чтобы изменить порядок")} disabled={busy || !!layerLockReason(project, node.id)} {...order.events(node)}>⠿</button>
 {node.kind === 'group' || node.kind === 'scene3d' ? <button className={'group-toggle ' + (!collapsed.has(node.id) ? 'expanded' : '')} onClick={() => toggle(node.id)} aria-label={(collapsed.has(node.id) ? ui("Развернуть") + " " : ui("Свернуть") + " ") + node.name} aria-expanded={!collapsed.has(node.id)}>›</button> : <span className="group-toggle-spacer"/>}
 <button disabled={!!order.view} className={'tree-node ' + (selectedId === node.id ? 'selected ' : '') + (hidden ? 'dim' : '')} onClick={() => onSelect(node.id)} data-node-id={node.id} aria-pressed={selectedId === node.id} title={node.name + ' — ' + layerDescription(project, node)}><Swatch node={node} project={project}/><span className="layer-row-copy"><strong>{node.name}</strong><small>{allScenes ? project.sequences.find(s => s.id === node.sequenceId)?.name + ' · ' : ''}{layerDescription(project, node)}</small></span></button>
 <button className="layer-row-control" aria-label={(node.visible ? ui("Скрыть слой") + " " : ui("Показать слой") + " ") + node.name} title={node.visible ? ui("Скрыть слой") : ui("Показать слой")} disabled={busy || !!layerLockReason(project, node.id)} aria-pressed={!node.visible} onClick={() => onAction(node.visible ? ui("Скрыть слой") : ui("Показать слой"), [{ op: 'updateNode', targetId: node.id, values: { visible: !node.visible } }])}><Icon name={node.visible ? 'eye' : 'eye-off'} size={14}/></button>
 <button className="layer-row-control" aria-label={(node.locked ? ui("Разблокировать слой") + " " : ui("Заблокировать слой") + " ") + node.name} title={inherited || ui("Блокировка слоя")} disabled={busy || !!inherited} aria-pressed={node.locked} onClick={() => onAction(node.locked ? ui("Разблокировать слой") : ui("Заблокировать слой"), [{ op: 'updateNode', targetId: node.id, values: { locked: !node.locked } }])}><Icon name={node.locked || inherited ? 'lock' : 'unlock'} size={13}/></button>
 </div>{node.kind === 'scene3d' && !collapsed.has(node.id) && descriptors(node).map(p => { const value = partEdit(node, p.id); let level = 1, parent = p.parentId; while (parent && level < 16) {
                level++;
                parent = descriptors(node).find(x => x.id === parent)?.parentId ?? null;
            } return <div key={p.id} className={'tree-part-row ' + (selectedId === node.id && partId === p.id ? 'current' : '')} style={{ paddingLeft: 22 + Math.min(depth + level, 8) * 12 }}><button aria-label={ui("Выбрать деталь") + " " + value.name} aria-pressed={selectedId === node.id && partId === p.id} disabled={busy} onClick={() => onPartSelect?.(node.id, p.id)}><Icon name={value.visible ? 'cube' : 'eye-off'} size={13}/><span>{value.name}</span>{value.keys?.length ? <small>◆</small> : null}</button><button className="layer-row-control" aria-label={(value.visible ? ui("Скрыть деталь") + " " : ui("Показать деталь") + " ") + value.name} disabled={busy || !!layerLockReason(project, node.id)} onClick={() => onAction(ui("Видимость детали"), [{ op: 'updatePart3d', targetId: node.id, partId: p.id, values: { visible: !value.visible } }])}><Icon name={value.visible ? 'eye' : 'eye-off'} size={12}/></button></div>; })}</Fragment>;
        })}{!rows.length && <p className="tree-empty">{filter ? ui("Не найдено.") : ui("В этой сцене пока нет слоёв.")}</p>}</div>
 <div className="tree-bottom">{selected ? <><div className="layer-selected-heading"><strong title={selected.name}>{selected.name}</strong><button className="text-button" aria-label={ui("Показать выбранный слой в кадре")} onClick={onLocate}><Icon name="target" size={14}/>{ui("Найти")}</button></div>{state && <LayerPreview project={project} node={selected} state={state} bitmaps={bitmaps} threeLayer={threeLayer} playing={playing}/>}<div className="layer-stack-actions"><button className="text-button" aria-label={ui("Поднять выбранный слой")} disabled={busy || !front.length} onClick={() => onAction(ui("Поднять слой"), front)}><Icon name="up" size={14}/>{ui("Выше")}</button><button className="text-button" aria-label={ui("Опустить выбранный слой")} disabled={busy || !back.length} onClick={() => onAction(ui("Опустить слой"), back)}><Icon name="down" size={14}/>{ui("Ниже")}</button></div>{reason && <small className="layer-lock-note">{reason}</small>}</> : <p>{ui("Выбери слой в списке или в кадре. Наведение подсветит его границы.")}</p>}<small className="layer-project-count">{layerCount(project.nodes.length)} · {sceneCount(project.sequences.length)}</small></div>
 {order.view && <div className={"layer-drag-ghost " + (!order.view.target ? "invalid" : "")} style={{ left: Math.min(window.innerWidth - 190, Math.max(8, order.view.x + 14)), top: Math.max(8, Math.min(window.innerHeight - 60, order.view.y + 12)) }} aria-live="polite"><b>{order.view.name}</b><small>{order.view.target ? ui("Новый порядок на линии") : ui("Между слоями одной группы и сцены")}</small></div>}
 </aside>;
}
