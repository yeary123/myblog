import test from 'node:test';
import assert from 'node:assert/strict';
import { newData } from '../src/lib/link-library.ts';
import { emptyLibrary, planSync, sameLibrary } from '../src/lib/link-sync.ts';

const noted = note => ({ ...newData(), records: { first: { note, level: 1, seen: 1 } } });
const cloud = (data, revision = 1) => ({ data, revision, updatedAt: '2026-11-07T00:00:00Z' });
test('first connection uploads existing local data or downloads into a fresh device', () => {
  assert.equal(planSync(newData(), cloud(null, 0), null), 'push', 'an empty owned library must persist without reseeding on another device');
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
  const reordered = { records: { first: { seen: 1, level: 1, note: '笔记' } }, tags: [], version: newData().version, entries: [], assignments: {}, deletedTags: [], journal: [], activityLog: [] };
  assert.equal(sameLibrary(data, reordered), true);
  assert.equal(planSync(data, cloud(reordered), null), 'equal');
  assert.equal(emptyLibrary(data), false);
  assert.equal(emptyLibrary({ ...newData(), tags: [{ id: 'tag-a', name: '收藏' }] }), false);
  assert.equal(emptyLibrary({ ...newData(), deletedTags: [{ tag: { id: 'tag-old', name: 'uke' }, entryIds: [], position: 0, deletedAt: 1 }] }), false, 'a recycle bin is personal data that must sync');
});

test('personal links alone upload and conflict rather than being treated as an empty library', () => {
  const data = {...newData(), entries: [{id:'custom-new',name:'新外链',url:'https://example.org',domain:'example.org',order:0,votes:null,recommendationTotal:0,reasons:[]}]};
  assert.equal(emptyLibrary(data),false);
  assert.equal(planSync(data,cloud(null,0),null),'push');
  assert.equal(planSync(newData(),cloud(data),null),'pull');
});

test('default copies pull an existing cloud library while deliberate empty libraries do not resurrect defaults',()=>{
 const seed=[{id:'first',name:'默认外链',url:'https://example.org/',domain:'example.org',order:1,votes:null,recommendationTotal:0,reasons:[],fees:['free']}];
 const initial=newData(seed);
 const removed={...initial,entries:[]};
 assert.equal(emptyLibrary(initial),false);
 assert.equal(planSync(initial,cloud(null,0),null,initial),'push');
 assert.equal(planSync(initial,cloud(removed),null,initial),'pull');
 assert.equal(planSync(removed,cloud(initial),null,initial),'conflict');
 assert.equal(planSync(removed,cloud(initial),{data:initial,revision:1},initial),'push');
 const changed={...initial,entries:[{...initial.entries[0],fees:[]}]};
 assert.equal(planSync(changed,cloud(initial),{data:initial,revision:1},initial),'push');
 assert.equal(planSync(changed,cloud(removed),{data:initial,revision:1},initial),'conflict');
});

test('migrated cloud documents are saved even when their normalized contents already match',()=>{
 const data=noted('旧数据');
 assert.equal(planSync(data,{...cloud(data),needsMigration:true},{data,revision:1}),'push');
 assert.equal(planSync(newData(),{...cloud(data),needsMigration:true},null),'pull');
});
