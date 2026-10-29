import {installAppearance} from './appearance.ts';
import {installLocale} from './locale.ts';
try { installLocale(); } catch { document.documentElement.lang = 'ru'; }
try { installAppearance(); } catch {
  // Restricted storage must not prevent the editor from opening.
  document.documentElement.dataset.appearance = 'system';
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
