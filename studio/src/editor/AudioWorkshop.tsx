import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui, uiLabel } from './i18n.ts';
import { soundCategoryLabel } from '../../domain/catalogIds.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, AssetRef, AudioTrack, Cue } from '../../domain/schema.ts';
import { applyOperations, type Operation } from '../../domain/operations.ts';
import { newId } from '../../domain/ids.ts';
import { clipDefaults, placeSound, gridCues, gridOperations, snapPose, type SoundEntry } from '../../domain/audioEditing.ts';
import type { MusicAnalysis } from '../../domain/musicAnalysis.ts';
import { api } from './api.ts';
import { Icon } from './Icon.tsx';
import { FrameCanvas } from './PreviewCanvas.tsx';
import type { AssetBitmaps, ThreeLayerRenderer } from '../../render/renderFrame.ts';
import { useAudioPlayback } from './useAudioPlayback.ts';
type Props = {
    project: Project;
    token: string;
    currentFrame: number;
    selectedId: string | null;
    bitmaps: AssetBitmaps;
    threeLayer?: ThreeLayerRenderer;
    onApply: (label: string, ops: Operation[], revision?: number) => Promise<boolean>;
    onSeek: (frame: number) => void;
    onClose: () => void;
};
const names = { music: 'Музыка', voice: 'Голос', sfx: 'Эффект' }, cueNames = { beat: 'Доля', bar: 'Такт', phrase: 'Фраза', accent: 'Акцент', drop: 'Сброс', mark: 'Метка' };
function clock(seconds: number) { return seconds.toFixed(2) + (" " + ui("с")); }
export function AudioWorkshop({ project, token, currentFrame, selectedId, bitmaps, threeLayer, onApply, onSeek, onClose }: Props) {
    const dialog = useRef<HTMLDialogElement>(null), previewAudio = useRef<HTMLAudioElement>(null), controller = useRef<AbortController | null>(null), [sounds, setSounds] = useState<SoundEntry[]>([]), [query, setQuery] = useState(''), [category, setCategory] = useState('all'), [tab, setTab] = useState('sounds'), [error, setError] = useState(''), [message, setMessage] = useState(''), [working, setWorking] = useState(false);
    const [operations, setOperations] = useState<Operation[]>([]), [baseRevision, setBaseRevision] = useState(project.revision), [position, setPosition] = useState(currentFrame), [trackId, setTrackId] = useState(project.audioTracks.find(t => t.kind === 'music')?.id ?? ''), [selectedCue, setSelectedCue] = useState(''), [alignment, setAlignment] = useState<'start' | 'peak' | 'end'>('peak');
    const [bpm, setBpm] = useState('120'), [first, setFirst] = useState('0'), [every, setEvery] = useState('4'), [rangeFrom, setRangeFrom] = useState('0'), [rangeTo, setRangeTo] = useState(String(project.durationFrames - 1)), [replace, setReplace] = useState(true), [analysis, setAnalysis] = useState<MusicAnalysis | null>(null), [analysisStart, setAnalysisStart] = useState(0);
    const fps = project.fps.num / project.fps.den, stale = project.revision !== baseRevision;
    const trial = useMemo(() => {
        try {
            return { project: operations.length ? applyOperations(project, operations) : project, error: '' };
        }
        catch (e) {
            return { project, error: errorText(e) };
        }
    }, [project, operations]), view = trial.project, track = view.audioTracks.find(t => t.id === trackId), asset = view.assets.find(a => a.id === track?.assetId), cue = view.cues.find(c => c.id === selectedCue), audio = useAudioPlayback(view, false);
    const musicTracks = view.audioTracks.filter(t => t.kind === 'music' && t.assetId), [musicId, setMusicId] = useState(project.audioTracks.find(t => t.kind === 'music' && t.assetId)?.id ?? ''), music = view.audioTracks.find(t => t.id === musicId);
    useEffect(() => { dialog.current?.showModal(); void api.sounds().then(setSounds).catch(e => setError(errorText(e))); return () => { controller.current?.abort(); previewAudio.current?.pause(); dialog.current?.close(); }; }, []);
    useEffect(() => {
        if (audio.error)
            setError(audio.error);
    }, [audio.error]);
    useEffect(() => {
        const area = dialog.current?.querySelector('.audio-controls-scroll');
        if (area)
            area.scrollTop = 0;
    }, [tab]);
    useEffect(() => {
        if (audio.phase !== 'playing')
            return;
        let raf = 0;
        function tick() {
            const time = audio.time();
            if (time !== null) {
                if (time >= view.durationFrames / fps) {
                    audio.pause();
                    setPosition(view.durationFrames - 1);
                    return;
                }
                setPosition(Math.floor(time * fps));
            }
            raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [audio.phase, view.durationFrames, fps]);
    const stop = () => { audio.pause(); previewAudio.current?.pause(); };
    function add(ops: Operation[], text: string) {
        if (stale || working)
            return;
        stop();
        try {
            applyOperations(view, ops);
            setOperations(old => [...old, ...ops]);
            setError('');
            setMessage(text + (" " + ui("· пока только примерка")));
        }
        catch (e) {
            setError(errorText(e));
        }
    }
    function reset() { stop(); setOperations([]); setBaseRevision(project.revision); setError(''); setMessage(ui("Примерка сброшена")); setSelectedCue(''); }
    function seek(frame: number) { stop(); setPosition(Math.max(0, Math.min(view.durationFrames - 1, Math.round(frame)))); }
    async function play() {
        previewAudio.current?.pause();
        audio.unlock();
        if (audio.phase === 'playing')
            audio.pause();
        else
            await audio.play(position >= view.durationFrames - 1 ? 0 : position / fps);
    }
    async function useSound(entry: SoundEntry) {
        if (stale || working)
            return;
        stop();
        setWorking(true);
        setError('');
        try {
            const staged = await api.stageSound(project.id, token, { soundId: entry.id, expectedRevision: baseRevision }), a = view.assets.find(a => a.sha256 === staged.asset.sha256) ?? { ...staged.asset, title: uiLabel(staged.asset.title ?? entry.title) }, t = placeSound(view, a, position, alignment, entry.peakSeconds, newId('sound'), { ...entry, title: uiLabel(entry.title) }), ops: Operation[] = [...(!view.assets.some(x => x.id === a.id) ? [{ op: 'addAsset' as const, asset: a }] : []), { op: 'addAudioTrack', track: t }];
            applyOperations(view, ops);
            setOperations(old => [...old, ...ops]);
            setTrackId(t.id);
            setTab('tracks');
            setMessage(ui("Звук поставлен на кадр") + " " + position + (" " + ui("· примерка")));
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setWorking(false);
        }
    }
    async function listen(entry: SoundEntry) {
        stop();
        const element = previewAudio.current!;
        element.src = '/sounds/' + entry.file;
        element.volume = Math.min(1, entry.suggestedGain);
        try {
            await element.play();
        }
        catch (e) {
            setError(errorText(e));
        }
    }
    async function analyze() {
        if (!music || stale || working)
            return;
        stop();
        setWorking(true);
        setError('');
        setMessage(ui("Ищу атаки и темп…"));
        const c = new AbortController();
        controller.current = c;
        try {
            const out = await api.analyzeAudio(project.id, token, { trackId: music.id, expectedRevision: baseRevision }, c.signal);
            if (c.signal.aborted)
                return;
            setAnalysis(out.analysis);
            setAnalysisStart(out.timelineStartSeconds);
            if (out.analysis.bpm) {
                setBpm(String(out.analysis.bpm));
                setFirst((out.timelineStartSeconds + out.analysis.firstBeatSeconds).toFixed(3));
                setMessage(ui("Сетка предложена. Проверьте темп и первую долю."));
            }
            else
                setMessage(out.analysis.warnings.join(' '));
        }
        catch (e) {
            if ((e as Error).name !== 'AbortError')
                setError(errorText(e));
        }
        finally {
            if (controller.current === c) {
                controller.current = null;
                setWorking(false);
            }
        }
    }
    function makeGrid() {
        if (!music)
            return;
        try {
            const cues = gridCues(view, music.id, Number(bpm), Number(first), Number(every), Number(rangeFrom), Number(rangeTo), 'musicgrid-' + newId('set')).map((c, i) => ({ ...c, label: ui(c.kind === 'bar' ? 'Такт' : 'Доля') + ' ' + (i + 1) }));
            add(gridOperations(view, music.id, cues, replace), ui("{0} музыкальных меток", [cues.length]));
        }
        catch (e) {
            setError(errorText(e));
        }
    }
    function editTrack(values: Partial<AudioTrack>) {
        if (track)
            add([{ op: 'updateAudioTrack', targetId: track.id, values }], ui("Дорожка изменена"));
    }
    function clipField(name: keyof NonNullable<AudioTrack['clip']>, value: number) {
        if (!track)
            return;
        editTrack({ clip: { ...(track.clip ?? clipDefaults(asset?.durationSeconds ?? track.synth?.durationSeconds ?? view.durationFrames / fps)), [name]: value } });
    }
    async function apply() {
        if (!operations.length || stale || working || trial.error)
            return;
        stop();
        setWorking(true);
        try {
            if (await onApply(ui("Звук и музыкальный монтаж"), operations, baseRevision)) {
                setOperations([]);
                onSeek(position);
                onClose();
            }
        }
        finally {
            setWorking(false);
        }
    }
    const waveform = analysis?.waveform ?? [], visible = view.cues.filter(c => c.trackId === musicId || c.kind === 'phrase' || c.kind === 'accent').sort((a, b) => a.frame - b.frame), clip = track?.clip ?? clipDefaults(asset?.durationSeconds ?? track?.synth?.durationSeconds ?? 1), categories = ['all', ...new Set(sounds.map(s => s.category))];
    return <dialog ref={dialog} className="audio-workshop" aria-labelledby="audio-title" onCancel={e => { e.preventDefault(); stop(); onClose(); }}>
 <header className="audio-header"><div><span className="eyebrow">{ui("МОНТАЖ")}</span><h2 id="audio-title"><Icon name="volume" size={23}/>{" " + ui("Звук и ритм")}</h2></div><div className="audio-header-actions"><span className={operations.length ? 'audio-draft-badge' : 'audio-saved-badge'}>{operations.length ? ui("Примерка · не применено") : ui("Сохранённый проект")}</span><button className="icon-button" aria-label={ui("Закрыть звук без применения")} disabled={working} onClick={() => { stop(); onClose(); }}><Icon name="close"/></button></div></header>
 <div className="audio-workspace"><section className="audio-controls"><nav className="audio-tabs">{[['sounds', ui("Библиотека")], ['tracks', ui("Дорожки")], ['beats', ui("Музыкальные метки")]].map(([id, label]) => <button key={id} className={tab === id ? 'current' : ''} onClick={() => setTab(id!)}>{label}</button>)}</nav><div className="audio-controls-scroll">
 {tab === 'sounds' && <><h3>{ui("Звук для действия")}</h3><p className="audio-description">{ui("Сначала прослушайте. Пик, начало или конец звука можно поставить точно на кадр.")}</p><input className="audio-search" aria-label={ui("Найти звук")} placeholder={ui("Щелчок, стекло, открытие…")} value={query} onChange={e => setQuery(e.target.value)}/><div className="audio-categories">{categories.map(c => <button data-category-id={c} key={c} className={category === c ? 'current' : ''} onClick={() => setCategory(c)}>{uiLabel(soundCategoryLabel(c))}</button>)}</div><label className="audio-align">{ui("Совместить с текущим кадром")}<select aria-label={ui("Выравнивание звука")} value={alignment} onChange={e => setAlignment(e.target.value as typeof alignment)}><option value="peak">{ui("Пик звука")}</option><option value="start">{ui("Начало")}</option><option value="end">{ui("Конец")}</option></select></label><div className="sound-cards">{sounds.filter(s => (category === 'all' || s.category === category) && [uiLabel(s.title), ...s.tags].join(' ').toLowerCase().includes(query.toLowerCase())).map(s => <article className="sound-card" key={s.id} data-sound-id={s.id}><button className="sound-listen" aria-label={ui("Прослушать:") + " " + uiLabel(s.title)} onClick={() => void listen(s)}><Icon name="play" size={15}/></button><div><strong>{uiLabel(s.title)}</strong><small>{uiLabel(soundCategoryLabel(s.category))} · {s.durationSeconds.toFixed(2)}{" " + ui("с ·") + " "}{s.credit.license}</small></div><button className="text-button" disabled={stale || working} onClick={() => void useSound(s)}>{ui("Примерить +")}</button><a href={s.credit.source} target="_blank" rel="noreferrer" className="sound-source" aria-label={ui("Источник:") + " " + uiLabel(s.title)}>Kenney ↗</a></article>)}</div><p className="audio-footnote">{ui("12 отобранных звуков CC0. Собственные WAV/MP3 добавляются через «Ресурсы». Источник библиотечного звука сохраняется в дорожке и ZIP.")}</p></>}
 {tab === 'tracks' && <><h3>{ui("Звуковые дорожки") + " "}<small>{view.audioTracks.length}</small></h3><div className="audio-track-list">{view.audioTracks.map(t => <button key={t.id} className={t.id === trackId ? 'current' : ''} onClick={() => setTrackId(t.id)}><Icon name={t.kind === 'music' ? 'motion' : 'volume'} size={15}/><span><strong>{t.name ?? view.assets.find(a => a.id === t.assetId)?.title ?? t.synth?.voice ?? t.id}</strong><small>{uiLabel(names[t.kind])} · {clock(t.offsetSeconds)}{t.mute ? " " + ui("· выключена") : ''}</small></span></button>)}</div>{track && <div className="audio-track-form" key={track.id}><label>{ui("Название")}<input aria-label={ui("Название звуковой дорожки")} defaultValue={track.name ?? asset?.title ?? track.id} onBlur={e => {
                    if (e.target.value !== (track.name ?? asset?.title ?? track.id))
                        editTrack({ name: e.target.value });
                }}/></label><div className="field-grid"><label>{ui("Громкость, %")}<input aria-label={ui("Громкость дорожки, проценты")} type="number" min="0" max="400" value={Math.round(track.gain * 100)} onChange={e => editTrack({ gain: Number(e.target.value) / 100 })}/></label><label>{ui("Начало в ролике, с")}<input aria-label={ui("Начало дорожки, секунды")} type="number" step="0.01" value={Number(track.offsetSeconds.toFixed(4))} onChange={e => editTrack({ offsetSeconds: Number(e.target.value) })}/></label><label>{ui("Начало в файле, с")}<input aria-label={ui("Начало в исходном файле")} type="number" min="0" step="0.01" value={clip.sourceStartSeconds} onChange={e => clipField('sourceStartSeconds', Number(e.target.value))}/></label><label>{ui("Длительность, с")}<input aria-label={ui("Длительность звукового фрагмента")} type="number" min="0.001" step="0.01" value={clip.durationSeconds} onChange={e => clipField('durationSeconds', Number(e.target.value))}/></label><label>{ui("Плавное начало, с")}<input aria-label={ui("Плавное начало звука")} type="number" min="0" step="0.01" value={clip.fadeInSeconds} onChange={e => clipField('fadeInSeconds', Number(e.target.value))}/></label><label>{ui("Затухание, с")}<input aria-label={ui("Затухание звука")} type="number" min="0" step="0.01" value={clip.fadeOutSeconds} onChange={e => clipField('fadeOutSeconds', Number(e.target.value))}/></label></div><label>{ui("Панорама") + " "}<output>{clip.pan < 0 ? ui("Левее") : clip.pan > 0 ? ui("Правее") : ui("По центру")} · {clip.pan.toFixed(2)}</output><input aria-label={ui("Панорама звука")} type="range" min="-1" max="1" step="0.05" value={clip.pan} onChange={e => clipField('pan', Number(e.target.value))}/></label>{track.kind !== 'music' && <label>{ui("Приглушить музыку под этой дорожкой, дБ")}<input aria-label={ui("Приглушение музыки под звуком")} type="number" min="0" max="24" value={clip.duckMusicDb} onChange={e => clipField('duckMusicDb', Number(e.target.value))}/></label>}<label className="setting-check"><input type="checkbox" checked={track.mute} onChange={e => editTrack({ mute: e.target.checked })}/>{ui("Не включать в ролик")}</label>{track.credit && <p className="audio-credit">{track.credit.author} · {track.credit.license} · <a href={track.credit.source} target="_blank" rel="noreferrer">{ui("Источник ↗")}</a></p>}<button className="text-button danger" onClick={() => { add([{ op: 'removeAudioTrack', targetId: track.id }], ui("Дорожка убрана")); setTrackId(''); }}>{ui("Убрать дорожку")}</button></div>}{!track && <p className="audio-description">{ui("Выберите дорожку или примерьте звук из библиотеки.")}</p>}</>}
 {tab === 'beats' && <><h3>{ui("Монтаж под музыку")}</h3><p className="audio-description">{ui("Найдите доли, задайте первую долю такта и поправьте сетку. Границы фраз и важные акценты ставятся отдельно.")}</p><label>{ui("Музыкальная дорожка")}<select aria-label={ui("Музыка для анализа")} value={musicId} onChange={e => { setMusicId(e.target.value); setAnalysis(null); }}><option value="">{ui("Выберите музыку…")}</option>{musicTracks.map(t => <option key={t.id} value={t.id}>{t.name ?? view.assets.find(a => a.id === t.assetId)?.title ?? t.id}</option>)}</select></label><button className="audio-analyze" disabled={!music || working || stale || operations.length > 0} onClick={() => void analyze()}><Icon name="motion" size={16}/>{working ? ui("Анализирую…") : ui("Найти доли в музыке")}</button>{operations.length > 0 && <p className="audio-footnote">{ui("Для нового анализа примените или сбросьте примерку. Сетку по BPM можно менять и сейчас.")}</p>}{analysis && <p className="audio-analysis-note">{analysis.bpm ? ui("Предложено {0} BPM · {1} ритм.", [analysis.bpm, analysis.confidence < .25 ? ui("слабый") : ui("выраженный")]) : ui("Темп не найден.")} {analysis.warnings.join(' ')}{" " + ui("Возможен половинный или двойной темп — сравните кнопками ÷2 и ×2.")}</p>}<div className="field-grid"><label>BPM<input aria-label={ui("Темп BPM")} type="number" min="30" max="300" step="0.1" value={bpm} onChange={e => setBpm(e.target.value)}/></label><div className="audio-tempo-alternatives"><button className="text-button" onClick={() => setBpm(String(Math.max(30, Number(bpm) / 2)))}>{ui("÷2 темп")}</button><button className="text-button" onClick={() => setBpm(String(Math.min(300, Number(bpm) * 2)))}>{ui("×2 темп")}</button></div><label>{ui("Первая доля, с")}<input aria-label={ui("Первая доля, секунды")} type="number" step="0.01" value={first} onChange={e => setFirst(e.target.value)}/></label><label>{ui("Шаг")}<select aria-label={ui("Шаг музыкальных меток")} value={every} onChange={e => setEvery(e.target.value)}>{[1, 2, 4, 8, 16].map(n => <option key={n} value={n}>{n === 1 ? ui("Каждая доля") : ui("Каждые") + " " + n + (" " + ui("доли"))}</option>)}</select></label><label>{ui("Начальный кадр")}<input aria-label={ui("Начало музыкальной сетки")} type="number" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}/></label><label>{ui("Конечный кадр")}<input aria-label={ui("Конец музыкальной сетки")} type="number" value={rangeTo} onChange={e => setRangeTo(e.target.value)}/></label></div><div className="audio-grid-actions"><button className="text-button" onClick={() => setFirst((position / fps).toFixed(3))}>{ui("Первая доля здесь")}</button><label className="setting-check"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)}/>{ui("Заменить прежнюю сетку")}</label><button className="primary" disabled={!music || stale || working} onClick={makeGrid}>{ui("Примерить сетку")}</button></div><p className="audio-footnote">{ui("Заменяются только автоматически созданные музыкальные метки этой дорожки. Авторские фразы и акценты сохраняются.")}</p><div className="audio-mark-actions"><button className="text-button" onClick={() => add([{ op: 'addCue', cue: { id: newId('phrase'), trackId: musicId || null, frame: position, kind: 'phrase', label: ui("Начало фразы") } }], ui("Граница фразы"))}>{ui("+ Фраза здесь")}</button><button className="text-button" onClick={() => add([{ op: 'addCue', cue: { id: newId('accent'), trackId: musicId || null, frame: position, kind: 'accent', label: ui("Акцент") } }], ui("Музыкальный акцент"))}>{ui("+ Акцент здесь")}</button></div><div className="audio-cue-list">{visible.map(c => <button key={c.id} className={selectedCue === c.id ? 'current' : ''} onClick={() => { setSelectedCue(c.id); seek(c.frame); }}><i className={'cue-dot ' + c.kind}/><span>{c.label || uiLabel(cueNames[c.kind])}</span><small>{c.frame} · {clock(c.frame / fps)}</small></button>)}</div>{cue && <div className="audio-cue-edit"><label>{ui("Подпись")}<input key={cue.id} aria-label={ui("Подпись музыкальной метки")} defaultValue={cue.label} onBlur={e => {
                    if (cue.label !== e.target.value)
                        add([{ op: 'updateCue', targetId: cue.id, values: { label: e.target.value } }], ui("Подпись метки"));
                }}/></label><label>{ui("Кадр")}<input aria-label={ui("Кадр музыкальной метки")} type="number" min="0" max={view.durationFrames - 1} value={cue.frame} onChange={e => add([{ op: 'updateCue', targetId: cue.id, values: { frame: Number(e.target.value) } }], ui("Метка сдвинута"))}/></label><button className="text-button" disabled={!selectedId} onClick={() => {
                    try {
                        add(snapPose(view, selectedId!, currentFrame, cue.frame), ui("Ключ объекта на музыкальной метке"));
                        seek(cue.frame);
                    }
                    catch (e) {
                        setError(errorText(e));
                    }
                }}>{ui("Поставить позу выбранного объекта на метку")}</button><button className="text-button danger" onClick={() => { add([{ op: 'removeCue', targetId: cue.id }], ui("Метка убрана")); setSelectedCue(''); }}>{ui("Убрать метку")}</button></div>}</>}
 </div></section><section className="audio-preview"><div className="audio-preview-title"><span>{operations.length ? ui("Примерка картины и звука") : ui("Проект")}</span><span>{view.audioTracks.length}{" " + ui("дорожек ·") + " "}{view.cues.length}{" " + ui("меток")}</span></div><div className="audio-frame"><FrameCanvas project={view} frame={position} bitmaps={bitmaps} threeLayer={threeLayer}/></div><div className="audio-preview-transport"><button className="play-button" aria-label={audio.phase === 'playing' ? ui("Остановить звуковую примерку") : ui("Прослушать ролик с примеркой")} onClick={() => void play()} disabled={working || stale}><Icon name={audio.phase === 'playing' ? 'pause' : 'play'}/></button><strong>{clock(position / fps)}</strong><span>/ {clock(view.durationFrames / fps)}</span><label>{ui("Кадр")}<input aria-label={ui("Кадр звуковой примерки")} type="number" value={position} min="0" max={view.durationFrames - 1} onChange={e => seek(Number(e.target.value))}/></label></div><div className="audio-waveform" onPointerDown={e => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * (view.durationFrames - 1)); }}><svg viewBox="0 0 720 100" preserveAspectRatio="none" aria-label={ui("Волновая форма и музыкальные метки")}><line x1="0" y1="50" x2="720" y2="50" className="wave-zero"/>{waveform.map((v, i) => <line key={i} x1={(analysisStart + i / waveform.length * (analysis?.durationSeconds ?? 0)) / (view.durationFrames / fps) * 720} x2={(analysisStart + i / waveform.length * (analysis?.durationSeconds ?? 0)) / (view.durationFrames / fps) * 720} y1={50 - v * 46} y2={50 + v * 46} className="wave-sample"/>)}{view.cues.map(c => <line key={c.id} x1={c.frame / view.durationFrames * 720} x2={c.frame / view.durationFrames * 720} y1={c.kind === 'phrase' ? 0 : 25} y2="100" className={'wave-cue ' + c.kind}/>)}<line x1={position / view.durationFrames * 720} x2={position / view.durationFrames * 720} y1="0" y2="100" className="wave-playhead"/></svg>{!waveform.length && <span>{ui("Нажмите «Найти доли», чтобы увидеть волну музыки")}</span>}</div><input className="audio-preview-seek" aria-label={ui("Перемотка звуковой примерки")} type="range" min="0" max={view.durationFrames - 1} value={position} onChange={e => seek(Number(e.target.value))}/><div className="audio-strip">{view.audioTracks.map(t => { const a = view.assets.find(a => a.id === t.assetId), start = Math.max(0, t.offsetSeconds * fps), duration = (t.clip?.durationSeconds ?? a?.durationSeconds ?? t.synth?.durationSeconds ?? 1) * fps; return <button key={t.id} className={'audio-strip-track ' + t.kind + (t.id === trackId ? ' current' : '')} style={{ marginLeft: `${Math.min(98, start / view.durationFrames * 100)}%`, width: `${Math.max(2, Math.min(100 - start / view.durationFrames * 100, duration / view.durationFrames * 100))}%` }} onClick={() => { setTrackId(t.id); setTab('tracks'); }} title={t.name ?? a?.title ?? t.id}>{uiLabel(names[t.kind])} · {t.name ?? a?.title ?? t.synth?.voice}</button>; })}</div><p className="audio-description">{operations.length ? ui("Примерка ещё не сохранена. После применения дорожки, ресурсы, метки и ключи останутся редактируемыми.") : ui("Показана сохранённая версия. Измените звук или метки, прослушайте примерку и примените результат.")}</p>{(error || trial.error) && <div className="field-warning" role="alert"><DiagnosticText message={error || trial.error}/></div>}{message && <p className="audio-message" role="status">{message}</p>}{stale && <p className="field-warning" role="alert">{ui("Проект изменился в другом окне. Примерка сохранена в этой панели; сбросьте её и перечитайте проект перед новой правкой.")}</p>}</section></div>
 <footer className="audio-footer"><span>{operations.length ? ui("{0} изменений в примерке", [operations.length]) : ui("Добавьте звук или музыкальные метки")}{" " + ui("· после применения доступна отмена")}</span><button className="text-button" disabled={working} onClick={reset}>{stale ? ui("Сбросить и обновить") : ui("Сбросить примерку")}</button><button className="primary" disabled={!operations.length || stale || working || !!trial.error} onClick={() => void apply()}>{working ? ui("Подготовка…") : ui("Применить звук и монтаж")}<Icon name="check" size={16}/></button></footer><audio ref={previewAudio} hidden/></dialog>;
}
