import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui } from './i18n.ts';
import { useState } from 'react';
import { api } from './api.ts';
import type { Project } from '../../domain/schema.ts';
type Workspace = Awaited<ReturnType<typeof api.workspace>>;
export function StorageSettings({ info, onChanged }: {
    info: Workspace;
    onChanged: () => void;
}) {
    const [folder, setFolder] = useState(''), [preview, setPreview] = useState<Awaited<ReturnType<typeof api.libraryPreview>> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState<Record<string, {
        projectId: string;
        title: string;
    }>>({});
    const webview = (window as unknown as {
        chrome?: {
            webview?: {
                postMessage: (v: unknown) => void;
                addEventListener: (type: string, fn: (e: {
                    data: Record<string, string>;
                }) => void) => void;
                removeEventListener: (type: string, fn: (e: {
                    data: Record<string, string>;
                }) => void) => void;
            };
        };
    }).chrome?.webview;
    function choose() {
        if (!webview)
            return;
        const requestId = crypto.randomUUID();
        const done = (e: {
            data: Record<string, string>;
        }) => {
            if (e.data?.type === 'library-folder-selected' && e.data.requestId === requestId) {
                webview.removeEventListener('message', done);
                if (e.data.path) {
                    setFolder(e.data.path);
                    setPreview(null);
                    setError('');
                }
            }
        };
        webview.addEventListener('message', done);
        webview.postMessage({ action: 'choose-library-folder', requestId });
    }
    async function inspect() {
        setBusy(true);
        setError('');
        setPreview(null);
        setCopied({});
        try {
            setPreview(await api.libraryPreview(info.mutationToken, folder.trim()));
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function copy(id: string) {
        setBusy(true);
        setError('');
        try {
            const p = await api.libraryImport(info.mutationToken, preview!.id, id);
            setCopied(x => ({ ...x, [id]: p }));
            onChanged();
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="library-settings"><h3>{ui("Где лежат проекты")}</h3><p>{ui("Активная папка данных")}</p><code className="folder-path" aria-label={ui("Активная папка данных")}>{info.dataRoot}</code><p className="dialog-note">{ui("В неё сохраняет этот запуск студии. EXE и запуск из исходников могут использовать разные папки. Обновление программы эту папку не удаляет.")}</p><details><summary>{ui("Перенести проекты из другой папки")}</summary><p className="dialog-note">{ui("Укажите папку данных другой студии или её подпапку projects. Сначала покажем список; затем можно перенести выбранный проект отдельной копией. Исходники, их история и настройки остаются на прежнем месте. Для другого компьютера используйте ZIP.")}</p><label>{ui("Папка другого хранилища")}<input aria-label={ui("Папка другого хранилища")} value={folder} disabled={busy} onChange={e => { setFolder(e.target.value); setPreview(null); }} placeholder={ui("Абсолютный путь к папке данных")}/></label><div className="settings-actions">{webview && <button className="secondary" disabled={busy} onClick={choose}>{ui("Выбрать папку…")}</button>}<button className="secondary" disabled={busy || !folder.trim()} onClick={() => void inspect()}>{busy ? ui("Проверяю…") : ui("Проверить папку")}</button></div>{preview && <div className="library-preview"><p>{ui("Источник:") + " "}<code>{preview.source}</code></p><p>{ui("Копии появятся в:") + " "}<code>{preview.destination}</code></p><p className="dialog-note">{ui("Переносятся текущее состояние и все его ресурсы; старая история отмен остаётся в источнике. Проверяем SHA256 ресурсов. Существующие проекты не заменяются.")}</p>{!preview.projects.length && <p role="status">{ui("Подходящих проектов не найдено.")}</p>}{preview.projects.map(p => <div className="library-project" key={p.id}><div><strong>{p.title}</strong><small>{ui("Версия") + " "}{p.revision} · {p.assets}{" " + ui("ресурсов ·") + " "}{(p.bytes / 1048576).toFixed(1)}{" " + ui("МБ")}</small></div>{copied[p.id] ? <a href={'/studio/?project=' + copied[p.id]!.projectId}>{ui("Открыть копию")}</a> : <button className="secondary" disabled={busy} onClick={() => void copy(p.id)}>{ui("Перенести копию")}</button>}</div>)}{!!preview.warnings.length && <details><summary>{ui("Не удалось прочитать:") + " "}{preview.warnings.length}</summary><ul>{preview.warnings.map(w => <li key={w}>{w}</li>)}</ul></details>}</div>}{error && <div role="alert" className="field-warning"><DiagnosticText message={error}/></div>}</details></section>;
}
const tools = ['chrome', 'ffmpeg', 'ffprobe'] as const;
export function ComponentSettings({ token }: {
    token: string;
}) {
    const [info, setInfo] = useState<Awaited<ReturnType<typeof api.diagnostics>> | null>(null), [paths, setPaths] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
    async function check() {
        setBusy(true);
        setError('');
        try {
            const d = await api.diagnostics();
            setInfo(d);
            setPaths(Object.fromEntries(tools.map(k => [k, d.configured[k] ?? ''])));
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function save() {
        setBusy(true);
        setError('');
        try {
            await api.saveTools(token, paths);
            setSaved(true);
            setInfo(null);
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    }
    return <section><h3>{ui("Готовность к первому ролику")}</h3><p className="dialog-note">{ui("Редактирование не требует подключения к модели. Для импорта своей музыки нужен FFprobe; для MP4 — Chrome, FFmpeg с H.264/AAC и FFprobe. Node.js уже входит в Windows-комплект. Проверка не загружает программы и не обращается к ИИ.")}</p><button className="secondary" disabled={busy} onClick={() => void check()}>{busy ? ui("Проверяю…") : ui("Проверить компоненты")}</button>{info && <><p className={'component-result ' + (info.mp4 ? 'ready' : '')} role="status">{info.mp4 ? ui("Компоненты для MP4 найдены") : ui("Для MP4 нужно настроить компоненты")}</p><ul className="component-list">{info.checks.map(c => <li key={c.id}><strong>{c.ready ? '✓' : '○'} {c.id}</strong><span>{c.ready ? ui("Готов") : c.detail}</span><code>{info.resolved[c.id]}</code></li>)}</ul>{info.issues.map(t => <p className="field-warning" key={t}>{t}</p>)}</>}<p className="dialog-note">{ui("Установить:") + " "}<a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer">Chrome</a> · <a href="https://ffmpeg.org/download.html" target="_blank" rel="noreferrer">{ui("FFmpeg и FFprobe")}</a>{ui(". Выберите сборку FFmpeg с libx264 и AAC, распакуйте её и укажите пути к EXE ниже.")}</p><details><summary>{ui("Пути к компонентам")}</summary><p className="dialog-note">{ui("Пустое поле включает автоматический поиск. Переменные MOTIVELIUM_CHROME, MOTIVELIUM_FFMPEG и MOTIVELIUM_FFPROBE имеют приоритет. Сохранённые пути используются после перезапуска этой копии программы.")}</p>{tools.map(id => <label key={id}>{id}<input aria-label={ui("Путь к") + " " + id} value={paths[id] ?? ''} disabled={busy} onChange={e => { setPaths(p => ({ ...p, [id]: e.target.value })); setSaved(false); }} placeholder={ui("Автоматический поиск")}/></label>)}<button className="secondary" disabled={busy} onClick={() => void save()}>{ui("Сохранить пути")}</button></details>{saved && <p role="status" className="component-result ready">{ui("Пути сохранены. Закройте эту копию студии и запустите её снова, затем повторите проверку.")}</p>}{error && <div role="alert" className="field-warning"><DiagnosticText message={error}/></div>}</section>;
}
export function AIConnectionGuide({ mcp, ai, project, onRefresh }: {
    mcp: Awaited<ReturnType<typeof api.mcpConfig>> | null;
    ai: Awaited<ReturnType<typeof api.aiStatus>> | null;
    project: Project | null;
    onRefresh: () => void;
}) {
    const [message, setMessage] = useState('');
    async function copy(value: string) {
        try {
            await navigator.clipboard.writeText(value);
            setMessage(ui("Скопировано."));
        }
        catch {
            setMessage(ui("Выделите текст и скопируйте вручную."));
        }
    }
    const prompt = ui("Работай через MCP Motivelium. Начни с capabilities и компактного обзора. {0} Выбери эффекты по каталогу, проверь настоящие кадры и переходы. Остановись после двух визуальных доработок. Сохрани примерку, дай ссылку и объясни изменения. Применяй к моему проекту только после моего согласия. Исходники читать не нужно.", [project ? ui("Проект") + " " + project.id + ui(". Подготовь улучшение его первых сцен.") : ui("Создай отдельный короткий проект из встроенного шаблона spectrum.")]);
    return <section><h3>{ui("Внешний ИИ через MCP")}</h3><p>{ui("Используйте своего ИИ-агента с поддержкой локальных MCP-серверов. Модель и её оплата остаются в вашем клиенте. Профиль GLM и Python для этого пути не нужны.")}</p><ol className="connection-steps"><li>{ui("Оставьте Motivelium открытым.")}</li><li>{ui("Добавьте локальный сервер в настройках MCP своего ИИ-клиента. Вставьте конфигурацию ниже; если клиент просит команду и аргументы отдельно, возьмите их из блока.")}</li><li>{ui("Переподключите сервер в клиенте и отправьте пробное поручение. Покажите агенту результат и дайте замечания.")}</li></ol>{mcp && <><p className={'component-result ' + (mcp.ready ? 'ready' : '')} role="status">{mcp.ready ? ui("MCP готов к подключению") : ui("MCP отсутствует в этом комплекте")} · {mcp.version} · {mcp.buildId}</p><label>{ui("Конфигурация MCP")}<textarea aria-label={ui("Конфигурация MCP")} readOnly rows={9} value={JSON.stringify(mcp.config, null, 2)}/></label><button className="secondary" onClick={() => void copy(JSON.stringify(mcp.config, null, 2))}>{ui("Скопировать конфигурацию")}</button><p className="dialog-note">{ui("Адрес относится к текущему запуску. После перезапуска проверьте его. У каждого поручения свой run-key и общий лимит работы; новая конфигурация создаёт новый бюджет.")}</p></>}<label>{ui("Пробное поручение")}<textarea aria-label={ui("Пробное поручение ИИ")} readOnly rows={6} value={prompt}/></label><button className="secondary" onClick={() => void copy(prompt)}>{ui("Скопировать поручение")}</button>{message && <p role="status">{message}</p>}<details className="connection-help"><summary>{ui("Встроенные правки выбранного объекта через GLM")}</summary><p className={'connection-state ' + (ai?.ready ? 'ready' : '')}>{ai?.ready ? ui("Встроенный GLM настроен") : ui("Необязательный профиль GLM не настроен")}</p><p className="dialog-note">{ui("Это отдельный способ: выбрать объект в студии, написать замечание, посмотреть примерку и применить. Для него нужны свой профиль GLM и Python 3.14. Отсутствие профиля не мешает внешнему MCP.")}</p>{ai?.reason && <p className="dialog-note">{ai.reason}</p>}<p className="dialog-note">{ui("В папке данных настройте runtime.json: glm.keyFile, glm.model и glm.visionModel; tools.python — путь к Python 3.14. Ключ хранится в отдельном файле на вашем компьютере. После настройки перезапустите студию. Подробности — docs/INSTALLATION.md в комплекте.")}</p></details><button className="text-button" onClick={onRefresh}>{ui("Обновить состояние")}</button></section>;
}
