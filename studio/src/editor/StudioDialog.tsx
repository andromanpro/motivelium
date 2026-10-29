import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { localeTag } from './locale.ts';
import { ui } from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import { Icon } from './Icon.tsx';
import { SetupFields, setupDraft, parseSetup } from './NewProject.tsx';
import { readPreferences, savePreferences, type Preferences } from './preferences.ts';
import type { Project } from '../../domain/schema.ts';
import type { Operation } from '../../domain/operations.ts';
import { StorageSettings, ComponentSettings, AIConnectionGuide } from './WorkspaceSettings.tsx';
import { HelpGuide } from './HelpGuide.tsx';
import { AppearanceSettings } from './AppearanceSettings.tsx';
import { LanguageSettings } from './LanguageSettings.tsx';
import { APP_VERSION, BUILD_ID } from '../../domain/version.ts';
export type StudioDialogMode = 'settings' | 'help' | 'parameters' | 'history';
export function StudioDialog({ mode, project, onClose, onPreferences, onCommit }: {
    mode: StudioDialogMode;
    project: Project | null;
    onClose: () => void;
    onPreferences: (prefs: Preferences) => void;
    onCommit: (label: string, ops: Operation[], revision?: number) => Promise<boolean>;
}) {
    const [artifacts, setArtifacts] = useState<Awaited<ReturnType<typeof api.artifacts>> | null>(null), [mcp, setMcp] = useState<Awaited<ReturnType<typeof api.mcpConfig>> | null>(null);
    const dialog = useRef<HTMLDialogElement>(null), [tab, setTab] = useState(mode === 'settings' ? 'general' : 'start'), [prefs, setPrefs] = useState(readPreferences), [draft, setDraft] = useState(() => setupDraft(readPreferences().newProject)), [error, setError] = useState(''), [saved, setSaved] = useState(false), [info, setInfo] = useState<Awaited<ReturnType<typeof api.workspace>> | null>(null), [ai, setAI] = useState<Awaited<ReturnType<typeof api.aiStatus>> | null>(null), [events, setEvents] = useState<Array<Record<string, unknown>>>([]), [title, setTitle] = useState(project?.title ?? ''), [baseRevision] = useState(project?.revision), [saving, setSaving] = useState(false);
    async function refresh() {
        setError('');
        try {
            const [workspace, provider] = await Promise.all([api.workspace(), api.aiStatus()]);
            setInfo(workspace);
            setAI(provider);
            setArtifacts(await api.artifacts());
            setMcp(await api.mcpConfig());
        }
        catch (e) {
            setError(errorText(e));
        }
    }
    useEffect(() => {
        dialog.current?.showModal();
        if (mode === 'settings')
            void refresh();
        if (mode === 'history' && project)
            void api.journal(project.id).then(j => setEvents(j.reverse())).catch(e => setError(errorText(e)));
    }, []);
    function applyPrefs() {
        try {
            const value = savePreferences({ ...prefs, newProject: parseSetup(draft) });
            setPrefs(value);
            onPreferences(value);
            setSaved(true);
            setError('');
        }
        catch (e) {
            setError(errorText(e));
        }
    }
    async function rename() {
        if (!project || saving)
            return;
        setSaving(true);
        try {
            const clean = title.trim();
            if (!clean || clean.length > 200)
                throw Error(ui("Проверьте название проекта."));
            if (await onCommit(ui("Переименовать проект"), [{ op: 'updateProjectMeta', values: { title: clean } }], baseRevision))
                onClose();
            else
                setError(ui("Изменение не сохранено. Проверьте сообщение студии."));
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setSaving(false);
        }
    }
    const tabs = mode === 'settings' ? [['general', ui("Просмотр")], ['defaults', ui("Новые проекты")], ['ai', ui("ИИ")], ['components', ui("Компоненты")], ['storage', ui("Хранилище")]] : [['start', ui("Быстрый старт")], ['ai-help', ui("ИИ и примерка")], ['media-help', ui("Материалы")], ['export-help', ui("MP4 и ZIP")], ['keys', ui("Клавиши")], ['about', ui("О программе")]];
    return <dialog ref={dialog} className={'workspace-dialog studio-dialog ' + (mode === 'parameters' ? 'project-parameters-dialog' : '')} aria-labelledby="studio-dialog-title" onCancel={e => {
            e.preventDefault();
            if (!saving)
                onClose();
        }}><header><div><span className="eyebrow">MOTIVELIUM</span><h2 id="studio-dialog-title">{{ settings: ui("Настройки студии"), help: ui("Справка"), parameters: ui("Параметры проекта"), history: ui("История изменений") }[mode]}</h2></div><button className="icon-button" aria-label={ui("Закрыть окно студии")} disabled={saving} onClick={onClose}><Icon name="close"/></button></header>
 {(mode === 'settings' || mode === 'help') && <nav className="studio-dialog-tabs" aria-label={ui("Разделы окна")}>{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'current' : ''} aria-pressed={tab === id} onClick={() => setTab(id!)}>{label}</button>)}</nav>}
 <div className="workspace-dialog-body">
 {mode === 'settings' && <>
  {tab === 'general' && <><LanguageSettings /><AppearanceSettings /><section><h3>{ui("Предпросмотр")}</h3><label className="setting-check"><input type="checkbox" aria-label={ui("Автозапуск превью в галереях")} checked={prefs.animatePreviews} onChange={e => { setPrefs({ ...prefs, animatePreviews: e.target.checked }); setSaved(false); }}/>{ui("Автоматически проигрывать превью в галереях")}</label><p className="dialog-note">{ui("Применяется при следующем открытии галереи. На экспорт и анимацию ролика не влияет.")}</p></section></>}
  {tab === 'defaults' && <section><h3>{ui("Начальные параметры")}</h3><p className="dialog-note">{ui("Используются только при создании нового пустого проекта.")}</p><SetupFields title={false} draft={draft} onChange={value => { setDraft(value); setSaved(false); }}/></section>}
  {tab === 'ai' && <AIConnectionGuide mcp={mcp} ai={ai} project={project} onRefresh={() => void refresh()}/>}
  {tab === 'components' && info && <ComponentSettings token={info.mutationToken}/>}
  {tab === 'storage' && <section>{info && <StorageSettings info={info} onChanged={() => void refresh()}/>}<h3>{ui("Хранилище проектов")}</h3>{artifacts && <div className="artifact-maintenance"><p>{ui("Производные файлы экспорта:") + " "}{(artifacts.derivedBytes / 1048576).toFixed(1)}{" " + ui("МБ. Можно очистить") + " "}{(artifacts.reclaimableBytes / 1048576).toFixed(1)}{" " + ui("МБ.")}</p><p className="dialog-note">{ui("Удаляются копии ресурсов и промежуточные кадры завершённых заданий старше суток. Проекты, история, исходные ресурсы и готовые MP4 сохраняются.")}</p><button className="secondary" disabled={saving || !artifacts.reclaimableBytes} onClick={async () => {
                        setSaving(true);
                        try {
                            await api.cleanArtifacts(info!.mutationToken);
                            await refresh();
                            setSaved(true);
                        }
                        catch (e) {
                            setError(errorText(e));
                        }
                        finally {
                            setSaving(false);
                        }
                    }}>{ui("Очистить промежуточные файлы")}</button></div>}{info ? <dl className="workspace-spec"><div><dt>{ui("Проекты")}</dt><dd>{info.projects}</dd></div><div><dt>{ui("Файлы ресурсов")}</dt><dd>{info.assets}</dd></div><div><dt>{ui("Объём ресурсов")}</dt><dd>{(info.assetBytes / 1024 / 1024).toFixed(1)}{" " + ui("МБ")}</dd></div><div><dt>{ui("Импорт изображений и музыки")}</dt><dd>{info.media.ready ? ui("Готов") : info.media.reason}</dd></div></dl> : <p>{ui("Загрузка сведений…")}</p>}<p className="dialog-note">{ui("В проектах сохраняются исходные файлы, сцены и история. Для переноса используйте «Файл → Скачать проект».")}</p><button className="secondary" onClick={() => void refresh()}>{ui("Обновить сведения")}</button></section>}
 </>}
 {mode === 'parameters' && project && <section><label>{ui("Название")}<input aria-label={ui("Название текущего проекта")} autoFocus value={title} maxLength={200} disabled={saving} onChange={e => setTitle(e.target.value)}/></label><dl className="workspace-spec"><div><dt>{ui("Размер кадра")}</dt><dd>{project.size.width} × {project.size.height} px</dd></div><div><dt>{ui("Частота")}</dt><dd>{(project.fps.num / project.fps.den).toFixed(2).replace(/\.00$/, '')}{" " + ui("кадров/с")}</dd></div><div><dt>{ui("Длительность")}</dt><dd>{(project.durationFrames * project.fps.den / project.fps.num).toFixed(2)}{" " + ui("с ·") + " "}{project.durationFrames}{" " + ui("кадров")}</dd></div><div><dt>{ui("Сцены / слои")}</dt><dd>{project.sequences.length} / {project.nodes.length}</dd></div></dl><p className="dialog-note">{ui("Название можно изменить с отменой. Размер, частота и длительность текущего ролика пока доступны для просмотра; они выбираются при создании проекта.")}</p>{baseRevision !== project.revision && <p className="field-warning">{ui("Проект изменился. Откройте параметры заново перед сохранением.")}</p>}</section>}
 {mode === 'help' && <>
  {['start', 'ai-help', 'media-help', 'export-help'].includes(tab) && <HelpGuide topic={tab}/>}
  {tab === 'keys' && <section><h3>{ui("Сочетания клавиш")}</h3><dl className="workspace-spec"><div><dt><kbd>{ui("Пробел")}</kbd></dt><dd>{ui("Просмотр / пауза")}</dd></div><div><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>{ui("Один кадр назад / вперёд")}</dd></div><div><dt><kbd>Ctrl + Z</kbd></dt><dd>{ui("Отменить")}</dd></div><div><dt><kbd>Ctrl + Shift + Z</kbd></dt><dd>{ui("Повторить")}</dd></div><div><dt><kbd>Shift</kbd>{" " + ui("при изменении размера")}</dt><dd>{ui("Сохранить пропорции")}</dd></div><div><dt><kbd>Esc</kbd></dt><dd>{ui("Отменить перетаскивание / закрыть окно")}</dd></div></dl><p className="dialog-note">{ui("В текстовых полях работают обычные клавиши редактирования. Открытые окна не перематывают основной ролик.")}</p></section>}
  {tab === 'about' && <section><h3>Motivelium</h3><p>{ui("Локальная студия программного видео. Версия") + " "}{APP_VERSION} · {BUILD_ID}.</p><p className="dialog-note">{ui("Проекты хранятся на компьютере, где запущен сервер. При переносе ZIP включает текущее состояние и ресурсы; история отмен и готовые MP4 остаются в исходной студии.")}</p><h3>{ui("Замечания")}</h3><p className="dialog-note">{ui("Для описания проблемы укажите название проекта, версию, номер кадра и действие. Прикладывайте кадр по своему выбору. Автоматическая отправка замечаний не выполняется.")}</p><h3>{ui("Сторонние материалы")}</h3><p className="dialog-note">{ui("Собственный код — MIT. Полные условия и авторство сторонних компонентов: LICENSE, THIRD_PARTY.md и папка licenses в комплекте программы. Публичный выпуск этого кандидата пока не объявлен.")}</p></section>}
 </>}
 {mode === 'history' && <section><p className="dialog-note">{ui("Последние действия проекта. Отмена и повтор доступны в верхней панели; журнал может содержать технические события восстановления.")}</p><ol className="project-history">{events.filter(e => e.description || ['undo', 'redo', 'init'].includes(String(e.kind))).map((e, i) => <li key={i}><strong>{String(e.description ?? ({ undo: ui("Отмена изменения"), redo: ui("Повтор изменения"), init: ui("Создание проекта") }[String(e.kind)] ?? e.kind))}</strong><span>{ui("Версия") + " "}{String(e.revision)} · {e.at ? new Date(String(e.at)).toLocaleString(localeTag()) : ''}</span></li>)}</ol>{!events.length && <p className="dialog-note">{ui("Действий пока нет.")}</p>}</section>}
 {error && <div role="alert" className="field-warning"><DiagnosticText message={error}/></div>}{saved && <p className="settings-saved" role="status">{ui("Настройки сохранены в этом браузере.")}</p>}
 </div><footer>{mode === 'settings' && (tab === 'general' || tab === 'defaults') && <button className="primary" onClick={applyPrefs}>{ui("Сохранить настройки")}</button>}{mode === 'parameters' && project && <button className="primary" disabled={saving || title.trim() === project.title || baseRevision !== project.revision} onClick={() => void rename()}>{saving ? ui("Сохранение…") : ui("Сохранить название")}</button>}<button className="text-button" disabled={saving} onClick={onClose}>{ui("Закрыть")}</button></footer></dialog>;
}
