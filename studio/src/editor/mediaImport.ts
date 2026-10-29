import {ui} from './i18n.ts';
import { api } from './api.ts';
import type { AssetRef } from '../../domain/schema.ts';
const base64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(Error(ui("Не удалось прочитать файл."))); reader.onabort = () => reject(Error(ui("Чтение файла отменено."))); reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.readAsDataURL(file); });
async function browserCheck(file: File, asset: AssetRef) { if (asset.mime.startsWith('image/')) {
    const bitmap = await createImageBitmap(new Blob([file], { type: asset.mime }));
    const valid = bitmap.width === asset.width && bitmap.height === asset.height;
    bitmap.close();
    if (!valid)
        throw Error(ui("Размер изображения не совпал с проверкой сервера."));
    return;
} await new Promise<void>((resolve, reject) => { const audio = new Audio(), url = URL.createObjectURL(new Blob([file], { type: asset.mime })); let done = false; const finish = (error?: Error) => { if (done)
    return; done = true; clearTimeout(timer); audio.onloadedmetadata = null; audio.onerror = null; audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); error ? reject(error) : resolve(); }; const timer = setTimeout(() => finish(Error(ui("Браузер не смог проверить аудиофайл за15секунд."))), 15000); audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? undefined : Error(ui("Браузер не смог определить длительность звука."))); audio.onerror = () => finish(Error(ui("Этот аудиофайл не воспроизводится браузером."))); audio.preload = 'metadata'; audio.src = url; }); }
export async function prepareMedia(projectId: string, token: string, file: File, revision: number, kind?: 'image' | 'audio') { if (file.size > 64 * 1024 * 1024)
    throw Error(ui("Файл должен быть не больше64МиБ.")); const { asset } = await api.stageMedia(projectId, token, { name: file.name, base64: await base64(file), expectedRevision: revision }); if (kind && !asset.mime.startsWith(kind + '/'))
    throw Error(kind === 'image' ? ui("Выберите PNG/JPEG/WebP.") : ui("Выберите WAV/MP3.")); await browserCheck(file, asset); return asset; }
