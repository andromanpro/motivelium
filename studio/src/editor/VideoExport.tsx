import {useEffect,useRef,useState} from 'react';
import type {Project} from '../../domain/schema.ts';
import {exportTerminal,videoExportPlan,type VideoExportJob} from '../../domain/videoExport.ts';
import {api} from './api.ts';
import {Icon} from './Icon.tsx';

const labels={preparing:'Подготавливаю ресурсы',rendering:'Рисую кадры',mixing:'Добавляю звук',verifying:'Проверяю MP4',ready:'Видео готово',cancelling:'Останавливаю экспорт',cancelled:'Экспорт отменён',failed:'Экспорт не завершён'};
export function VideoExport({project,token,onClose}:{project:Project;token:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement|null>(null),[job,setJob]=useState<VideoExportJob|null>(null),[jobs,setJobs]=useState<VideoExportJob[]>([]),[info,setInfo]=useState<{ready:boolean;reason?:string}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 let constraint='';try{videoExportPlan(project)}catch(e){constraint=(e as Error).message}
 useEffect(()=>{dialog.current?.showModal();let alive=true;void Promise.all([api.videoInfo(),api.videoList(project.id)]).then(([r,list])=>{if(alive){setInfo(r);setJobs(list);setJob(list[0]??null)}}).catch(e=>{if(alive)setError((e as Error).message)});return()=>{alive=false}},[project.id]);
 useEffect(()=>{if(!job||exportTerminal(job.status))return;let alive=true,timer=0;const tick=async()=>{try{const next=await api.videoGet(project.id,job.id);if(!alive)return;setJob(next);setJobs(list=>[next,...list.filter(j=>j.id!==next.id)]);setError('');}catch(e){if(alive)setError('Не удалось обновить статус: '+(e as Error).message)}if(alive)timer=window.setTimeout(()=>void tick(),1000)};timer=window.setTimeout(()=>void tick(),500);return()=>{alive=false;clearTimeout(timer)}},[job?.id,job?.status,project.id]);
 async function start(){setBusy(true);setError('');try{const next=await api.videoStart(project.id,token,project.revision,'export-'+crypto.randomUUID());setJob(next);setJobs(list=>[next,...list]);}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function cancel(){if(!job)return;setBusy(true);try{setJob(await api.videoCancel(project.id,job.id,token))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const running=!!job&&!exportTerminal(job.status),percent=Math.min(job?.status==='ready'?100:99,Math.round((job?.progress??0)*100)),duration=project.durationFrames*project.fps.den/project.fps.num;
 return <dialog ref={dialog} className="video-export-dialog" aria-labelledby="video-export-title" onCancel={e=>{e.preventDefault();onClose()}}>
  <header><div><span className="eyebrow">MOTIVELIUM / ВИДЕО</span><h2 id="video-export-title">Экспорт видео</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть экспорт"><Icon name="close"/></button></header>
  <div className="video-export-body">
   <div className="video-export-spec"><strong>{project.title}</strong><span>{Math.ceil(project.size.width/2)*2} × {Math.ceil(project.size.height/2)*2} <b>·</b> {(project.fps.num/project.fps.den).toFixed(2).replace(/\.00$/,'')} кадров/с <b>·</b> {duration.toFixed(2)} с</span><small>MP4 · H.264 · AAC</small></div>
   {job?<section className={'video-export-result '+job.status} aria-live="polite">
    {job.status==='ready'&&job.downloadUrl?<video key={job.id} src={job.downloadUrl} poster={job.posterUrl} controls preload="metadata" aria-label="Готовый MP4"/>:<div className="video-export-visual" aria-hidden="true"><div className="video-export-orbit"><Icon name={running?'motion':job.status==='cancelled'?'back':'download'} size={40}/></div><span>{running?String(percent).padStart(2,'0')+'%':job.status==='cancelled'?'ПАУЗА':'MP4'}</span></div>}
    <div className="video-export-progress"><strong>{labels[job.status]}</strong><span>Ревизия {job.revision}{job.status==='ready'&&job.bytes?' · '+(job.bytes/1024/1024).toFixed(1)+' МБ':''}</span></div>
    {running&&<><progress max={1} value={job.progress} aria-label="Прогресс экспорта"/><p className="video-export-detail">Кадры {job.renderedFrames} / {job.totalFrames} · {percent}%</p><p className="video-export-detail">Можно закрыть это окно — экспорт продолжится.</p></>}
    {job.error&&<p className={job.status==='cancelled'?'video-export-detail':'video-export-error'}>{job.error}</p>}
    {job.revision!==project.revision&&<p className="video-export-detail">Этот файл относится к ревизии {job.revision}. Текущая ревизия проекта — {project.revision}.</p>}
    {job.status==='ready'&&<p className="video-export-detail">{job.withAudio?'Музыка и звуковые акценты включены.':'В проекте нет активных звуковых дорожек.'}</p>}
   </section>:<div className="video-export-empty"><Icon name="download" size={36}/><p>Файл MP4 ещё не создан.</p><small>Параметры изображения и звука берутся из проекта.</small></div>}
   {!info&&<p className="video-export-detail">Проверяю готовность экспорта…</p>}
   {info&&!info.ready&&<p className="video-export-error">{info.reason}</p>}
   {constraint&&<p className="video-export-error">{constraint}</p>}{error&&<p role="alert" className="video-export-error">{error}</p>}
   {jobs.length>1&&<label className="video-export-history">Предыдущие экспорты<select aria-label="Задание экспорта" value={job?.id??''} disabled={busy||running} onChange={e=>setJob(jobs.find(j=>j.id===e.target.value)??null)}>{jobs.map(j=><option key={j.id} value={j.id}>{new Date(j.createdAt).toLocaleString('ru-RU')} · r{j.revision} · {labels[j.status]}</option>)}</select></label>}
  </div>
  <footer><p>Звук берётся из дорожек проекта. Кнопка отключения звука при просмотре на экспорт не влияет.</p><div>{running?<button className="video-export-cancel" disabled={busy||job.status==='cancelling'} onClick={()=>void cancel()}>Отменить экспорт</button>:<><button className={job?.status==='ready'?'secondary':'primary'} disabled={busy||!info?.ready||!!constraint} onClick={()=>void start()}>{busy?'Запускаю…':job?'Экспортировать заново':'Создать MP4'}</button>{job?.status==='ready'&&job.downloadUrl&&<a className="primary" href={job.downloadUrl+'?download=1'} download><Icon name="download" size={16}/> Скачать MP4</a>}</>}</div></footer>
 </dialog>;
}
