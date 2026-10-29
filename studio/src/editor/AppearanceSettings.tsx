import {useEffect, useState} from 'react';
import {APPEARANCE_EVENT, currentAppearance, setAppearance, type AppearanceMode} from './appearance.ts';
import {message, type InterfaceLocale} from './i18n.ts';
import {useInterfaceLocale} from './useInterfaceLocale.ts';

export function AppearanceSettings({locale: override}: {locale?: InterfaceLocale}) {
  const selectedLocale = useInterfaceLocale(), locale = override ?? selectedLocale;
  const [mode, setMode] = useState(currentAppearance);
  const [resolved, setResolved] = useState(document.documentElement.dataset.theme);
  const [saved, setSaved] = useState<boolean | null>(null);
  const t = (key: Parameters<typeof message>[1]) => message(locale, key);
  useEffect(() => {
    const changed = () => { setMode(currentAppearance()); setResolved(document.documentElement.dataset.theme); };
    window.addEventListener(APPEARANCE_EVENT, changed);
    return () => window.removeEventListener(APPEARANCE_EVENT, changed);
  }, []);
  function choose(value: AppearanceMode) { setSaved(setAppearance(value).saved); }
  const modes = ['system', 'light', 'dark'] as const;
  return <section className="appearance-settings">
    <h3>{t('appearance.title')}</h3>
    <div className="appearance-options" role="group" aria-label={t('appearance.group')}>
      {modes.map(value => <button type="button" key={value} className={'appearance-option ' + value} aria-pressed={mode === value} onClick={() => choose(value)}>
        <span className="appearance-mini" aria-hidden="true"><i/><b/><em/><small/></span>
        <strong>{t(('appearance.' + value) as 'appearance.system' | 'appearance.light' | 'appearance.dark')}</strong>
        <span>{t(('appearance.' + value + 'Hint') as 'appearance.systemHint' | 'appearance.lightHint' | 'appearance.darkHint')}</span>
      </button>)}
    </div>
    <p className="dialog-note">{t('appearance.description')}</p>
    <p className="appearance-state" aria-live="polite">{saved === false ? t('appearance.notSaved') : saved === true ? t('appearance.saved') + ' ' : ''}{saved !== false && t(resolved === 'dark' ? 'appearance.currentDark' : 'appearance.currentLight')}</p>
  </section>;
}
