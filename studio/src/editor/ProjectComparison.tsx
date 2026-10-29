import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui } from './i18n.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../../domain/schema.ts';
import { comparisonChanges, comparisonDuration, comparisonFrame } from '../../domain/comparison.ts';
import { accentSamples } from '../../domain/synthAudio.ts';
import { createThreeAdapter, type ThreeAdapter } from '../../render/threeAdapter.ts';
import { captureComparison, type ComparisonSnapshot } from './comparisonAssets.ts';
import { FrameCanvas } from './PreviewCanvas.tsx';
import { api, type ProjectSummary } from './api.ts';
import { Icon } from './Icon.tsx';
type Pair = {
    before: ComparisonSnapshot;
    after: ComparisonSnapshot;
};
function usePair(before: Project | null, after: Project) {
    const [pair, setPair] = useState<Pair | null>(null), [error, setError] = useState('');
    useEffect(() => {
        setPair(null);
        setError('');
        if (!before)
            return;
        const controller = new AbortController(), owned: ComparisonSnapshot[] = [];
        void (async () => {
            try {
                for (const p of [before, after])
                    owned.push(await captureComparison(p, controller.signal));
                controller.signal.throwIfAborted();
                setPair({ before: owned[0]!, after: owned[1]! });
            }
            catch (e) {
                owned.forEach(v => v.dispose());
                if (!controller.signal.aborted)
                    setError(errorText(e));
            }
        })();
        return () => { controller.abort(); owned.forEach(v => v.dispose()); };
    }, [before, after]);
    return { pair, error };
}
/** One audio side, all file tracks + deterministic synth accents, on the visual clock. */
function ComparisonSound({ snapshot, seconds, playing, onError }: {
    snapshot: ComparisonSnapshot | null;
    seconds: number;
    playing: boolean;
    onError: (error: string) => void;
}) {
    const latest = useRef(seconds);
    latest.current = seconds;
    useEffect(() => {
        if (!snapshot || !playing)
            return;
        let cancelled = false, ctx: AudioContext;
        try {
            ctx = new AudioContext();
        }
        catch {
            onError(ui("Браузер не разрешил звук."));
            return;
        }
        const sources: AudioBufferSourceNode[] = [];
        const output = ctx.createGain();
        output.connect(ctx.destination);
        void (async () => {
            try {
                await ctx.resume();
                for (const track of snapshot.project.audioTracks) {
                    if (cancelled || track.mute || !track.gain)
                        continue;
                    let buffer: AudioBuffer;
                    if (track.synth) {
                        const samples = accentSamples(track.synth, ctx.sampleRate);
                        buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
                        buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
                    }
                    else {
                        const bytes = track.assetId ? snapshot.audio.get(track.assetId) : null;
                        if (!bytes)
                            continue;
                        buffer = await ctx.decodeAudioData(bytes.slice(0));
                    }
                    if (cancelled)
                        return;
                    const t = latest.current - track.offsetSeconds;
                    if (t >= buffer.duration)
                        continue;
                    const source = ctx.createBufferSource(), gain = ctx.createGain();
                    source.buffer = buffer;
                    gain.gain.value = track.gain;
                    source.connect(gain);
                    gain.connect(output);
                    sources.push(source);
                    source.start(ctx.currentTime + Math.max(0, -t), Math.max(0, t));
                }
            }
            catch (e) {
                if (!cancelled)
                    onError(ui("Звук сравнения:") + " " + errorText(e));
            }
        })();
        return () => {
            cancelled = true;
            for (const s of sources) {
                try {
                    s.stop();
                }
                catch { }
                s.disconnect();
            }
            output.disconnect();
            void ctx.close();
        };
    }, [snapshot, playing, onError]);
    return null;
}
function ComparisonStage({ snapshot, frame, label }: {
    snapshot: ComparisonSnapshot;
    frame: number;
    label: string;
}) {
    const [adapter, setAdapter] = useState<ThreeAdapter | null>(null), [error, setError] = useState('');
    useEffect(() => {
        if (!snapshot.project.nodes.some(n => n.kind === 'scene3d'))
            return;
        let a: ThreeAdapter | undefined;
        try {
            a = createThreeAdapter(snapshot.project, { modelBytes: snapshot.modelBytes });
            setAdapter(a);
        }
        catch (e) {
            setError('3D: ' + errorText(e));
        }
        return () => { a?.dispose(); };
    }, [snapshot]);
    return <>{error ? <div role="alert" className="field-warning"><DiagnosticText message={error}/></div> : <FrameCanvas project={snapshot.project} bitmaps={snapshot.bitmaps} threeLayer={adapter?.layer} frame={frame} label={label}/>}</>;
}
export function ProjectComparison({ project, candidate, onClose, onApply, initialReference, initialSeconds = 0 }: {
    project: Project;
    candidate?: Project;
    onClose: () => void;
    onApply?: () => void;
    initialReference?: string;
    initialSeconds?: number;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    // Capture document identities once. SSE updates cannot replace a side under the user.
    const [after] = useState(() => structuredClone(candidate ?? project)), [base] = useState(() => candidate ? structuredClone(project) : null);
    const [options, setOptions] = useState<ProjectSummary[]>([]), [reference, setReference] = useState(initialReference ?? ''), [before, setBefore] = useState<Project | null>(base), [loading, setLoading] = useState(false), [loadError, setLoadError] = useState('');
    const [mode, setMode] = useState<'side' | 'wipe'>('side'), [wipe, setWipe] = useState(50), [seconds, setSeconds] = useState(initialSeconds), [playing, setPlaying] = useState(false), [sound, setSound] = useState<'before' | 'after' | 'none'>('after'), [audioError, setAudioError] = useState('');
    const { pair, error } = usePair(before, after), latest = useRef(seconds);
    latest.current = seconds;
    const duration = Math.max(comparisonDuration(after), before ? comparisonDuration(before) : 0), fps = Math.max(after.fps.num / after.fps.den, before ? before.fps.num / before.fps.den : 0);
    const changes = useMemo(() => before ? comparisonChanges(before, after) : null, [before, after]);
    const sameRatio = !!before && before.size.width * after.size.height === after.size.width * before.size.height;
    useEffect(() => {
        if (!sameRatio)
            setMode('side');
    }, [sameRatio]);
    useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
    useEffect(() => {
        if (candidate)
            return;
        let alive = true;
        void api.list().then(v => {
            if (alive)
                setOptions(v.filter(p => p.id !== project.id));
        }).catch(e => {
            if (alive)
                setLoadError(errorText(e));
        });
        return () => { alive = false; };
    }, []);
    useEffect(() => {
        if (candidate || !reference)
            return;
        let alive = true;
        setPlaying(false);
        setBefore(null);
        setLoading(true);
        setLoadError('');
        void api.open(reference).then(v => {
            if (alive)
                setBefore(structuredClone(v.project));
        }).catch(e => {
            if (alive)
                setLoadError(errorText(e));
        }).finally(() => {
            if (alive)
                setLoading(false);
        });
        return () => { alive = false; };
    }, [reference]);
    useEffect(() => { setSeconds(t => Math.max(0, Math.min(duration, t))); }, [duration]);
    useEffect(() => {
        if (!playing || !pair)
            return;
        const from = latest.current, start = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            const t = Math.min(duration, from + (now - start) / 1000);
            setSeconds(t);
            if (t >= duration) {
                setPlaying(false);
                return;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, pair, duration]);
    function seek(t: number) { setPlaying(false); setSeconds(Math.max(0, Math.min(duration, t))); setAudioError(''); }
    function toggle() {
        if (!pair)
            return;
        if (latest.current >= duration)
            setSeconds(0);
        setAudioError('');
        setPlaying(v => !v);
    }
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes((e.target as HTMLElement).tagName))
                return;
            if (e.code === 'Space') {
                e.preventDefault();
                toggle();
            }
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                seek(latest.current - 1 / fps);
            }
            if (e.code === 'ArrowRight') {
                e.preventDefault();
                seek(latest.current + 1 / fps);
            }
        };
        const el = dialog.current;
        el?.addEventListener('keydown', key);
        return () => el?.removeEventListener('keydown', key);
    }, [pair, duration, fps]);
    const selectedSound = pair && seconds < comparisonDuration(pair[sound === 'before' ? 'before' : 'after'].project) ? sound === 'before' ? pair.before : sound === 'after' ? pair.after : null : null;
    const summary = changes ? [[ui("Объекты"), changes.nodes], [ui("Эффекты"), changes.effects], [ui("Сцены"), changes.scenes], [ui("Звук"), changes.audio]] as const : [];
    return <dialog ref={dialog} className="compare-dialog" aria-labelledby="compare-title" onCancel={e => { e.preventDefault(); onClose(); }}>
  <header><div><span className="eyebrow">{ui("ПРОСМОТР ВАРИАНТОВ")}</span><h2 id="compare-title">{candidate ? ui("Сравнение ИИ-правки") : ui("Сравнение проектов")}</h2></div><button className="icon-button" autoFocus aria-label={ui("Закрыть сравнение")} onClick={onClose}><Icon name="close"/></button></header>
  <div className="compare-toolbar">{!candidate && <label className="compare-reference">{ui("С чем сравнить")}<select aria-label={ui("Исходный вариант для сравнения")} value={reference} onChange={e => {
                setReference(e.target.value);
                if (!e.target.value) {
                    setBefore(null);
                    setPlaying(false);
                }
            }}><option value="">{ui("Выбрать сохранённый проект…")}</option>{options.map(p => <option key={p.id} value={p.id}>{p.title} · v{p.revision}</option>)}</select></label>}
   <div className="before-after" role="group" aria-label={ui("Вид сравнения")}><button aria-pressed={mode === 'side'} onClick={() => setMode('side')}>{ui("Рядом")}</button><button aria-pressed={mode === 'wipe'} disabled={!sameRatio} title={sameRatio ? ui("Двигай границу поверх кадра") : ui("Шторка доступна для одинаковых пропорций кадра")} onClick={() => setMode('wipe')}>{ui("Шторка")}</button></div>
   <label className="compare-sound"><Icon name={sound === 'none' ? 'muted' : 'volume'} size={16}/>{ui("Звук")}<select aria-label={ui("Звук сравнения")} value={sound} onChange={e => { setAudioError(''); setSound(e.target.value as typeof sound); }}><option value="after">{ui("После")}</option><option value="before">{ui("До")}</option><option value="none">{ui("Без звука")}</option></select></label>
  </div>
  <div className="compare-body">{(loading || before && !pair && !error) && <p role="status" className="compare-empty">{ui("Готовлю кадры и ресурсы…")}</p>}{(loadError || error) && <p role="alert" className="field-warning">{loadError || error}</p>}{!before && !loading && !loadError && <div className="compare-empty"><Icon name="layers" size={38}/><h3>{ui("Один момент. Два варианта.")}</h3><p>{ui("Выбери сохранённую версию. Для следующей правки можно заранее создать копию через меню «Файл».")}</p></div>}
   {pair && <><div className="compare-headings"><div><b>{ui("ДО")}</b><strong>{pair.before.project.title}</strong><small>v{pair.before.project.revision}{" " + ui("· кадр") + " "}{comparisonFrame(pair.before.project, seconds)}{seconds >= comparisonDuration(pair.before.project) ? " " + ui("· конец") : ''}</small></div><div><b>{ui("ПОСЛЕ")}</b><strong>{pair.after.project.title}</strong><small>{candidate ? ui("Примерка") : `v${pair.after.project.revision}`}{" " + ui("· кадр") + " "}{comparisonFrame(pair.after.project, seconds)}{seconds >= comparisonDuration(pair.after.project) ? " " + ui("· конец") : ''}</small></div></div>
    <div className={'compare-stages ' + (mode === 'wipe' && sameRatio ? 'wipe' : 'side')} style={{ '--wipe': wipe + '%', '--ratio': after.size.width + '/' + after.size.height } as React.CSSProperties}>
     <div className="compare-stage compare-before"><ComparisonStage snapshot={pair.before} frame={comparisonFrame(pair.before.project, seconds)} label={ui("Кадр до изменения")}/></div><div className="compare-stage compare-after"><ComparisonStage snapshot={pair.after} frame={comparisonFrame(pair.after.project, seconds)} label={ui("Кадр после изменения")}/></div>
     {mode === 'wipe' && sameRatio && <><span className="compare-wipe-line"/><input className="compare-wipe-input" type="range" aria-label={ui("Граница сравнения")} min="0" max="100" value={wipe} onChange={e => setWipe(Number(e.target.value))}/></>}
    </div>
   </>}
  </div>
  <footer><div className="compare-transport"><button className="icon-button" aria-label={ui("В начало сравнения")} disabled={!pair} onClick={() => seek(0)}><Icon name="back"/></button><button className="primary" aria-label={playing ? ui("Пауза сравнения") : ui("Воспроизвести сравнение")} disabled={!pair} onClick={toggle}><Icon name={playing ? 'pause' : 'play'}/></button><button className="icon-button" aria-label={ui("Предыдущий кадр сравнения")} disabled={!pair} onClick={() => seek(seconds - 1 / fps)}>−1</button><button className="icon-button" aria-label={ui("Следующий кадр сравнения")} disabled={!pair} onClick={() => seek(seconds + 1 / fps)}>+1</button><input type="range" aria-label={ui("Время сравнения")} min="0" max={duration} step="0.001" disabled={!pair} value={seconds} onChange={e => seek(Number(e.target.value))}/><label className="compare-time"><input type="number" aria-label={ui("Секунда сравнения")} min="0" max={duration} step={1 / fps} value={Number(seconds.toFixed(3))} disabled={!pair} onChange={e => seek(Number(e.target.value))}/><output>/ {duration.toFixed(2)}{" " + ui("с")}</output></label><button className="icon-button" aria-label={ui("В конец сравнения")} disabled={!pair} onClick={() => seek(duration)}><Icon name="next"/></button></div>
   <div className="compare-info"><p>{summary.filter(([, v]) => v.added || v.removed || v.changed).map(([label, v]) => `${label}: ${v.added ? `+${v.added} ` : ''}${v.removed ? `−${v.removed} ` : ''}${v.changed ? ui("изменено {0}", [v.changed]) : ''}`).join(' · ')}{changes?.camera ? " " + ui("· Камера изменена") : ''}</p>{audioError && <p role="status" className="field-warning">{audioError}</p>}<span>{ui("Общий таймер · без повтора ·") + " "}{candidate ? ui("проект изменится после применения") : ui("просмотр не изменяет проекты")}</span>{project.revision !== (base ?? after).revision && <span className="field-warning">{ui("Проект обновился. Здесь показаны снимки на момент открытия.")}</span>}{onApply && <button className="primary" disabled={!pair} onClick={() => { setPlaying(false); onApply(); }}>{ui("Применить правку")}</button>}</div>
  </footer><ComparisonSound snapshot={selectedSound} seconds={seconds} playing={playing && !!pair} onError={setAudioError}/>
 </dialog>;
}
