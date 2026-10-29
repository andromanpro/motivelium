import {test} from 'node:test';import assert from 'node:assert/strict';
import {stageLighting3d} from '../effects/stageLighting3d.ts';
test('Lighting profile does not change old project light or the discharge scene',()=>{
 const before=stageLighting3d(undefined,1.65),dramatic=stageLighting3d('dramatic',1.65);
 assert.equal(before.hemisphere,1.2);assert.equal(before.environment,1);assert.equal(before.key,1.15*1.65);
 assert(dramatic.hemisphere<before.hemisphere);assert(dramatic.strip>0);assert(dramatic.fog<before.fog);
 assert.deepEqual(stageLighting3d('dramatic',1.65,true),stageLighting3d(undefined,1.65,true));
 assert.deepEqual(stageLighting3d(undefined,1.65),before);
});
