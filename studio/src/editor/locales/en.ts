import type {ru} from './ru.ts';
/** A typed starting point. English is not exposed until complete UI coverage. */
export const en: Record<keyof typeof ru, string> = {
  'appearance.title': 'Appearance',
  'appearance.group': 'Interface theme',
  'appearance.system': 'System',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.systemHint': 'Follow Windows or your browser',
  'appearance.lightHint': 'Light paper with green accents',
  'appearance.darkHint': 'Graphite panels with soft highlights',
  'appearance.description': 'Applied immediately and saved for this browser. Video colours and exports stay the same.',
  'appearance.saved': 'Theme saved.',
  'appearance.notSaved': 'Theme applied. Your browser blocked saving, so the selection may reset after restarting.',
  'appearance.currentDark': 'The dark theme is currently active.',
  'appearance.currentLight': 'The light theme is currently active.',
};
