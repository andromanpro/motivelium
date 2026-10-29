// These faces ship with the application; canvas and MP4 wait for the same files.
// No system-font installation and no network font service are required.
import {BUNDLED_FONTS} from '../domain/fonts.ts';
export {BUNDLED_FONTS} from '../domain/fonts.ts';
const ready=new Map<string,Promise<void>>();
export function prepareFonts(families:readonly string[]=BUNDLED_FONTS): Promise<void> {
  const names=BUNDLED_FONTS.filter(f=>families.includes(f)),key=names.join('|');
  if(ready.has(key))return ready.get(key)!;
  const promise=Promise.all(names.map(async family => {
    const loaded = await document.fonts.load(`100px "${family}"`);
    if (!loaded.length) throw Error(`Не загружен встроенный шрифт ${family}. Восстановите комплект программы.`);
  })).then(() => document.fonts.ready).then(() => undefined);
  ready.set(key,promise);return promise;
}
