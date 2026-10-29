import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { decimal } from './localeFormat.ts';
import { sceneCount, objectCount, effectCount } from './localeFormat.ts';
import { ui } from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../domain/schema.ts';
import { PACKAGE_MAX_BYTES, packageSummary, type PackageExport, type PackagePreview } from '../../domain/projectPackage.ts';
import { api } from './api.ts';
import { Icon } from './Icon.tsx';
const bytes = (n: number) => n < 1024 * 1024 ? decimal(n / 1024, 0) + (" " + ui("КБ")) : decimal(n / 1024 / 1024, 1) + (" " + ui("МБ"));
export function ProjectPackage({ mode: initial, project, onClose, onImported }: {
    mode: 'export' | 'import';
    project: Project | null;
    onClose: () => void;
    onImported: (id: string) => Promise<void>;
}) {
    const dialog = useRef<HTMLDialogElement | null>(null), upload = useRef<AbortController | null>(null), mode = initial, [token, setToken] = useState(''), [preview, setPreview] = useState<PackagePreview | null>(null), [archive, setArchive] = useState<PackageExport | null>(null), [title, setTitle] = useState(''), [busy, setBusy] = useState<'export' | 'upload' | 'apply' | null>(null), [progress, setProgress] = useState(0), [error, setError] = useState(''), [filename, setFilename] = useState('');
    useEffect(() => {
        dialog.current?.showModal();
        let alive = true;
        void api.packageInfo().then(info => {
            if (alive)
                setToken(info.mutationToken);
        }).catch(e => {
            if (alive)
                setError(errorText(e));
        });
        return () => { alive = false; upload.current?.abort(); };
    }, []);
    async function discard() {
        if (preview?.status === 'validated' && token)
            await api.packageDiscard(preview.id, token).catch(() => { });
        setPreview(null);
    }
    function close() {
        if (busy === 'apply')
            return;
        upload.current?.abort();
        void discard();
        onClose();
    }
    async function choose(file: File | undefined) {
        if (!file || busy)
            return;
        await discard();
        setError('');
        setFilename(file.name);
        setArchive(null);
        if (file.size > PACKAGE_MAX_BYTES) {
            setError(ui("Архив должен быть не больше 256 МиБ."));
            return;
        }
        setBusy('upload');
        setProgress(0);
        const controller = new AbortController();
        upload.current = controller;
        try {
            const result = await api.packageStage(file, token, setProgress, controller.signal);
            setPreview(result);
            setTitle((result.title + (" " + ui("— копия"))).slice(0, 200));
        }
        catch (e) {
            if ((e as Error).name !== 'AbortError')
                setError(errorText(e));
        }
        finally {
            if (upload.current === controller)
                upload.current = null;
            setBusy(null);
        }
    }
    async function pack() {
        if (!project)
            return;
        setError('');
        setBusy('export');
        try {
            setArchive(await api.packageExport(project.id, token, project.revision));
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(null);
        }
    }
    async function apply() {
        if (!preview)
            return;
        setBusy('apply');
        setError('');
        try {
            const result = await api.packageApply(preview.id, token, title);
            setPreview(result.preview);
            await onImported(result.project.id);
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(null);
        }
    }
    const summary = mode === 'export' && project ? packageSummary('', project, 0) : preview;
    return <dialog ref={dialog} className="project-package-dialog" aria-labelledby="package-title" onCancel={e => { e.preventDefault(); close(); }}>
  <header><div><span className="eyebrow">{ui("MOTIVELIUM / ПРОЕКТ")}</span><h2 id="package-title">{mode === 'export' ? ui("Скачать проект") : ui("Импортировать проект")}</h2></div><button className="icon-button" onClick={close} disabled={busy === 'apply'} aria-label={ui("Закрыть перенос проекта")}><Icon name="close"/></button></header>

  <div className="project-package-body">
   {mode === 'import' && <label className={'package-drop ' + (busy === 'upload' ? 'loading' : '')} onDragOver={e => e.preventDefault()} onDrop={e => {
                e.preventDefault();
                if (token)
                    void choose(e.dataTransfer.files[0]);
            }}><input type="file" accept=".zip,application/zip" aria-label={ui("Архив проекта")} disabled={!token || !!busy} onChange={e => { void choose(e.target.files?.[0]); e.currentTarget.value = ''; }}/><Icon name="folder" size={30}/><strong>{filename || ui("Выберите ZIP проекта")}</strong><span>{ui("Или перетащите архив сюда · до 256 МиБ")}</span></label>}
   {busy === 'upload' && <div className="package-upload"><progress max={1} value={progress} aria-label={ui("Загрузка архива")}/><p>{progress < 1 ? ui("Загружаю") + " " + Math.round(progress * 100) + '%' : ui("Проверяю состав и контрольные суммы…")}</p></div>}
   {summary && <section className="package-summary" data-package-id={summary.id || undefined}><div className="package-summary-title"><div><span className="eyebrow">{mode === 'export' ? ui("СОХРАНЁННЫЙ ПРОЕКТ") : ui("АРХИВ ПРОВЕРЕН")}</span><h3>{summary.title}</h3><p>{summary.size.width} × {summary.size.height} · {decimal(summary.durationSeconds)}{" " + ui("с ·") + " "}{(summary.fps.num / summary.fps.den).toFixed(2).replace(/\.00$/, '')}{" " + ui("кадров/с · версия") + " "}{summary.sourceRevision}</p></div><span className="package-summary-icon"><Icon name={mode === 'import' ? 'check' : 'layers'} size={25}/></span></div>
    <div className="package-counts">{[[ui("Модели"), summary.models], [ui("Музыка и звук"), summary.audio], [ui("Изображения"), summary.images]].map(([label, n]) => <div key={String(label)}><strong>{n}</strong><span>{label}</span></div>)}</div>
    <p className="package-structure">{sceneCount(summary.sequences)} · {objectCount(summary.nodes)} · {effectCount(summary.effects)} · {bytes(summary.assetBytes)}{" " + ui("ресурсов")}</p>
    <details><summary>{ui("Ресурсы проекта") + " "}<span>{summary.assets.length}</span></summary><ul>{summary.assets.map(a => <li key={a.id}><Icon name={a.mime.startsWith('model/') ? 'cube' : a.mime.startsWith('audio/') ? 'volume' : 'image'} size={17}/><span><strong title={a.title}>{a.title}</strong><small>{a.mime} · {bytes(a.bytes)}</small></span>{mode === 'import' && <Icon name="check" size={16}/>}</li>)}</ul></details>
   </section>}
   {mode === 'import' && preview && <label className="package-name">{ui("Название копии")}<input value={title} maxLength={200} disabled={!!busy} aria-label={ui("Название импортированного проекта")} onChange={e => setTitle(e.target.value)}/></label>}
   {mode === 'export' && archive && <div className="package-ready" role="status"><Icon name="check" size={22}/><div><strong>{ui("Архив готов ·") + " "}{bytes(archive.bytes)}</strong><p>{ui("Ревизия") + " "}{archive.revision}{ui(". Модели и медиа включены.")}</p></div></div>}
   {mode === 'export' && archive && project && archive.revision !== project.revision && <p className="package-hint">{ui("Проект уже на ревизии") + " "}{project.revision}{ui(". Создайте новый архив, чтобы включить последние правки.")}</p>}
   {error && <div className="video-export-error" role="alert"><DiagnosticText message={error}/></div>}
  </div>
  <footer><p>{mode === 'export' ? ui("В архив входят сцены, ключи, камеры, эффекты и все ресурсы проекта. История правок и готовые MP4 остаются в студии.") : ui("Импорт создаст отдельную копию. Исходный проект сохранится; история новых правок начнётся заново.")}</p><div>{mode === 'export' ? <><button className={archive ? 'secondary' : 'primary'} disabled={!token || !!busy || !project} onClick={() => void pack()}>{busy === 'export' ? ui("Собираю архив…") : archive ? ui("Создать заново") : ui("Создать архив")}</button>{archive && <a className="primary" href={archive.downloadUrl} download><Icon name="download" size={16}/>{ui("Скачать ZIP")}</a>}</> : <button className="primary" disabled={!token || !preview || !!busy || !title.trim()} onClick={() => void apply()}>{busy === 'apply' ? ui("Создаю копию…") : ui("Импортировать копию")}<Icon name="arrow" size={16}/></button>}</div></footer>
 </dialog>;
}
