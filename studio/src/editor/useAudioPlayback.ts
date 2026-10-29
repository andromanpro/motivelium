import {errorText} from './errorText.ts';
import { ui } from './i18n.ts';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../domain/schema.ts';
import { AUDIO_RATE, audioPlan, mixProjectAudio } from '../../domain/audio.ts';
import { api } from './api.ts';
type Phase = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export function useAudioPlayback(project: Project | null, muted: boolean, assetUrl?: (assetId: string) => string) {
    const context = useRef<AudioContext | null>(null), source = useRef<AudioBufferSourceNode | null>(null), master = useRef<GainNode | null>(null);
    const generation = useRef(0), clock = useRef<{
        origin: number;
        from: number;
    } | null>(null);
    const cache = useRef<{
        key: string;
        buffer: AudioBuffer;
    } | null>(null), pending = useRef<AbortController | null>(null);
    const [phase, setPhase] = useState<Phase>('idle'), [error, setError] = useState('');
    const key = project ? JSON.stringify([project.id, project.fps, project.durationFrames, project.audioTracks, project.assets.filter(a => a.mime.startsWith('audio/')).map(a => [a.id, a.sha256])]) : '';
    function stop() {
        generation.current++;
        pending.current?.abort();
        pending.current = null;
        try {
            source.current?.stop();
        }
        catch { }
        source.current?.disconnect();
        source.current = null;
        clock.current = null;
    }
    function unlock() {
        if (!context.current || context.current.state === 'closed') {
            context.current = new AudioContext({ sampleRate: AUDIO_RATE });
            master.current = context.current.createGain();
            master.current.connect(context.current.destination);
        }
        master.current!.gain.value = muted ? 0 : 1;
        void context.current.resume().catch(() => { });
    }
    async function play(from: number) {
        stop();
        const run = generation.current;
        if (!project)
            return;
        setError('');
        setPhase('loading');
        const controller = new AbortController();
        pending.current = controller;
        const check = () => {
            if (run !== generation.current || controller.signal.aborted)
                throw new DOMException('Cancelled', 'AbortError');
        };
        try {
            unlock();
            const ctx = context.current!;
            await ctx.resume();
            check();
            const plan = audioPlan(project);
            if (plan.tracks.length && cache.current?.key !== key) {
                const mix = await mixProjectAudio(project, async (asset) => {
                    if ((asset.durationSeconds ?? 0) * AUDIO_RATE * 8 > 512 * 1024 * 1024)
                        throw Error(ui("Источник слишком длинный для предпросмотра. Обрежьте аудиофайл до нужного фрагмента."));
                    const response = await fetch(assetUrl ? assetUrl(asset.id) : api.assetUrl(project.id, asset.id), { signal: controller.signal });
                    if (!response.ok)
                        throw Error(ui("Не загружен звук:") + " " + (asset.title ?? asset.id));
                    const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
                    check();
                    if (decoded.numberOfChannels > 2)
                        throw Error(ui("Для общего микса используйте моно или стереофайл:") + " " + (asset.title ?? asset.id));
                    return { sampleRate: decoded.sampleRate, channels: Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i)) };
                }, check);
                const buffer = ctx.createBuffer(2, mix.left.length, AUDIO_RATE);
                buffer.copyToChannel(mix.left as Float32Array<ArrayBuffer>, 0);
                buffer.copyToChannel(mix.right as Float32Array<ArrayBuffer>, 1);
                cache.current = { key, buffer };
            }
            check();
            if (plan.tracks.length) {
                const node = ctx.createBufferSource();
                node.buffer = cache.current!.buffer;
                node.connect(master.current!);
                node.start(0, Math.max(0, from));
                source.current = node;
            }
            clock.current = { origin: ctx.currentTime, from };
            setPhase('playing');
        }
        catch (e) {
            if (run === generation.current && (e as Error).name !== 'AbortError') {
                stop();
                setError(errorText(e));
                setPhase('error');
            }
        }
    }
    useEffect(() => { stop(); cache.current = null; setPhase('idle'); setError(''); }, [key]);
    useEffect(() => {
        if (master.current)
            master.current.gain.value = muted ? 0 : 1;
    }, [muted]);
    useEffect(() => () => { stop(); void context.current?.close(); }, []);
    return { phase, error, unlock, play, pause() { stop(); setPhase('paused'); }, time() { const c = clock.current; return c && context.current ? c.from + context.current.currentTime - c.origin : null; } };
}
