import{currentLocale}from'./locale.ts';
import type{ExampleLanguage}from'../../domain/exampleLanguage.ts';
import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui } from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import { Icon } from './Icon.tsx';
import { useAudioPlayback } from './useAudioPlayback.ts';
import { FrameCanvas } from './PreviewCanvas.tsx';
import { createThreeAdapter, type ThreeAdapter } from '../../render/threeAdapter.ts';
import type { Project } from '../../domain/schema.ts';
import type { AssetBitmaps } from '../../render/renderFrame.ts';
type Example = Awaited<ReturnType<typeof api.examples>>[number];
export function ExampleGallery({ disabled, onDemo }: {
    disabled: boolean;
    onDemo: (preset: string) => void;
}) {
    const [list, setList] = useState<Example[] | null>(null), [selected, setSelected] = useState<Example | null>(null), [error, setError] = useState('');
    const [language,setLanguage]=useState<ExampleLanguage>(()=>currentLocale());
    useEffect(() => {
        setList(null);setError('');
        let alive = true;
        void api.examples(language).then(v => {
            if (alive)
                setList(v);
        }).catch(e => {
            if (alive)
                setError(errorText(e));
        });
        return () => { alive = false; };
    }, [language]);
    return <section aria-label={ui("Редактируемые примеры")}><div className="settings-actions"><label>{ui("Язык примеров")} <select value={language} aria-label={ui("Язык примеров")} onChange={e=>setLanguage(e.target.value as ExampleLanguage)}><option value="ru">Русский</option><option value="en">English</option></select></label></div><p className="dialog-note">{ui("Язык ролика выбирается отдельно от интерфейса. Все примеры доступны на русском и английском.")}</p><p className="dialog-note">{ui("Встроены в комплект и доступны без сети. Просмотр не создаёт проект; для редактирования откройте отдельную копию.")}</p>{error && <div role="alert"><DiagnosticText message={error}/></div>}{!list && !error && <p role="status">{ui("Проверяю примеры…")}</p>}<div className="example-grid">{list?.map((s, i) => <article className="example-card" key={s.id}><button className={'example-cover example-' + s.id} aria-label={ui("Посмотреть пример") + " " + s.title} disabled={disabled || !s.ready} onClick={() => setSelected(s)}><span>0{i + 1}</span><b className="sr-only">{s.title}</b><img src={s.coverUrl ?? '/examples/covers/' + s.id + '.webp'} alt="" loading="lazy"/><span className="example-watch"><Icon name="play" size={16}/>{" " + ui("Смотреть ·") + " "}{Number(s.durationSeconds.toFixed(1))}{" " + ui("с")}</span></button><div><h3>{s.title}</h3><span className="eyebrow" data-content-language={s.contentLanguage}>{s.contentLanguage==='en'?'English':'Русский'}</span><p>{s.description}</p>{s.ready ? <div className="settings-actions"><button className="text-button" disabled={disabled} onClick={() => setSelected(s)}>{ui("Смотреть")}</button><button className="text-button" disabled={disabled} onClick={() => onDemo(s.preset)}>{ui("Создать свою копию")}<Icon name="arrow" size={16}/></button></div> : <p className="field-warning" role="status">{s.reason}</p>}</div></article>)}</div>{selected && <ExamplePreview summary={selected} onClose={() => setSelected(null)} onCreate={() => { onDemo(selected.preset); setSelected(null); }}/>}</section>;
}
function ExamplePreview({ summary, onClose, onCreate }: {
    summary: Example;
    onClose: () => void;
    onCreate: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null), [project, setProject] = useState<Project | null>(null), [bitmaps, setBitmaps] = useState<AssetBitmaps>(new Map()), [adapter, setAdapter] = useState<ThreeAdapter | null>(null), [error, setError] = useState(''), [playing, setPlaying] = useState(false), [muted, setMuted] = useState(true);
    const [frame, setFrame] = useState(0), latest = useRef(frame);
    latest.current = frame;
    const sound = useAudioPlayback(project, muted, id => api.exampleAssetUrl(summary.id, id));
    useEffect(() => {
        if (sound.error) {
            setError(sound.error);
            setPlaying(false);
        }
    }, [sound.error]);
    useEffect(() => {
        if (!playing || !project)
            return;
        let raf = 0;
        void sound.play(latest.current * project.fps.den / project.fps.num);
        const tick = () => {
            const time = sound.time();
            if (time !== null) {
                const f = Math.floor(time * project.fps.num / project.fps.den);
                setFrame(Math.min(f, project.durationFrames - 1));
                if (f >= project.durationFrames - 1) {
                    setPlaying(false);
                    return;
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(raf); sound.pause(); };
    }, [playing, project?.id]);
    useEffect(() => {
        dialog.current?.showModal();
        let cancelled = false, three: ThreeAdapter | undefined;
        const images: AssetBitmaps = new Map();
        void api.example(summary.id,summary.contentLanguage).then(async (p) => {
            await document.fonts.ready;
            await Promise.all(p.assets.filter(a => a.mime.startsWith('image/')).map(async (a) => {
                const r = await fetch(api.exampleAssetUrl(summary.id, a.id));
                if (!r.ok)
                    throw Error(ui("Изображение примера недоступно."));
                const b = await createImageBitmap(await r.blob());
                if (cancelled)
                    b.close();
                else
                    images.set(a.id, b);
            }));
            if (cancelled)
                return;
            if (p.nodes.some(n => n.kind === 'scene3d')) {
                const bytes = new Map<string, Uint8Array>();
                await Promise.all(p.assets.filter(a => a.mime.startsWith('model/')).map(async (a) => {
                    const r = await fetch(api.exampleAssetUrl(summary.id, a.id));
                    if (!r.ok)
                        throw Error(ui("Модель примера недоступна."));
                    bytes.set(a.sha256, new Uint8Array(await r.arrayBuffer()));
                }));
                if (cancelled)
                    return;
                three = createThreeAdapter(p, { modelBytes: bytes });
                await three.layer.prepare?.(p);
                if (cancelled)
                    return;
                setAdapter(three);
            }
            setProject(p);
            setBitmaps(images);
        }).catch(e => {
            if (!cancelled)
                setError(errorText(e));
        });
        return () => { cancelled = true; three?.dispose(); images.forEach(b => (b as ImageBitmap).close?.()); };
    }, [summary.id,summary.contentLanguage]);
    useEffect(() => {
        if (project && frame >= project.durationFrames - 1)
            setPlaying(false);
    }, [frame, project]);
    const chapters = project?.sequences.length === 1 && project.cues.filter(c => c.kind === 'mark').length > 1 ? project.cues.filter(c => c.kind === 'mark').map(c => ({ id: c.id, name: c.label, fromFrame: c.frame, toFrame: project.durationFrames, seekFrame: c.frame })) : (project?.sequences ?? []).map(s => ({ ...s, seekFrame: s.fromFrame + Math.min(25, s.toFrame - s.fromFrame - 1) }));
    return <dialog ref={dialog} className="template-preview-dialog" aria-labelledby="example-preview-title" onCancel={e => { e.preventDefault(); onClose(); }}><header><div><span className="eyebrow">{ui("ВСТРОЕННЫЙ ПРИМЕР")}</span><h2 id="example-preview-title">{summary.title}</h2></div><button className="icon-button" aria-label={ui("Закрыть просмотр примера")} onClick={onClose}><Icon name="close"/></button></header><div className="template-preview-body"><div className="template-preview-stage">{project ? <FrameCanvas project={project} frame={frame} bitmaps={bitmaps} threeLayer={adapter?.layer} label={ui("Предпросмотр примера")}/> : <p role="status">{error || ui("Готовлю просмотр…")}</p>}</div>{project && <><div className="template-transport"><button className="play-button" aria-label={playing ? ui("Пауза примера") : ui("Воспроизвести пример")} onClick={() => {
                sound.unlock();
                if (frame === project.durationFrames - 1)
                    setFrame(0);
                setPlaying(v => !v);
            }}><Icon name={playing ? 'pause' : 'play'} size={16}/></button><input type="range" aria-label={ui("Кадр примера")} min={0} max={project.durationFrames - 1} value={frame} onChange={e => { setPlaying(false); setFrame(Number(e.target.value)); }}/><output>{(frame * project.fps.den / project.fps.num).toFixed(1)} / {Number(summary.durationSeconds.toFixed(1))}{" " + ui("с")}</output><button className="icon-button" aria-label={muted ? ui("Включить звук примера") : ui("Выключить звук примера")} onClick={() => { sound.unlock(); setMuted(v => !v); }}><Icon name={muted ? 'muted' : 'volume'} size={17}/></button></div><div className="template-chapters">{chapters.map((s, i) => <button key={s.id} aria-pressed={frame >= s.fromFrame && frame < (chapters[i + 1]?.fromFrame ?? s.toFrame)} onClick={() => { setPlaying(false); setFrame(s.seekFrame); }}>{s.name}</button>)}</div><p className="dialog-note">{ui("Сцены, слои, эффекты и камера доступны для редактирования в собственной копии.")}</p></>}{error && project && <div className="field-warning" role="alert"><DiagnosticText message={error}/></div>}</div><footer><button className="text-button" onClick={onClose}>{ui("Закрыть")}</button><button className="primary" disabled={!project} onClick={onCreate}>{ui("Создать свою копию")}</button></footer></dialog>;
}
