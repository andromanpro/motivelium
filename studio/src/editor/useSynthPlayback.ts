import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../domain/schema.ts';
import { accentSamples, accentSlice } from '../../domain/synthAudio.ts';
/** Short look-ahead scheduling follows the displayed timeline, including seek and preview loops. */
export function useSynthPlayback(project: Project | null, frame: number, playing: boolean, muted: boolean) {
    const latest = useRef(frame);
    latest.current = frame;
    const [error, setError] = useState('');
    const signature = JSON.stringify(project?.audioTracks.filter(t => t.synth) ?? []);
    useEffect(() => {
        if (!project || !playing || muted || !project.audioTracks.some(t => t.synth && !t.mute))
            return;
        let ctx: AudioContext;
        try {
            ctx = new AudioContext();
        }
        catch {
            setError(ui("Синтез звука недоступен в браузере."));
            return;
        }
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -6;
        compressor.ratio.value = 6;
        compressor.connect(ctx.destination);
        const scheduled = new Set<string>(), sources = new Set<AudioBufferSourceNode>(), buffers = new Map<string, AudioBuffer>();
        let previous = latest.current, cancelled = false;
        const stop = () => {
            for (const s of sources) {
                try {
                    s.stop();
                }
                catch { }
            }
            sources.clear();
            scheduled.clear();
        };
        const tick = () => {
            if (cancelled || ctx.state !== 'running')
                return;
            const now = latest.current * project.fps.den / project.fps.num;
            if (latest.current < previous)
                stop();
            previous = latest.current;
            for (const t of project.audioTracks) {
                if (!t.synth || t.mute || scheduled.has(t.id) || t.offsetSeconds > now + .16)
                    continue;
                const slice = accentSlice(t, now);
                scheduled.add(t.id);
                if (!slice)
                    continue;
                let buffer = buffers.get(t.id);
                if (!buffer) {
                    const samples = accentSamples(t.synth, ctx.sampleRate);
                    buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
                    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
                    buffers.set(t.id, buffer);
                }
                const source = ctx.createBufferSource(), gain = ctx.createGain();
                source.buffer = buffer;
                gain.gain.value = slice.gain;
                source.connect(gain);
                gain.connect(compressor);
                sources.add(source);
                source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); };
                source.start(ctx.currentTime + slice.delay, slice.offset);
            }
        };
        void ctx.resume().then(() => {
            if (!cancelled) {
                setError('');
                tick();
            }
        }).catch(() => {
            if (!cancelled)
                setError(ui("Браузер не разрешил звук. Нажми воспроизведение ещё раз."));
        });
        const timer = window.setInterval(tick, 35);
        return () => { cancelled = true; clearInterval(timer); stop(); compressor.disconnect(); void ctx.close(); };
    }, [project?.id, project?.fps.num, project?.fps.den, signature, playing, muted]);
    return error;
}
import {ui} from './i18n.ts';
