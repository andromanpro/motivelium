import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appearanceMode, resolveTheme, storedAppearance, APPEARANCE_KEY} from '../src/editor/appearance.ts';
import {ru} from '../src/editor/locales/ru.ts';
import {en} from '../src/editor/locales/en.ts';
import {message} from '../src/editor/i18n.ts';

test('Appearance treats missing/corrupt preferences as system and respects explicit choice', () => {
  for (const value of [null,undefined,'auto','Dark','<script>',{},false]) assert.equal(appearanceMode(value),'system');
  assert.equal(resolveTheme(appearanceMode('dark'),false),'dark');
  assert.equal(resolveTheme(appearanceMode('light'),true),'light');
  assert.equal(resolveTheme('system',false),'light');
  assert.equal(resolveTheme('system',true),'dark');
  assert.equal(storedAppearance({getItem:key=>{assert.equal(key,APPEARANCE_KEY);return 'dark'}}),'dark');
  assert.equal(storedAppearance({getItem:()=>{throw new Error('Storage denied')}}),'system');
});
test('New interface messages have explicit English equivalents; locale does not rewrite content', () => {
  assert.deepEqual(Object.keys(ru).sort(),Object.keys(en).sort());
  for(const key of Object.keys(ru) as (keyof typeof ru)[]) {
    assert(message('en',key).trim());
    assert(!/[А-Яа-яЁё]/u.test(message('en',key)));
  }
  assert.equal(message('en','appearance.dark'),'Dark');
  assert.equal(message('ru','appearance.dark'),'Тёмная');
});
