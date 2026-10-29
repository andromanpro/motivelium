import { DiagnosticText } from './DiagnosticText.tsx';
import { errorText, errorSummary } from './errorText.ts';
import { decimal } from './localeFormat.ts';
import { ui } from './i18n.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION, BUILD_ID } from '../../domain/version.ts';
import { useInterfaceLocale } from './useInterfaceLocale.ts';
import { api, type ProjectSummary } from './api.ts';
import type { Project, SceneNode } from '../../domain/schema.ts';
import type { Transaction } from '../../domain/transaction.ts';
import { evaluateFrame } from '../../render/evaluate.ts';
import { renderFrame, type AssetBitmaps, type ThreeLayerRenderer } from '../../render/renderFrame.ts';
import { hitTest } from '../../render/hitTest.ts';
import { createThreeAdapter } from '../../render/threeAdapter.ts';
import { frameToSeconds } from '../../domain/time.ts';
import { ModelWorkshop } from './ModelWorkshop.tsx';
import { ModelImport } from './ModelImport.tsx';
import { descriptors, partEdit } from '../../domain/model3d.ts';
import { drawPartSelection } from './partOverlay.ts';
import { TreePanel } from './TreePanel.tsx';
import { ShaderLibrary } from './ShaderLibrary.tsx';
import { transitionAtFrame } from '../../domain/transitions.ts';
import { KeyframePanel } from './KeyframePanel.tsx';
import { transformAtFrame } from '../../domain/animation.ts';
import { Inspector } from './Inspector.tsx';
import { Icon } from './Icon.tsx';
import { CompositionLibrary } from './CompositionLibrary.tsx';
import { VideoExport } from './VideoExport.tsx';
import { CommandMenu } from './CommandMenu.tsx';
import { ProjectHome, type HomeSection } from './ProjectHome.tsx';
import { NewProject } from './NewProject.tsx';
import { ProjectAction } from './ProjectAction.tsx';
import { StudioDialog, type StudioDialogMode } from './StudioDialog.tsx';
import { ResourcePanel } from './ResourcePanel.tsx';
import { AudioWorkshop } from './AudioWorkshop.tsx';
import { TemplateContent } from './TemplateContent.tsx';
import { templateSlots } from '../../domain/templates.ts';
import { ProjectPackage } from './ProjectPackage.tsx';
import { useAudioPlayback } from './useAudioPlayback.ts';
import { EffectGallery } from './EffectGallery.tsx';
import { AIEditor } from './AIEditor.tsx';
import { Storyboard } from './Storyboard.tsx';
import { storyFrame, type StoryCard } from '../../domain/storyboard.ts';
import { ProjectComparison } from './ProjectComparison.tsx';
import { LayerDialog } from './LayerDialog.tsx';
import { drawLayerOverlay } from './layerOverlay.ts';
import { layerViewFrame, deleteLayerOperations, layerQuad, layerLockReason } from '../../domain/layers.ts';
import { useCanvasTransform } from './useCanvasTransform.ts';
type Notice = {
    kind: 'info' | 'error' | 'ok';
    text: string;
} | null;
const seconds = (frame: number, project: Project) => decimal(frameToSeconds(frame, project.fps));
const kindIcons: Record<string, string> = { shape: 'shape', text: 'text', group: 'group', image: 'image', scene3d: 'cube' };
export function App() {
    useInterfaceLocale();
    const [projects, setProjects] = useState<ProjectSummary[]>([]), [project, setProject] = useState<Project | null>(null), [token, setToken] = useState(''), [loading, setLoading] = useState(true), [opening, setOpening] = useState(false), [notice, setNotice] = useState<Notice>(null);
    const [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false), [selectedId, setSelectedId] = useState<string | null>(null), [canUndo, setCanUndo] = useState(false), [canRedo, setCanRedo] = useState(false), [exporting, setExporting] = useState(false), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
    const [treeOpen, setTreeOpen] = useState(() => window.innerWidth > 1100), [propertiesOpen, setPropertiesOpen] = useState(false), [bitmaps, setBitmaps] = useState<AssetBitmaps>(new Map()), [renderEpoch, setRenderEpoch] = useState(0), [fit, setFit] = useState({ width: 640, height: 360 }), [timeDraft, setTimeDraft] = useState<string | null>(null);
    const [audioMuted, setAudioMuted] = useState(() => localStorage.getItem('motivelium-audio-muted') === 'true');
    const [galleryOpen, setGalleryOpen] = useState(false), [aiOpen, setAiOpen] = useState(false);
    const [compositionOpen, setCompositionOpen] = useState(false);
    const [audioWorkshopOpen, setAudioWorkshopOpen] = useState(() => new URLSearchParams(location.search).get('panel') === 'audio');
    const [compareOpen, setCompareOpen] = useState(() => new URLSearchParams(location.search).get('panel') === 'compare');
    const [homeSection, setHomeSection] = useState<HomeSection>(() => { const section = new URLSearchParams(location.search).get('section'); return section === 'templates' || section === 'examples' ? section : 'projects'; }), [newProjectOpen, setNewProjectOpen] = useState(false), [studioDialog, setStudioDialog] = useState<StudioDialogMode | null>(null), [projectAction, setProjectAction] = useState<{
        kind: 'rename' | 'copy';
        target: ProjectSummary;
    } | null>(null), [packageTarget, setPackageTarget] = useState<Project | null>(null);
    const [contentOpen, setContentOpen] = useState(false);
    const [resourcesOpen, setResourcesOpen] = useState(false), [resourceBusy, setResourceBusy] = useState(false), [resourceDraft, setResourceDraft] = useState(false);
    const [storyboardOpen, setStoryboardOpen] = useState(() => new URLSearchParams(location.search).get('panel') === 'storyboard'), [storyDraft, setStoryDraft] = useState(false);
    const hasDraft = dirty || resourceDraft || storyDraft;
    const [videoExportOpen, setVideoExportOpen] = useState(() => new URLSearchParams(window.location.search).get('panel') === 'export');
    const [packageMode, setPackageMode] = useState<'export' | 'import' | null>(() => { const panel = new URLSearchParams(window.location.search).get('panel'); return panel === 'import' ? 'import' : panel === 'package' ? 'export' : null; });
    const [shaderOpen, setShaderOpen] = useState(false);
    const [selectedPart, setSelectedPart] = useState<string | null>(null), [modelOpen, setModelOpen] = useState(false), [modelImportOpen, setModelImportOpen] = useState(false);
    const [animationMode, setAnimationMode] = useState(false);
    const [orderingLayers, setOrderingLayers] = useState(false);
    const [addingLayer, setAddingLayer] = useState(false), [hoveredId, setHoveredId] = useState<string | null>(null);
    const hoverLayer = useCallback((id: string | null) => setHoveredId(id), []);
    const audio = useAudioPlayback(project, audioMuted);
    useEffect(() => {
        if (audio.error) {
            setNotice({ kind: 'error', text: audio.error });
            setPlaying(false);
        }
    }, [audio.error]);
    const canvasRef = useRef<HTMLCanvasElement | null>(null), overlayRef = useRef<HTMLCanvasElement | null>(null), viewportRef = useRef<HTMLDivElement | null>(null), threeRef = useRef<{
        layer: ThreeLayerRenderer;
        dispose: () => void;
    } | null>(null), openGeneration = useRef(0), assetSignature = useRef(''), frameRef = useRef(0), projectRef = useRef<Project | null>(null);
    frameRef.current = frame;
    projectRef.current = project;
    const fps = project ? project.fps.num / project.fps.den : 30, has3D = project?.nodes.some(n => n.kind === 'scene3d') ?? false;
    const baseState = useMemo(() => project ? evaluateFrame(project, frame) : null, [project, frame]);
    const activeTransition = project ? transitionAtFrame(project, frame) : null;
    const modalOpen = audioWorkshopOpen || storyboardOpen || newProjectOpen || !!studioDialog || !!projectAction || compositionOpen || compareOpen || !!packageMode || videoExportOpen || modelOpen || modelImportOpen || shaderOpen || galleryOpen || aiOpen || addingLayer;
    useEffect(() => {
        if (modalOpen || playing)
            document.querySelectorAll<HTMLAudioElement>('.resource-panel audio').forEach(a => a.pause());
    }, [modalOpen, playing]);
    const commandBlocked = busy || hasDraft || resourceBusy || exporting || opening || orderingLayers;
    // Viewer settings do not apply, reset or replace a project/property draft.
    const settingsBlocked = busy || resourceBusy || exporting || opening || orderingLayers;
    const canvasEdit = useCanvasTransform({ project, state: baseState, selectedId, canvas: canvasRef, recordKeys: animationMode, disabled: modalOpen || !!selectedPart || modelOpen || modelImportOpen || !!activeTransition || shaderOpen || busy || hasDraft || resourceBusy || exporting || opening || galleryOpen || aiOpen || addingLayer || orderingLayers, onPick: id => { setSelectedPart(null); setSelectedId(id); setHoveredId(null); }, onPause: () => { setPlaying(false); setNotice(null); }, onCommit: commit, onNotice: text => setNotice({ kind: 'info', text }) });
    const viewProject = canvasEdit.preview ?? project;
    const state = useMemo(() => viewProject ? evaluateFrame(viewProject, frame) : null, [viewProject, frame]);
    const selected = project?.nodes.find(n => n.id === selectedId) ?? null;
    const selectedPartName = selected?.kind === 'scene3d' && selectedPart && descriptors(selected).some(p => p.id === selectedPart) ? partEdit(selected, selectedPart).name : null;
    const modelSignature = (project?.assets.filter(a => a.mime.startsWith('model/')).map(a => a.id + a.sha256).join('|') ?? '') + (project?.nodes.filter(n => n.kind === 'scene3d' && n.model).map(n => n.kind === 'scene3d' ? n.model!.assetId : '').join('|') ?? '');
    const onDirty = useCallback((value: boolean) => setDirty(value), []);
    const refreshList = useCallback(async () => {
        try {
            setProjects(await api.list());
        }
        catch (e) {
            setNotice({ kind: 'error', text: ui("Не удалось прочитать проекты:") + " " + errorText(e) });
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        void refreshList();
        const id = new URLSearchParams(window.location.search).get('project');
        if (id)
            void openProject(id);
    }, [refreshList]);
    useEffect(() => {
        const narrow = window.matchMedia('(max-width:1100px)');
        const adapt = () => {
            if (narrow.matches && propertiesOpen)
                setTreeOpen(false);
        };
        adapt();
        narrow.addEventListener('change', adapt);
        return () => narrow.removeEventListener('change', adapt);
    }, [propertiesOpen]);
    async function openProject(id: string, keepFrame = false) {
        const generation = ++openGeneration.current;
        if (!keepFrame)
            setOpening(true);
        try {
            const opened = await api.open(id), signature = id + ':' + opened.project.assets.map(a => a.id + ':' + a.sha256).join('|');
            let nextBitmaps: AssetBitmaps | undefined;
            if (signature !== assetSignature.current) {
                nextBitmaps = new Map();
                await Promise.all(opened.project.assets.filter(a => a.mime.startsWith('image/')).map(async (a) => {
                    const r = await fetch(api.assetUrl(id, a.id));
                    if (!r.ok)
                        throw Error(ui("Не загружено изображение:") + " " + (a.title ?? a.id));
                    nextBitmaps!.set(a.id, await createImageBitmap(await r.blob()));
                }));
            }
            await document.fonts.ready;
            if (generation !== openGeneration.current) {
                nextBitmaps?.forEach(b => (b as ImageBitmap).close?.());
                return;
            }
            if (nextBitmaps) {
                assetSignature.current = signature;
                setBitmaps(nextBitmaps);
            }
            setProject(previous => previous?.id === id && previous.revision > opened.project.revision ? previous : opened.project);
            setToken(opened.mutationToken);
            setCanUndo(opened.canUndo);
            setCanRedo(opened.canRedo);
            if (!keepFrame) {
                setSelectedPart(null);
                setModelOpen(false);
                setModelImportOpen(false);
                setAnimationMode(false);
                const link = new URLSearchParams(window.location.search), linkedFrame = Number(link.get('frame') ?? 0);
                setFrame(Number.isFinite(linkedFrame) ? Math.max(0, Math.min(opened.project.durationFrames - 1, Math.round(linkedFrame))) : 0);
                setStoryboardOpen(link.get('panel') === 'storyboard');
                setStoryDraft(false);
                setCompositionOpen(link.get('panel') === 'compositions');
                setSelectedId(null);
                setPlaying(false);
                setPropertiesOpen(false);
                setDirty(false);
                setResourcesOpen(false);
                setContentOpen(false);
                setResourceDraft(false);
                setNotice(null);
                const u = new URL(window.location.href);
                u.searchParams.set('project', id);
                window.history.replaceState(null, '', u);
            }
        }
        catch (e) {
            if (generation === openGeneration.current)
                setNotice({ kind: 'error', text: ui("Не удалось открыть проект:") + " " + errorText(e) });
        }
        finally {
            if (generation === openGeneration.current)
                setOpening(false);
        }
    }
    useEffect(() => {
        const es = new EventSource('/api/v1/events');
        es.onmessage = e => {
            try {
                const data = JSON.parse(e.data) as {
                    type: string;
                    projectId: string;
                    revision: number;
                };
                if (data.type === 'revision' && data.projectId === projectRef.current?.id && data.revision > projectRef.current.revision)
                    void openProject(data.projectId, true);
                void refreshList();
            }
            catch { }
        };
        return () => es.close();
    }, [refreshList]);
    useEffect(() => {
        if (!project)
            return;
        const current = project.id + ':' + project.assets.map(a => a.id + ':' + a.sha256).join('|');
        if (current === assetSignature.current)
            return;
        let cancelled = false, installed = false;
        const loaded: AssetBitmaps = new Map();
        void Promise.all(project.assets.filter(a => a.mime.startsWith('image/')).map(async (a) => {
            const response = await fetch(api.assetUrl(project.id, a.id));
            if (!response.ok)
                throw Error(ui("Не загружено изображение:") + " " + (a.title ?? a.id));
            const bitmap = await createImageBitmap(await response.blob());
            if (cancelled)
                bitmap.close();
            else
                loaded.set(a.id, bitmap);
        })).then(() => {
            if (cancelled)
                return;
            assetSignature.current = current;
            installed = true;
            setBitmaps(loaded);
        }).catch(e => {
            const report = !cancelled;
            cancelled = true;
            loaded.forEach(b => (b as ImageBitmap).close?.());
            if (report)
                setNotice({ kind: 'error', text: errorText(e) });
        });
        return () => {
            cancelled = true;
            if (!installed)
                loaded.forEach(b => (b as ImageBitmap).close?.());
        };
    }, [project?.id, project?.assets.map(a => a.id + ':' + a.sha256).join('|')]);
    useEffect(() => () => { bitmaps.forEach(b => (b as ImageBitmap).close?.()); }, [bitmaps]);
    useEffect(() => {
        if (!project || !has3D)
            return;
        try {
            const adapter = createThreeAdapter(project);
            threeRef.current = adapter;
            setRenderEpoch(v => v + 1);
            return () => {
                adapter.dispose();
                if (threeRef.current === adapter)
                    threeRef.current = null;
            };
        }
        catch (e) {
            setNotice({ kind: 'error', text: ui("3D недоступно:") + " " + errorText(e) });
        }
    }, [project?.id, project?.fps.num, project?.fps.den, has3D]);
    useEffect(() => {
        const a = threeRef.current;
        if (!project || !a?.layer.prepare)
            return;
        void a.layer.prepare(project).then(() => {
            if (threeRef.current === a)
                setRenderEpoch(v => v + 1);
        }).catch(e => setNotice({ kind: 'error', text: ui("Модель:") + " " + errorText(e) }));
    }, [project?.id, modelSignature, has3D]);
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || !project)
            return;
        const resize = () => { const ratio = project.size.width / project.size.height, w = Math.max(1, Math.min(viewport.clientWidth - 32, (viewport.clientHeight - 32) * ratio)); setFit({ width: w, height: w / ratio }); };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [project?.id, project?.size.width, project?.size.height]);
    useEffect(() => {
        const canvas = canvasRef.current, overlay = overlayRef.current;
        if (!canvas || !overlay || !project || !state)
            return;
        if (canvas.width !== project.size.width || canvas.height !== project.size.height) {
            canvas.width = project.size.width;
            canvas.height = project.size.height;
            overlay.width = project.size.width;
            overlay.height = project.size.height;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        renderFrame(state, { ctx, project, bitmaps, threeLayer: threeRef.current?.layer });
    }, [project, state, bitmaps, renderEpoch]);
    useEffect(() => {
        if (overlayRef.current && project && state)
            drawLayerOverlay(overlayRef.current, project, state, activeTransition || selectedPart ? null : selectedId, activeTransition ? null : hoveredId, fit.width);
        if (overlayRef.current && project && state && selectedId && selectedPart && !activeTransition)
            drawPartSelection(overlayRef.current, project, state, selectedId, selectedPart, threeRef.current?.layer);
    }, [project, state, selectedId, selectedPart, hoveredId, fit.width, renderEpoch]);
    useEffect(() => {
        if (selectedId && !project?.nodes.some(n => n.id === selectedId)) {
            setSelectedId(null);
            setPropertiesOpen(false);
            setDirty(false);
        }
    }, [project, selectedId]);
    function seek(value: number) {
        if (!project || canvasEdit.active || orderingLayers || resourceBusy)
            return;
        audio.pause();
        setPlaying(false);
        setFrame(Math.max(0, Math.min(project.durationFrames - 1, Math.round(value))));
    }
    function toggle() {
        if (!project || canvasEdit.active || orderingLayers || resourceBusy)
            return;
        if (!playing) {
            audio.unlock();
            if (frame >= project.durationFrames - 1)
                setFrame(0);
        }
        setPlaying(value => !value);
    }
    useEffect(() => {
        if (!playing || !project)
            return;
        let raf = 0;
        void audio.play(frameRef.current / fps);
        const tick = () => {
            const time = audio.time();
            if (time !== null) {
                const next = Math.min(project.durationFrames - 1, Math.floor(time * fps));
                setFrame(next);
                if (next >= project.durationFrames - 1) {
                    setPlaying(false);
                    return;
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(raf); audio.pause(); };
    }, [playing, project?.id, project?.durationFrames, fps, JSON.stringify(project?.audioTracks)]);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (modalOpen || resourceBusy || canvasEdit.active || orderingLayers || ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes((e.target as HTMLElement).tagName) || !project || (e.target as HTMLElement).isContentEditable)
                return;
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
                e.preventDefault();
                if (!busy && !hasDraft && !resourceBusy && (e.shiftKey ? canRedo : canUndo))
                    void history(e.shiftKey ? 'redo' : 'undo');
                return;
            }
            if (e.code === 'Space') {
                e.preventDefault();
                toggle();
            }
            if (e.code === 'ArrowLeft')
                seek(frameRef.current - 1);
            if (e.code === 'ArrowRight')
                seek(frameRef.current + 1);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [project, playing, modalOpen, canvasEdit.active, orderingLayers, busy, hasDraft, resourceBusy, canUndo, canRedo]);
    useEffect(() => {
        if (!hasDraft)
            return;
        const guard = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', guard);
        return () => window.removeEventListener('beforeunload', guard);
    }, [hasDraft]);
    function openAI() {
        if (canvasEdit.active)
            return;
        setPlaying(false);
        if (!selectedId) {
            setTreeOpen(true);
            setNotice({ kind: 'info', text: ui("Выбери объект в кадре или списке слоёв.") });
            return;
        }
        if (hasDraft) {
            setNotice({ kind: 'info', text: ui("Сохрани или сбрось черновик свойств перед ИИ-правкой.") });
            return;
        }
        setAiOpen(true);
    }
    async function applyAI(jobId: string) {
        if (!project || busy)
            return { ok: false, error: ui("Дождись завершения сохранения.") };
        setBusy(true);
        try {
            const out = await api.aiApply(project.id, jobId, token);
            setProject(previous => previous && previous.revision > out.project.revision ? previous : out.project);
            await historyState(project.id);
            void refreshList();
            setNotice({ kind: 'ok', text: out.warning ?? ui("ИИ-правка сохранена. Её можно отменить.") });
            return { ok: true };
        }
        catch (e) {
            const error = (e as Error & {
                status?: number;
            }).status === 409 ? errorSummary(ui("Проект изменился. Подготовь предложение заново."),e) : errorText(e);
            setNotice({ kind: 'error', text: error });
            void openProject(project.id, true);
            return { ok: false, error };
        }
        finally {
            setBusy(false);
        }
    }
    function openShaders() {
        if (canvasEdit.active || orderingLayers)
            return;
        setPlaying(false);
        if (hasDraft) {
            setNotice({ kind: 'info', text: ui("Сохрани или сбрось черновик перед библиотекой.") });
            return;
        }
        setShaderOpen(true);
    }
    function openStoryboard() {
        if (commandBlocked || canvasEdit.active)
            return;
        setPlaying(false);
        setStoryboardOpen(true);
        const u = new URL(location.href);
        u.searchParams.set('panel', 'storyboard');
        window.history.replaceState(null, '', u);
    }
    function closeStoryboard() {
        setStoryboardOpen(false);
        setStoryDraft(false);
        setRenderEpoch(v => v + 1);
        const u = new URL(location.href);
        if (u.searchParams.get('panel') === 'storyboard') {
            u.searchParams.delete('panel');
            window.history.replaceState(null, '', u);
        }
    }
    function openStoryMontage(card: StoryCard) {
        const f = storyFrame(project!, card);
        closeStoryboard();
        if (f !== null)
            seek(f);
        const id = card.nodeIds.find(id => project!.nodes.some(n => n.id === id));
        if (id)
            select(id);
    }
    function openCompositions() {
        if (canvasEdit.active || orderingLayers || busy)
            return;
        setPlaying(false);
        if (hasDraft) {
            setNotice({ kind: 'info', text: ui("Сохрани или сбрось черновик перед примеркой сочетания.") });
            return;
        }
        setCompositionOpen(true);
    }
    function openGallery() {
        if (canvasEdit.active)
            return;
        setPlaying(false);
        if (hasDraft) {
            setNotice({ kind: 'info', text: ui("Сохрани или сбрось черновик свойств перед примеркой эффекта.") });
            return;
        }
        setGalleryOpen(true);
    }
    function select(id: string | null) {
        setSelectedPart(null);
        if (canvasEdit.active)
            return;
        if (hasDraft && id !== selectedId) {
            setNotice({ kind: 'info', text: ui("Сохрани или сбрось черновик свойств перед выбором другого слоя.") });
            return;
        }
        setPlaying(false);
        setSelectedId(id);
        setPropertiesOpen(!!id);
        if (window.innerWidth <= 1100) {
            setTreeOpen(false);
            setResourcesOpen(false);
            setContentOpen(false);
        }
    }
    function selectPart(id: string, part: string) {
        if (hasDraft) {
            setNotice({ kind: 'info', text: ui("Сохрани или сбрось черновик свойств перед выбором детали.") });
            return;
        }
        select(id);
        setSelectedPart(part);
        setPropertiesOpen(false);
    }
    function openModel() {
        if (hasDraft || busy || selected?.kind !== 'scene3d')
            return;
        setPlaying(false);
        setModelOpen(true);
    }
    function openModelImport() {
        if (hasDraft || busy)
            return;
        setPlaying(false);
        setModelImportOpen(true);
    }
    function selectLayer(id: string) {
        if (!project)
            return;
        if (hasDraft && id !== selectedId) {
            setNotice({ kind: 'info', text: ui("Сохрани или сбрось черновик свойств перед выбором другого слоя.") });
            return;
        }
        const next = layerViewFrame(project, id, frame);
        if (next !== frame)
            seek(next);
        select(id);
    }
    function locateLayer() {
        if (!project || !selectedId)
            return;
        const next = layerViewFrame(project, selectedId, frame);
        seek(next);
        const s = evaluateFrame(project, next);
        if (s.hiddenNodeIds.includes(selectedId))
            setNotice({ kind: 'info', text: ui("Слой скрыт или прозрачен. Его видимость можно изменить в списке.") });
    }
    function addLayer() {
        if (canvasEdit.active)
            return;
        setPlaying(false);
        if (hasDraft) {
            setNotice({ kind: 'info', text: ui("Сохрани или сбрось черновик свойств перед добавлением слоя.") });
            return;
        }
        setAddingLayer(true);
    }
    async function createLayerNode(node: SceneNode, revision: number) {
        const ok = await commit(ui("Добавить слой"), [{ op: 'createNode', node }], revision);
        if (ok) {
            seek(layerViewFrame({ ...project!, nodes: [...project!.nodes, node] }, node.id, frame));
            select(node.id);
        }
        return ok;
    }
    async function deleteSelectedLayer() {
        if (!project || !selectedId || hasDraft || resourceBusy || busy)
            return;
        try {
            if (await commit(ui("Удалить слой"), deleteLayerOperations(project, selectedId))) {
                select(null);
                setHoveredId(null);
                setNotice({ kind: 'ok', text: ui("Слой удалён. Его можно вернуть кнопкой «Отменить».") });
            }
        }
        catch (e) {
            setNotice({ kind: 'error', text: errorText(e) });
        }
    }
    async function keyAction(description: string, ops: Transaction['operations'], revision?: number) {
        if (busy || hasDraft || resourceBusy || canvasEdit.active || orderingLayers)
            return false;
        setPlaying(false);
        return commit(description, ops, revision);
    }
    function layerAction(description: string, ops: Transaction['operations'], revision?: number) {
        if (hasDraft || canvasEdit.active) {
            setNotice({ kind: 'info', text: ui("Сохрани или сбрось черновик свойств и заверши перетаскивание.") });
            return;
        }
        if (ops.length) {
            setPlaying(false);
            void commit(description, ops, revision);
        }
    }
    function handlePosition(p: {
        x: number;
        y: number;
    }) { const v = viewportRef.current, x = p.x / project!.size.width * fit.width, y = p.y / project!.size.height * fit.height, ox = ((v?.clientWidth ?? fit.width) - fit.width) / 2, oy = ((v?.clientHeight ?? fit.height) - fit.height) / 2, left = Math.max(12 - ox, Math.min((v?.clientWidth ?? fit.width) - 12 - ox, x)), top = Math.max((notice ? 64 : 12) - oy, Math.min((v?.clientHeight ?? fit.height) - 12 - oy, y)); return { left, top, clipped: Math.abs(left - x) + Math.abs(top - y) > .5 }; }
    function canvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
        if (resourceBusy)
            return;
        if (hasDraft) {
            setNotice({ kind: 'info', text: ui("Сохрани или сбрось черновик свойств перед выбором детали.") });
            return;
        }
        if (activeTransition) {
            setNotice({ kind: 'info', text: ui("В переходе выбери кадр за его границами.") });
            return;
        }
        if (canvasEdit.consumeClick() || !state || !canvasRef.current)
            return;
        const b = e.currentTarget.getBoundingClientRect(), hit = hitTest(state, (e.clientX - b.left) * e.currentTarget.width / b.width, (e.clientY - b.top) * e.currentTarget.height / b.height);
        if (!hit) {
            select(null);
            return;
        }
        select(hit.nodeId);
        if (hit.item.node.kind === 'scene3d' && threeRef.current) {
            threeRef.current.layer.render(hit.item, state);
            const part = threeRef.current.layer.raycast(hit.item, hit.local.x, hit.local.y)?.split('::')[1];
            if (part && descriptors(hit.item.node).some(d => d.id === part)) {
                selectPart(hit.nodeId, part);
                setNotice({ kind: 'info', text: ui("Выбрана деталь:") + " " + partEdit(hit.item.node, part).name + (" " + ui("· открой мастерскую 3D для правки.")) });
            }
        }
    }
    async function historyState(id: string) { const current = await api.open(id); setCanUndo(current.canUndo); setCanRedo(current.canRedo); }
    async function commit(description: string, operations: Transaction['operations'], expectedRevision?: number) {
        if (!project || busy)
            return false;
        setBusy(true);
        try {
            const out = await api.commit(project.id, token, { transactionId: 'ui-' + crypto.randomUUID(), projectId: project.id, expectedRevision: expectedRevision ?? project.revision, source: 'manual', description, operations });
            setProject(out.project);
            await historyState(project.id);
            void refreshList();
            setNotice({ kind: 'ok', text: ui("Изменения сохранены") });
            return true;
        }
        catch (e) {
            setNotice({ kind: 'error', text: (e as Error & {
                    status?: number;
                }).status === 409 ? errorSummary(ui("Проект изменился. Сверь изменения перед повторным применением."),e) : errorText(e) });
            return false;
        }
        finally {
            setBusy(false);
        }
    }
    async function history(kind: 'undo' | 'redo') {
        if (!project || busy)
            return;
        setBusy(true);
        setPlaying(false);
        try {
            const out = await (kind === 'undo' ? api.undo(project.id, token, { transactionId: 'ui-' + crypto.randomUUID(), expectedRevision: project.revision }) : api.redo(project.id, token, { transactionId: 'ui-' + crypto.randomUUID(), expectedRevision: project.revision }));
            setProject(out.project);
            setCanUndo(out.canUndo);
            setCanRedo(out.canRedo);
            setNotice({ kind: 'ok', text: kind === 'undo' ? ui("Последнее изменение отменено") : ui("Изменение повторено") });
        }
        catch (e) {
            setNotice({ kind: 'error', text: errorText(e) });
        }
        finally {
            setBusy(false);
        }
    }
    async function exportFrames(currentOnly = false) {
        if (!project || exporting || canvasEdit.active)
            return;
        setExporting(true);
        setPlaying(false);
        const snapshot = structuredClone(project), layer = threeRef.current?.layer;
        try {
            if (has3D && !layer)
                throw Error(ui("Дождись готовности 3D-сцены"));
            await layer?.prepare?.(snapshot);
            const off = document.createElement('canvas');
            off.width = snapshot.size.width;
            off.height = snapshot.size.height;
            const ctx = off.getContext('2d');
            if (!ctx)
                throw Error(ui("Canvas недоступен"));
            const picks = currentOnly ? [frame] : [0, Math.floor(snapshot.durationFrames / 2), snapshot.durationFrames - 1], frames = [];
            for (const f of picks) {
                const evaluated = evaluateFrame(snapshot, f), target = currentOnly && canvasRef.current ? canvasRef.current : off, targetContext = target.getContext('2d');
                if (!targetContext)
                    throw Error(ui("Canvas недоступен"));
                const rendered = renderFrame(evaluated, { ctx: targetContext, project: snapshot, bitmaps, threeLayer: layer });
                if (rendered.missingAssets.length)
                    throw Error(ui("Не все изображения загружены"));
                frames.push({ frame: f, image: target.toDataURL('image/png') });
            }
            const out = await api.exportFrames(snapshot.id, token, frames, snapshot.revision);
            if (out.revision !== snapshot.revision)
                throw Error(ui("Проект изменился во время экспорта. Проверь ревизию и повтори сохранение."));
            setNotice({ kind: 'ok', text: currentOnly ? ui("Кадр {0} сохранён в PNG", [frame]) : ui("Сохранены 3 PNG · кадры {0} · ревизия {1}", [picks.join(', '), out.revision]) });
        }
        catch (e) {
            setNotice({ kind: 'error', text: ui("Экспорт:") + " " + errorText(e) });
        }
        finally {
            setExporting(false);
            setRenderEpoch(v => v + 1);
        }
    }
    async function openFresh(id: string, initialFrame?: number) {
        const u = new URL(window.location.href);
        u.searchParams.delete('frame');
        if (initialFrame !== undefined)
            u.searchParams.set('frame', String(initialFrame));
        u.searchParams.delete('panel');
        window.history.replaceState(null, '', u);
        await refreshList();
        await openProject(id);
    }
    async function createDemo(preset = 'showcase-v2') {
        if (opening)
            return;
        setOpening(true);
        try {
            const created = await api.create({ preset });
            await openFresh(created.id);
        }
        catch (e) {
            setNotice({ kind: 'error', text: errorText(e) });
            setOpening(false);
        }
    }
    function openWindow(mode: StudioDialogMode) {
        if ((mode === 'settings' ? settingsBlocked : commandBlocked) || canvasEdit.active)
            return;
        setPlaying(false);
        setStudioDialog(mode);
    }
    function openResources() {
        if (commandBlocked || canvasEdit.active)
            return;
        setPlaying(false);
        setContentOpen(false);
        setResourcesOpen(true);
        setTreeOpen(false);
        if (window.innerWidth <= 1100)
            setPropertiesOpen(false);
    }
    function closeResources() {
        if (resourceDraft || resourceBusy) {
            setNotice({ kind: 'info', text: ui("Примените или сбросьте черновик музыки перед закрытием ресурсов.") });
            return;
        }
        setResourcesOpen(false);
    }
    function openContent() {
        if (commandBlocked || canvasEdit.active)
            return;
        setPlaying(false);
        setContentOpen(true);
        setTreeOpen(false);
        setResourcesOpen(false);
        if (window.innerWidth <= 1100)
            setPropertiesOpen(false);
    }
    function closeContent() {
        if (resourceDraft || resourceBusy) {
            setNotice({ kind: 'info', text: ui("Примените или сбросьте текст перед закрытием материалов.") });
            return;
        }
        setContentOpen(false);
    }
    async function downloadProject(id: string) {
        setOpening(true);
        try {
            setPackageTarget((await api.open(id)).project);
            setPackageMode('export');
        }
        catch (e) {
            setNotice({ kind: 'error', text: errorText(e) });
        }
        finally {
            setOpening(false);
        }
    }
    const workspaceDialogs = <>
  {newProjectOpen && <NewProject onClose={() => setNewProjectOpen(false)} onCreated={async (id) => { setNewProjectOpen(false); await openFresh(id); }}/>}
  {projectAction && <ProjectAction key={projectAction.kind + projectAction.target.id} {...projectAction} onClose={() => setProjectAction(null)} onDone={async (id, open) => {
                setProjectAction(null);
                await refreshList();
                if (open)
                    await openFresh(id);
                else if (project?.id === id)
                    await openProject(id, true);
            }}/>}
  {studioDialog && <StudioDialog key={studioDialog} mode={studioDialog} project={project} onClose={() => { setStudioDialog(null); void refreshList(); }} onPreferences={() => setNotice({ kind: 'ok', text: ui("Настройки студии сохранены") })} onCommit={commit}/>}
 </>;
    if (!project)
        return <ProjectHome brand={<Brand />} projects={projects} loading={loading} opening={opening} section={homeSection} onSection={section => {
                setHomeSection(section);
                const u = new URL(location.href);
                if (section === 'projects')
                    u.searchParams.delete('section');
                else
                    u.searchParams.set('section', section);
                window.history.replaceState(null, '', u);
            }} onNew={() => setNewProjectOpen(true)} onSettings={() => openWindow('settings')} onHelp={() => openWindow('help')} onAction={(kind, target) => setProjectAction({ kind, target })} onDownload={id => void downloadProject(id)} onTemplateCreated={async (id, initialFrame) => { await openFresh(id, initialFrame); setContentOpen(true); setTreeOpen(false); setResourcesOpen(false); }} notice={notice && <div className={'notice ' + notice.kind} role="status"><DiagnosticText message={notice.text}/></div>} onOpen={id => void openProject(id)} onImport={() => { setPackageTarget(null); setPackageMode('import'); }} onDemo={preset => void createDemo(preset)}>{workspaceDialogs}{packageMode && <ProjectPackage mode={packageMode} project={packageTarget} onClose={() => { setPackageMode(null); setPackageTarget(null); }} onImported={async (id) => { setPackageMode(null); setPackageTarget(null); await openFresh(id); }}/>}</ProjectHome>;
    return <div className={'studio-shell ' + (treeOpen || resourcesOpen || contentOpen ? 'tree-open ' : '') + (propertiesOpen ? 'props-open' : '')}>
  <span className="sr-only" role="status" aria-label={ui("Состояние звука")}>{audio.phase === 'loading' ? ui("Подготовка звука") : audio.phase === 'playing' ? ui("Воспроизведение") : audio.error || ui("Готово")}</span>
  <header className="studio-top" data-version={APP_VERSION} data-build={BUILD_ID}>
   <button className="brand-button" aria-label={ui("К проектам")} title={hasDraft ? ui("Примените или сбросьте изменения в свойствах") : ui("К проектам")} disabled={commandBlocked || canvasEdit.active} onClick={() => { ++openGeneration.current; setHomeSection('projects'); setProject(null); setPlaying(false); setNotice(null); const u = new URL(window.location.href); u.searchParams.delete('project'); u.searchParams.delete('panel'); u.searchParams.delete('frame'); u.searchParams.delete('section'); window.history.replaceState(null, '', u); void refreshList(); }}><Brand /></button>
   <CommandMenu label={ui("Файл")} disabled={canvasEdit.active || orderingLayers || opening} commands={[
            { label: ui("Новый проект…"), icon: 'plus', disabled: commandBlocked, action: () => { setPlaying(false); setNewProjectOpen(true); } },
            { label: ui("Создать копию…"), icon: 'layers', disabled: commandBlocked, action: () => { setPlaying(false); setProjectAction({ kind: 'copy', target: { id: project.id, title: project.title, revision: project.revision, updatedAt: null } }); } },
            { label: ui("Параметры проекта…"), icon: 'sliders', disabled: commandBlocked, action: () => openWindow('parameters') },
            { label: ui("Скачать проект…"), hint: ui("ZIP со всеми ресурсами"), icon: 'folder', disabled: commandBlocked, action: () => { setPlaying(false); setPackageMode('export'); } },
            { label: ui("Импортировать проект…"), hint: ui("Открыть отдельную копию из ZIP"), icon: 'folder', disabled: commandBlocked, action: () => { setPlaying(false); setPackageMode('import'); } },
            { label: ui("Импортировать 3D-модель…"), hint: ui("GLB или GLTF"), icon: 'cube', disabled: commandBlocked, divider: true, action: openModelImport },
            { label: ui("Обновить проект"), hint: ui("Перечитать сохранённое состояние"), icon: 'refresh', disabled: commandBlocked, divider: true, action: () => void openProject(project.id, true) }
        ]}/>
   <CommandMenu label={ui("Вид")} disabled={commandBlocked || canvasEdit.active} commands={[
            { label: ui("Слои"), icon: 'layers', action: () => {
                    setContentOpen(false);
                    setResourcesOpen(false);
                    setTreeOpen(true);
                    if (window.innerWidth <= 1100)
                        setPropertiesOpen(false);
                } },
            { label: ui("Ресурсы"), icon: 'folder', action: openResources },
            { label: ui("Звук и ритм…"), icon: 'volume', action: () => { setPlaying(false); setAudioWorkshopOpen(true); } },
            { label: ui("Раскадровка…"), icon: 'image', action: openStoryboard },
            ...(templateSlots(project).length ? [{ label: ui("Материалы шаблона"), icon: 'image', action: openContent }] : []),
            { label: ui("Свойства"), icon: 'sliders', action: () => {
                    setPropertiesOpen(true);
                    if (window.innerWidth <= 1100) {
                        setTreeOpen(false);
                        setResourcesOpen(false);
                        setContentOpen(false);
                    }
                } },
            { label: ui("Сравнить с проектом…"), icon: 'layers', divider: true, action: () => { setPlaying(false); setCompareOpen(true); } },
            { label: ui("История изменений…"), icon: 'history', action: () => openWindow('history') }
        ]}/><span className="top-divider"/><div className="document-name"><button title={ui("Параметры проекта")} disabled={commandBlocked} onClick={() => openWindow('parameters')}><strong>{project.title}</strong></button></div>
   <span className={'save-state ' + (hasDraft ? 'draft' : '')} title={ui("Версия проекта") + " " + project.revision} role="status"><span className="live-dot"/>{busy || resourceBusy ? ui("Сохранение…") : hasDraft ? ui("Не применено") : ui("Сохранено")}</span>
   <div className="top-actions"><button className="icon-button" title={hasDraft ? ui("Примените или сбросьте изменения в свойствах") : ui("Отменить · Ctrl+Z")} aria-label={ui("Отменить")} disabled={!canUndo || busy || hasDraft || resourceBusy || canvasEdit.active || orderingLayers} onClick={() => void history('undo')}><Icon name="undo"/></button><button className="icon-button" title={hasDraft ? ui("Примените или сбросьте изменения в свойствах") : ui("Повторить · Ctrl+Shift+Z")} aria-label={ui("Повторить")} disabled={!canRedo || busy || hasDraft || resourceBusy || canvasEdit.active || orderingLayers} onClick={() => void history('redo')}><Icon name="redo"/></button>
   <CommandMenu label={exporting ? ui("Сохранение…") : ui("Экспорт")} primary disabled={canvasEdit.active || orderingLayers || opening} commands={[
            { label: ui("Видео MP4…"), hint: ui("Ролик со звуком"), icon: 'play', disabled: commandBlocked, action: () => { setPlaying(false); setVideoExportOpen(true); } },
            { label: ui("Текущий кадр PNG"), hint: ui("Кадр") + " " + frame, icon: 'image', disabled: commandBlocked, divider: true, action: () => void exportFrames(true) },
            { label: ui("Три кадра PNG"), hint: ui("Первый, средний и последний"), icon: 'layers', disabled: commandBlocked, action: () => void exportFrames() }
        ]}/></div>
  </header>
  <div className="studio-main"><nav className="tool-rail" aria-label={ui("Инструменты студии")}>
   <div className="rail-group"><button aria-label={ui("Раскадровка")} title={ui("Сценарий, ключевые кадры и заметки")} disabled={commandBlocked} onClick={openStoryboard}><Icon name="image"/><span>{ui("Раскадровка")}</span></button></div>
   <div className="rail-group" aria-label={ui("Панели")}><button className={treeOpen ? 'active' : ''} aria-label={ui("Слои")} aria-pressed={treeOpen} title={ui("Слои")} disabled={resourceBusy || resourceDraft || dirty && propertiesOpen && window.innerWidth <= 1100} onClick={() => {
            setContentOpen(false);
            setResourcesOpen(false);
            if (window.innerWidth <= 1100)
                setPropertiesOpen(false);
            setTreeOpen(v => !v);
        }}><Icon name="layers"/><span>{ui("Слои")}</span></button><button className={propertiesOpen ? 'active' : ''} aria-label={ui("Свойства")} aria-pressed={propertiesOpen} title={dirty ? ui("Примените или сбросьте изменения перед закрытием") : ui("Свойства выбранного объекта")} disabled={commandBlocked} onClick={() => {
            if (window.innerWidth <= 1100) {
                setTreeOpen(false);
                setResourcesOpen(false);
                setContentOpen(false);
            }
            setPropertiesOpen(v => !v);
        }}><Icon name="sliders"/><span>{ui("Свойства")}</span></button></div>
   <div className="rail-group"><button className={resourcesOpen ? 'active' : ''} aria-label={ui("Ресурсы")} aria-pressed={resourcesOpen} disabled={commandBlocked} onClick={() => resourcesOpen ? closeResources() : openResources()}><Icon name="folder"/><span>{ui("Ресурсы")}</span></button></div><div className="rail-group" aria-label={ui("Библиотеки")}><button aria-label={ui("Звук и ритм")} title={ui("Звуковые эффекты и музыкальные метки")} disabled={commandBlocked} onClick={() => { setPlaying(false); setAudioWorkshopOpen(true); }}><Icon name="volume"/><span>{ui("Звук")}</span></button>{templateSlots(project).length > 0 && <button className={contentOpen ? 'active' : ''} aria-label={ui("Материалы шаблона")} aria-pressed={contentOpen} disabled={commandBlocked} onClick={() => contentOpen ? closeContent() : openContent()}><Icon name="image"/><span>{ui("Материалы")}</span></button>}<button aria-label={ui("Галерея эффектов")} title={ui("Анимация и эффекты объектов")} disabled={commandBlocked} onClick={openGallery}><Icon name="sparkles"/><span>{ui("Эффекты")}</span></button><button aria-label={ui("Фоны и переходы")} title={ui("Фоны, фильтры и переходы между сценами")} disabled={commandBlocked} onClick={openShaders}><Icon name="motion"/><span>{ui("Фоны")}</span></button><button aria-label={ui("Готовые композиции")} title={ui("Камера, текст, частицы, свет и звук")} disabled={commandBlocked} onClick={openCompositions}><Icon name="group"/><span>{ui("Композиции")}</span></button></div>
   <div className="rail-group rail-service"><button aria-label={ui("Настройки студии")} disabled={settingsBlocked} onClick={() => openWindow('settings')}><Icon name="settings"/><span>{ui("Настройки")}</span></button><button aria-label={ui("Справка")} disabled={commandBlocked} onClick={() => openWindow('help')}><Icon name="help"/><span>{ui("Справка")}</span></button></div>
  </nav>
   {contentOpen && <TemplateContent key={project.id} project={project} token={token} busy={busy || dirty || exporting || canvasEdit.active || orderingLayers} onCommit={commit} onWorking={setResourceBusy} onDirty={setResourceDraft} onSeek={seek} onPause={() => setPlaying(false)} onClose={closeContent} onResources={openResources}/>}
   {resourcesOpen && <ResourcePanel key={project.id} project={project} token={token} frame={frame} busy={busy || dirty || exporting || canvasEdit.active || orderingLayers} onCommit={commit} onSelect={select} onPause={() => setPlaying(false)} onClose={closeResources} onImportModel={openModelImport} onWorking={setResourceBusy} onDirty={setResourceDraft}/>}
   {treeOpen && <TreePanel partId={selectedPart} onPartSelect={selectPart} project={viewProject!} state={state} selectedId={selectedId} bitmaps={bitmaps} threeLayer={threeRef.current?.layer} playing={playing} busy={busy || hasDraft || resourceBusy || canvasEdit.active || galleryOpen || aiOpen || addingLayer} onOrderingChange={value => {
                setOrderingLayers(value);
                if (value)
                    setNotice(null);
            }} onSelect={selectLayer} onHover={hoverLayer} onAdd={addLayer} onDelete={() => void deleteSelectedLayer()} onAction={layerAction} onLocate={locateLayer} onClose={() => setTreeOpen(false)}/>}
   <section className="workspace"><div className="stage-heading"><span><i className="live-dot"/>{state?.sequence?.name ?? ui("Композиция")}</span><button className="stage-parameters" disabled={commandBlocked} onClick={() => openWindow('parameters')}>{project.size.width} × {project.size.height}<span>·</span>{fps}{" " + ui("кадров/с")}</button><button className={'selection-pill ' + (!selected ? 'empty' : '')} aria-label={selectedPart ? ui("Открыть деталь {0}", [selectedPartName]) : selected ? ui("Свойства объекта {0}", [selected.name]) : ui("Открыть свойства")} title={selectedPart ? ui("Открыть деталь в 3D") : selected ? selected.name : ui("Выбери объект в кадре или списке слоёв")} disabled={commandBlocked} onClick={() => {
            if (selectedPart)
                openModel();
            else {
                if (window.innerWidth <= 1100)
                    setTreeOpen(false);
                setPropertiesOpen(v => !v);
            }
        }}>{selected && <Icon name={kindIcons[selected.kind] ?? 'shape'} size={13}/>}<span>{selectedPartName ?? selected?.name ?? ui("Объект не выбран")}</span></button></div>
    <div className="stage-viewport" ref={viewportRef}><div className="canvas-fit" {...canvasEdit.events} style={{ width: fit.width, height: fit.height }}><canvas ref={canvasRef} className={"preview " + (canvasEdit.active ? "transforming" : "")} data-transforming={canvasEdit.active} style={{ cursor: canvasEdit.cursor }} onClick={canvasClick} aria-label={ui("Предпросмотр композиции")}/><canvas ref={overlayRef} className="overlay" aria-hidden="true"/>{selectedId && !selectedPart && state && !activeTransition && <svg className="canvas-frame-extensions" viewBox={"0 0 " + project.size.width + " " + project.size.height} aria-hidden="true"><polygon points={(layerQuad(viewProject!, state, selectedId) ?? []).map(p => p.x + "," + p.y).join(" ")} fill="none" stroke="#ffae79" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>{(layerQuad(viewProject!, state, selectedId) ?? []).map((p, i) => handlePosition(p).clipped ? <line key={i} x1={p.x} y1={p.y} x2={handlePosition(p).left / fit.width * project.size.width} y2={handlePosition(p).top / fit.height * project.size.height} stroke="#d78b58" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke"/> : null)}</svg>}{selectedId && !selectedPart && state && !activeTransition && (layerQuad(viewProject!, state, selectedId) ?? []).map((p, i) => <button key={i} type="button" className={"canvas-corner " + (handlePosition(p).clipped ? "off-frame" : "")} title={handlePosition(p).clipped ? ui("Угол за пределами просмотра — потяни эту ручку") : ui("Потяни угол · Shift — сохранить пропорции")} data-corner={i} aria-label={ui("Изменить размер —") + " " + [ui("левый верхний"), ui("правый верхний"), ui("правый нижний"), ui("левый нижний")][i] + (" " + ui("угол"))} disabled={busy || hasDraft || resourceBusy || !!layerLockReason(project, selectedId)} style={{ left: handlePosition(p).left, top: handlePosition(p).top, cursor: i % 2 ? "nesw-resize" : "nwse-resize" }}/>)}</div>{!project.nodes.length && !opening && <div className="empty-scene"><span className="empty-scene-symbol"><Icon name="plus" size={26}/></span><strong>{project.storyboard?.cards.length ? ui("Пока только раскадровка") : ui("Сцена готова к работе")}</strong><p>{project.storyboard?.cards.length ? ui("Откройте раскадровку и соберите монтажные сцены.") : ui("Добавьте изображение, текст или модель.")}</p><div><button className="text-button" onClick={openResources} disabled={commandBlocked}><Icon name="image" size={15}/>{ui("Изображение")}</button><button className="text-button" onClick={addLayer} disabled={commandBlocked}><Icon name="text" size={15}/>{ui("Текст")}</button><button className="text-button" onClick={openModelImport} disabled={commandBlocked}><Icon name="cube" size={15}/>{ui("Модель 3D")}</button></div></div>}{canvasEdit.active && <div className="canvas-gesture-hint" role="status">{busy ? ui("Сохраняю…") : ui("Перетаскивание · Shift — пропорции · Esc — отменить")}</div>}{opening && <div className="stage-loading">{ui("Открываю проект…")}</div>}</div>
    {notice && <div className={'notice ' + notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}><span><DiagnosticText message={notice.text}/></span><button className="icon-button" aria-label={ui("Закрыть сообщение")} onClick={() => setNotice(null)}><Icon name="close" size={14}/></button></div>}
    <div className="timeline"><div className="transport"><div className="transport-buttons"><button className="icon-button" onClick={() => seek(0)} aria-label={ui("В начало")} title={ui("В начало")}><Icon name="back" size={15}/></button><button className="step-button" onClick={() => seek(frame - 1)} aria-label={ui("Кадр назад")}>−1</button><button className="play-button" onClick={toggle} aria-label={playing ? ui("Пауза") : ui("Воспроизвести")}><Icon name={playing ? 'pause' : 'play'} size={17}/></button><button className="step-button" onClick={() => seek(frame + 1)} aria-label={ui("Кадр вперёд")}>+1</button></div><div className="time-readout"><strong>{seconds(frame, project)}</strong><span>/ {seconds(project.durationFrames, project)}{" " + ui("с")}</span></div>{project.audioTracks.length > 0 && <button className="icon-button sound-button" title={audioMuted ? ui("Включить звук") : ui("Выключить звук")} aria-label={audioMuted ? ui("Включить звук") : ui("Выключить звук")} aria-pressed={!audioMuted} onClick={() => { const next = !audioMuted; setAudioMuted(next); localStorage.setItem('motivelium-audio-muted', String(next)); }}><Icon name={audioMuted ? 'muted' : 'volume'} size={17}/></button>}<label className="frame-field">{ui("Кадр")}<input aria-label={ui("Номер кадра")} type="number" min="0" max={project.durationFrames - 1} value={timeDraft ?? frame} onFocus={() => { setPlaying(false); setTimeDraft(String(frame)); }} onChange={e => setTimeDraft(e.target.value)} onBlur={() => {
            if (timeDraft !== null && timeDraft.trim() && Number.isFinite(Number(timeDraft)))
                seek(Number(timeDraft));
            setTimeDraft(null);
        }} onKeyDown={e => {
            if (e.key === 'Enter')
                e.currentTarget.blur();
        }}/></label><span className="transport-hint">{activeTransition ? ui("Переход двух сцен · для правки выбери кадр вне перехода") : selectedPart ? ui("Деталь выбрана · положение и ключи — в мастерской 3D") : selectedId ? ui("Потяни объект или угол · Shift — пропорции") : ui("Пробел — просмотр · ← → по кадру")}</span></div>{selected && !selectedPart && <KeyframePanel project={project} node={selected} frame={frame} recording={animationMode} busy={busy || hasDraft || resourceBusy || canvasEdit.active || orderingLayers || exporting} onRecording={setAnimationMode} onSeek={seek} onAction={keyAction}/>}<div className="ruler"><span>0:00</span><span>{seconds(project.durationFrames / 2, project)}{" " + ui("с")}</span><span>{seconds(project.durationFrames, project)}{" " + ui("с")}</span></div><input className="timeline-seek" style={{ "--seek-progress": `${frame / Math.max(1, project.durationFrames - 1) * 100}%` } as React.CSSProperties} aria-valuetext={ui("Кадр {0}, {1} секунды", [frame, seconds(frame, project)])} aria-label={ui("Перемотка по кадрам")} type="range" min="0" max={project.durationFrames - 1} value={frame} onPointerDown={() => setPlaying(false)} onInput={e => seek(Number(e.currentTarget.value))} onChange={e => seek(Number(e.target.value))}/><div className="music-cue-strip" aria-label={ui("Музыкальные метки")}>{project.cues.map(c => <button key={c.id} aria-label={(c.label || c.kind) + (" " + ui("· кадр") + " ") + c.frame} title={(c.label || c.kind) + (" " + ui("· кадр") + " ") + c.frame} className={"music-cue " + c.kind} style={{ left: `${c.frame / project.durationFrames * 100}%` }} onClick={() => seek(c.frame)}/>)}</div><div className="scene-strip">{project.sequences.map((s, i) => <button key={s.id} className={'scene-clip ' + (state?.sequence?.id === s.id ? 'current' : '')} title={ui("{0} · кадры {1}–{2}", [s.name, s.fromFrame, s.toFrame - 1])} style={{ left: `${s.fromFrame / project.durationFrames * 100}%`, width: `calc(${(s.toFrame - s.fromFrame) / project.durationFrames * 100}% - 4px)` }} onClick={() => seek(s.fromFrame)}><span className="clip-icon"><Icon name={i % 2 ? 'cube' : 'layers'} size={16}/></span><span><b>{s.name}</b><small>{seconds(s.fromFrame, project)}–{seconds(s.toFrame, project)}{" " + ui("с")}</small></span><i className="clip-pattern"/></button>)}<div className="playhead" style={{ left: `${frame / Math.max(1, project.durationFrames - 1) * 100}%` }}/></div></div>
   </section>{propertiesOpen && <Inspector interactionBusy={canvasEdit.active || orderingLayers || resourceBusy || resourceDraft} project={project} frame={frame} recordKeys={animationMode || !!selected?.transformKeys?.length} node={selected ? { ...selected, transform: transformAtFrame(selected, frame) } : null} onCommit={commit} onClose={() => {
                if (hasDraft) {
                    setNotice({ kind: 'info', text: ui("Примените или сбросьте изменения в свойствах перед закрытием.") });
                    return;
                }
                setPropertiesOpen(false);
            }} onModel={openModel} onDirty={onDirty} onAddEffect={openGallery} onEditAI={openAI}/>}</div>
  {storyboardOpen && <Storyboard key={project.id} project={project} token={token} currentFrame={frame} bitmaps={bitmaps} threeLayer={threeRef.current?.layer} canUndo={canUndo} canRedo={canRedo} busy={busy} onDirty={setStoryDraft} onApply={commit} onHistory={history} onMontage={openStoryMontage} onClose={closeStoryboard}/>}
  {workspaceDialogs}
  {packageMode && <ProjectPackage mode={packageMode} project={project} onClose={() => setPackageMode(null)} onImported={async (id) => { setPackageMode(null); setVideoExportOpen(false); const u = new URL(window.location.href); u.searchParams.delete('panel'); window.history.replaceState(null, '', u); await refreshList(); await openProject(id); }}/>}
  {audioWorkshopOpen && <AudioWorkshop key={project.id} project={project} token={token} currentFrame={frame} selectedId={selectedId} bitmaps={bitmaps} threeLayer={threeRef.current?.layer} onApply={commit} onSeek={seek} onClose={() => {
                setAudioWorkshopOpen(false);
                const u = new URL(location.href);
                if (u.searchParams.get("panel") === "audio") {
                    u.searchParams.delete("panel");
                    window.history.replaceState(null, "", u);
                }
            }}/>}
  {videoExportOpen && <VideoExport project={project} token={token} onClose={() => setVideoExportOpen(false)}/>}
  {compositionOpen && <CompositionLibrary project={project} frame={frame} bitmaps={bitmaps} threeLayer={threeRef.current?.layer} onApply={commit} onSelect={select} onSeek={seek} onClose={() => { setCompositionOpen(false); setRenderEpoch(v => v + 1); }}/>}
  {modelOpen && selected?.kind === 'scene3d' && <ModelWorkshop key={project.id + selected.id} project={project} nodeId={selected.id} initialPart={selectedPart} currentFrame={frame} bitmaps={bitmaps} onApply={commit} onClose={() => { setModelOpen(false); setRenderEpoch(v => v + 1); }}/>}
  {modelImportOpen && <ModelImport project={project} token={token} frame={frame} onApply={async (description, ops, revision, id) => {
                const ok = await commit(description, ops, revision);
                if (ok) {
                    select(id);
                    seek(project.sequences.find(s => frame >= s.fromFrame && frame < s.toFrame)?.fromFrame ?? 0);
                }
                return ok;
            }} onClose={() => { setModelImportOpen(false); setRenderEpoch(v => v + 1); }}/>}
  {shaderOpen && <ShaderLibrary project={project} nodeId={selectedId} frame={frame} bitmaps={bitmaps} threeLayer={threeRef.current?.layer} onApply={commit} onSelect={select} onSeek={seek} onClose={() => { setShaderOpen(false); setRenderEpoch(v => v + 1); }}/>}
  {addingLayer && <LayerDialog project={project} frame={frame} selectedId={selectedId} onImportModel={() => { setAddingLayer(false); openModelImport(); }} onClose={() => setAddingLayer(false)} onCreate={createLayerNode}/>}
  {galleryOpen && <EffectGallery key={project.id} project={project} selectedId={selectedId} currentFrame={frame} bitmaps={bitmaps} threeLayer={threeRef.current?.layer} onSelect={select} onClose={() => { setGalleryOpen(false); setRenderEpoch(v => v + 1); }} onApply={commit} onSeek={seek}/>}
  {compareOpen && <ProjectComparison project={project} initialReference={new URLSearchParams(location.search).get('compare') ?? undefined} initialSeconds={frame / fps} onClose={() => {
                setCompareOpen(false);
                const u = new URL(location.href);
                if (u.searchParams.get('panel') === 'compare') {
                    u.searchParams.delete('panel');
                    u.searchParams.delete('compare');
                    window.history.replaceState(null, '', u);
                }
            }}/>}
  {aiOpen && selectedId && <AIEditor key={project.id + selectedId} project={project} nodeId={selectedId} currentFrame={frame} token={token} bitmaps={bitmaps} threeLayer={threeRef.current?.layer} onClose={() => { setAiOpen(false); setRenderEpoch(v => v + 1); }} onSeek={seek} onApply={applyAI}/>}
 </div>;
}
function Brand() { return <span className="brand"><span className="brand-mark"><i /><i /><i /></span>motivelium<span className="brand-dot">.</span></span>; }
