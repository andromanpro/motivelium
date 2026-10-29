import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui, uiLabel } from './i18n.ts';
import { StoryMontagePreview } from './StoryMontagePreview.tsx';
import { useEffect, useRef, useState } from 'react';
import type { Project, AssetRef } from '../../domain/schema.ts';
import type { Operation } from '../../domain/operations.ts';
import { newStoryCard, storyFrame, storyLink, storySignature, type StoryCard } from '../../domain/storyboard.ts';
import { newId } from '../../domain/ids.ts';
import { evaluateFrame } from '../../render/evaluate.ts';
import { renderFrame, type AssetBitmaps, type ThreeLayerRenderer } from '../../render/renderFrame.ts';
import { FrameCanvas } from './PreviewCanvas.tsx';
import { prepareMedia } from './mediaImport.ts';
import { api } from './api.ts';
import { Icon } from './Icon.tsx';
type Props = {
    project: Project;
    token: string;
    currentFrame: number;
    bitmaps: AssetBitmaps;
    threeLayer?: ThreeLayerRenderer;
    canUndo: boolean;
    canRedo: boolean;
    busy: boolean;
    onDirty: (v: boolean) => void;
    onApply: (description: string, ops: Operation[], revision: number) => Promise<boolean>;
    onHistory: (kind: 'undo' | 'redo') => Promise<void>;
    onMontage: (card: StoryCard) => void;
    onClose: () => void;
};
const statusLabels = { draft: 'Черновик', review: 'На просмотр', selected: 'Выбран' };
const notes = [['description', 'Что показываем'], ['camera', 'Камера и движение'], ['transition', 'Переход'], ['sound', 'Музыка и звук'], ['sources', 'Материалы и источники']] as const;
export function Storyboard({ project, token, currentFrame, bitmaps, threeLayer, canUndo, canRedo, busy, onDirty, onApply, onHistory, onMontage, onClose }: Props) {
    const dialog = useRef<HTMLDialogElement | null>(null), detail = useRef<HTMLElement | null>(null), upload = useRef<HTMLInputElement | null>(null), cards = project.storyboard?.cards ?? [];
    const [selectedId, setSelectedId] = useState<string | null>(cards[0]?.id ?? null), [draft, setDraft] = useState<StoryCard | null>(cards[0] ? structuredClone(cards[0]) : null), [synopsis, setSynopsis] = useState(project.storyboard?.synopsis ?? ''), [baseRevision, setBaseRevision] = useState(project.revision), [editing, setEditing] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState(''), [comment, setComment] = useState(''), [compare, setCompare] = useState(false), [pending, setPending] = useState<AssetRef | null>(null), [localURL, setLocalURL] = useState(''), [previewFrame, setPreviewFrame] = useState(currentFrame);
    const [montage, setMontage] = useState(false);
    const dirty = editing || !!comment.trim(), stale = dirty && baseRevision !== project.revision, disabled = working || busy;
    const linked = project.sequences.find(s => s.id === draft?.sequenceId), imageAsset = project.assets.find(a => a.id === draft?.image?.assetId), imageURL = localURL || (imageAsset ? api.assetUrl(project.id, imageAsset.id) : ''), link = draft ? storyLink(project, draft) : null;
    useEffect(() => { dialog.current?.showModal(); }, []);
    useEffect(() => { detail.current?.scrollTo({ top: 0 }); }, [selectedId]);
    useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
    useEffect(() => () => {
        if (localURL)
            URL.revokeObjectURL(localURL);
    }, [localURL]);
    useEffect(() => {
        if (dirty || working)
            return;
        const c = cards.find(c => c.id === selectedId) ?? cards[0] ?? null;
        setSelectedId(c?.id ?? null);
        setDraft(c ? structuredClone(c) : null);
        setSynopsis(project.storyboard?.synopsis ?? '');
        setBaseRevision(project.revision);
        setPreviewFrame(c ? storyFrame(project, c) ?? currentFrame : currentFrame);
        setPending(null);
        setLocalURL('');
    }, [project, selectedId, dirty, working]);
    const leave = () => {
        if (disabled)
            return;
        if (dirty) {
            setError(ui("Сохраните или сбросьте черновик перед закрытием."));
            return;
        }
        onClose();
    };
    const change = (values: Partial<StoryCard>) => {
        if (!draft)
            return;
        setDraft({ ...draft, ...values });
        setEditing(true);
        setError('');
    };
    function pick(id: string) {
        if (dirty) {
            setError(ui("Сохраните или сбросьте черновик перед выбором другого кадра."));
            return;
        }
        setSelectedId(id);
        setCompare(false);
        setError('');
    }
    function reset() { setEditing(false); setComment(''); setPending(null); setLocalURL(''); setError(''); setBaseRevision(project.revision); const c = cards.find(c => c.id === selectedId) ?? cards[0] ?? null; setSelectedId(c?.id ?? null); setDraft(c ? structuredClone(c) : null); setSynopsis(project.storyboard?.synopsis ?? ''); }
    async function apply(description: string, ops: Operation[]) {
        setWorking(true);
        setError('');
        try {
            const ok = await onApply(description, ops, baseRevision);
            if (!ok)
                setError(ui("Не удалось сохранить. Проверьте сообщение студии; черновик оставлен на экране."));
            return ok;
        }
        finally {
            setWorking(false);
        }
    }
    async function save() {
        const ops: Operation[] = [];
        if (synopsis !== (project.storyboard?.synopsis ?? ''))
            ops.push({ op: 'setStorySynopsis', text: synopsis });
        if (pending && !project.assets.some(a => a.id === pending.id))
            ops.push({ op: 'addAsset', asset: pending });
        if (draft) {
            const c = structuredClone(draft);
            if (comment.trim())
                c.comments.push({ id: newId('remark'), text: comment.trim(), resolved: false });
            ops.push({ op: 'upsertStoryCard', card: c });
        }
        if (!ops.length) {
            setEditing(false);
            return;
        }
        if (await apply(ui("Сохранить раскадровку"), ops)) {
            setComment('');
            setEditing(false);
            setPending(null);
            setLocalURL('');
        }
    }
    async function act(description: string, ops: Operation[]) {
        if (dirty) {
            setError(ui("Сначала сохраните или сбросьте черновик."));
            return;
        }
        await apply(description, ops);
    }
    function add() {
        if (dirty) {
            setError(ui("Сначала сохраните или сбросьте черновик."));
            return;
        }
        if (cards.length >= 100) {
            setError(ui("В раскадровке уже 100 кадров."));
            return;
        }
        const c = newStoryCard(newId('shot'), ui("Новый кадр"), Math.round(3 * project.fps.num / project.fps.den));
        setSelectedId(c.id);
        setDraft(c);
        setEditing(true);
        setComment('');
        setCompare(false);
        setError('');
    }
    async function fromScenes() {
        const missing = project.sequences.filter(s => !cards.some(c => c.sequenceId === s.id));
        if (!missing.length) {
            setError(ui("Для всех сцен уже есть карточки."));
            return;
        }
        const ops = missing.map(s => ({ op: 'upsertStoryCard' as const, card: { ...newStoryCard(newId('shot'), s.name, s.toFrame - s.fromFrame), sequenceId: s.id } }));
        await act(ui("Создать раскадровку из сцен"), ops);
    }
    async function image(file: File, origin: 'concept' | 'render', signature?: string) {
        setWorking(true);
        setError('');
        try {
            const asset = await prepareMedia(project.id, token, file, baseRevision, 'image');
            setPending(asset);
            setLocalURL(URL.createObjectURL(file));
            change({ image: { assetId: asset.id, origin, ...(origin === 'render' ? { frame: previewFrame, signature } : {}) } });
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setWorking(false);
        }
    }
    async function capture() {
        if (!draft || !linked)
            return;
        setWorking(true);
        setError('');
        try {
            const snapshot = structuredClone(project);
            await threeLayer?.prepare?.(snapshot);
            if (snapshot.nodes.some(n => n.sequenceId === linked.id && n.kind === 'scene3d') && !threeLayer)
                throw Error(ui("Дождитесь готовности 3D"));
            const canvas = document.createElement('canvas');
            canvas.width = snapshot.size.width;
            canvas.height = snapshot.size.height;
            const ctx = canvas.getContext('2d');
            if (!ctx)
                throw Error(ui("Canvas недоступен"));
            const result = renderFrame(evaluateFrame(snapshot, previewFrame), { ctx, project: snapshot, bitmaps, threeLayer });
            if (result.missingAssets.length)
                throw Error(ui("Изображения ещё загружаются"));
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error(ui("Не удалось сохранить кадр"))), 'image/png'));
            await image(new File([blob], ui("Кадр-") + previewFrame + '.png', { type: 'image/png' }), 'render', storySignature(snapshot, linked.id, previewFrame));
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setWorking(false);
        }
    }
    function downloadDraft() { const blob = new Blob([JSON.stringify({ baseRevision, synopsis, card: draft, pendingAsset: pending, comment }, null, 2)], { type: 'application/json' }), u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = ui("Раскадровка-черновик.json"); a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
    const visibleCards = draft && !cards.some(c => c.id === draft.id) ? [...cards, draft] : cards, chosenIndex = cards.findIndex(c => c.id === selectedId), fps = project.fps.num / project.fps.den;
    return <><dialog className="storyboard-dialog" ref={dialog} aria-label={ui("Раскадровка проекта")} onCancel={e => { e.preventDefault(); leave(); }} onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
                e.preventDefault();
                if (!dirty && !disabled)
                    void onHistory(e.shiftKey ? 'redo' : 'undo');
            }
        }}>
  <header className="story-head"><div><small>{ui("ЗАМЫСЕЛ / КАДРЫ / МОНТАЖ")}</small><h2>{ui("Раскадровка") + " "}<span>{cards.length}</span></h2></div><div className="story-head-actions"><button className="secondary" disabled={disabled || dirty || !cards.length} onClick={() => setMontage(true)}>{ui("Собрать монтаж…")}</button><button className="icon-button" aria-label={ui("Отменить в раскадровке")} disabled={disabled || dirty || !canUndo} onClick={() => void onHistory('undo')}><Icon name="undo"/></button><button className="icon-button" aria-label={ui("Повторить в раскадровке")} disabled={disabled || dirty || !canRedo} onClick={() => void onHistory('redo')}><Icon name="redo"/></button><button className="text-button" disabled={disabled || dirty} onClick={() => void fromScenes()}>{ui("Из сцен монтажа")}</button><button className="primary-button" disabled={disabled || dirty || cards.length >= 100} onClick={add}><Icon name="plus" size={16}/>{ui("Добавить кадр")}</button><button className="icon-button" aria-label={ui("Закрыть раскадровку")} onClick={leave} disabled={disabled}><Icon name="close"/></button></div></header>
  <div className="story-body"><aside className="story-rail" aria-label={ui("Кадры раскадровки")}>{!visibleCards.length && <p className="story-empty-rail">{ui("Начните с первого кадра или возьмите сцены существующего монтажа.")}</p>}{visibleCards.map((c, i) => { const a = project.assets.find(a => a.id === c.image?.assetId), state = storyLink(project, c); return <button key={c.id} className={'story-card ' + (selectedId === c.id ? 'current' : '')} onClick={() => pick(c.id)} disabled={disabled} data-shot-id={c.id}><div className="story-thumb">{a ? <img src={api.assetUrl(project.id, a.id)} alt="" loading="lazy"/> : <span><Icon name="image" size={28}/>{c.image ? ui("Новый эскиз") : ui("Кадр ещё не выбран")}</span>}<b>{String(i + 1).padStart(2, '0')}</b></div><strong>{c.title}</strong><div className="story-card-meta"><span>{uiLabel(statusLabels[c.status])}</span><span>{(c.durationFrames / fps).toFixed(1)}{" " + ui("с")}</span></div>{['missing', 'changed'].includes(state.state) && <small className="story-changed">{state.label}</small>}</button>; })}</aside>
   <main className="story-detail" ref={detail}><label className="story-synopsis">{ui("Общий замысел")}<textarea aria-label={ui("Общий замысел")} value={synopsis} maxLength={4000} rows={2} disabled={disabled} placeholder={ui("О чём ролик, для кого и что должно остаться после просмотра")} onChange={e => { setSynopsis(e.target.value); setEditing(true); }}/></label>
    {stale && <div className="story-warning" role="alert">{ui("Проект изменился после начала правки. Черновик сохранён на экране. Скачайте его или сбросьте, чтобы прочитать новую ревизию.") + " "}<button className="text-button" onClick={downloadDraft}>{ui("Скачать черновик")}</button></div>}
    {error && <div className="story-warning" role="alert"><DiagnosticText message={error}/></div>}
    {!draft ? <div className="story-empty"><Icon name="image" size={48}/><h3>{ui("С чего начнётся ролик?")}</h3><p>{ui("Опишите первый кадр, добавьте эскиз и движение камеры.")}<br />{ui("Монтаж можно собрать позже.")}</p><button className="primary-button" disabled={disabled || dirty} onClick={add}>{ui("Добавить первый кадр")}</button></div> : <>
     <div className="story-title-row"><label>{ui("Название кадра")}<input aria-label={ui("Название кадра")} maxLength={200} value={draft.title} disabled={disabled} onChange={e => change({ title: e.target.value })}/></label><label>{ui("Состояние")}<select aria-label={ui("Состояние кадра")} value={draft.status} disabled={disabled} onChange={e => change({ status: e.target.value as StoryCard['status'] })}>{Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>{ui("Длительность, с")}<input aria-label={ui("Длительность кадра в секундах")} type="number" min={1 / fps} max={1000000 / fps} step={1 / fps} value={Number((draft.durationFrames / fps).toFixed(3))} disabled={disabled} onChange={e => change({ durationFrames: Math.max(1, Math.round(Number(e.target.value) * fps)) })}/></label></div>
     <div className={'story-image-grid ' + (compare && linked ? 'split' : '')}><figure><div className="story-figure-caption">{draft.image?.origin === 'render' ? ui("СОХРАНЁННЫЙ КАДР МОНТАЖА") : ui("КЛЮЧЕВОЙ КАДР")}{draft.image?.origin === 'render' && <span>№ {draft.image.frame}</span>}</div>{imageURL ? <img className="story-main-image" src={imageURL} alt={ui("Ключевой кадр:") + " " + draft.title} style={{ aspectRatio: project.size.width / project.size.height }}/> : <div className="story-image-placeholder" style={{ aspectRatio: project.size.width / project.size.height }}><Icon name="image" size={36}/><span>{ui("Загрузите эскиз или сохраните кадр монтажа")}</span></div>}</figure>{compare && linked && <figure><div className="story-figure-caption">{ui("СЕЙЧАС В МОНТАЖЕ")}<span>№ {previewFrame}</span></div><FrameCanvas project={project} frame={previewFrame} bitmaps={bitmaps} threeLayer={threeLayer} label={ui("Текущий кадр монтажа для раскадровки")}/></figure>}</div>
     <div className="story-image-actions"><button className="text-button" disabled={disabled || stale} onClick={() => upload.current?.click()}><Icon name="image" size={15}/>{ui("Загрузить эскиз")}</button><input type="file" ref={upload} hidden accept="image/png,image/jpeg,image/webp" onChange={e => {
                const f = e.target.files?.[0];
                if (f)
                    void image(f, 'concept');
                e.target.value = '';
            }}/><select aria-label={ui("Изображение проекта для кадра")} disabled={disabled} value={imageAsset?.id ?? ''} onChange={e => { setPending(null); setLocalURL(''); change({ image: e.target.value ? { assetId: e.target.value, origin: 'concept' } : null }); }}><option value="">{ui("Изображение проекта…")}</option>{project.assets.filter(a => a.mime.startsWith('image/')).map(a => <option key={a.id} value={a.id}>{a.title ?? a.id}</option>)}</select>{draft.image && <button className="text-button" disabled={disabled} onClick={() => { setPending(null); setLocalURL(''); change({ image: null }); }}>{ui("Убрать изображение")}</button>}{linked && <button className="text-button" aria-pressed={compare} onClick={() => setCompare(v => !v)} disabled={disabled}>{compare ? ui("Скрыть монтаж") : ui("Сравнить с монтажом")}</button>}</div>
     <section className="story-link-panel"><div><strong>{ui("Связь с монтажом")}</strong><span className={'story-link-state ' + link?.state}>{link?.label}</span></div><label>{ui("Сцена")}<select aria-label={ui("Сцена монтажа")} disabled={disabled} value={draft.sequenceId ?? ''} onChange={e => {
                const id = e.target.value, s = project.sequences.find(s => s.id === id);
                change({ sequenceId: id || null, nodeIds: [] });
                if (s)
                    setPreviewFrame(Math.floor((s.fromFrame + s.toFrame) / 2));
            }}><option value="">{ui("Пока без сцены")}</option>{draft.sequenceId && !linked && <option value={draft.sequenceId}>{ui("Удалённая сцена:") + " "}{draft.sequenceId}</option>}{project.sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{linked && <><label>{ui("Кадр монтажа")}<input aria-label={ui("Кадр монтажа для раскадровки")} type="number" min={linked.fromFrame} max={linked.toFrame - 1} value={previewFrame} disabled={disabled} onChange={e => setPreviewFrame(Math.min(linked.toFrame - 1, Math.max(linked.fromFrame, Math.round(Number(e.target.value)))))}/></label><button className="text-button" disabled={disabled || stale} onClick={() => void capture()}>{ui("Сохранить снимок монтажа")}</button><button className="text-button" disabled={disabled || dirty} onClick={() => onMontage(draft)}>{ui("В монтаж") + " "}<Icon name="arrow" size={14}/></button></>}</section>
     {linked && <details className="story-objects"><summary>{ui("Связанные объекты ·") + " "}{draft.nodeIds.length}</summary><div>{project.nodes.filter(n => n.sequenceId === linked.id).map(n => <label key={n.id}><input type="checkbox" disabled={disabled || (!draft.nodeIds.includes(n.id) && draft.nodeIds.length >= 30)} checked={draft.nodeIds.includes(n.id)} onChange={e => change({ nodeIds: e.target.checked ? [...draft.nodeIds, n.id] : draft.nodeIds.filter(id => id !== n.id) })}/>{n.name}</label>)}{draft.nodeIds.filter(id => !project.nodes.some(n => n.id === id && n.sequenceId === linked.id)).map(id => <label key={id}><input type="checkbox" checked disabled={disabled} onChange={() => change({ nodeIds: draft.nodeIds.filter(v => v !== id) })}/>{ui("Удалён:") + " "}{id}</label>)}</div></details>}
     <div className="story-notes">{notes.map(([key, label]) => <label key={key}>{uiLabel(label)}<textarea aria-label={uiLabel(label)} value={draft[key]} maxLength={2000} rows={key === 'description' ? 3 : 2} disabled={disabled} onChange={e => change({ [key]: e.target.value })}/></label>)}</div>
     <section className="story-comments"><h3>{ui("Замечания") + " "}<span>{draft.comments.filter(c => !c.resolved).length}</span></h3>{draft.comments.map(c => <div className={'story-comment ' + (c.resolved ? 'resolved' : '')} key={c.id}><label><input type="checkbox" aria-label={ui("Закрыть замечание") + " " + c.text.slice(0, 40)} checked={c.resolved} disabled={disabled} onChange={e => change({ comments: draft.comments.map(v => v.id === c.id ? { ...v, resolved: e.target.checked } : v) })}/><span>{c.text}</span></label><button className="icon-button" aria-label={ui("Удалить замечание") + " " + c.text.slice(0, 40)} disabled={disabled} onClick={() => change({ comments: draft.comments.filter(v => v.id !== c.id) })}><Icon name="trash" size={14}/></button></div>)}<div className="story-comment-input"><textarea aria-label={ui("Новое замечание")} placeholder={ui("Что нужно доработать в этом кадре")} maxLength={1000} rows={2} disabled={disabled || draft.comments.length >= 30} value={comment} onChange={e => setComment(e.target.value)}/><button className="text-button" disabled={disabled || !comment.trim() || draft.comments.length >= 30} onClick={() => { change({ comments: [...draft.comments, { id: newId('remark'), text: comment.trim(), resolved: false }] }); setComment(''); }}>{ui("Добавить замечание")}</button></div></section>
    </>}
   </main></div>
  <footer className="story-footer"><div>{draft && <><button className="icon-button" aria-label={ui("Кадр выше")} disabled={disabled || dirty || chosenIndex <= 0} onClick={() => void act(ui("Переставить кадр"), [{ op: 'reorderStoryCard', targetId: draft.id, index: chosenIndex - 1 }])}><Icon name="up"/></button><button className="icon-button" aria-label={ui("Кадр ниже")} disabled={disabled || dirty || chosenIndex < 0 || chosenIndex >= cards.length - 1} onClick={() => void act(ui("Переставить кадр"), [{ op: 'reorderStoryCard', targetId: draft.id, index: chosenIndex + 1 }])}><Icon name="down"/></button><button className="text-button" disabled={disabled || dirty || chosenIndex < 0} onClick={() => void act(ui("Удалить кадр раскадровки"), [{ op: 'removeStoryCard', targetId: draft.id }])}><Icon name="trash" size={15}/>{ui("Удалить кадр")}</button></>}<span>{working ? ui("Сохраняю…") : dirty ? ui("Есть несохранённые изменения") : ui("Изменения можно отменить")}</span></div><div><button className="text-button" disabled={disabled || !dirty} onClick={reset}>{ui("Сбросить")}</button><button className="primary-button" disabled={disabled || !dirty || stale} onClick={() => void save()}>{ui("Сохранить раскадровку")}</button></div></footer>
 </dialog>{montage && <StoryMontagePreview project={project} bitmaps={bitmaps} threeLayer={threeLayer} onClose={() => setMontage(false)} onApply={onApply}/>}</>;
}
