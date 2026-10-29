import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui } from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import type { Project, AssetRef, AudioTrack } from '../../domain/schema.ts';
import type { Operation } from '../../domain/operations.ts';
import { templateSlots, templateName, templateTextOperations, templateImageOperations } from '../../domain/templates.ts';
import { Icon } from './Icon.tsx';
import { api } from './api.ts';
import { prepareMedia } from './mediaImport.ts';
export function TemplateContent({ project, token, busy, onCommit, onWorking, onDirty, onSeek, onPause, onClose, onResources }: {
    project: Project;
    token: string;
    busy: boolean;
    onCommit: (label: string, ops: Operation[], revision?: number) => Promise<boolean>;
    onWorking: (v: boolean) => void;
    onDirty: (v: boolean) => void;
    onSeek: (f: number) => void;
    onPause: () => void;
    onClose: () => void;
    onResources: () => void;
}) {
    const slots = templateSlots(project), textSlots = slots.filter(s => s.kind === 'text'), images = slots.filter(s => s.kind === 'image'), [draft, setDraft] = useState<Record<string, string>>({}), [dirty, setDirty] = useState(false), [working, setWorking] = useState(false), [revision, setRevision] = useState(project.revision), [error, setError] = useState(''), [message, setMessage] = useState(''), [imageSlot, setImageSlot] = useState(() => images[0]?.id ?? ''), imageFile = useRef<HTMLInputElement>(null), musicFile = useRef<HTMLInputElement>(null);
    const stale = dirty && revision !== project.revision, music = project.audioTracks.find(t => t.id === 'template-music') ?? project.audioTracks.find(t => t.kind === 'music' && t.assetId), audioAsset = project.assets.find(a => a.id === music?.assetId);
    function reset() { setDraft(Object.fromEntries(textSlots.map(s => [s.id, s.nodes[0]!.kind === 'text' ? s.nodes[0]!.text : '']))); setRevision(project.revision); setDirty(false); setError(''); }
    useEffect(() => {
        if (!dirty)
            reset();
    }, [project.revision, dirty]);
    useEffect(() => { onWorking(working); return () => onWorking(false); }, [working, onWorking]);
    useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
    async function applyText() {
        if (stale || working || busy)
            return;
        setWorking(true);
        setError('');
        onPause();
        try {
            const ctx = document.createElement('canvas').getContext('2d')!, ops = templateTextOperations(project, draft, (text, font, size) => { ctx.font = size + 'px ' + font; return ctx.measureText(text).width; });
            if (!ops.length) {
                setDirty(false);
                return;
            }
            if (await onCommit(ui("Заменить текст шаблона"), ops, revision)) {
                setDirty(false);
                setMessage(ui("Текст заменён. Изменение можно отменить."));
            }
            else
                setError(ui("Текст не сохранён. Проверьте сообщение студии."));
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setWorking(false);
        }
    }
    async function changeAsset(kind: 'image' | 'audio', asset: AssetRef) {
        const ops: Operation[] = [];
        const exists = project.assets.some(a => a.id === asset.id);
        if (!exists)
            ops.push({ op: 'addAsset', asset });
        if (kind === 'image')
            ops.push(...templateImageOperations({ ...project, assets: exists ? project.assets : [...project.assets, asset] }, imageSlot, asset.id));
        else if (music)
            ops.push({ op: 'updateAudioTrack', targetId: music.id, values: { assetId: asset.id } });
        else
            ops.push({ op: 'addAudioTrack', track: { id: 'template-music', kind: 'music', assetId: asset.id, gain: .8, offsetSeconds: 0, mute: false } as AudioTrack });
        if (!await onCommit(kind === 'image' ? ui("Заменить изображение шаблона") : ui("Заменить музыку шаблона"), ops, project.revision))
            throw Error(ui("Изменение не сохранено. Проект мог измениться."));
        setMessage(ui("Материал заменён. Анимация и ключи сохранены; замену можно отменить."));
    }
    async function upload(kind: 'image' | 'audio', file: File) {
        if (working || busy || dirty)
            return;
        setWorking(true);
        setError('');
        setMessage(ui("Проверка файла…"));
        onPause();
        try {
            const asset = await prepareMedia(project.id, token, file, project.revision, kind);
            await changeAsset(kind, asset);
        }
        catch (e) {
            setMessage('');
            setError(errorText(e));
        }
        finally {
            setWorking(false);
        }
    }
    async function useAsset(kind: 'image' | 'audio', id: string, slot?: string) {
        if (busy || working || dirty)
            return;
        const a = project.assets.find(a => a.id === id);
        if (!a)
            return;
        setWorking(true);
        setError('');
        onPause();
        try {
            if (kind === 'image') {
                const ops = templateImageOperations(project, slot!, a.id);
                if (!await onCommit(ui("Заменить изображение шаблона"), ops, project.revision))
                    throw Error(ui("Изменение не сохранено."));
                setMessage(ui("Изображение заменено. Анимация сохранена."));
            }
            else
                await changeAsset(kind, a);
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setWorking(false);
        }
    }
    return <aside className="resource-panel template-content" aria-label={ui("Материалы шаблона")}><div className="panel-title"><span>{ui("Материалы")}</span><button className="icon-button" aria-label={ui("Закрыть материалы")} disabled={working} onClick={onClose}><Icon name="close" size={15}/></button></div><div className="template-content-intro"><span>{ui("ОСНОВА /") + " "}{templateName(project)}</span><p>{ui("Замените содержимое. Движение и оформление сохранятся.")}</p></div><div className="template-content-scroll">{error && <div className="field-warning" role="alert"><DiagnosticText message={error}/></div>}{message && <p className="resource-message" role="status">{message}</p>}<h3>{ui("Текст")}</h3>{textSlots.map(s => <label className="template-slot-field" key={s.id}>{s.label}<textarea aria-label={s.label} rows={s.maxLength > 50 ? 2 : 3} maxLength={s.maxLength} value={draft[s.id] ?? ''} disabled={busy || working} onChange={e => {
                if (!dirty)
                    setRevision(project.revision);
                setDirty(true);
                setDraft({ ...draft, [s.id]: e.target.value });
                setError('');
            }}/><span><small>{(draft[s.id] ?? '').length}/{s.maxLength}</small><button className="text-button" disabled={working} onClick={() => { onPause(); onSeek(s.frame + Math.min(30, (project.sequences.find(q => q.fromFrame === s.frame)?.toFrame ?? s.frame + 90) - s.frame - 1)); }}>{ui("Показать в кадре")}<Icon name="target" size={12}/></button></span></label>)}{stale && <p className="field-warning">{ui("Проект изменился. Сбросьте черновик перед новой правкой.")}</p>}{dirty && <div className="template-text-actions"><button className="primary" disabled={busy || working || stale} onClick={() => void applyText()}>{ui("Применить текст")}</button><button className="text-button" disabled={working} onClick={reset}>{ui("Сбросить")}</button></div>}
 <h3>{ui("Изображение")}</h3>{images.map(s => { const n = s.nodes[0]!, a = n.kind === 'image' ? project.assets.find(a => a.id === n.assetId) : null; return <section key={s.id} className="template-image-slot"><strong>{s.label}</strong>{a && <img src={api.assetUrl(project.id, a.id)} alt={ui("Текущее изображение шаблона")}/>}<button className="primary" disabled={busy || working || dirty} onClick={() => { setImageSlot(s.id); imageFile.current?.click(); }}><Icon name="image" size={14}/>{ui("Загрузить изображение")}</button><label>{ui("Из ресурсов")}<select aria-label={ui("Изображение") + " " + s.label} value={a?.id ?? ''} disabled={busy || working || dirty} onChange={e => void useAsset('image', e.target.value, s.id)}>{project.assets.filter(a => a.mime.startsWith('image/')).map(a => <option key={a.id} value={a.id}>{a.title ?? a.id}</option>)}</select></label><small>{ui("Заполнение и кадрирование можно изменить в свойствах слоя.")}</small></section>; })}
 <h3>{ui("Музыка")}</h3><section className="template-music-slot"><strong>{audioAsset?.title ?? ui("Музыка не выбрана")}</strong><button className="primary" disabled={busy || working || dirty} onClick={() => musicFile.current?.click()}><Icon name="volume" size={14}/>{ui("Загрузить музыку")}</button>{audioAsset?.durationSeconds !== undefined && audioAsset.durationSeconds + (music?.offsetSeconds ?? 0) < project.durationFrames * project.fps.den / project.fps.num && <p className="template-short-music">{ui("Музыка короче ролика. После её окончания будет тишина; длительность видео сохраняется.")}</p>}<label>{ui("Из ресурсов")}<select aria-label={ui("Музыка шаблона")} value={audioAsset?.id ?? ''} disabled={busy || working || dirty} onChange={e => void useAsset('audio', e.target.value)}><option value="" disabled>{ui("Выберите музыку")}</option>{project.assets.filter(a => a.mime.startsWith('audio/')).map(a => <option key={a.id} value={a.id}>{a.title ?? a.id}</option>)}</select></label><button className="text-button" disabled={busy || working || dirty} onClick={onResources}>{ui("Громкость и смещение")}<Icon name="arrow" size={14}/></button></section><p className="template-content-note">{ui("Заменяется содержимое вашего проекта. Исходный шаблон хранится отдельно. Все изменения можно отменить.")}</p></div><input className="sr-only" ref={imageFile} type="file" aria-label={ui("Новое изображение шаблона")} accept=".png,.jpg,.jpeg,.webp" disabled={busy || working || dirty} onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f)
                void upload('image', f);
        }}/><input className="sr-only" ref={musicFile} type="file" aria-label={ui("Новая музыка шаблона")} accept=".wav,.mp3" disabled={busy || working || dirty} onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f)
                void upload('audio', f);
        }}/></aside>;
}
