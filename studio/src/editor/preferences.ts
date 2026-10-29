import {ui} from './i18n.ts';
import { projectSetup, DEFAULT_SETUP, type ProjectSetup } from '../../domain/projectSetup.ts';
export type Preferences = {
    version: 1;
    animatePreviews: boolean;
    newProject: ProjectSetup;
};
const KEY = 'motivelium-preferences-v1';
export function readPreferences(): Preferences { try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (value?.version === 1)
        return { version: 1, animatePreviews: typeof value.animatePreviews === 'boolean' ? value.animatePreviews : true, newProject: projectSetup({ ...value.newProject, title: ui("Новый проект") }) };
}
catch { } return { version: 1, animatePreviews: !matchMedia('(prefers-reduced-motion: reduce)').matches, newProject: {...structuredClone(DEFAULT_SETUP),title:ui('Новый проект')} }; }
export function savePreferences(value: Preferences) { const safe: Preferences = { version: 1, animatePreviews: !!value.animatePreviews, newProject: projectSetup({ ...value.newProject, title: ui("Новый проект") }) }; localStorage.setItem(KEY, JSON.stringify(safe)); return safe; }
