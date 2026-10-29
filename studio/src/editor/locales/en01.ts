import {shell} from './en01-shell.ts';
import {home} from './en01-home.ts';
import {settings} from './en01-settings.ts';
import {edit} from './en01-edit.ts';
import {media} from './en01-media.ts';
const validation={
 'Модель недоступна':'Model unavailable','Миниатюра выбранного слоя':'Selected layer thumbnail','Не виден на этом кадре':'Not visible in this frame','Миниатюра на паузе':'Thumbnail paused',

 'Пустой текст':'Empty text', 'Круг / эллипс':'Circle / ellipse',
 'Слой удалён.':'This layer has been deleted.', 'Заблокирован слой «{0}».':'Layer “{0}” is locked.',
 'Импортированная модель':'Imported model','Шестерни':'Gears','Монолит':'Monolith','Неоновый реактор':'Neon reactor','Световой тоннель':'Light tunnel','Разборное устройство':'Exploded device',

 'Название должно содержать от 1 до 200 символов.':'Use a title between 1 and 200 characters.',
 'Размер кадра — от 16 до 4096 пикселей по стороне, до 8,8 Мп.':'Each side must be 16–4096 pixels, with at most 8.8 megapixels in total.',
 'Частота кадров должна быть от 1 до 120.':'Frame rate must be between 1 and 120 fps.',
 'Длительность — до 5 минут и 36 000 кадров.':'Duration must be at least one frame and at most 5 minutes / 36,000 frames.',
} as const;
export const sourceCatalog = {...shell,...home,...settings,...edit,...media,...validation} as const;
export const sourceGroups = [shell,home,settings,edit,media,validation];
export type SourceMessage = keyof typeof sourceCatalog;
