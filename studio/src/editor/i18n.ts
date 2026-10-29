import {ru} from './locales/ru.ts';
import {en} from './locales/en.ts';
import {currentLocale, type InterfaceLocale} from './locale.ts';
import {sourceCatalog, type SourceMessage} from './locales/catalog.ts';
export type {InterfaceLocale} from './locale.ts';
export type MessageKey = keyof typeof ru;
export function message(locale: InterfaceLocale, key: MessageKey): string {
  return (locale === 'en' ? en : ru)[key];
}

/** Explicit UI messages only. Never pass project text through this function. */
export function ui(source: SourceMessage, values: readonly unknown[] = []): string {
  const translated = currentLocale() === 'en' ? sourceCatalog[source] : source;
  return translated.replace(/\{(\d+)\}/g, (token,index) => Number(index)<values.length ? String(values[Number(index)]) : token);
}
/** UI-only labels from fixed maps; unknown labels remain available verbatim. */
export function uiLabel(source: string): string {
  return Object.hasOwn(sourceCatalog,source) ? ui(source as SourceMessage) : source;
}
