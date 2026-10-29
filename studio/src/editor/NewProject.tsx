import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui } from './i18n.ts';
import { validatedSetup } from './setupValidation.ts';
import { currentLocale } from './locale.ts';
import { useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import { Icon } from './Icon.tsx';
import { readPreferences } from './preferences.ts';
import { type ProjectSetup } from '../../domain/projectSetup.ts';
export type SetupDraft = {
    title: string;
    width: string;
    height: string;
    fps: string;
    seconds: string;
};
export const setupDraft = (p: ProjectSetup): SetupDraft => ({ title: p.title, width: String(p.size.width), height: String(p.size.height), fps: String(p.fps.num / p.fps.den), seconds: String(p.durationFrames * p.fps.den / p.fps.num) });
export const parseSetup = (d: SetupDraft) => validatedSetup({ title: d.title, size: { width: Number(d.width), height: Number(d.height) }, fps: { num: Number(d.fps), den: 1 }, durationFrames: Math.round(Number(d.seconds) * Number(d.fps)) });
export function SetupFields({ draft, onChange, title = true }: {
    draft: SetupDraft;
    onChange: (value: SetupDraft) => void;
    title?: boolean;
}) {
    const change = (key: keyof SetupDraft, value: string) => onChange({ ...draft, [key]: value }), size = draft.width + 'x' + draft.height, formats = [['1920x1080', ui("Горизонтальный · 16:9")], ['1080x1920', ui("Вертикальный · 9:16")], ['1080x1080', ui("Квадрат · 1:1")]];
    return <>{title && <label>{ui("Название")}<input autoFocus aria-label={ui("Название проекта")} value={draft.title} onChange={e => change('title', e.target.value)} maxLength={200} required/></label>}<label>{ui("Формат")}<select aria-label={ui("Формат нового проекта")} value={formats.some(f => f[0] === size) ? size : 'custom'} onChange={e => {
            if (e.target.value === 'custom') {
                onChange({ ...draft, width: '', height: '' });
            }
            else {
                const [width, height] = e.target.value.split('x');
                onChange({ ...draft, width: width!, height: height! });
            }
        }}>{formats.map(([value, name]) => <option key={value} value={value}>{name}</option>)}<option value="custom">{ui("Свой размер")}</option></select></label><div className="field-grid"><label>{ui("Ширина, px")}<input aria-label={ui("Ширина нового проекта")} type="number" min="16" max="4096" value={draft.width} onChange={e => change('width', e.target.value)}/></label><label>{ui("Высота, px")}<input aria-label={ui("Высота нового проекта")} type="number" min="16" max="4096" value={draft.height} onChange={e => change('height', e.target.value)}/></label><label>{ui("Частота кадров")}<select aria-label={ui("Частота нового проекта")} value={draft.fps} onChange={e => change('fps', e.target.value)}>{[24, 25, 30, 50, 60, 120].map(n => <option key={n} value={n}>{n}{" " + ui("кадров/с")}</option>)}</select></label><label>{ui("Длительность, с")}<input aria-label={ui("Длительность нового проекта")} type="number" min="0.1" max="300" step="0.1" value={draft.seconds} onChange={e => change('seconds', e.target.value)}/></label></div></>;
}
export function NewProject({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: (id: string) => Promise<void>;
}) {
    const dialog = useRef<HTMLDialogElement>(null), [draft, setDraft] = useState(() => setupDraft(readPreferences().newProject)), [saving, setSaving] = useState(false), [error, setError] = useState(''), attempt = useRef<{
        signature: string;
        id: string;
    } | null>(null);
    useEffect(() => { dialog.current?.showModal(); }, []);
    async function create(e: React.FormEvent) {
        e.preventDefault();
        if (saving)
            return;
        setError('');
        try {
            const input = { ...parseSetup(draft), locale: currentLocale() }, signature = JSON.stringify(input);
            if (attempt.current?.signature !== signature)
                attempt.current = { signature, id: 'create-' + crypto.randomUUID() };
            setSaving(true);
            const info = await api.packageInfo(), p = await api.createBlank({ ...input, requestId: attempt.current!.id }, info.mutationToken);
            await onCreated(p.id);
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setSaving(false);
        }
    }
    return <dialog ref={dialog} className="workspace-dialog new-project-dialog" aria-labelledby="new-project-title" onCancel={e => {
            e.preventDefault();
            if (!saving)
                onClose();
        }}><form onSubmit={e => void create(e)}><header><div><span className="eyebrow">{ui("ПРОЕКТ")}</span><h2 id="new-project-title">{ui("Новый проект")}</h2></div><button type="button" className="icon-button" aria-label={ui("Закрыть создание проекта")} disabled={saving} onClick={onClose}><Icon name="close"/></button></header><div className="workspace-dialog-body"><fieldset disabled={saving}><SetupFields draft={draft} onChange={setDraft}/></fieldset><p className="dialog-note">{ui("Откроется одна пустая сцена. Изображения, музыку и модели можно добавить в панели ресурсов.")}</p>{error && <div className="field-warning" role="alert"><DiagnosticText message={error}/></div>}</div><footer><button type="button" className="text-button" disabled={saving} onClick={onClose}>{ui("Отмена")}</button><button className="primary" disabled={saving} type="submit">{saving ? ui("Создание…") : ui("Создать проект")}<Icon name="arrow" size={16}/></button></footer></form></dialog>;
}
