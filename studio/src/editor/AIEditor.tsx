import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui, uiLabel } from './i18n.ts';
import { BeforeAfter } from './BeforeAfter.tsx';
import { ProjectComparison } from './ProjectComparison.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../../domain/schema.ts';
import { applyOperations } from '../../domain/operations.ts';
import { newId } from '../../domain/ids.ts';
import { makeAIContext, EDIT_SYSTEM_PROMPT, type AIJob } from '../../agent/proposal.ts';
import { effectRange } from '../../effects/catalog.ts';
import type { AssetBitmaps, ThreeLayerRenderer } from '../../render/renderFrame.ts';
import { FrameCanvas, useLoop } from './PreviewCanvas.tsx';
import { api } from './api.ts';
import { Icon } from './Icon.tsx';
import { captureAIFrames, visualSampleFrames } from './aiFrames.ts';
import { useAutoEdit, autoPointer } from './useAutoEdit.ts';
import { AUTO_REASON_LABELS } from '../../agent/auto.ts';
const labels: Record<AIJob['status'], string> = { running: 'Готовлю предложение', proposed: 'Готово к примерке', clarification: 'Нужно уточнение', applied: 'Правка была применена', rejected: 'Предложение отклонено', cancelled: 'Запрос отменён', failed: 'Предложение не получено' };
export function AIEditor({ project, nodeId, currentFrame, token, bitmaps, threeLayer, onClose, onSeek, onApply }: {
    project: Project;
    nodeId: string;
    currentFrame: number;
    token: string;
    bitmaps: AssetBitmaps;
    threeLayer?: ThreeLayerRenderer;
    onClose: () => void;
    onSeek: (frame: number) => void;
    onApply: (id: string) => Promise<{
        ok: boolean;
        error?: string;
    }>;
}) {
    const dialog = useRef<HTMLDialogElement | null>(null), node = project.nodes.find(n => n.id === nodeId) ?? null, range = effectRange(project, node);
    const draftKey = 'motivelium-ai-draft-v1:' + project.id + ':' + nodeId;
    const [initialDraft] = useState<{
        prompt: string;
        allowText: boolean;
        withFrame: boolean;
        autoMode: boolean;
    } | null>(() => {
        try {
            const d = JSON.parse(localStorage.getItem(draftKey) ?? 'null');
            return d && typeof d.prompt === 'string' ? { prompt: d.prompt, allowText: d.allowText === true, withFrame: d.withFrame !== false, autoMode: d.autoMode !== false } : null;
        }
        catch {
            return null;
        }
    });
    const savedDraft = useRef(initialDraft);
    const [mobilePane, setMobilePane] = useState('request');
    const [compareOpen, setCompareOpen] = useState(false);
    const [prompt, setPrompt] = useState(savedDraft.current?.prompt ?? ''), [allowText, setAllowText] = useState(savedDraft.current?.allowText ?? false), [withFrame, setWithFrame] = useState(savedDraft.current?.withFrame ?? true), [job, setJob] = useState<AIJob | null>(null), [provider, setProvider] = useState<{
        ready: boolean;
        model: string;
        label: string;
        reason?: string;
        visionModel?: string;
    } | null>(null), [error, setError] = useState(''), [starting, setStarting] = useState(false), [reviewStarting, setReviewStarting] = useState(false), [applying, setApplying] = useState(false), [manual, setManual] = useState(''), [before, setBefore] = useState(false), [elapsed, setElapsed] = useState(0), [copied, setCopied] = useState(false);
    const [playing, setPlaying] = useState(false), [preview, setPreview] = useLoop(playing, range.toFrame - range.fromFrame, project.fps.num / project.fps.den);
    const [autoMode, setAutoMode] = useState(savedDraft.current?.autoMode ?? true);
    const latestDraft = useRef({ prompt, allowText });
    latestDraft.current = { prompt, allowText };
    useEffect(() => {
        try {
            localStorage.setItem(draftKey, JSON.stringify({ prompt, allowText, withFrame, autoMode }));
        }
        catch { }
    }, [prompt, allowText, withFrame, autoMode]);
    useEffect(() => {
        if (job?.status === 'proposed' && window.innerWidth <= 760)
            setMobilePane('preview');
    }, [job?.id, job?.status]);
    const key = 'motivelium-ai-job-v1:' + project.id + ':' + nodeId;
    useEffect(() => {
        const element = dialog.current;
        element?.showModal();
        let alive = true;
        void api.aiStatus().then(info => {
            if (alive)
                setProvider(info);
        }).catch(e => {
            if (alive)
                setError(ui("Не удалось проверить подключение модели:") + " " + errorText(e));
        });
        let previous: string | null = null;
        try {
            if (!localStorage.getItem(autoPointer(project.id, nodeId)))
                previous = localStorage.getItem(key);
        }
        catch { }
        if (previous)
            void api.aiJob(project.id, previous).then(j => {
                if (alive) {
                    if (j.nodeId !== nodeId || j.projectId !== project.id) {
                        try {
                            localStorage.removeItem(key);
                        }
                        catch { }
                        return;
                    }
                    setJob(j);
                    if (!savedDraft.current && !latestDraft.current.prompt.trim()) {
                        setPrompt(j.prompt);
                        setAllowText(j.allowText);
                    }
                }
            }).catch(() => { });
        setPreview(Math.max(0, Math.min(range.toFrame - range.fromFrame - 1, currentFrame - range.fromFrame)));
        return () => { alive = false; element?.close(); };
    }, []);
    useEffect(() => {
        if (!job || (job.autoRunId && !job.autoReleased) || (job.status !== 'running' && job.visualReview?.status !== 'running'))
            return;
        let stopped = false, timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const next = await api.aiJob(project.id, job.id);
                if (!stopped) {
                    setJob(next);
                    if (next.status === 'running' || next.visualReview?.status === 'running')
                        timer = setTimeout(poll, 1000);
                }
            }
            catch (e) {
                if (!stopped) {
                    setError(ui("Не удалось получить статус. Запрос сохранён; можно открыть окно снова."));
                    timer = setTimeout(poll, 3000);
                }
            }
        };
        timer = setTimeout(poll, 500);
        return () => { stopped = true; clearTimeout(timer); };
    }, [job?.id, job?.status, job?.visualReview?.status]);
    useEffect(() => {
        if (job?.status !== 'running')
            return;
        const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(job.createdAt)) / 1000)));
        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [job?.id, job?.status]);
    const stale = !!job && job.baseRevision !== project.revision, changed = !!job && (job.prompt !== prompt.trim() || job.allowText !== allowText);
    const trial = useMemo(() => {
        if (job?.status !== 'proposed' || stale)
            return { project: null, error: '' };
        try {
            return { project: applyOperations(project, job.operations), error: '' };
        }
        catch (e) {
            return { project: null, error: errorText(e) };
        }
    }, [project, job, stale]);
    const frame = range.fromFrame + preview, shownProject = !before && trial.project ? trial.project : project;
    const auto = useAutoEdit({ project, nodeId, token, bitmaps, threeLayer, shownProject, frame, onJob: j => {
            setJob(j);
            if (j && !latestDraft.current.prompt.trim()) {
                setPrompt(j.prompt);
                setAllowText(j.allowText);
            }
        }, onError: setError });
    function remember(j: AIJob) {
        setJob(j);
        try {
            localStorage.setItem(key, j.id);
        }
        catch { }
        setPreview(Math.max(0, Math.min(range.toFrame - range.fromFrame - 1, j.frame - range.fromFrame)));
        setBefore(false);
    }
    async function generate(raw?: unknown, refine = false) {
        if (auto.active || starting || reviewStarting || job?.status === 'running' || job?.visualReview?.status === 'running' || !node)
            return;
        if (!prompt.trim()) {
            setError(ui("Напиши, что изменить."));
            return;
        }
        setStarting(true);
        setPlaying(false);
        setError('');
        try {
            await document.fonts.ready;
            const visualFrames = raw === undefined && (withFrame || refine) ? captureAIFrames(project, nodeId, visualSampleFrames(project, nodeId, frame), bitmaps, threeLayer, refine ? trial.project ?? undefined : undefined, { project: shownProject, frame }) : undefined;
            const previousJobId = refine ? job?.id : undefined;
            if (raw === undefined && !refine && autoMode && withFrame && visualFrames) {
                const v = await auto.start({ requestId: auto.newId(), nodeId, expectedRevision: project.revision, frame, prompt: prompt.trim(), allowText, visualFrames });
                if (v.job)
                    remember(v.job);
                return;
            }
            auto.clear();
            const requestId = newId('ai');
            setJob(null);
            try {
                localStorage.setItem(key, requestId);
            }
            catch { }
            const j = await api.aiStart(project.id, token, { requestId, nodeId, expectedRevision: project.revision, frame, prompt: prompt.trim(), allowText, ...(visualFrames ? { visualFrames } : {}), ...(previousJobId ? { previousJobId } : {}), ...(raw !== undefined ? { proposal: raw } : {}) });
            remember(j);
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setStarting(false);
        }
    }
    async function review() {
        if (auto.active || !job || !trial.project || stale || changed || job.visualReview || starting || reviewStarting || applying)
            return;
        setReviewStarting(true);
        setPlaying(false);
        setError('');
        try {
            await document.fonts.ready;
            const visualFrames = captureAIFrames(project, nodeId, visualSampleFrames(project, nodeId, frame), bitmaps, threeLayer, trial.project, { project: shownProject, frame });
            setJob(await api.aiReview(project.id, job.id, token, { requestId: newId('vision'), expectedRevision: project.revision, visualFrames }));
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setReviewStarting(false);
        }
    }
    async function cancelReview() {
        if (!job)
            return;
        try {
            setJob(await api.aiCancelReview(project.id, job.id, token));
        }
        catch (e) {
            setError(errorText(e));
        }
    }
    async function cancel() {
        if (!job)
            return;
        try {
            setJob(await api.aiCancel(project.id, job.id, token));
            setPlaying(false);
        }
        catch (e) {
            setError(errorText(e));
        }
    }
    async function apply() {
        if (auto.active || !job || job.nodeId !== nodeId || !trial.project || stale || changed || applying || reviewStarting || job.visualReview?.status === 'running')
            return;
        setApplying(true);
        setPlaying(false);
        setError('');
        try {
            const result = await onApply(job.id);
            if (result.ok) {
                onSeek(frame);
                onClose();
            }
            else
                setError(result.error ?? ui("Правка не применена."));
        }
        finally {
            setApplying(false);
        }
    }
    function download() {
        try {
            const value = { system: EDIT_SYSTEM_PROMPT, request: prompt, context: makeAIContext(project, nodeId, currentFrame, allowText) }, url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })), a = document.createElement('a');
            a.href = url;
            a.download = 'motivelium-ai-' + nodeId + '.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setCopied(true);
        }
        catch (e) {
            setError(errorText(e));
        }
    }
    function paste() {
        try {
            const value = JSON.parse(manual.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1'));
            void generate(value);
        }
        catch {
            setJob(null);
            try {
                localStorage.removeItem(key);
            }
            catch { }
            setError(ui("Вставь JSON-ответ модели с summary и operations."));
        }
    }
    const reviewBusy = reviewStarting || job?.visualReview?.status === 'running', loading = starting || job?.status === 'running' || reviewBusy || auto.active;
    return <dialog ref={dialog} className="ai-dialog" data-has-proposal={!!trial.project} data-mobile-pane={mobilePane} aria-labelledby="ai-title" onCancel={e => { e.preventDefault(); onClose(); }}><header className="gallery-header"><div className="gallery-heading"><span className="gallery-symbol"><Icon name="sparkles" size={24}/></span><div><span className="eyebrow">{ui("ИНСТРУМЕНТЫ ОБЪЕКТА")}</span><h2 id="ai-title">{ui("Правка через ИИ")}</h2></div></div><button className="icon-button" aria-label={ui("Закрыть ИИ-правку")} title={job?.status === 'running' || reviewBusy ? ui("Запрос продолжится; его можно открыть снова") : ui("Закрыть")} onClick={onClose}><Icon name="close"/></button></header>
 <nav className="ai-mobile-tabs"><button className={mobilePane === 'request' ? 'current' : ''} onClick={() => setMobilePane('request')}>{ui("Пожелание")}</button><button className={mobilePane === 'preview' ? 'current' : ''} onClick={() => setMobilePane('preview')}>{ui("Примерка")}</button></nav>
 <div className="ai-body"><section className="ai-request"><div className="ai-request-scroll"><span className="eyebrow">{ui("ВЫБРАННЫЙ ОБЪЕКТ")}</span><div className="ai-target"><Icon name={node?.kind === 'text' ? 'text' : node?.kind === 'scene3d' ? 'cube' : 'shape'} size={18}/><strong>{node?.name ?? ui("Объект удалён")}</strong><span>{ui("Только этот объект")}</span></div>
  <label className="ai-prompt-label">{ui("Что изменить?")}<textarea autoFocus aria-label={ui("Пожелание для ИИ")} rows={5} maxLength={6000} placeholder={ui("Например: пусть появится справа и мягко остановится. Текст не меняй.")} value={prompt} onChange={e => setPrompt(e.target.value)} disabled={loading}/></label>
  <div className="ai-examples">{[ui("Появление справа, мягче."), ui("Добавь мягкое неоновое свечение."), ui("Смести на 40 пикселей вправо.")].map(s => <button key={s} disabled={loading} onClick={() => setPrompt(s)}>{s}</button>)}</div>
  {node?.kind === 'text' && <label className="ai-text-permission"><input type="checkbox" aria-label={ui("Разрешить переписать текст")} checked={allowText} onChange={e => setAllowText(e.target.checked)} disabled={loading}/>{ui("Разрешить переписать текст")}</label>}
  <label className="ai-text-permission ai-vision-permission"><input type="checkbox" aria-label={ui("Показывать кадры модели")} checked={withFrame} onChange={e => setWithFrame(e.target.checked)} disabled={loading}/>{ui("Показывать кадры модели")}</label>
  <label className="ai-text-permission"><input type="checkbox" aria-label={ui("Автопроверка и доработка")} checked={autoMode} onChange={e => setAutoMode(e.target.checked)} disabled={loading || !withFrame}/>{ui("Автопроверка и доработка")}</label>
  {autoMode && withFrame && <p className="ai-context-note">{ui("ИИ проверит примерку и при необходимости доработает её до двух раз. До 6 запросов и 6 минут. Применение — после твоего решения.")}</p>}
  <div className="ai-provider"><span className={'live-dot ' + (!provider?.ready ? 'offline' : '')}/><span>{provider ? `${withFrame ? (provider.visionModel ?? provider.model) : provider.model} · ${uiLabel(provider.label)}` : ui("Проверяю подключение…")}</span></div><p className="ai-context-note">{withFrame ? ui("Вместе с описанием отправятся до 3 кадров сцены: выбранный момент и ещё две точки. Без панелей студии, до 1280 px.") : ui("Отправится только описание объекта, его групп и эффектов.")}</p>
  {!!job?.visualFrames?.length && <p className="ai-sent-frames">{ui("ИИ получил кадры") + " "}{Array.from(new Set(job.visualFrames.map(f => f.frame))).join(', ')} · {job.model}</p>}
  {provider && !provider.ready && <div className="field-warning"><DiagnosticText message={ui('Подключение ИИ не готово. Откройте Настройки → ИИ.') + '\n[details]\n' + (provider.reason ?? '')}/></div>}
  <button className="primary ai-generate" aria-label={ui("Подготовить ИИ-правку")} disabled={loading || !prompt.trim() || !node || !provider?.ready} onClick={() => void generate()}><Icon name="sparkles" size={16}/>{auto.active ? ui("ИИ работает…") : loading ? ui("Готовлю предложение…") : autoMode && withFrame ? ui("Подготовить с проверкой") : job ? ui("Подготовить заново") : ui("Подготовить правку")}</button>
  {auto.run && <div className={'ai-auto-status ' + auto.run.status} role="status"><strong>{auto.active ? auto.run.phase === 'generating' ? (auto.run.round ? ui("Дорабатываю примерку") : ui("Готовлю первый вариант")) : auto.run.phase === 'reviewing' ? ui("Проверяю результат") : ui("Снимаю кадры для ИИ") : uiLabel(AUTO_REASON_LABELS[auto.run.reason ?? 'error'])}</strong><p>{auto.run.calls}{ui("/6 запросов ·") + " "}{auto.run.round}{ui("/2 доработок")}</p>{auto.active ? <button className="text-button" aria-label={ui("Остановить автоматический проход")} onClick={() => void auto.cancel().catch(e => setError(errorText(e)))}>{ui("Остановить проход")}</button> : <p>{auto.run.resultJobId ? ui("Готовая примерка показана справа. Решение о применении за тобой.") : ui("Проект не изменён.")}</p>}{auto.run.error && <div><DiagnosticText message={auto.run.error}/></div>}{auto.active && <small>{ui("При закрытии окна проход дождётся кадров; повторное открытие продолжит его в пределах прежнего лимита.")}</small>}</div>}
  {job && !auto.active && <div className={'ai-status ' + job.status} role="status"><span className={job.status === 'running' ? 'ai-spinner' : ''}/><div><strong>{uiLabel(labels[job.status])}{job.status === 'running' ? " " + ui("· {0} с", [elapsed]) : ''}</strong>{job.status === 'running' && <p>{ui("Можно закрыть окно — запрос сохранён.")}</p>}{job.error && <div><DiagnosticText message={job.error}/></div>}</div>{job.status === 'running' && <button className="text-button" onClick={() => void cancel()}>{ui("Отменить запрос")}</button>}</div>}
  {error && <div className="field-warning" role="alert"><DiagnosticText message={error}/></div>}
  <details className="ai-manual"><summary>{ui("Использовать ответ другой модели")}</summary><p>{ui("Скачай задание, передай его модели и вставь ответ. Проверка и примерка будут теми же.")}</p><button className="text-button" onClick={download}><Icon name="download" size={14}/>{copied ? ui("Задание скачано") : ui("Скачать задание")}</button><label>{ui("Ответ модели (JSON)")}<textarea aria-label={ui("Ответ модели JSON")} rows={5} value={manual} onChange={e => setManual(e.target.value)}/></label><button className="text-button" disabled={loading || !manual.trim() || !prompt.trim()} onClick={paste}>{ui("Проверить и примерить")}</button></details>
 </div></section><section className="ai-preview"><div className="ai-preview-scroll"><div className="ai-preview-heading"><div><span className="eyebrow">{trial.project ? ui("ПРИМЕРКА · НЕ СОХРАНЕНО") : ui("ИСХОДНЫЙ ПРОЕКТ")}</span><h3>{trial.project ? ui("Результат правки") : ui("Выбранный кадр")}</h3></div><BeforeAfter before={before} disabled={!trial.project} onChange={setBefore}/></div>
  {trial.project && <button className="text-button ai-compare-open" onClick={() => { setPlaying(false); setCompareOpen(true); }}><Icon name="layers" size={15}/>{ui("Сравнить рядом / со шторкой")}</button>}
  <div className="ai-canvas"><FrameCanvas project={shownProject} frame={frame} bitmaps={bitmaps} threeLayer={threeLayer} label={ui("Примерка ИИ-правки")}/></div>
  <div className="gallery-preview-transport"><button className="icon-button" aria-label={playing ? ui("Остановить ИИ-примерку") : ui("Воспроизвести ИИ-примерку")} onClick={() => setPlaying(v => !v)}><Icon name={playing ? 'pause' : 'play'} size={14}/></button><input type="range" aria-label={ui("Кадр ИИ-примерки")} min="0" max={Math.max(0, range.toFrame - range.fromFrame - 1)} value={preview} onChange={e => { setPlaying(false); setPreview(Number(e.target.value)); }}/><span>{ui("Кадр") + " "}{frame}</span></div><p className="gallery-loop-label">{ui("Цикл сцены · кадры") + " "}{range.fromFrame}–{range.toFrame - 1}{" " + ui("· без звука")}</p>
  {!!auto.run?.steps.length && <section className="ai-auto-history" aria-label={ui("Ход автоматического прохода")}><span className="eyebrow">{ui("ХОД ПРОВЕРКИ")}</span><ol>{auto.run.steps.map(s => <li key={s.jobId} data-chosen={auto.run?.resultJobId === s.jobId}><strong>{ui("Вариант") + " "}{s.round + 1}{auto.run?.resultJobId === s.jobId ? " " + ui("· показан тебе") : ''}</strong><p>{s.summary}</p>{s.reviewSummary && <p>{s.reviewSummary}</p>}{s.score !== undefined && <small>{ui("Исполнение пожелания · оценка ИИ:") + " "}{s.score}/100</small>}</li>)}</ol></section>}
  {trial.project && <section className={'ai-visual-review ' + (job?.visualReview?.verdict ?? '')} aria-label={ui("Визуальная проверка ИИ")}><div className="ai-visual-heading"><span className="eyebrow">{ui("ПРОВЕРКА КАДРОВ")}</span>{!job?.visualReview && <button className="text-button" aria-label={ui("Проверить примерку через ИИ")} disabled={loading || stale || changed || applying || !provider?.ready} onClick={() => void review()}><Icon name="sparkles" size={14}/>{reviewStarting ? ui("Снимаю кадры…") : ui("Проверить примерку")}</button>}</div>
   {!job?.visualReview && <p>{ui("Сравнит до 3 пар «до/после» и проверит, как выглядит правка. Это отдельный запрос с изображениями, без сохранения.")}</p>}
   {job?.visualReview && <><h4>{job.visualReview.status === 'running' ? ui("Смотрю результат примерки…") : job.visualReview.status === 'failed' ? ui("Проверка не завершена") : job.visualReview.status === 'cancelled' ? ui("Проверка отменена") : job.visualReview.verdict === 'good' ? ui("Пожелание выполнено") : job.visualReview.verdict === 'needs-work' ? ui("Есть что доработать") : ui("Нужно посмотреть внимательнее")}</h4>
    <p className="ai-review-frames">{ui("Кадры") + " "}{Array.from(new Set(job.visualReview.frames.map(f => f.frame))).join(', ')}{" " + ui("· до/после ·") + " "}{job.visualReview.model}</p>
    <div className="ai-review-frame-buttons">{Array.from(new Set(job.visualReview.frames.map(f => f.frame))).map(f => <button key={f} className={f === frame ? 'current' : ''} aria-label={ui("Посмотреть проверенный кадр {0}", [f])} onClick={() => { setPlaying(false); setPreview(f - range.fromFrame); }}>{ui("Кадр") + " "}{f}</button>)}</div>
    {job.visualReview.status === 'running' && <><p>{ui("Можно закрыть окно — результат сохранится.")}</p>{!auto.active && <button className="text-button" onClick={() => void cancelReview()}>{ui("Отменить проверку")}</button>}</>}
    {job.visualReview.error && <div className="field-warning"><DiagnosticText message={job.visualReview.error}/></div>}
    {['failed', 'cancelled'].includes(job.visualReview.status) && <p>{ui("Предложение сохранилось: его можно применить или подготовить заново.")}</p>}
    {job.visualReview.summary && <p>{job.visualReview.summary}</p>}
    {!!job.visualReview.observations.length && <ul>{job.visualReview.observations.map((s, i) => <li key={i}>{s}</li>)}</ul>}
    {job.visualReview.status === 'complete' && job.visualReview.nextPrompt && <><p className="ai-review-next">{job.visualReview.nextPrompt}</p><button className="text-button" aria-label={ui("Доработать по замечаниям ИИ")} disabled={loading || stale || changed || applying} onClick={() => void generate(undefined, true)}>{ui("Доработать по замечаниям")}<Icon name="arrow" size={14}/></button></>}
    <small>{ui("Проверены отдельные кадры. Движение и музыку оценивай при проигрывании.")}</small>
   </>}
  </section>}
  {job?.summary && <div className="ai-summary"><h4>{job.summary}</h4>{job.notes.map((note, i) => <p key={i}>{note}</p>)}</div>}
  {!!job?.changes.length && <div className="ai-changes"><h4>{ui("Что изменится") + " "}<small>{job.changes.length}</small></h4>{job.changes.map((c, i) => <div className="ai-change" key={i}><strong>{c.label}</strong><div><del>{c.before}</del><Icon name="arrow" size={13}/><ins>{c.after}</ins></div></div>)}</div>}
  {!job && <div className="ai-first-note"><Icon name="sparkles" size={24}/><h4>{ui("Примерка пока не подготовлена")}</h4><p>{ui("После ответа здесь появятся примерка и список изменений. Применённую правку можно отменить в истории проекта.")}</p></div>}
 </div><footer className="ai-apply">{stale && <p className="field-warning">{ui("Проект изменился. Подготовь новое предложение на текущей версии.")}</p>}{changed && job?.status === 'proposed' && <p className="field-warning">{ui("Пожелание изменилось. Подготовь предложение заново.")}</p>}{trial.error && <div className="field-warning"><DiagnosticText message={trial.error}/></div>}<div><button className="text-button" disabled={!job || loading || applying || job.status !== 'proposed'} onClick={() => void cancel()}>{ui("Отклонить")}</button><button className="primary" aria-label={ui("Применить ИИ-правку")} disabled={!trial.project || stale || changed || applying || loading} onClick={() => void apply()}>{applying ? ui("Применяю…") : ui("Применить правку")}<Icon name="check" size={16}/></button></div><span>{ui("Сохранится одним шагом · можно отменить")}</span></footer></section></div>{compareOpen && trial.project && <ProjectComparison project={project} candidate={trial.project} initialSeconds={frame * project.fps.den / project.fps.num} onClose={() => setCompareOpen(false)} onApply={!stale && !changed && !applying && !loading ? () => { setCompareOpen(false); void apply(); } : undefined}/>}</dialog>;
}
