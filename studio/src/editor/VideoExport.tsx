import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { decimal } from './localeFormat.ts';
import { localeTag } from './locale.ts';
import { ui, uiLabel } from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../domain/schema.ts';
import { exportTerminal, videoExportPlan, type VideoExportJob } from '../../domain/videoExport.ts';
import { api } from './api.ts';
import { Icon } from './Icon.tsx';
const labels = { preparing: 'Подготавливаю ресурсы', rendering: 'Рисую кадры', mixing: 'Добавляю звук', verifying: 'Проверяю MP4', ready: 'Видео готово', cancelling: 'Останавливаю экспорт', cancelled: 'Экспорт отменён', failed: 'Экспорт не завершён' };
export function VideoExport({ project, token, onClose }: {
    project: Project;
    token: string;
    onClose: () => void;
}) {
    const dialog = useRef<HTMLDialogElement | null>(null), [job, setJob] = useState<VideoExportJob | null>(null), [jobs, setJobs] = useState<VideoExportJob[]>([]), [info, setInfo] = useState<{
        ready: boolean;
        reason?: string;
    } | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    let constraint = '';
    if (project.storyboard?.cards.length && !project.nodes.length)
        constraint = ui("В проекте пока только раскадровка. Сначала соберите монтажные сцены.");
    try {
        videoExportPlan(project);
    }
    catch (e) {
        constraint = errorText(e);
    }
    useEffect(() => {
        dialog.current?.showModal();
        let alive = true;
        void Promise.all([api.videoInfo(), api.videoList(project.id)]).then(([r, list]) => {
            if (alive) {
                setInfo(r);
                setJobs(list);
                setJob(list[0] ?? null);
            }
        }).catch(e => {
            if (alive)
                setError(errorText(e));
        });
        return () => { alive = false; };
    }, [project.id]);
    useEffect(() => {
        if (!job || exportTerminal(job.status))
            return;
        let alive = true, timer = 0;
        const tick = async () => {
            try {
                const next = await api.videoGet(project.id, job.id);
                if (!alive)
                    return;
                setJob(next);
                setJobs(list => [next, ...list.filter(j => j.id !== next.id)]);
                setError('');
            }
            catch (e) {
                if (alive)
                    setError(ui("Не удалось обновить статус:") + " " + errorText(e));
            }
            if (alive)
                timer = window.setTimeout(() => void tick(), 1000);
        };
        timer = window.setTimeout(() => void tick(), 500);
        return () => { alive = false; clearTimeout(timer); };
    }, [job?.id, job?.status, project.id]);
    async function start() {
        setBusy(true);
        setError('');
        try {
            const next = await api.videoStart(project.id, token, project.revision, 'export-' + crypto.randomUUID());
            setJob(next);
            setJobs(list => [next, ...list]);
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function cancel() {
        if (!job)
            return;
        setBusy(true);
        try {
            setJob(await api.videoCancel(project.id, job.id, token));
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    }
    const running = !!job && !exportTerminal(job.status), percent = Math.min(job?.status === 'ready' ? 100 : 99, Math.round((job?.progress ?? 0) * 100)), duration = project.durationFrames * project.fps.den / project.fps.num;
    return <dialog ref={dialog} className="video-export-dialog" aria-labelledby="video-export-title" onCancel={e => { e.preventDefault(); onClose(); }}>
  <header><div><span className="eyebrow">{ui("MOTIVELIUM / ВИДЕО")}</span><h2 id="video-export-title">{ui("Экспорт видео")}</h2></div><button className="icon-button" onClick={onClose} aria-label={ui("Закрыть экспорт")}><Icon name="close"/></button></header>
  <div className="video-export-body">
   <div className="video-export-spec"><strong>{project.title}</strong><span>{Math.ceil(project.size.width / 2) * 2} × {Math.ceil(project.size.height / 2) * 2} <b>·</b> {(project.fps.num / project.fps.den).toFixed(2).replace(/\.00$/, '')}{" " + ui("кадров/с") + " "}<b>·</b> {decimal(duration)}{" " + ui("с")}</span><small>MP4 · H.264 · AAC</small></div>
   {job ? <section className={'video-export-result ' + job.status} aria-live="polite">
    {job.status === 'ready' && job.downloadUrl ? <video key={job.id} src={job.downloadUrl} poster={job.posterUrl} controls preload="metadata" aria-label={ui("Готовый MP4")}/> : <div className="video-export-visual" aria-hidden="true"><div className="video-export-orbit"><Icon name={running ? 'motion' : job.status === 'cancelled' ? 'back' : 'download'} size={40}/></div><span>{running ? String(percent).padStart(2, '0') + '%' : job.status === 'cancelled' ? ui("ПАУЗА") : 'MP4'}</span></div>}
    <div className="video-export-progress"><strong>{uiLabel(labels[job.status])}</strong><span>{ui("Ревизия") + " "}{job.revision}{job.status === 'ready' && job.bytes ? ' · ' + decimal(job.bytes / 1024 / 1024, 1) + (" " + ui("МБ")) : ''}</span></div>
    {running && <><progress max={1} value={job.progress} aria-label={ui("Прогресс экспорта")}/><p className="video-export-detail">{ui("Кадры") + " "}{job.renderedFrames} / {job.totalFrames} · {percent}%</p><p className="video-export-detail">{ui("Можно закрыть это окно — экспорт продолжится.")}</p></>}
    {job.error && <div className={job.status === 'cancelled' ? 'video-export-detail' : 'video-export-error'}><DiagnosticText message={job.error}/></div>}
    {job.revision !== project.revision && <p className="video-export-detail">{ui("Этот файл относится к ревизии") + " "}{job.revision}{ui(". Текущая ревизия проекта —") + " "}{project.revision}.</p>}
    {job.status === 'ready' && <p className="video-export-detail">{job.withAudio ? ui("Музыка и звуковые акценты включены.") : ui("В проекте нет активных звуковых дорожек.")}</p>}
   </section> : <div className="video-export-empty"><Icon name="download" size={36}/><p>{ui("Файл MP4 ещё не создан.")}</p><small>{ui("Параметры изображения и звука берутся из проекта.")}</small></div>}
   {!info && <p className="video-export-detail">{ui("Проверяю готовность экспорта…")}</p>}
   {info && !info.ready && <p className="video-export-error">{info.reason}</p>}
   {constraint && <p className="video-export-error">{constraint}</p>}{error && <div role="alert" className="video-export-error"><DiagnosticText message={error}/></div>}
   {jobs.length > 1 && <label className="video-export-history">{ui("Предыдущие экспорты")}<select aria-label={ui("Задание экспорта")} value={job?.id ?? ''} disabled={busy || running} onChange={e => setJob(jobs.find(j => j.id === e.target.value) ?? null)}>{jobs.map(j => <option key={j.id} value={j.id}>{new Date(j.createdAt).toLocaleString(localeTag())} · r{j.revision} · {uiLabel(labels[j.status])}</option>)}</select></label>}
  </div>
  <footer><p>{ui("Звук берётся из дорожек проекта. Кнопка отключения звука при просмотре на экспорт не влияет.")}</p><div>{running ? <button className="video-export-cancel" disabled={busy || job.status === 'cancelling'} onClick={() => void cancel()}>{ui("Отменить экспорт")}</button> : <><button className={job?.status === 'ready' ? 'secondary' : 'primary'} disabled={busy || !info?.ready || !!constraint} onClick={() => void start()}>{busy ? ui("Запускаю…") : job ? ui("Экспортировать заново") : ui("Создать MP4")}</button>{job?.status === 'ready' && job.downloadUrl && <a className="primary" href={job.downloadUrl + '?download=1'} download><Icon name="download" size={16}/>{" " + ui("Скачать MP4")}</a>}</>}</div></footer>
 </dialog>;
}
