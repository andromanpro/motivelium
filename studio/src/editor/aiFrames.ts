import { ui } from './i18n.ts';
import type { Project } from '../../domain/schema.ts';
import { evaluateFrame } from '../../render/evaluate.ts';
import { renderFrame, selectionQuad, type AssetBitmaps, type ThreeLayerRenderer } from '../../render/renderFrame.ts';
import { effectRange } from '../../effects/catalog.ts';
import type { VisualFrame } from '../../agent/visual.ts';
export function visualSampleFrames(project: Project, nodeId: string, current: number) {
    const node = project.nodes.find(n => n.id === nodeId) ?? null, range = effectRange(project, node), span = range.toFrame - range.fromFrame;
    return [...new Set([Math.max(range.fromFrame, Math.min(range.toFrame - 1, current)), range.fromFrame + Math.min(span - 1, Math.max(1, Math.round(span * .15))), range.fromFrame + Math.min(span - 1, Math.round(span * .75))])].sort((a, b) => a - b);
}
/** Captures the same compositor as preview; no editor chrome or selection is painted. */
export function captureAIFrames(project: Project, nodeId: string, frames: number[], bitmaps: AssetBitmaps, threeLayer: ThreeLayerRenderer | undefined, after?: Project, restore?: {
    project: Project;
    frame: number;
}): VisualFrame[] {
    const full = document.createElement('canvas'), small = document.createElement('canvas');
    full.width = project.size.width;
    full.height = project.size.height;
    const k = Math.min(1, 1280 / full.width, 1280 / full.height);
    small.width = Math.max(1, Math.round(full.width * k));
    small.height = Math.max(1, Math.round(full.height * k));
    const ctx = full.getContext('2d'), out = small.getContext('2d');
    if (!ctx || !out)
        throw Error(ui("Не удалось снять кадр."));
    const result: VisualFrame[] = [];
    try {
        for (const frame of frames)
            for (const [role, snapshot] of after ? [['before', project], ['after', after]] as const : [['before', project]] as const) {
                const state = evaluateFrame(snapshot, frame);
                if (state.items.some(i => i.node.kind === 'scene3d') && !threeLayer)
                    throw Error(ui("Дождись загрузки3D перед отправкой кадра."));
                const rendered = renderFrame(state, { ctx, project: snapshot, bitmaps, threeLayer });
                if (rendered.missingAssets.length)
                    throw Error(ui("Дождись загрузки изображений перед отправкой кадра."));
                out.clearRect(0, 0, small.width, small.height);
                out.drawImage(full, 0, 0, small.width, small.height);
                const quad = selectionQuad(state, nodeId)?.map(p => ({ x: p.x * k, y: p.y * k })) ?? null;
                result.push({ frame, role, image: small.toDataURL('image/jpeg', .9), width: small.width, height: small.height, target: { visible: state.items.some(i => i.node.id === nodeId && i.opacity > 0), quad } });
            }
    }
    finally {
        try {
            if (restore)
                renderFrame(evaluateFrame(restore.project, restore.frame), { ctx, project: restore.project, bitmaps, threeLayer });
        }
        finally {
            full.width = small.width = 1;
            full.height = small.height = 1;
        }
    }
    return result;
}
