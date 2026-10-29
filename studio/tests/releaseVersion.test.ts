import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReleaseVersion,compareReleaseVersions,windowsReleaseVersion} from '../domain/releaseVersion.ts';
import {assertReaderCompatible} from '../domain/version.ts';

test('release channels order numeric versions, prereleases and final releases correctly',()=>{
 const ordered=['0.1.0-alpha.4','0.1.0-alpha.12','0.1.0-beta.0','0.1.0-beta.2','0.1.0-rc.1','0.1.0','0.1.1-alpha.0','0.2.0-beta.1','0.10.0','1.0.0-alpha.0'];
 for(let i=0;i<ordered.length;i++)for(let j=0;j<ordered.length;j++)assert.equal(compareReleaseVersions(ordered[i]!,ordered[j]!),Math.sign(i-j));
});

test('beta readers open older alpha projects, but refuse future readers or missing features',()=>{
 const reader='0.2.0-beta.1',features=['storyboard-v1'];
 for(const minVersion of ['0.1.0-alpha.4','0.1.0','0.2.0-alpha.99','0.2.0-beta.1'])assert.doesNotThrow(()=>assertReaderCompatible({minVersion,features},reader,features));
 for(const minVersion of ['0.2.0-beta.2','0.2.0-rc.0','0.2.0','0.3.0-alpha.0'])assert.throws(()=>assertReaderCompatible({minVersion,features},reader,features),/Обновите/);
 assert.throws(()=>assertReaderCompatible({minVersion:reader,features},'0.1.0-alpha.4',features),/Обновите/);
 assert.throws(()=>assertReaderCompatible({minVersion:'0.1.0-alpha.4',features:['future-feature']},reader,features),/future-feature/);
 assert.doesNotThrow(()=>assertReaderCompatible(undefined,reader,features));
});

test('malformed and lossy version values do not bypass project compatibility checks',()=>{
 for(const value of ['0.2','0.02.0','0.2.0-beta','0.2.0-beta.01','0.2.0-nightly.1','0.2.0-beta.-1','0.2.0+build','0.2.0\n','9007199254740992.0.0','<script>']){
  assert.throws(()=>parseReleaseVersion(value),/Invalid/);
  assert.throws(()=>assertReaderCompatible({minVersion:value,features:[]},'0.2.0-beta.1',[]),/Некорректные/);
 }
 assert.throws(()=>assertReaderCompatible({minVersion:'0.2.0-beta.1',features:null as unknown as string[]},'0.2.0-beta.1',[]),/Некорректные/);
});

test('Windows PE revisions preserve alpha numbering and monotonic channel upgrades',()=>{
 assert.equal(windowsReleaseVersion('0.1.0-alpha.4'),'0.1.0.4');
 assert.equal(windowsReleaseVersion('0.2.0-beta.1'),'0.2.0.10001');
 assert.equal(windowsReleaseVersion('0.2.0-rc.2'),'0.2.0.20002');
 assert.equal(windowsReleaseVersion('0.2.0'),'0.2.0.65535');
 assert.throws(()=>windowsReleaseVersion('65536.0.0'),/Windows/);
 assert.throws(()=>windowsReleaseVersion('0.2.0-alpha.10000'),/Windows/);
});
