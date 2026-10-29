import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText } from './errorText.ts';
import { ui, uiLabel } from './i18n.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../../domain/schema.ts';
import type { Operation } from '../../domain/operations.ts';
import { buildStoryMontage, STORY_RECIPES, type StoryRecipe } from '../../domain/storyMontage.ts';
import type { AssetBitmaps, ThreeLayerRenderer } from '../../render/renderFrame.ts';
import { FrameCanvas, useLoop } from './PreviewCanvas.tsx';
import { Icon } from './Icon.tsx';
export function StoryMontagePreview({ project, bitmaps, threeLayer, onClose, onApply }: {
    project: Project;
    bitmaps: AssetBitmaps;
    threeLayer?: ThreeLayerRenderer;
    onClose: () => void;
    onApply: (label: string, ops: Operation[], revision: number) => Promise<boolean>;
}) {
    const ref = useRef<HTMLDialogElement>(null), [recipe, setRecipe] = useState<StoryRecipe>('screen'), [playing, setPlaying] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [ids, setIds] = useState(() => { const chosen = project.storyboard!.cards.filter(c => c.status === 'selected'); return (chosen.length ? chosen : project.storyboard!.cards).slice(0, 10).map(c => c.id); });
    useEffect(() => ref.current?.showModal(), []);
    const result = useMemo(() => {
        try {
            return { draft: buildStoryMontage(project, { cardIds: ids, recipe, prefix: 'preview-montage' }) };
        }
        catch (e) {
            return { error: errorText(e) };
        }
    }, [project, recipe, ids]);
    const preview = result.draft?.project, [frame, setFrame] = useLoop(playing, preview?.durationFrames ?? 1, project.fps.num / project.fps.den, project.nodes.length ? project.durationFrames : 0);
    async function apply() {
        if (!result.draft)
            return;
        setBusy(true);
        try {
            const draft = buildStoryMontage(project, { cardIds: ids, recipe });
            if (await onApply(ui("Собрать сцены из раскадровки"), draft.operations, project.revision))
                onClose();
            else
                setError(ui("Проект изменился. Перечитайте его перед применением."));
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    }
    return <dialog ref={ref} className="story-montage-dialog" onCancel={e => {
            e.preventDefault();
            if (!busy)
                onClose();
        }}><header><div><small>{ui("ПРИМЕРКА · РЕДАКТИРУЕМЫЕ ОБЪЕКТЫ")}</small><h2>{ui("Собрать сцены из плана")}</h2></div><button className="icon-button" aria-label={ui("Закрыть примерку монтажа")} disabled={busy} onClick={onClose}><Icon name="close"/></button></header><div className="story-montage-body"><aside><label>{ui("Приём")}<select aria-label={ui("Рецепт монтажа")} value={recipe} onChange={e => setRecipe(e.target.value as StoryRecipe)}>{STORY_RECIPES.map(r => <option key={r.id} value={r.id}>{uiLabel(r.name)}</option>)}</select></label><p>{uiLabel(STORY_RECIPES.find(r => r.id === recipe)?.description ?? '')}</p><small>{uiLabel(STORY_RECIPES.find(r => r.id === recipe)?.cost ?? '')}</small><h3>{ui("Карточки · до 10")}</h3>{project.storyboard?.cards.map(c => <label className="setting-check" key={c.id}><input type="checkbox" checked={ids.includes(c.id)} onChange={e => setIds(e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id))}/>{c.title}</label>)}</aside><section>{preview ? <><FrameCanvas project={preview} frame={frame} bitmaps={bitmaps} threeLayer={threeLayer} label={ui("Примерка монтажа из раскадровки")}/><div className="montage-transport"><button className="secondary" onClick={() => setPlaying(v => !v)}>{playing ? ui("Пауза") : ui("Смотреть")}</button><input aria-label={ui("Кадр примерки монтажа")} type="range" min={0} max={preview.durationFrames - 1} value={frame} onChange={e => { setPlaying(false); setFrame(Number(e.target.value)); }}/></div></> : <div><DiagnosticText message={result.error}/></div>}{error && <div role="alert"><DiagnosticText message={error}/></div>}</section></div><footer><p>{project.nodes.length ? ui("Новые сцены добавятся после текущего монтажа.") : ui("Пустая сцена будет заменена монтажом.")}{" " + ui("Тексты, изображения и движение останутся редактируемыми. Изменение можно отменить.")}</p><button className="primary" disabled={busy || !preview} onClick={() => void apply()}>{busy ? ui("Сохраняю…") : ui("Применить монтаж")}</button></footer></dialog>;
}
