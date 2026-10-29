import{currentLocale}from'./locale.ts';
import type{ExampleLanguage}from'../../domain/exampleLanguage.ts';
import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui } from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../domain/schema.ts';
import type { TemplateSummary, TemplateDetail } from '../../domain/templates.ts';
import type { AssetBitmaps } from '../../render/renderFrame.ts';
import { FrameCanvas, useLoop } from './PreviewCanvas.tsx';
import { readPreferences } from './preferences.ts';
import { api } from './api.ts';
import { Icon } from './Icon.tsx';
function useTemplate(summary: TemplateSummary | null) {
    const [detail, setDetail] = useState<TemplateDetail | null>(null), [bitmaps, setBitmaps] = useState<AssetBitmaps>(new Map()), [error, setError] = useState('');
    useEffect(() => {
        if (!summary)
            return;
        let cancelled = false;
        const loaded: AssetBitmaps = new Map();
        setDetail(null);
        setError('');
        void api.template(summary.id, summary.version).then(async (d) => {
            await document.fonts.ready;
            await Promise.all(d.project.assets.filter(a => a.mime.startsWith('image/')).map(async (a) => {
                const r = await fetch(api.templateAssetUrl(summary.id, summary.version, a.id));
                if (!r.ok)
                    throw Error(ui("Не загружено изображение шаблона."));
                const bitmap = await createImageBitmap(await r.blob());
                if (cancelled)
                    bitmap.close();
                else
                    loaded.set(a.id, bitmap);
            }));
            if (!cancelled) {
                setDetail(d);
                setBitmaps(loaded);
            }
        }).catch(e => {
            if (!cancelled)
                setError(errorText(e));
        });
        return () => { cancelled = true; loaded.forEach(b => (b as ImageBitmap).close?.()); };
    }, [summary?.id, summary?.version]);
    return { detail, bitmaps, error };
}
export function TemplateGallery({ onCreated, disabled }: {
    onCreated: (id: string, frame: number) => Promise<void>;
    disabled: boolean;
}) {
    const [list, setList] = useState<TemplateSummary[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [selected, setSelected] = useState<TemplateSummary | null>(null), [animate, setAnimate] = useState(() => readPreferences().animatePreviews);
    const [language,setLanguage]=useState<ExampleLanguage>(()=>currentLocale());
    useEffect(() => {
        setLoading(true);setError('');
        let alive = true;
        void api.templates(language).then(items => {
            if (alive)
                setList(items);
        }).catch(e => {
            if (alive)
                setError(errorText(e));
        }).finally(() => {
            if (alive)
                setLoading(false);
        });
        return () => { alive = false; };
    }, [language]);
    return <section className="template-library" aria-label={ui("Стартовые шаблоны")}><div className="settings-actions"><label>{ui("Язык шаблонов")} <select aria-label={ui("Язык шаблонов")} value={language} onChange={e=>setLanguage(e.target.value as ExampleLanguage)}><option value="ru">Русский</option><option value="en">English</option></select></label></div><div className="template-library-intro"><p>{ui("Выберите основу и замените материалы. Камера, слои, ключи и эффекты останутся доступны для редактирования.")}</p><button className="text-button" aria-label={animate ? ui("Остановить превью шаблонов") : ui("Запустить превью шаблонов")} onClick={() => setAnimate(v => !v)}><Icon name={animate ? 'pause' : 'play'} size={15}/>{animate ? ui("Остановить превью") : ui("Запустить превью")}</button></div>{error && <div className="field-warning" role="alert"><DiagnosticText message={error}/></div>}{loading ? <p role="status">{ui("Загрузка шаблонов…")}</p> : <div className="template-grid">{list.map(s => <TemplateCard key={s.id} summary={s} animate={animate && !selected} disabled={disabled} onOpen={() => setSelected(s)}/>)}</div>}{!loading && !list.length && !error && <p className="dialog-note">{ui("Каталог шаблонов пуст.")}</p>}{selected && <TemplatePreview summary={selected} onClose={() => setSelected(null)} onCreated={onCreated}/>}</section>;
}
function TemplateCard({ summary, animate, disabled, onOpen }: {
    summary: TemplateSummary;
    animate: boolean;
    disabled: boolean;
    onOpen: () => void;
}) { const { detail, bitmaps, error } = useTemplate(summary), [frame] = useLoop(animate, Math.round(summary.durationSeconds * 18), 18, Math.round(summary.previewFrame * 18 / 30)); return <article className="template-card" style={{ '--template-accent': summary.accent } as React.CSSProperties}><button className="template-card-preview" aria-label={ui("Посмотреть шаблон") + " " + summary.name} disabled={disabled || !detail} onClick={onOpen}>{detail ? <FrameCanvas project={detail.project} bitmaps={bitmaps} frame={Math.round(frame / 18 * 30) % detail.project.durationFrames} label={ui("Живое превью") + " " + summary.name}/> : <div className="template-loading">{error || ui("Готовлю превью…")}</div>}<span className="template-format">{summary.durationSeconds}{ui("с · 16:9")}</span><span className="template-play"><Icon name="play" size={18}/></span></button><div className="template-card-body"><span>{summary.category}</span><h2>{summary.name}</h2><p>{summary.description}</p><footer><small>{ui("Текст · изображение · музыка")}</small><button className="text-button" disabled={disabled || !detail} onClick={onOpen}>{ui("Выбрать")}<Icon name="arrow" size={16}/></button></footer></div></article>; }
function TemplatePreview({ summary, onClose, onCreated }: {
    summary: TemplateSummary;
    onClose: () => void;
    onCreated: (id: string, frame: number) => Promise<void>;
}) {
    const { detail, bitmaps, error: loadError } = useTemplate(summary), dialog = useRef<HTMLDialogElement>(null), audio = useRef<HTMLAudioElement>(null), [frame, setFrame] = useState(summary.previewFrame), [playing, setPlaying] = useState(false), [muted, setMuted] = useState(true), [repeat, setRepeat] = useState(false), [title, setTitle] = useState(summary.name + (" " + ui("— мой проект"))), [saving, setSaving] = useState(false), [error, setError] = useState(''), request = useRef<{
        title: string;
        id: string;
    } | null>(null), latest = useRef(frame);
    latest.current = frame;
    const p = detail?.project, music = p?.audioTracks.find(a => a.kind === 'music' && a.assetId), asset = p?.assets.find(a => a.id === music?.assetId);
    useEffect(() => { dialog.current?.showModal(); }, []);
    useEffect(() => {
        if (!p || !playing)
            return;
        const start = performance.now(), from = latest.current;
        let raf = 0;
        const tick = (now: number) => {
            const f = from + Math.floor((now - start) * p.fps.num / p.fps.den / 1000);
            if (f >= p.durationFrames) {
                if (repeat)
                    setFrame(f % p.durationFrames);
                else {
                    setFrame(p.durationFrames - 1);
                    setPlaying(false);
                    return;
                }
            }
            else
                setFrame(f);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [p, playing, repeat]);
    useEffect(() => {
        const a = audio.current;
        if (!a || !p)
            return;
        a.muted = muted;
        a.volume = Math.min(1, music?.gain ?? .8);
        if (!playing) {
            a.pause();
            return;
        }
        const time = frame * p.fps.den / p.fps.num - (music?.offsetSeconds ?? 0);
        if (time < 0) {
            a.pause();
            return;
        }
        if (a.paused || Math.abs(a.currentTime - time) > .16) {
            a.currentTime = time;
            void a.play().catch(() => setError(ui("Не удалось включить музыку. Изображение доступно.")));
        }
    }, [frame, playing, muted, p, music]);
    useEffect(() => { const a = audio.current; return () => a?.pause(); }, [asset?.id]);
    async function create() {
        if (saving || !p)
            return;
        setSaving(true);
        setPlaying(false);
        setError('');
        try {
            if (!title.trim() || title.trim().length > 200)
                throw Error(ui("Проверьте название проекта."));
            if (request.current?.title !== title.trim())
                request.current = { title: title.trim(), id: 'template-' + crypto.randomUUID() };
            const info = await api.packageInfo(), created = await api.createFromTemplate(summary.id, summary.version, { title: title.trim(), requestId: request.current!.id }, info.mutationToken);
            await onCreated(created.id, summary.previewFrame);
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setSaving(false);
        }
    }
    return <dialog ref={dialog} className="template-preview-dialog" aria-labelledby="template-preview-title" onCancel={e => {
            e.preventDefault();
            if (!saving)
                onClose();
        }}><header><div><span className="eyebrow">{ui("ШАБЛОН /") + " "}{summary.category.toLocaleUpperCase('ru')}</span><h2 id="template-preview-title">{summary.name}</h2></div><button className="icon-button" aria-label={ui("Закрыть превью шаблона")} disabled={saving} onClick={onClose}><Icon name="close"/></button></header><div className="template-preview-body"><div className="template-preview-stage">{p ? <FrameCanvas project={p} frame={frame} bitmaps={bitmaps} label={ui("Предпросмотр шаблона")}/> : <p>{loadError || ui("Загрузка…")}</p>}</div>{p && <><div className="template-transport"><button className="play-button" disabled={saving} aria-label={playing ? ui("Пауза шаблона") : ui("Воспроизвести шаблон")} onClick={() => {
                if (frame >= p.durationFrames - 1)
                    setFrame(0);
                setPlaying(v => !v);
            }}><Icon name={playing ? 'pause' : 'play'} size={16}/></button><input type="range" aria-label={ui("Кадр шаблона")} min="0" max={p.durationFrames - 1} value={frame} disabled={saving} onChange={e => { setPlaying(false); setFrame(Number(e.target.value)); }}/><output>{(frame * p.fps.den / p.fps.num).toFixed(2)} / {summary.durationSeconds}{ui("с")}</output><button className="icon-button" disabled={saving} aria-label={muted ? ui("Включить музыку шаблона") : ui("Выключить музыку шаблона")} aria-pressed={!muted} onClick={() => setMuted(v => !v)}><Icon name={muted ? 'muted' : 'volume'} size={17}/></button><label><input type="checkbox" checked={repeat} disabled={saving} onChange={e => setRepeat(e.target.checked)}/>{ui("Цикл")}</label></div><div className="template-chapters">{p.sequences.map(s => <button key={s.id} disabled={saving} aria-pressed={frame >= s.fromFrame && frame < s.toFrame} onClick={() => { setPlaying(false); setFrame(s.fromFrame + Math.min(28, Math.floor((s.toFrame - s.fromFrame) / 3))); }}>{s.name}</button>)}</div><p className="template-preview-description">{summary.description}</p><p className="template-attribution">{summary.attribution}</p></>}{asset && <audio ref={audio} src={api.templateAssetUrl(summary.id, summary.version, asset.id)} preload="metadata"/>}{error && <div className="field-warning" role="alert"><DiagnosticText message={error}/></div>}</div><footer><label>{ui("Название вашего проекта")}<input aria-label={ui("Название проекта из шаблона")} maxLength={200} value={title} disabled={saving} onChange={e => setTitle(e.target.value)}/></label><div><small>{ui("Откроется отдельная копия с панелью замены материалов.")}</small><button className="primary" disabled={!p || saving} onClick={() => void create()}>{saving ? ui("Создаю проект…") : ui("Создать проект")}<Icon name="arrow" size={16}/></button></div></footer></dialog>;
}
