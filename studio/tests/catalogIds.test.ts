import{test}from'node:test';import assert from'node:assert/strict';
import{EFFECT_CATEGORIES,SOUND_CATEGORIES,effectCategoryId,soundCategoryId}from'../domain/catalogIds.ts';
import{CATALOG,filterCatalog}from'../effects/catalog.ts';
import data from'../../www/sounds/catalog.json'with{type:'json'};
test('Catalog categories use stable unique IDs; Russian aliases are accepted only on input',()=>{
 for(const definitions of [EFFECT_CATEGORIES,SOUND_CATEGORIES]){
  assert.equal(new Set(definitions.map(d=>d.id)).size,definitions.length);
  for(const d of definitions)assert.match(d.id,/^[a-z][a-z-]*$/);
 }
 for(const d of EFFECT_CATEGORIES){assert.equal(effectCategoryId(d.id),d.id);assert.equal(effectCategoryId(d.label),d.id);assert.deepEqual(filterCatalog('',d.id),filterCatalog('',d.label));}
 for(const card of CATALOG)assert.equal(effectCategoryId(card.category),card.category);
 for(const entry of data.sounds){assert.equal(soundCategoryId(entry.category),entry.category);assert.equal(soundCategoryId(entry.categoryLabel),entry.category)}
 assert.equal(effectCategoryId('Unknown'),null);assert.equal(soundCategoryId(null),null);assert.deepEqual(filterCatalog('','Unknown'),[]);
 assert.equal(filterCatalog('','particles').length,2);assert.equal(filterCatalog('','all').length,CATALOG.length);
});
