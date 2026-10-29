/** UI preferences belong to the local viewer, never to a Project or its history. */
export type AppearanceMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export const APPEARANCE_KEY = 'motivelium-appearance-v1';
export const APPEARANCE_EVENT = 'motivelium:appearance';

export function appearanceMode(value: unknown): AppearanceMode {
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function resolveTheme(mode: AppearanceMode, systemDark: boolean): ResolvedTheme {
  return mode === 'system' ? systemDark ? 'dark' : 'light' : mode;
}
export function storedAppearance(storage: Pick<Storage, 'getItem'>): AppearanceMode {
  try { return appearanceMode(storage.getItem(APPEARANCE_KEY)); } catch { return 'system'; }
}
export function currentAppearance(): AppearanceMode {
  return appearanceMode(document.documentElement.dataset.appearance);
}
function apply(mode: AppearanceMode) {
  const root = document.documentElement;
  root.dataset.appearance = mode;
  root.dataset.theme = resolveTheme(mode, matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', root.dataset.theme === 'dark' ? '#11191f' : '#f3f1eb');
}
export function setAppearance(mode: AppearanceMode): {saved: boolean} {
  apply(mode);
  let saved = true;
  try { localStorage.setItem(APPEARANCE_KEY, mode); } catch { saved = false; }
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
  return {saved};
}
/** Called by a small blocking head script, before CSS, fonts or React. */
export function installAppearance() {
  let initial: AppearanceMode = 'system';
  try { initial = storedAppearance(localStorage); } catch {}
  apply(initial);
  const media = matchMedia('(prefers-color-scheme: dark)');
  const changed = () => { apply(currentAppearance()); window.dispatchEvent(new Event(APPEARANCE_EVENT)); };
  const storage = (e: StorageEvent) => {
    if (e.key === APPEARANCE_KEY || e.key === null) {
      apply(appearanceMode(e.newValue));
      window.dispatchEvent(new Event(APPEARANCE_EVENT));
    }
  };
  media.addEventListener('change', changed);
  window.addEventListener('storage', storage);
  return () => { media.removeEventListener('change', changed); window.removeEventListener('storage', storage); };
}
