import { ui } from './i18n.ts';
import type { Project } from '../../domain/schema.ts';
import type { AssetBitmaps } from '../../render/renderFrame.ts';
import { api } from './api.ts';
export type ComparisonSnapshot = {
    project: Project;
    bitmaps: AssetBitmaps;
    modelBytes: Map<string, Uint8Array>;
    audio: Map<string, ArrayBuffer>;
    dispose: () => void;
};
/** Own the bytes too: a later edit/removal must not silently change the reference. */
export async function captureComparison(project: Project, signal: AbortSignal): Promise<ComparisonSnapshot> {
    const frozen = structuredClone(project), bitmaps: AssetBitmaps = new Map(), modelBytes = new Map<string, Uint8Array>(), audio = new Map<string, ArrayBuffer>();
    const images = new Set(frozen.nodes.flatMap(n => n.kind === 'image' ? [n.assetId] : []));
    const models = new Set(frozen.nodes.flatMap(n => n.kind === 'scene3d' && n.model ? [n.model.assetId] : []));
    const sounds = new Set(frozen.audioTracks.flatMap(t => t.assetId ? [t.assetId] : []));
    const needed = frozen.assets.filter(a => images.has(a.id) || models.has(a.id) || sounds.has(a.id));
    if (needed.reduce((n, a) => n + a.bytes, 0) > 256 * 1024 * 1024)
        throw Error(ui("Для сравнения выбрано больше 256 МБ ресурсов. Используй более лёгкую копию проекта."));
    const dispose = () => { bitmaps.forEach(b => (b as ImageBitmap).close?.()); bitmaps.clear(); modelBytes.clear(); audio.clear(); };
    try {
        // Sequential reads bound transient memory and make cancellation predictable.
        for (const a of needed) {
            signal.throwIfAborted();
            const response = await fetch(api.assetUrl(frozen.id, a.id), { signal });
            if (!response.ok)
                throw Error(ui("Не загружен ресурс сравнения:") + " " + (a.title ?? a.id));
            const bytes = await response.arrayBuffer();
            signal.throwIfAborted();
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(v => v.toString(16).padStart(2, '0')).join('');
            if (hash !== a.sha256 || bytes.byteLength !== a.bytes)
                throw Error(ui("Ресурс изменился во время загрузки:") + " " + (a.title ?? a.id) + ui(". Открой сравнение заново."));
            if (images.has(a.id)) {
                const image = await createImageBitmap(new Blob([bytes], { type: a.mime }));
                if (signal.aborted) {
                    image.close();
                    signal.throwIfAborted();
                }
                bitmaps.set(a.id, image);
            }
            if (models.has(a.id))
                modelBytes.set(a.sha256, new Uint8Array(bytes));
            if (sounds.has(a.id))
                audio.set(a.id, bytes);
        }
        await document.fonts.ready;
        signal.throwIfAborted();
        return { project: frozen, bitmaps, modelBytes, audio, dispose };
    }
    catch (error) {
        dispose();
        throw error;
    }
}
