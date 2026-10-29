import {useState} from 'react';
import {setInterfaceLocale, type InterfaceLocale} from './locale.ts';
import {useInterfaceLocale} from './useInterfaceLocale.ts';
export function LanguageSettings() {
  const locale=useInterfaceLocale(),[saved,setSaved]=useState<boolean|null>(null);
  return <section className="language-settings"><h3>{locale==='en'?'Interface language':'Язык интерфейса'}</h3>
    <label>{locale==='en'?'Language':'Язык'}<select aria-label="Язык / Language" value={locale} onChange={e=>setSaved(setInterfaceLocale(e.target.value as InterfaceLocale).saved)}>
      <option value="ru" lang="ru">Русский</option><option value="en" lang="en">English</option>
    </select></label>
    <p className="dialog-note">{locale==='en'?'Changes menus and controls immediately. Your video text stays as written.':'Меняет меню и элементы управления сразу. Тексты вашего ролика сохраняются.'}</p>
    <p className="dialog-note">{locale==='en'?'Studio controls and Help are available in English. In Examples, choose the video language separately. All built-in examples and starter templates are available in Russian and English.':'Элементы управления и справка доступны на английском. В «Примерах» язык ролика выбирается отдельно. Все встроенные примеры и стартовые шаблоны доступны на русском и английском.'}</p>
    {saved===false&&<p className="field-warning" role="status">{locale==='en'?'Language applied. Your browser blocked saving, so the choice may reset after restarting.':'Язык применён. Браузер запретил сохранение — после перезапуска выбор может сброситься.'}</p>}
  </section>;
}
