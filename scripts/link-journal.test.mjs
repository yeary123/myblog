import test from 'node:test';
import assert from 'node:assert/strict';
import { newData, validateBackup } from '../src/lib/link-library.ts';
import { localDate, validJournalDate, validateJournal } from '../src/lib/link-journal.ts';
import { emptyLibrary, planSync } from '../src/lib/link-sync.ts';

const entry = { date: '2026-11-08', work: '发布产品介绍，跟进审核', published: 2, urls: ['https://example.com/post'], next: '明天补充简介', updatedAt: 123 };
test('journal survives backups and old libraries migrate without losing notes or recycle bin', () => {
  const data = { ...newData(), journal: [entry] };
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data)), []), data);
  const old = { version: 3, tags: [], assignments: {}, records: {}, deletedTags: [{ tag: { id: 'tag-old', name: '保留' }, entryIds: [], position: 0, deletedAt: 1 }] };
  const migrated = validateBackup(old, []);
  assert.deepEqual(migrated.journal, []);
  assert.deepEqual(migrated.deletedTags, old.deletedTags);
});
test('dates use the local calendar and reject impossible dates', () => {
  assert.equal(localDate(new Date(2026, 10, 8, 0, 15)), '2026-11-08');
  for (const date of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-11-31', '0000-01-01', '2026-1-1']) assert.equal(validJournalDate(date), false);
  assert.equal(validJournalDate('2028-02-29'), true);
});
test('journal validation rejects duplicate days, invalid counts, dangerous links and missing work', () => {
  for (const patch of [{ date: '2026-02-30' }, { work: '  ' }, { published: -1 }, { published: 1.5 }, { urls: ['javascript:alert(1)'] }, { urls: ['https://user:password@example.com'] }, { urls: ['not a link'] }, { next: 'a'.repeat(5001) }]) assert.throws(() => validateJournal([{ ...entry, ...patch }]));
  assert.throws(() => validateJournal([entry, entry]));
  assert.throws(() => validateBackup({ ...newData(), journal: undefined }, []));
  assert.deepEqual(validateJournal([{ ...entry, urls: [entry.urls[0], entry.urls[0]] }]), [entry]);
  assert.deepEqual(validateJournal([entry, { ...entry, date: '2026-11-09' }]).map(item => item.date), ['2026-11-09', '2026-11-08']);
});
test('journal-only records upload, pull and detect concurrent edits', () => {
  const data = { ...newData(), journal: [entry] };
  const cloud = { data, revision: 1, updatedAt: null };
  assert.equal(emptyLibrary(data), false);
  assert.equal(planSync(data, { data: null, revision: 0, updatedAt: null }, null), 'push');
  assert.equal(planSync(newData(), cloud, null), 'pull');
  const edited = { ...data, journal: [{ ...entry, work: '本机修改' }] };
  const remote = { ...cloud, data: { ...data, journal: [{ ...entry, work: '其他设备修改' }] } };
  assert.equal(planSync(edited, remote, { data, revision: 1 }), 'conflict');
  assert.equal(planSync(newData(), cloud, { data, revision: 1 }), 'push');
});

test('explicit note saves preserve previous changes and ignore unchanged content', async () => {
  const { updateNoteActivity } = await import('../src/lib/link-journal.ts');
  const link = { id: 'first', name: '同名外链', url: 'https://example.org/' };
  const start = { ...newData(), records: { first: { level: 2, seen: 123, note: '旧笔记' } } };
  const saved = updateNoteActivity(start, link, '新笔记', 'act-first', '2026-11-13');
  assert.deepEqual(saved.records.first, { level: 2, seen: 123, note: '新笔记' });
  assert.equal(saved.activityLog.length, 1);
  assert.equal(saved.activityLog[0].before, '旧笔记');
  assert.equal(saved.activityLog[0].after, '新笔记');
  assert.equal(saved.activityLog[0].entryUrl, link.url);
  assert.equal(updateNoteActivity(saved, link, '新笔记', 'act-noop', '2026-11-13'), saved);
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(saved)), [link]), saved);
  const reverted = updateNoteActivity(saved, link, '旧笔记', 'act-revert', '2026-11-13');
  assert.equal(reverted.activityLog.length, 2, 'saving an earlier value must preserve both saved changes');
  const removed = updateNoteActivity(saved, link, '', 'act-second', '2026-11-13');
  assert.equal(removed.activityLog.length, 2);
  assert.equal(removed.activityLog[0].summary, '删除笔记');
  assert.equal(removed.activityLog[0].before, '新笔记');
});

test('activity history never silently truncates and validates deleted-link snapshots', async () => {
  const { appendActivities, validateActivityLog } = await import('../src/lib/link-journal.ts');
  const item = { id: 'act-old', date: '2026-11-13', entryId: 'custom-deleted', entryName: '已删除外链', entryUrl: 'https://example.org/', kind: 'link-deleted', summary: '删除外链', before: 'https://example.org/' };
  const history = Array.from({ length: 20000 }, (_, i) => ({ ...item, id: `act-${i}` }));
  const result = appendActivities(history, [item]);
  assert.equal(result.length, 20001);
  assert.equal(result.at(-1).id, 'act-19999');
  assert.equal(validateActivityLog(result).length, 20001);
  assert.deepEqual(validateBackup({ ...newData(), activityLog: [item] }, []).activityLog, [item]);
  assert.throws(() => validateActivityLog([item, item]));
  assert.throws(() => validateActivityLog([{ ...item, entryUrl: 'javascript:alert(1)' }]));
  assert.throws(() => validateActivityLog([{ ...item, date: '2026-02-30' }]));
  const { activityLog, ...v6 } = newData();
  assert.deepEqual(validateBackup({ ...v6, version: 6 }, []).activityLog, []);
});
