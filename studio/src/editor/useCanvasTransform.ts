import {errorText} from './errorText.ts';
import { ui } from './i18n.ts';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Project, Transform } from '../../domain/schema.ts';
import type { FrameState } from '../../render/evaluate.ts';
import type { Operation } from '../../domain/operations.ts';
import { beginCanvasGesture, cornerAt, gestureOperations, gestureProject, pointInQuad, transformForPointer, type CanvasGesture, type Point, type Corner } from '../../domain/directManipulation.ts';
import { layerLockReason, layerQuad } from '../../domain/layers.ts';
import { hitTest } from '../../render/hitTest.ts';
type Live = {
    base: Project;
    gesture: CanvasGesture;
    transform: Transform;
    pointerId: number;
    capture: HTMLElement;
    client: Point;
    moved: boolean;
};
export function useCanvasTransform({ project, state, selectedId, canvas, disabled, recordKeys = false, onPick, onPause, onCommit, onNotice }: {
    project: Project | null;
    state: FrameState | null;
    selectedId: string | null;
    canvas: RefObject<HTMLCanvasElement | null>;
    disabled: boolean;
    recordKeys?: boolean;
    onPick: (id: string) => void;
    onPause: () => void;
    onCommit: (label: string, ops: Operation[], revision: number) => Promise<boolean>;
    onNotice: (message: string) => void;
}) {
    const live = useRef<Live | null>(null), latest = useRef({ project, state, disabled });
    latest.current = { project, state, disabled };
    const [preview, setPreview] = useState<Project | null>(null), [active, setActive] = useState(false), [cursor, setCursor] = useState('default');
    const suppress = useRef(false);
    function position(e: {
        clientX: number;
        clientY: number;
    }): Point { const c = canvas.current!, r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; }
    function cancel(message?: string) {
        const l = live.current;
        if (!l)
            return;
        live.current = null;
        suppress.current = l.moved;
        setPreview(null);
        setActive(false);
        setCursor('default');
        if (l.capture.hasPointerCapture(l.pointerId))
            l.capture.releasePointerCapture(l.pointerId);
        if (message)
            onNotice(message);
    }
    const cancelRef = useRef(cancel);
    cancelRef.current = cancel;
    useEffect(() => {
        const l = live.current;
        if (l && (disabled || project?.id !== l.gesture.projectId || project?.revision !== l.gesture.revision || state?.frame !== l.gesture.frame))
            cancel(ui("Перетаскивание отменено: изменился проект или кадр."));
    }, [project?.id, project?.revision, state?.frame, disabled]);
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (live.current && e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelRef.current(ui("Перетаскивание отменено."));
            }
        }, blur = () => cancelRef.current(ui("Перетаскивание отменено.")), resize = () => cancelRef.current(ui("Размер просмотра изменился — перетаскивание отменено."));
        window.addEventListener('keydown', key, true);
        window.addEventListener('blur', blur);
        window.addEventListener('resize', resize);
        return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('blur', blur); window.removeEventListener('resize', resize); };
    }, []);
    function down(e: ReactPointerEvent<HTMLElement>) {
        if (e.button !== 0 || !e.isPrimary || live.current || !project || !state)
            return;
        suppress.current = false;
        if (disabled) {
            onNotice(ui("Сохрани или сбрось черновик и дождись завершения операции."));
            return;
        }
        const point = position(e), selected = project.nodes.find(n => n.id === selectedId), quad = selectedId ? layerQuad(project, state, selectedId) : null, tolerance = 10 * canvas.current!.width / canvas.current!.getBoundingClientRect().width, handle = (e.target as HTMLElement).closest<HTMLElement>('[data-corner]'), corner = handle ? Number(handle.dataset.corner) as Corner : cornerAt(quad, point, tolerance);
        const id = corner !== undefined ? selectedId : selected?.kind === 'group' && pointInQuad(quad, point) ? selectedId : hitTest(state, point.x, point.y)?.nodeId;
        if (!id)
            return;
        onPause();
        onPick(id);
        try {
            const gesture = beginCanvasGesture(project, state, id, point, corner, recordKeys), capture = e.target instanceof HTMLElement ? e.target : e.currentTarget;
            live.current = { base: project, gesture, transform: gesture.transform, pointerId: e.pointerId, capture, client: { x: e.clientX, y: e.clientY }, moved: false };
            setActive(true);
            capture.setPointerCapture(e.pointerId);
            setCursor(corner === undefined ? 'grabbing' : resizeCursor(quad!, corner));
            e.preventDefault();
        }
        catch (error) {
            onNotice(errorText(error));
        }
    }
    function update(e: ReactPointerEvent<HTMLElement>) {
        const l = live.current;
        if (!l || l.pointerId !== e.pointerId)
            return;
        const distance = Math.hypot(e.clientX - l.client.x, e.clientY - l.client.y);
        if (!l.moved && distance < 3)
            return;
        l.moved = true;
        try {
            l.transform = transformForPointer(l.gesture, position(e), e.shiftKey);
            setPreview(gestureProject(l.base, l.gesture, l.transform));
        }
        catch (error) {
            cancel(errorText(error));
        }
    }
    function move(e: ReactPointerEvent<HTMLElement>) {
        if (live.current) {
            update(e);
            return;
        }
        if (!project || !state || disabled) {
            setCursor('default');
            return;
        }
        const p = position(e), quad = selectedId ? layerQuad(project, state, selectedId) : null, corner = cornerAt(quad, p, 10 * canvas.current!.width / canvas.current!.getBoundingClientRect().width);
        if (corner !== undefined && !layerLockReason(project, selectedId!)) {
            setCursor(resizeCursor(quad!, corner));
            return;
        }
        const id = project.nodes.find(n => n.id === selectedId)?.kind === 'group' && pointInQuad(quad, p) ? selectedId : hitTest(state, p.x, p.y)?.nodeId;
        setCursor(id && !layerLockReason(project, id) ? 'grab' : id ? 'not-allowed' : 'default');
    }
    async function up(e: ReactPointerEvent<HTMLElement>) {
        const l = live.current;
        if (!l || l.pointerId !== e.pointerId)
            return;
        update(e);
        if (live.current !== l)
            return;
        live.current = null;
        suppress.current = l.moved;
        if (l.capture.hasPointerCapture(e.pointerId))
            l.capture.releasePointerCapture(e.pointerId);
        const now = latest.current;
        try {
            if (now.project?.id !== l.gesture.projectId || now.project.revision !== l.gesture.revision || now.state?.frame !== l.gesture.frame) {
                onNotice(ui("Проект изменился. Перетаскивание отменено."));
                return;
            }
            const ops = l.moved ? gestureOperations(l.gesture, l.transform) : [];
            if (ops.length)
                await onCommit(l.gesture.mode === 'move' ? ui("Переместить слой") : ui("Изменить размер слоя"), ops, l.gesture.revision);
        }
        finally {
            setPreview(null);
            setActive(false);
            setCursor('grab');
        }
    }
    return { preview, active, cursor, consumeClick: () => { const value = suppress.current; suppress.current = false; return value; }, events: { onPointerDown: down, onPointerMove: move, onPointerUp: (e: ReactPointerEvent<HTMLElement>) => { void up(e); }, onPointerCancel: () => cancel(ui("Перетаскивание отменено.")), onLostPointerCapture: () => cancel(), onPointerLeave: () => {
                if (!live.current)
                    setCursor('default');
            } } };
}
function resizeCursor(quad: Point[], corner: number) { const a = quad[corner]!, b = quad[(corner + 2) % 4]!, angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 180) % 180; return angle < 22.5 || angle >= 157.5 ? 'ew-resize' : angle < 67.5 ? 'nwse-resize' : angle < 112.5 ? 'ns-resize' : 'nesw-resize'; }
