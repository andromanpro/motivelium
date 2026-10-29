import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui } from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import { api, type ProjectSummary, type OpenedProject } from './api.ts';
import { Icon } from './Icon.tsx';
export function ProjectAction({ kind, target, onClose, onDone }: {
    kind: 'rename' | 'copy';
    target: ProjectSummary;
    onClose: () => void;
    onDone: (id: string, open: boolean) => Promise<void>;
}) {
    const dialog = useRef<HTMLDialogElement>(null), [opened, setOpened] = useState<OpenedProject | null>(null), [title, setTitle] = useState(kind === 'copy' ? (target.title + (" " + ui("— копия"))).slice(0, 200) : target.title), [error, setError] = useState(''), [saving, setSaving] = useState(false), request = useRef<{
        signature: string;
        id: string;
    } | null>(null);
    async function load() {
        try {
            setOpened(await api.open(target.id));
            setError('');
        }
        catch (e) {
            setError(errorText(e));
        }
    }
    useEffect(() => { dialog.current?.showModal(); void load(); }, []);
    async function apply(e: React.FormEvent) {
        e.preventDefault();
        if (!opened || saving)
            return;
        const clean = title.trim();
        if (!clean) {
            setError(ui("Введите название проекта."));
            return;
        }
        setSaving(true);
        setError('');
        try {
            const signature = clean + ':' + opened.project.revision;
            if (request.current?.signature !== signature)
                request.current = { signature, id: 'project-action-' + crypto.randomUUID() };
            if (kind === 'copy') {
                const p = await api.copyProject(target.id, opened.mutationToken, { requestId: request.current!.id, expectedRevision: opened.project.revision, title: clean });
                await onDone(p.id, true);
            }
            else {
                await api.commit(target.id, opened.mutationToken, { transactionId: request.current!.id, projectId: target.id, expectedRevision: opened.project.revision, source: 'manual', description: ui("Переименовать проект"), operations: [{ op: 'updateProjectMeta', values: { title: clean } }] });
                await onDone(target.id, false);
            }
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setSaving(false);
        }
    }
    return <dialog ref={dialog} className="workspace-dialog" aria-labelledby="project-action-title" onCancel={e => {
            e.preventDefault();
            if (!saving)
                onClose();
        }}><form onSubmit={e => void apply(e)}><header><h2 id="project-action-title">{kind === 'copy' ? ui("Создать копию") : ui("Переименовать проект")}</h2><button type="button" className="icon-button" disabled={saving} aria-label={ui("Закрыть действие с проектом")} onClick={onClose}><Icon name="close"/></button></header><div className="workspace-dialog-body"><label>{ui("Название")}<input autoFocus aria-label={ui("Новое название проекта")} value={title} maxLength={200} disabled={saving} onChange={e => setTitle(e.target.value)}/></label><p className="dialog-note">{kind === 'copy' ? ui("Копия получит свои ресурсы и отдельную историю. Исходный проект сохранится.") : ui("Изменение названия можно отменить в редакторе.")}</p>{error && <div role="alert" className="field-warning"><DiagnosticText message={error}/> <button type="button" className="text-button" disabled={saving} onClick={() => void load()}>{ui("Обновить данные проекта")}</button></div>}</div><footer><button type="button" className="text-button" disabled={saving} onClick={onClose}>{ui("Отмена")}</button><button className="primary" disabled={!opened || saving || !title.trim()}>{saving ? ui("Сохранение…") : kind === 'copy' ? ui("Создать копию") : ui("Переименовать")}</button></footer></form></dialog>;
}
