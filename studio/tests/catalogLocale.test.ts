import{test}from'node:test';import assert from'node:assert/strict';
import{REGISTRY as original}from'../effects/registry.ts';import{UI_REGISTRY,filterCatalog,parameterLabel}from'../src/editor/catalogView.ts';import{errorText,errorSummary}from'../src/editor/errorText.ts';
test('English metadata views preserve IDs, defaults, choices, evaluators and original definitions',()=>{
 const previous=globalThis.document;Object.assign(globalThis,{document:{documentElement:{dataset:{language:'en'}}}});
 try{for(const[id,source]of original){const before=JSON.stringify(source),view=UI_REGISTRY.get(id)!;assert.equal(view.id,id);assert.equal(view.evaluate,source.evaluate);assert.equal(UI_REGISTRY.get(id),view);assert(!/[А-Яа-яЁё]/u.test(view.name),id);assert(!/[А-Яа-яЁё]/u.test(view.description),id);for(let i=0;i<source.params.length;i++){assert.equal(view.params[i]!.name,source.params[i]!.name);assert.deepEqual(view.params[i]!.default,source.params[i]!.default);assert.deepEqual(view.params[i]!.choices?.map(c=>c.value),source.params[i]!.choices?.map(c=>c.value));assert(!/[А-Яа-яЁё]/u.test(parameterLabel(id,source.params[i]!.name)),id);for(const choice of view.params[i]!.choices??[])assert(!/[А-Яа-яЁё]/u.test(choice.label),id)}assert.equal(JSON.stringify(source),before)}
 assert(filterCatalog('choreography','motion').some(c=>c.id==='glyph-motion'));assert.equal(filterCatalog('','particles').length,2);assert.deepEqual(filterCatalog('','particles'),filterCatalog('','Частицы'));
 assert.equal(errorSummary('Review your changes.',{status:409,detail:'raw conflict'}),'Review your changes.\n[details]\nraw conflict');
 assert.equal(errorText(new Error('Произвольная диагностика')),'Could not complete the action.\n[details]\nПроизвольная диагностика');assert.equal(errorText(Object.assign(new Error('Conflict. Reload the project.'),{detail:'trace detail'})),'Conflict. Reload the project.\n[details]\ntrace detail');
 }finally{Object.assign(globalThis,{document:previous})}
});
