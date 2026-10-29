import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui, uiLabel } from './i18n.ts';
import { readPreferences } from './preferences.ts';
import { BeforeAfter } from './BeforeAfter.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, CameraTrack, AudioTrack } from '../../domain/schema.ts';
import type { Operation } from '../../domain/operations.ts';
import { COMPOSITIONS, PALETTES, compositionSettings as sourceCompositionSettings, buildComposition, compositionFixture, type CompositionSettings, type CompositionId } from '../../domain/compositions.ts';
import { FrameCanvas, useLoop } from './PreviewCanvas.tsx';
import { useSynthPlayback } from './useSynthPlayback.ts';
import type { AssetBitmaps, ThreeLayerRenderer } from '../../render/renderFrame.ts';
import { createThreeAdapter, type ThreeAdapter } from '../../render/threeAdapter.ts';
import { api } from './api.ts';
import { Icon } from './Icon.tsx';
type Props = {
    project: Project;
    frame: number;
    bitmaps: AssetBitmaps;
    threeLayer?: ThreeLayerRenderer;
    onApply: (description: string, operations: Operation[], revision: number) => Promise<boolean>;
    onSelect: (id: string) => void;
    onSeek: (frame: number) => void;
    onClose: () => void;
};
function compositionSettings(...args: Parameters<typeof sourceCompositionSettings>) { const s = sourceCompositionSettings(...args); return { ...s, title: uiLabel(s.title), subtitle: uiLabel(s.subtitle) }; }
const example = compositionFixture(true);
const examples = COMPOSITIONS.map(c => buildComposition(example, compositionSettings(example, 'scene', c.id), 'example-' + c.id).project);
export function CompositionLibrary({ project, frame, bitmaps, threeLayer, onApply, onSelect, onSeek, onClose }: Props) {
    const [exampleThree, setExampleThree] = useState<ThreeAdapter | null>(null);
    useEffect(() => {
        try {
            const a = createThreeAdapter(example);
            setExampleThree(a);
            return () => a.dispose();
        }
        catch {
            setError(ui("3D-примеры недоступны. Примерка на своей сцене работает."));
        }
    }, []);
    const scene = project.sequences.find(s => frame >= s.fromFrame && frame < s.toFrame) ?? project.sequences[0]!;
    const dialog = useRef<HTMLDialogElement | null>(null), [tab, setTab] = useState<'library' | 'tracks'>('library'), [settings, setSettings] = useState(() => compositionSettings(project, scene.id)), [baseRevision, setBaseRevision] = useState(project.revision), [actual, setActual] = useState(true), [before, setBefore] = useState(false), [playing, setPlaying] = useState(false), [repeat, setRepeat] = useState(false), [muted, setMuted] = useState(true), [previewFrame, setPreviewFrame] = useState(0), [saving, setSaving] = useState(false), [error, setError] = useState(''), [mobile, setMobile] = useState(false), [animate, setAnimate] = useState(() => readPreferences().animatePreviews);
    const [thumbFrame] = useLoop(animate && tab === 'library', 180, 24), latest = useRef(previewFrame);
    latest.current = previewFrame;
    const plan = useMemo(() => {
        try {
            return { value: buildComposition(project, settings, 'trial'), error: '' };
        }
        catch (e) {
            return { value: null, error: errorText(e) };
        }
    }, [project, settings]);
    const chosen = COMPOSITIONS.find(c => c.id === settings.id)!, fixture = examples[COMPOSITIONS.findIndex(c => c.id === settings.id)]!, length = actual ? settings.durationFrames : 180, from = actual ? settings.fromFrame : 0, shown = actual ? (before ? project : plan.value?.project ?? project) : fixture, shownFrame = from + Math.min(previewFrame, Math.max(0, length - 1)), stale = baseRevision !== project.revision;
    const soundError = useSynthPlayback(shown, shownFrame, playing && !before, muted), music = actual ? shown.audioTracks.find(t => t.kind === 'music' && t.assetId && !t.mute) : null, audioAsset = shown.assets.find(a => a.id === music?.assetId), audio = useRef<HTMLAudioElement | null>(null);
    useEffect(() => { dialog.current?.showModal(); }, []);
    useEffect(() => { setPlaying(false); setPreviewFrame(0); }, [settings.id, settings.sequenceId, settings.fromFrame, settings.durationFrames, actual]);
    useEffect(() => {
        if (!playing)
            return;
        const start = performance.now(), initial = latest.current;
        let raf = 0;
        const tick = (now: number) => {
            const f = initial + Math.floor((now - start) * shown.fps.num / shown.fps.den / 1000);
            if (f >= length) {
                if (repeat)
                    setPreviewFrame(f % length);
                else {
                    setPreviewFrame(length - 1);
                    setPlaying(false);
                    return;
                }
            }
            else
                setPreviewFrame(f);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, length, repeat, shown.fps.num, shown.fps.den]);
    useEffect(() => {
        const a = audio.current;
        if (!a || !music)
            return;
        a.muted = muted || before;
        a.volume = Math.min(1, music.gain);
        const time = shownFrame * shown.fps.den / shown.fps.num - music.offsetSeconds;
        if (!playing || time < 0) {
            a.pause();
            return;
        }
        if (a.paused || Math.abs(a.currentTime - time) > .14) {
            a.currentTime = Math.max(0, time);
            void a.play().catch(() => setError(ui("Музыку не удалось запустить. Акценты и изображение доступны.")));
        }
    }, [shownFrame, playing, muted, before, music, audioAsset]);
    useEffect(() => { const a = audio.current; return () => a?.pause(); }, [audioAsset?.id]);
    const change = <K extends keyof CompositionSettings>(key: K, value: CompositionSettings[K]) => { setSettings(s => ({ ...s, [key]: value })); setError(''); };
    function choose(id: CompositionId) { const defaults = compositionSettings(project, settings.sequenceId, id); setSettings(s => ({ ...s, id, title: defaults.title, subtitle: defaults.subtitle, palette: defaults.palette, sound: defaults.sound })); setBefore(false); setMobile(true); }
    async function apply() {
        if (!plan.value || stale || saving)
            return;
        setSaving(true);
        setPlaying(false);
        try {
            const next = buildComposition(project, settings, crypto.randomUUID().replaceAll('-', '').slice(0, 16));
            if (await onApply(ui("Сочетание «") + uiLabel(chosen.name) + '»', next.operations, baseRevision)) {
                onSeek(next.accentFrame);
                onSelect(next.rootId.replace(/-root$/, '-title-0'));
                onClose();
            }
            else
                setError(ui("Не удалось сохранить. Примерка осталась открыта."));
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setSaving(false);
        }
    }
    async function commitTrack(name: string, ops: Operation[]) {
        setSaving(true);
        setError('');
        try {
            if (!await onApply(name, ops, project.revision))
                setError(ui("Правка не сохранена. Проверь ревизию проекта."));
        }
        finally {
            setSaving(false);
        }
    }
    return <dialog className="composition-dialog" ref={dialog} aria-labelledby="composition-title" data-detail={mobile} onCancel={e => {
            e.preventDefault();
            if (!saving)
                onClose();
        }}>
  <header className="composition-header"><div><span className="eyebrow">{ui("БИБЛИОТЕКА")}</span><h2 id="composition-title">{ui("Готовые композиции")}</h2></div><div className="composition-header-actions"><button className="composition-live" aria-label={animate ? ui("Остановить карточки") : ui("Оживить карточки")} onClick={() => setAnimate(v => !v)}><Icon name={animate ? 'pause' : 'play'} size={14}/><span>{animate ? ui("Остановить превью") : ui("Запустить превью")}</span></button><button className="icon-button" disabled={saving} aria-label={ui("Закрыть сочетания")} onClick={onClose}><Icon name="close"/></button></div></header>
  <nav className="composition-tabs"><button className={tab === 'library' ? 'current' : ''} onClick={() => { setTab('library'); setPlaying(false); }}>{ui("Композиции") + " "}<small>03</small></button><button className={tab === 'tracks' ? 'current' : ''} onClick={() => { setTab('tracks'); setPlaying(false); }}>{ui("Камера и звук в проекте") + " "}<small>{project.cameraTracks.filter(t => t.scope).length}</small></button></nav>
  {tab === 'tracks' ? <div className="composition-tracks"><div className="composition-track-intro"><h3>{ui("Камера и звуковые акценты")}</h3><p>{ui("Надписи, свет и частицы доступны в слоях. Здесь можно изменить их дорожки.")}</p></div>{project.cameraTracks.filter(t => t.scope).map(t => <CameraEditor key={t.id + '-' + project.revision} track={t} busy={saving} onSeek={onSeek} commit={commitTrack}/>)}{project.audioTracks.filter(t => t.synth).map(t => <SoundEditor key={t.id + '-' + project.revision} track={t} project={project} busy={saving} commit={commitTrack}/>)}{!project.cameraTracks.some(t => t.scope) && !project.audioTracks.some(t => t.synth) && <p className="composition-empty">{ui("После применения здесь появятся камера и звуковой акцент.")}</p>}{error && <div role="alert" className="field-warning"><DiagnosticText message={error}/></div>}</div> : <div className="composition-body"><aside className="composition-cards"><button className="text-button mobile-composition-back" onClick={() => setMobile(true)}>{ui("К примерке →")}</button>{COMPOSITIONS.map((c, i) => <button key={c.id} className={'composition-card ' + (c.id === settings.id ? 'selected' : '')} aria-label={ui("Сочетание") + " " + uiLabel(c.name)} onClick={() => choose(c.id)}><div className="composition-card-art"><FrameCanvas project={examples[i]!} threeLayer={exampleThree?.layer} frame={Math.floor(thumbFrame / 2) * 2} label={ui("Живое превью") + " " + uiLabel(c.name)}/><span>0{i + 1}</span></div><div className="composition-card-copy"><small style={{ color: c.color }}>{uiLabel(c.tag)}</small><h3>{uiLabel(c.name)}<Icon name="arrow" size={18}/></h3><p>{uiLabel(c.description)}</p></div></button>)}<div className="composition-footnote"><Icon name="layers" size={16}/><p>{ui("После применения слои, эффекты и дорожки редактируются отдельно.")}</p></div></aside>
   <section className="composition-detail"><button className="text-button mobile-composition-back" onClick={() => setMobile(false)}>{ui("← Все сочетания")}</button><div className="composition-preview-heading"><div><small>{uiLabel(chosen.tag)}</small><h3>{uiLabel(chosen.name)}</h3></div><div className="gallery-preview-tabs"><button className={!actual ? 'current' : ''} onClick={() => setActual(false)}>{ui("Пример")}</button><button className={actual ? 'current' : ''} onClick={() => setActual(true)}>{ui("В проекте")}</button><BeforeAfter before={before} disabled={!actual} onChange={value => { setBefore(value); setPlaying(false); }}/></div></div>
    <div className="composition-stage"><FrameCanvas project={shown} frame={shownFrame} bitmaps={actual ? bitmaps : undefined} threeLayer={actual ? threeLayer : exampleThree?.layer} label={ui("Примерка сочетания")}/><span>{actual ? (before ? ui("ДО") : ui("ПРИМЕРКА · НЕ СОХРАНЕНО")) : ui("ПРИМЕР")}</span></div>
    <div className="composition-transport"><button className="play-button" aria-label={playing ? ui("Остановить сочетание") : ui("Воспроизвести сочетание")} onClick={() => {
                if (previewFrame >= length - 1)
                    setPreviewFrame(0);
                setPlaying(v => !v);
            }}><Icon name={playing ? 'pause' : 'play'} size={17}/></button><input type="range" aria-label={ui("Кадр сочетания")} min="0" max={Math.max(0, length - 1)} value={Math.min(previewFrame, length - 1)} onChange={e => { setPlaying(false); setPreviewFrame(Number(e.target.value)); }}/><output>{(previewFrame * shown.fps.den / shown.fps.num).toFixed(2)} / {(length * shown.fps.den / shown.fps.num).toFixed(2)}{" " + ui("с")}</output><button className={'icon-button ' + (!muted ? 'active' : '')} aria-label={muted ? ui("Включить звук сочетания") : ui("Выключить звук сочетания")} onClick={() => setMuted(v => !v)}><Icon name={muted ? 'muted' : 'volume'} size={17}/></button><label><input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)}/>{ui("Цикл")}</label></div>
    {audioAsset && <audio ref={audio} key={audioAsset.id} src={api.assetUrl(project.id, audioAsset.id)} preload="auto"/>}
    {project.cameraTracks.some(t => t.enabled !== false && t.scope?.sequenceId === settings.sequenceId && t.scope.fromFrame < settings.fromFrame + settings.durationFrames && t.scope.toFrame > settings.fromFrame) && <p className="composition-overlap">{ui("В этом интервале уже есть камера. Новое сочетание получит приоритет; прежняя дорожка сохранится.")}</p>}
    <div className="composition-controls"><label>{ui("Сцена")}<select aria-label={ui("Сцена сочетания")} value={settings.sequenceId} onChange={e => setSettings(compositionSettings(project, e.target.value, settings.id))}>{project.sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>{ui("Палитра")}<select aria-label={ui("Палитра сочетания")} value={settings.palette} onChange={e => change('palette', e.target.value as keyof typeof PALETTES)}><option value="amber">{ui("Янтарь / коралл")}</option><option value="mint">{ui("Мята / электрический синий")}</option><option value="violet">{ui("Ирис / розовый")}</option></select></label><label className="wide composition-replace"><input type="checkbox" aria-label={ui("Заменить прежние надписи")} checked={settings.replaceText} onChange={e => change('replaceText', e.target.checked)}/>{ui("Заменить прежние надписи на время сочетания · заблокированные слои сохраняются")}</label><label className="wide">{ui("Заголовок · до трёх строк")}<textarea aria-label={ui("Заголовок сочетания")} maxLength={100} value={settings.title} onChange={e => change('title', e.target.value)}/></label><label className="wide">{ui("Подзаголовок")}<input aria-label={ui("Подзаголовок сочетания")} maxLength={160} value={settings.subtitle} onChange={e => change('subtitle', e.target.value)}/></label><label>{ui("Первый кадр")}<input type="number" aria-label={ui("Первый кадр сочетания")} value={settings.fromFrame} onChange={e => { const f = Number(e.target.value); setSettings(s => ({ ...s, fromFrame: f, accentFrame: s.accentFrame + f - s.fromFrame })); }}/></label><label>{ui("Длительность, с")}<input type="number" aria-label={ui("Длительность сочетания")} step="0.1" min={24 * project.fps.den / project.fps.num} value={+(settings.durationFrames * project.fps.den / project.fps.num).toFixed(3)} onChange={e => { const n = Math.round(Number(e.target.value) * project.fps.num / project.fps.den); setSettings(s => ({ ...s, durationFrames: n, accentFrame: s.fromFrame + Math.round((n - 1) * .28) })); }}/></label><label>{ui("Акцент, кадр")}<input type="number" aria-label={ui("Кадр музыкального акцента")} value={settings.accentFrame} onChange={e => change('accentFrame', Number(e.target.value))}/></label><label>{ui("Взять метку")}<select aria-label={ui("Привязать акцент к метке")} value="" onChange={e => {
                if (e.target.value)
                    change('accentFrame', Number(e.target.value));
            }}><option value="">{ui("Выбрать из проекта…")}</option>{project.cues.filter(c => c.frame > settings.fromFrame + 1 && c.frame < settings.fromFrame + settings.durationFrames - 2).map(c => <option key={c.id} value={c.frame}>{c.frame} · {c.label}</option>)}</select></label><label>{ui("Размах движения") + " "}<b>{Math.round(settings.intensity * 100)}%</b><input type="range" aria-label={ui("Размах сочетания")} min="0" max="1" step="0.05" value={settings.intensity} onChange={e => change('intensity', Number(e.target.value))}/></label><label>{ui("Частицы") + " "}<b>{settings.particles}</b><input type="range" aria-label={ui("Частицы сочетания")} min="0" max="36" value={settings.particles} onChange={e => change('particles', Number(e.target.value))}/></label><label>{ui("Звуковой акцент")}<select aria-label={ui("Звук сочетания")} value={settings.sound} onChange={e => change('sound', e.target.value as CompositionSettings['sound'])}><option value="impact">{ui("Мягкий низкий удар")}</option><option value="chime">{ui("Гармонический сигнал")}</option><option value="sweep">{ui("Воздушный свип")}</option><option value="none">{ui("Без звука")}</option></select></label><label>{ui("Громкость") + " "}<b>{Math.round(settings.gain * 100)}%</b><input type="range" aria-label={ui("Громкость акцента")} min="0" max="1" step="0.01" value={settings.gain} onChange={e => change('gain', Number(e.target.value))}/></label></div>
    {soundError && <p className="field-warning">{soundError}</p>}{plan.error && <div role="alert" className="field-warning"><DiagnosticText message={plan.error}/></div>}{error && <div role="alert" className="field-warning"><DiagnosticText message={error}/></div>}{stale && <p className="field-warning">{ui("Проект изменился.") + " "}<button className="text-button" onClick={() => setBaseRevision(project.revision)}>{ui("Обновить примерку")}</button></p>}
    <footer className="composition-apply"><p>{plan.value ? plan.value.summary.layers + (" " + ui("слоёв ·") + " ") + plan.value.summary.effects + (" " + ui("эффектов ·") + " ") + plan.value.summary.keys + (" " + ui("ключей")) : ui("Проверь настройки")}<small>{ui("Изменения применятся одним шагом истории")}</small></p><button className="primary" disabled={!plan.value || stale || saving} onClick={() => void apply()}>{saving ? ui("Применяю…") : ui("Применить композицию")}<Icon name="arrow" size={16}/></button></footer>
   </section></div>}
 </dialog>;
}
type TrackProps = {
    busy: boolean;
    commit: (name: string, ops: Operation[]) => Promise<void>;
};
function CameraEditor({ track, onSeek, busy, commit }: TrackProps & {
    track: CameraTrack;
    onSeek: (frame: number) => void;
}) {
    const [keys, setKeys] = useState(track.keys);
    return <section className="composition-track"><header><div><small>{ui("КАМЕРА /") + " "}{track.scope!.fromFrame}–{track.scope!.toFrame - 1}</small><h3>{track.name}</h3></div><label><input type="checkbox" disabled={busy} checked={track.enabled !== false} onChange={e => void commit(ui("Включение камеры"), [{ op: 'updateCameraTrack', targetId: track.id, values: { enabled: e.target.checked } }])}/>{ui("Включена")}</label><button className="text-button" disabled={busy} onClick={() => void commit(ui("Удалить камеру сочетания"), [{ op: 'removeCameraTrack', targetId: track.id }])}>{ui("Удалить")}</button></header><div className="composition-key-table"><div>{ui("Кадр")}</div><div>{ui("Центр X")}</div><div>{ui("Центр Y")}</div><div>{ui("Масштаб")}</div><div>{ui("Поворот")}</div>{keys.map((k, i) => <div className="composition-key-row" key={i}><button disabled={busy} onClick={() => onSeek(k.frame)}>{k.frame}</button>{(['cx', 'cy', 'zoom', 'rotation'] as const).map(key => <input key={key} disabled={busy} type="number" step={key === 'zoom' ? '.01' : '1'} aria-label={track.name + ' · ' + key + ' · ' + k.frame} value={k[key]} onChange={e => setKeys(v => v.map((q, j) => j === i ? { ...q, [key]: Number(e.target.value) } : q))}/>)}</div>)}</div><button className="primary" disabled={busy} onClick={() => void commit(ui("Изменить ключи камеры"), keys.map(key => ({ op: 'setCameraKey', trackId: track.id, key })))}>{ui("Сохранить ключи")}</button></section>;
}
function SoundEditor({ track, project, busy, commit }: TrackProps & {
    track: AudioTrack;
    project: Project;
}) {
    const [value, setValue] = useState(track), [cueFrame, setCueFrame] = useState(Math.round(track.offsetSeconds * project.fps.num / project.fps.den)), s = value.synth!;
    return <section className="composition-track"><header><div><small>{ui("СИНТЕЗИРОВАННЫЙ АКЦЕНТ")}</small><h3>{project.cues.find(c => c.trackId === track.id)?.label ?? track.id}</h3></div><button className="text-button" disabled={busy} onClick={() => void commit(ui("Удалить звуковой акцент"), [{ op: 'removeAudioTrack', targetId: track.id }])}>{ui("Удалить")}</button></header><div className="composition-controls"><label>{ui("Кадр")}<input type="number" aria-label={ui("Кадр звуковой дорожки")} value={cueFrame} onChange={e => setCueFrame(Number(e.target.value))}/></label><label>{ui("Громкость")}<input type="number" min="0" max="1" step=".05" aria-label={ui("Громкость звуковой дорожки")} value={value.gain} onChange={e => setValue(v => ({ ...v, gain: Number(e.target.value) }))}/></label><label>{ui("Тембр")}<select aria-label={ui("Тембр звуковой дорожки")} value={s.voice} onChange={e => setValue(v => ({ ...v, synth: { ...s, voice: e.target.value as typeof s.voice } }))}><option value="impact">{ui("Низкий удар")}</option><option value="chime">{ui("Гармонический сигнал")}</option><option value="sweep">{ui("Свип")}</option></select></label><label>{ui("Тон, Гц")}<input type="number" aria-label={ui("Тон звуковой дорожки")} value={s.pitch} min="40" max="2000" onChange={e => setValue(v => ({ ...v, synth: { ...s, pitch: Number(e.target.value) } }))}/></label><label>{ui("Длительность, с")}<input type="number" aria-label={ui("Длина звуковой дорожки")} value={s.durationSeconds} min=".05" max="4" step=".05" onChange={e => setValue(v => ({ ...v, synth: { ...s, durationSeconds: Number(e.target.value) } }))}/></label><label><input type="checkbox" checked={!value.mute} onChange={e => setValue(v => ({ ...v, mute: !e.target.checked }))}/>{ui("Звучит")}</label></div><button className="primary" disabled={busy || !Number.isInteger(cueFrame) || cueFrame < 0 || cueFrame >= project.durationFrames} onClick={() => { const ops: Operation[] = [{ op: 'updateAudioTrack', targetId: track.id, values: { synth: value.synth, gain: value.gain, mute: value.mute, offsetSeconds: cueFrame * project.fps.den / project.fps.num } }, ...project.cues.filter(c => c.trackId === track.id).map(c => ({ op: 'updateCue' as const, targetId: c.id, values: { frame: cueFrame } }))]; void commit(ui("Изменить звуковой акцент"), ops); }}>{ui("Сохранить звук")}</button></section>;
}
