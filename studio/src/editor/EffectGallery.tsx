import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { UI_REGISTRY as REGISTRY, parameterLabel, filterCatalog } from './catalogView.ts';
import { ui, uiLabel } from './i18n.ts';
import { effectCategoryLabel, type EffectCategoryId } from '../../domain/catalogIds.ts';
import { readPreferences } from './preferences.ts';
import { BeforeAfter } from './BeforeAfter.tsx';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, EffectInstance } from '../../domain/schema.ts';
import type { Operation } from '../../domain/operations.ts';
import { applyOperations } from '../../domain/operations.ts';
import { newId } from '../../domain/ids.ts';
import { validateEffectParams } from '../../effects/registry.ts';
import { CATALOG, CATEGORIES, compatibilityReason, addEffectOperation, effectRange, readEffectIds, type EffectCard } from '../../effects/catalog.ts';
import { buildEffectFixture, FIXTURE_FRAMES, galleryDefaultParams } from '../../effects/fixtures.ts';
import { type AssetBitmaps, type ThreeLayerRenderer } from '../../render/renderFrame.ts';
import { Icon } from './Icon.tsx';
import { createThreeAdapter, type ThreeAdapter } from '../../render/threeAdapter.ts';
import { FrameCanvas, useLoop } from './PreviewCanvas.tsx';
import { EffectParamField } from './EffectParamField.tsx';
const emptyBitmaps: AssetBitmaps = new Map();
const EffectTile = memo(function EffectTile({ card, frame, active, favorite, shortlisted, onChoose, onFavorite, onShortlist, threeLayer }: {
    threeLayer?: ThreeLayerRenderer;
    card: EffectCard;
    frame: number;
    active: boolean;
    favorite: boolean;
    shortlisted: boolean;
    onChoose: (id: string) => void;
    onFavorite: (id: string) => void;
    onShortlist: (id: string) => void;
}) {
    const ref = useRef<HTMLElement | null>(null), [visible, setVisible] = useState(false), project = useMemo(() => buildEffectFixture(card.id), [card.id]), def = REGISTRY.get(card.id)!;
    useEffect(() => {
        const element = ref.current;
        if (!element)
            return;
        const observer = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: .05 });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return <article ref={ref} className={'gallery-card ' + (active ? 'chosen' : '')} data-effect-id={card.id} style={{ '--effect-color': card.color } as React.CSSProperties}>
  <button className="effect-tile" aria-label={ui("Примерить") + " " + def.name} aria-pressed={active} onClick={() => onChoose(card.id)}><div className="effect-picture"><FrameCanvas project={project} frame={visible ? frame : 40} threeLayer={threeLayer}/><span className="effect-tag">{uiLabel(card.tag)}</span>{active && <span className="effect-picked"><Icon name="check" size={14}/></span>}</div><div className="effect-tile-text"><strong>{def.name}</strong><span>{uiLabel(effectCategoryLabel(card.category))}</span></div></button>
  <div className="effect-tile-actions"><span>{ui("В движении")}</span><button className="icon-button" aria-label={(favorite ? ui("Убрать из избранного:") + " " : ui("В избранное:") + " ") + def.name} aria-pressed={favorite} onClick={() => onFavorite(card.id)}><Icon name="star" size={16}/></button><button className="icon-button" aria-label={(shortlisted ? ui("Убрать из подборки:") + " " : ui("В подборку:") + " ") + def.name} aria-pressed={shortlisted} onClick={() => onShortlist(card.id)}><Icon name="bookmark" size={16}/></button></div>
 </article>;
});
export function EffectGallery({ project, selectedId, currentFrame, bitmaps, threeLayer, onSelect, onClose, onApply, onSeek }: {
    project: Project;
    selectedId: string | null;
    currentFrame: number;
    bitmaps: AssetBitmaps;
    threeLayer?: ThreeLayerRenderer;
    onSeek: (frame: number) => void;
    onSelect: (id: string) => void;
    onClose: () => void;
    onApply: (description: string, ops: Operation[], revision: number) => Promise<boolean>;
}) {
    const [fixtureThree, setFixtureThree] = useState<ThreeAdapter | null>(null);
    useEffect(() => { const a = createThreeAdapter(buildEffectFixture('assembly-spread')); setFixtureThree(a); return () => a.dispose(); }, []);
    const dialog = useRef<HTMLDialogElement | null>(null), [query, setQuery] = useState(''), [category, setCategory] = useState<EffectCategoryId>('all'), [scope, setScope] = useState('all'), [compatible, setCompatible] = useState(false);
    const [chosen, setChosen] = useState('prism-fold'), [params, setParams] = useState<EffectInstance['params']>(() => galleryDefaultParams('prism-fold'));
    const target = project.nodes.find(n => n.id === selectedId) ?? null, range = effectRange(project, target);
    const [from, setFrom] = useState(range.fromFrame), [last, setLast] = useState(range.toFrame - 1), [baseRevision, setBaseRevision] = useState(project.revision), [actual, setActual] = useState(!!target), [before, setBefore] = useState(false), [mobilePane, setMobilePane] = useState('library');
    const [animate, setAnimate] = useState(() => readPreferences().animatePreviews), [previewPlaying, setPreviewPlaying] = useState(() => readPreferences().animatePreviews), [saving, setSaving] = useState(false), [error, setError] = useState(''), [storageError, setStorageError] = useState('');
    const favoriteKey = 'motivelium-effects-favorites-v1', shortlistKey = 'motivelium-effects-shortlist-v1:' + project.id;
    const read = (key: string) => {
        try {
            return readEffectIds(localStorage.getItem(key));
        }
        catch {
            return [];
        }
    };
    const [favorites, setFavorites] = useState(() => read(favoriteKey)), [shortlist, setShortlist] = useState(() => read(shortlistKey));
    const draftId = useRef(newId('fx-gallery'));
    useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
    useEffect(() => { const next = effectRange(project, target); setFrom(next.fromFrame); setLast(next.toFrame - 1); draftId.current = newId('fx-gallery'); }, [target?.id]);
    const def = REGISTRY.get(chosen)!, card = CATALOG.find(c => c.id === chosen)!;
    const trial = useMemo(() => {
        try {
            const operation = addEffectOperation(project, selectedId ?? '', chosen, params, from, last + 1, draftId.current);
            return { operation, project: applyOperations(project, [operation]), error: '' };
        }
        catch (e) {
            return { operation: null, project: null, error: errorText(e) };
        }
    }, [project, selectedId, chosen, params, from, last]);
    const actualPreview = actual && !!trial.project, length = actualPreview ? last - from + 1 : FIXTURE_FRAMES;
    const [thumbFrame] = useLoop(animate, FIXTURE_FRAMES, 30, 48), [previewFrame, setPreviewFrame] = useLoop(previewPlaying, length, actualPreview ? project.fps.num / project.fps.den : 30);
    const parameterErrors = useMemo(() => validateEffectParams(def, params), [def, params]);
    const fixture = useMemo(() => buildEffectFixture(chosen, parameterErrors.length ? galleryDefaultParams(chosen) : params), [chosen, params, parameterErrors]);
    const stale = baseRevision !== project.revision;
    const activeSequenceId = target?.sequenceId ?? project.sequences.find(s => currentFrame >= s.fromFrame && currentFrame < s.toFrame)?.id;
    const filtered = filterCatalog(query, category, scope === 'favorites' ? favorites : scope === 'shortlist' ? shortlist : undefined).filter(c => !compatible || !compatibilityReason(project, target, c.id));
    function choose(id: string) {
        setChosen(id);
        setParams(galleryDefaultParams(id));
        setError('');
        setBefore(false);
        setPreviewFrame(0);
        draftId.current = newId('fx-gallery');
        if (window.innerWidth <= 760)
            setMobilePane('detail');
    }
    function toggle(id: string, kind: 'favorite' | 'shortlist') {
        const previous = kind === 'favorite' ? favorites : shortlist, next = previous.includes(id) ? previous.filter(v => v !== id) : [...previous, id];
        (kind === 'favorite' ? setFavorites : setShortlist)(next);
        try {
            localStorage.setItem(kind === 'favorite' ? favoriteKey : shortlistKey, JSON.stringify(next));
            setStorageError('');
        }
        catch {
            setStorageError(ui("Не удалось сохранить подборку в браузере. Её можно скачать файлом."));
        }
    }
    function download() { const value = { schemaVersion: 1, projectId: project.id, title: project.title, effects: shortlist.map(id => ({ definitionId: id, definitionVersion: REGISTRY.get(id)!.version, name: REGISTRY.get(id)!.name })) }, url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'motivelium-effects-' + project.id + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    async function apply() {
        if (!trial.operation || stale || saving)
            return;
        setSaving(true);
        setPreviewPlaying(false);
        setError('');
        try {
            if (await onApply(ui("Добавить эффект:") + " " + def.name, [trial.operation], baseRevision)) {
                onSeek(from + previewFrame);
                onClose();
            }
            else
                setError(ui("Не удалось применить эффект. Проверь сообщение студии; примерка сохранена."));
        }
        finally {
            setSaving(false);
        }
    }
    const shownProject = actualPreview ? (before ? project : trial.project!) : fixture, shownFrame = actualPreview ? from + previewFrame : previewFrame;
    return <dialog ref={dialog} className="gallery-dialog" aria-labelledby="gallery-title" data-mobile-pane={mobilePane} onCancel={e => { e.preventDefault(); onClose(); }}>
  <header className="gallery-header"><div className="gallery-heading"><span className="gallery-symbol"><Icon name="sparkles" size={25}/></span><div><span className="eyebrow">{ui("БИБЛИОТЕКА")}</span><h2 id="gallery-title">{ui("Галерея эффектов") + " "}<small>{CATALOG.length}</small></h2></div></div><div className="gallery-header-actions"><button className="gallery-animation-toggle" aria-label={animate || previewPlaying ? ui("Остановить все превью") : ui("Оживить все превью")} onClick={() => { const next = !(animate || previewPlaying); setAnimate(next); setPreviewPlaying(next); }}><Icon name={animate || previewPlaying ? 'pause' : 'play'} size={14}/><span>{animate || previewPlaying ? ui("Остановить превью") : ui("Запустить превью")}</span></button><button className="icon-button" aria-label={ui("Закрыть галерею")} onClick={onClose}><Icon name="close"/></button></div></header>
  <nav className="gallery-mobile-tabs"><button className={mobilePane === 'library' ? 'current' : ''} onClick={() => setMobilePane('library')}>{ui("Эффекты")}</button><button className={mobilePane === 'detail' ? 'current' : ''} onClick={() => setMobilePane('detail')}>{ui("Примерка")}</button></nav>
  <div className="gallery-body"><section className="gallery-library"><div className="gallery-filters"><div className="gallery-search"><Icon name="search" size={17}/><input autoFocus aria-label={ui("Найти эффект")} placeholder={ui("Поиск по названию или движению")} value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="icon-button" aria-label={ui("Очистить поиск")} onClick={() => setQuery('')}><Icon name="close" size={14}/></button>}</div>
   <div className="gallery-scopes"><button className={scope === 'all' ? 'current' : ''} onClick={() => setScope('all')}>{ui("Все эффекты")}</button><button className={scope === 'favorites' ? 'current' : ''} onClick={() => setScope('favorites')}><Icon name="star" size={13}/>{ui("Избранное") + " "}<small>{favorites.length}</small></button><button className={scope === 'shortlist' ? 'current' : ''} onClick={() => setScope('shortlist')}><Icon name="bookmark" size={13}/>{ui("Для ролика") + " "}<small>{shortlist.length}</small></button></div>
   <div className="gallery-categories">{CATEGORIES.map(c => <button data-category-id={c} key={c} className={category === c ? 'current' : ''} onClick={() => setCategory(c)}>{uiLabel(effectCategoryLabel(c))}</button>)}</div><div className="gallery-result-line"><span>{ui("Найдено") + " "}{filtered.length}</span><label><input type="checkbox" checked={compatible} disabled={!target} onChange={e => setCompatible(e.target.checked)}/>{ui("Подходит объекту")}</label></div>
  </div><div className="gallery-card-scroll"><div className="gallery-card-grid">{filtered.map(c => <EffectTile threeLayer={fixtureThree?.layer} key={c.id} card={c} frame={thumbFrame} active={c.id === chosen} favorite={favorites.includes(c.id)} shortlisted={shortlist.includes(c.id)} onChoose={choose} onFavorite={id => toggle(id, 'favorite')} onShortlist={id => toggle(id, 'shortlist')}/>)}</div>{!filtered.length && <div className="gallery-empty"><Icon name="search" size={30}/><h3>{ui("Здесь пока пусто")}</h3><p>{scope === 'all' ? ui("Попробуй другое слово или категорию.") : ui("Добавляй эффекты кнопками со звездой и закладкой на карточке.")}</p><button className="text-button" onClick={() => { setQuery(''); setCategory('all'); setScope('all'); setCompatible(false); }}>{ui("Показать все эффекты")}</button></div>}</div>
   <footer className="gallery-library-footer"><span>{ui("Подборка ролика хранится в этом браузере.")}</span><button className="text-button" disabled={!shortlist.length} onClick={download}><Icon name="download" size={14}/>{ui("Скачать подборку")}</button></footer></section>
  <section className="gallery-detail" aria-label={ui("Примерка эффекта")}><div className="gallery-detail-scroll"><div className="gallery-detail-heading"><span className="effect-category-label" style={{ color: card.color }}>{uiLabel(card.tag)} / {uiLabel(effectCategoryLabel(card.category))}</span><h3>{def.name}</h3><p>{uiLabel(card.recipe)}</p></div>
   <label className="gallery-target">{ui("Объект для эффекта")}<select aria-label={ui("Объект для эффекта")} value={selectedId ?? ''} onChange={e => {
            if (e.target.value) {
                onSelect(e.target.value);
                setActual(true);
                setBefore(false);
                setPreviewFrame(0);
            }
        }}><option value="">{ui("Выбери объект…")}</option>{project.nodes.filter(n => n.sequenceId === activeSequenceId).map(n => <option key={n.id} value={n.id} disabled={n.locked}>{n.name}{n.locked ? " " + ui("· заблокирован") : ''}</option>)}</select></label>
   <div className="gallery-preview-tabs"><button className={!actualPreview ? 'current' : ''} onClick={() => { setActual(false); setPreviewFrame(0); }}>{ui("Пример")}</button><button className={actualPreview ? 'current' : ''} disabled={!trial.project} onClick={() => { setActual(true); setPreviewFrame(Math.max(0, Math.min(last - from, currentFrame - from))); }}>{ui("В проекте")}</button>{actualPreview && <BeforeAfter before={before} onChange={setBefore}/>}</div>
   <div className="gallery-large-preview"><FrameCanvas project={shownProject} frame={shownFrame} bitmaps={actualPreview ? bitmaps : emptyBitmaps} threeLayer={actualPreview ? threeLayer : fixtureThree?.layer} metrics label={actualPreview ? ui("Примерка в проекте") : ui("Крупный пример эффекта")}/><span>{actualPreview ? (before ? ui("ИСХОДНЫЙ КАДР") : ui("ПРИМЕРКА · НЕ СОХРАНЕНО")) : ui("ПРИМЕР ЭФФЕКТА")}</span></div>
   <div className="gallery-preview-transport"><button className="icon-button" aria-label={previewPlaying ? ui("Остановить примерку") : ui("Воспроизвести примерку")} onClick={() => setPreviewPlaying(v => !v)}><Icon name={previewPlaying ? 'pause' : 'play'} size={14}/></button><input aria-label={ui("Кадр примерки")} type="range" min="0" max={Math.max(0, length - 1)} value={previewFrame} onChange={e => { setPreviewPlaying(false); setPreviewFrame(Number(e.target.value)); }}/><span>{actualPreview ? ui("Кадр") + " " + shownFrame : (previewFrame / 30).toFixed(1) + (" " + ui("с"))}</span></div><p className="gallery-loop-label">{ui("Цикл превью ·") + " "}{actualPreview ? ((last - from + 1) / (project.fps.num / project.fps.den)).toFixed(2) : '4.00'}{" " + ui("с · без звука")}</p>
   <div className="gallery-range"><h4>{ui("Интервал в проекте")}</h4><div className="field-grid"><label>{ui("Первый кадр")}<input aria-label={ui("Первый кадр эффекта")} type="number" min={range.fromFrame} max={range.toFrame - 1} value={from} onChange={e => setFrom(Number(e.target.value))}/></label><label>{ui("Последний кадр")}<input aria-label={ui("Последний кадр эффекта")} type="number" min={range.fromFrame} max={range.toFrame - 1} value={last} onChange={e => setLast(Number(e.target.value))}/></label></div></div>
   <div className="gallery-parameters"><h4>{ui("Параметры")}</h4><div className="field-grid">{def.params.map(spec => <EffectParamField key={spec.name} definitionId={chosen} spec={spec} value={params[spec.name] ?? spec.default} params={params} prefix={ui("Параметр:") + " "} onChange={value => setParams(v => ({ ...v, [spec.name]: value }))}/>)}</div><button className="text-button" onClick={() => setParams(galleryDefaultParams(chosen))}>{ui("Сбросить параметры")}</button></div>
   {parameterErrors.length > 0 && <p className="field-warning" role="alert">{parameterErrors.join(' ')}</p>}
   {storageError && <p className="field-warning">{storageError}</p>}
  </div><footer className="gallery-apply">{trial.error && target && <div className="gallery-hint"><DiagnosticText message={trial.error}/></div>}{stale && <div className="field-warning">{ui("Проект изменился. Проверь примерку на новой версии.")}<button className="text-button" onClick={() => { setBaseRevision(project.revision); setError(''); }}>{ui("Обновить примерку")}</button></div>}{error && <div className="field-warning"><DiagnosticText message={error}/></div>}<button className="primary" disabled={!trial.operation || stale || saving} onClick={() => void apply()}>{saving ? ui("Добавляю…") : ui("Добавить эффект")}<Icon name="arrow" size={16}/></button><span>{target ? ui("Объект · {0}", [target.name]) : ui("Выбери объект в списке выше")}</span></footer></section></div>
 </dialog>;
}
