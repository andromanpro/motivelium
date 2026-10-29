export type InterfaceLocale = 'ru' | 'en';
export const LOCALE_KEY = 'motivelium-language-v1';
export const LOCALE_EVENT = 'motivelium:language';
export function interfaceLocale(value: unknown): InterfaceLocale { return value === 'en' ? 'en' : 'ru'; }
/** A new profile follows its first browser language; an explicit saved choice always wins. */
export function preferredInterfaceLocale(languages:readonly string[]):InterfaceLocale {
  return !languages.length||languages[0]!.toLowerCase().startsWith('ru')?'ru':'en';
}
export function currentLocale(): InterfaceLocale {
  return typeof document === 'undefined' ? 'ru' : interfaceLocale(document.documentElement.dataset.language);
}
export function localeTag(locale = currentLocale()): 'ru-RU' | 'en-US' { return locale === 'en' ? 'en-US' : 'ru-RU'; }
function apply(locale: InterfaceLocale) {
  document.documentElement.dataset.language = locale;
  document.documentElement.lang = locale;
  document.title = locale === 'en' ? 'Motivelium — video studio' : 'Motivelium — студия видео';
}
export function setInterfaceLocale(value: InterfaceLocale): {saved:boolean} {
  const locale = interfaceLocale(value); apply(locale);
  let saved = true; try { localStorage.setItem(LOCALE_KEY,locale); } catch { saved = false; }
  window.dispatchEvent(new Event(LOCALE_EVENT)); return {saved};
}
export function installLocale() {
  const fallback=()=>preferredInterfaceLocale(typeof navigator==='undefined'?[]:navigator.languages);
  let locale: InterfaceLocale = fallback();
  try { const value=localStorage.getItem(LOCALE_KEY);if(value==='ru'||value==='en')locale=value; } catch {}
  apply(locale);
  const storage = (event: StorageEvent) => {
    if(event.key === LOCALE_KEY || event.key === null) { apply(event.newValue===null?fallback():interfaceLocale(event.newValue)); window.dispatchEvent(new Event(LOCALE_EVENT)); }
  };
  window.addEventListener('storage',storage);
  return () => window.removeEventListener('storage',storage);
}
