import test from 'node:test';
import assert from 'node:assert/strict';
import { newData } from '../src/lib/link-library.ts';
import { emptyLibrary, planSync, sameLibrary } from '../src/lib/link-sync.ts';

const noted = note => ({ ...newData(), records: { first: { note, level: 1, seen: 1 } } });
const cloud = (data, revision = 1) => ({ data, revision, updatedAt: '2026-11-07T00:00:00Z' });
test('first connection uploads existing local data or downloads into a fresh device', () => {
  assert.equal(planSync(newData(), cloud(null, 0), null), 'equal', 'opening an empty device must not create an empty cloud document');
  assert.equal(planSync(noted('本机笔记'), cloud(null, 0), null), 'push');
  assert.equal(planSync(newData(), cloud(noted('已有云端笔记')), null), 'pull');
  assert.equal(planSync(noted('不同的本机笔记'), cloud(noted('已有云端笔记')), null), 'conflict');
});
test('a common baseline distinguishes local changes, cloud changes, and offline conflicts', () => {
  const before = noted('以前的笔记');
  const base = { data: before, revision: 1 };
  assert.equal(planSync(noted('本机新笔记'), cloud(before), base), 'push');
  assert.equal(planSync(before, cloud(noted('另一设备的新笔记'), 2), base), 'pull');
  assert.equal(planSync(noted('本机离线改动'), cloud(noted('另一设备改动'), 2), base), 'conflict');
  assert.equal(planSync(newData(), cloud(before), base), 'push', 'intentional clearing must sync, not restore old data');
});
test('comparison ignores object key insertion order without discarding edits or tags', () => {
  const data = noted('笔记');
  const reordered = { records: { first: { seen: 1, level: 1, note: '笔记' } }, tags: [], version: 6, feeOverrides: {}, customEntries: [], assignments: {}, deletedTags: [], journal: [] };
  assert.equal(sameLibrary(data, reordered), true);
  assert.equal(planSync(data, cloud(reordered), null), 'equal');
  assert.equal(emptyLibrary(data), false);
  assert.equal(emptyLibrary({ ...newData(), tags: [{ id: 'tag-a', name: '收藏' }] }), false);
  assert.equal(emptyLibrary({ ...newData(), deletedTags: [{ tag: { id: 'tag-old', name: 'uke' }, entryIds: [], position: 0, deletedAt: 1 }] }), false, 'a recycle bin is personal data that must sync');
});

test('personal links alone upload and conflict rather than being treated as an empty library', () => {
  const data = {...newData(), customEntries: [{id:'custom-new',name:'新外链',url:'https://example.org',domain:'example.org',order:0,votes:null,recommendationTotal:0,reasons:[]}]};
  assert.equal(emptyLibrary(data),false);
  assert.equal(planSync(data,cloud(null,0),null),'push');
  assert.equal(planSync(newData(),cloud(data),null),'pull');
});

test('removing a default fee tag is personal data and survives synchronization planning',()=>{
 const removed={...newData(),feeOverrides:{first:[]}};
 assert.equal(emptyLibrary(removed),false);
 assert.equal(planSync(removed,cloud(null,0),null),'push');
 assert.equal(planSync(newData(),cloud(removed),null),'pull');
 const changed={...removed,feeOverrides:{first:['paid']}};
 assert.equal(planSync(changed,cloud(removed),{data:removed,revision:1}),'push');
 assert.equal(planSync(changed,cloud({...removed,feeOverrides:{first:['free','paid']}}),{data:removed,revision:1}),'conflict');
});
