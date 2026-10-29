import {errorText} from './errorText.ts';
import { ui } from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../domain/schema.ts';
import { applyOperations } from '../../domain/operations.ts';
import { newId } from '../../domain/ids.ts';
import type { AIJob } from '../../agent/proposal.ts';
import type { AutoRun, AutoView } from '../../agent/auto.ts';
import type { AssetBitmaps, ThreeLayerRenderer } from '../../render/renderFrame.ts';
import { captureAIFrames } from './aiFrames.ts';
import { api } from './api.ts';
export function autoPointer(projectId: string, nodeId: string) { return 'motivelium-auto-run-v1:' + projectId + ':' + nodeId; }
export function useAutoEdit(input: {
    project: Project;
    nodeId: string;
    token: string;
    bitmaps: AssetBitmaps;
    threeLayer?: ThreeLayerRenderer;
    shownProject: Project;
    frame: number;
    onJob: (j: AIJob | null) => void;
    onError: (s: string) => void;
}) {
    const [run, setRun] = useState<AutoRun | null>(null), latest = useRef(input), epoch = useRef(0);
    latest.current = input;
    const key = autoPointer(input.project.id, input.nodeId);
    function accept(view: AutoView) {
        setRun(view.run);
        latest.current.onJob(view.job);
        if (view.job)
            try {
                localStorage.setItem('motivelium-ai-job-v1:' + view.run.projectId + ':' + view.run.nodeId, view.job.id);
            }
            catch { }
        ;
    }
    useEffect(() => {
        let alive = true, id: string | null = null;
        const started = epoch.current;
        try {
            id = localStorage.getItem(key);
        }
        catch { }
        if (id)
            void api.autoGet(input.project.id, id).then(v => {
                if (alive && epoch.current === started) {
                    if (v.run.nodeId === input.nodeId && v.run.projectId === input.project.id)
                        accept(v);
                    else
                        try {
                            localStorage.removeItem(key);
                        }
                        catch { }
                }
            }).catch(e => {
                if (alive && epoch.current === started) {
                    latest.current.onError(ui("Не удалось восстановить проход. Он не запускался повторно.") + " " + errorText(e));
                }
            });
        return () => { alive = false; };
    }, []);
    useEffect(() => {
        if (!run || run.status !== 'running')
            return;
        let stopped = false, timer: ReturnType<typeof setTimeout>, failures = 0;
        async function tick() {
            const i = latest.current;
            try {
                let v = await api.autoGet(i.project.id, run!.id);
                if (stopped)
                    return;
                accept(v);
                failures = 0;
                if (v.run.status === 'running' && v.run.phase === 'awaiting-frames' && v.job) {
                    await document.fonts.ready;
                    if (stopped)
                        return;
                    const current = latest.current;
                    if (current.project.revision !== v.run.baseRevision) {
                        v = await api.autoGet(i.project.id, run!.id);
                        if (!stopped)
                            accept(v);
                    }
                    else {
                        let frames;
                        try {
                            const trial = applyOperations(current.project, v.job.operations);
                            frames = captureAIFrames(current.project, current.nodeId, v.run.sampleFrames, current.bitmaps, current.threeLayer, trial, { project: current.shownProject, frame: current.frame });
                        }
                        catch (e) {
                            const ended = await api.autoCancel(i.project.id, run!.id, i.token, 'capture-error');
                            if (!stopped) {
                                accept(ended);
                                current.onError(errorText(e));
                            }
                            return;
                        }
                        if (stopped)
                            return;
                        try {
                            v = await api.autoAdvance(i.project.id, run!.id, i.token, { stepKey: v.run.stepKey, visualFrames: frames });
                        }
                        catch {
                            v = await api.autoGet(i.project.id, run!.id);
                        } // Lost POST: read persisted state; never blindly repeat it.
                        if (!stopped)
                            accept(v);
                    }
                }
                if (!stopped && v.run.status === 'running')
                    timer = setTimeout(tick, 600);
            }
            catch (e) {
                if (stopped)
                    return;
                failures++;
                latest.current.onError(ui("Связь с проходом прервана. Состояние сохранено; повторных запусков нет.") + " " + errorText(e));
                if (failures < 3)
                    timer = setTimeout(tick, 2000);
            }
        }
        timer = setTimeout(tick, 150);
        return () => { stopped = true; clearTimeout(timer); };
    }, [run?.id, run?.status]);
    return {
        run, active: run?.status === 'running',
        async start(input: Parameters<typeof api.autoStart>[2]) {
            epoch.current++;
            try {
                localStorage.setItem(key, input.requestId);
            }
            catch { }
            let v: AutoView;
            try {
                v = await api.autoStart(latest.current.project.id, latest.current.token, input);
            }
            catch (e) {
                try {
                    v = await api.autoGet(latest.current.project.id, input.requestId);
                }
                catch {
                    throw e;
                }
            }
            accept(v);
            return v;
        },
        async cancel() {
            if (!run)
                return;
            const v = await api.autoCancel(latest.current.project.id, run.id, latest.current.token);
            accept(v);
        },
        clear() {
            if (run?.status === 'running')
                return;
            epoch.current++;
            setRun(null);
            try {
                localStorage.removeItem(key);
            }
            catch { }
            ;
        },
        newId: () => newId('auto'),
    };
}
