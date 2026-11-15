import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import worker from '../worker/index.ts';
import entries from '../src/data/external-links.json' with { type: 'json' };
import { archiveTag, createLibraryEntry, deleteLibraryEntry, editLibraryEntry, setEntryFees, validateBackup, newData, permanentlyDeleteTag, restoreTag } from '../src/lib/link-library.ts';

const schema = await readFile(new URL('../worker/migrations/0001_personal_library.sql', import.meta.url), 'utf8');
const origin = 'https://builtbyluna.cc';
const secret = 'test1234';
function harness(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  t.after(() => sqlite.close());
  const env = {
    SITE_ORIGIN: origin,
    SYNC_KEY: secret,
    LOGIN_RATE_LIMITER: { limit: async () => ({ success: true }) },
    DB: { prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async run() { return sqlite.prepare(sql).run(...values); },
      };
    } },
  };
  async function call(path, { method = 'GET', body, cookie, requestOrigin = origin } = {}) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (requestOrigin) headers.set('Origin', requestOrigin);
    if (cookie) headers.set('Cookie', cookie);
    return worker.fetch(new Request('https://links-sync.builtbyluna.cc' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  }
  async function login() {
    const response = await call('/session', { method: 'POST', body: { key: secret } });
    assert.equal(response.status, 200);
    return response.headers.get('Set-Cookie').split(';')[0];
  }
  return { env, sqlite, call, login };
}
const dataWith = note => ({ ...newData(entries), records: { [entries[0].id]: { note, level: 1, seen: 123 } } });

test('journals sync between sessions and support intentional deletion', async t => {
 const h=harness(t),a=await h.login(),b=await h.login();
 const data={...newData(entries),journal:[{date:'2026-11-08',work:'提交外链',published:1,urls:['https://example.com/post'],next:'',updatedAt:123}]};
 assert.equal((await h.call('/library',{method:'PUT',cookie:a,body:{revision:0,data}})).status,200);
 assert.deepEqual((await (await h.call('/library',{cookie:b})).json()).data,data);
 assert.equal((await h.call('/library',{method:'PUT',cookie:b,body:{revision:1,data:{...data,journal:[]}}})).status,200);
 assert.deepEqual((await (await h.call('/library',{cookie:a})).json()).data.journal,[]);
});

test('private data requires authentication and the exact website origin', async t => {
  const h = harness(t);
  assert.equal((await h.call('/library')).status, 401);
  assert.equal((await h.call('/library', { method: 'PUT', body: { revision: 0, data: newData(entries) } })).status, 401);
  const cookie = await h.login();
  assert.equal((await h.call('/library', { cookie, requestOrigin: 'https://evil.example' })).status, 403);
  assert.equal((await h.call('/session', { method: 'DELETE', cookie, requestOrigin: null })).status, 403);
  const preflight = await h.call('/library', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), 'true');
});
test('login uses secure cookies, stores only token hashes, and supports revocation and key rotation', async t => {
  const h = harness(t);
  assert.equal((await h.call('/session', { method: 'POST', body: { key: 'wrong' } })).status, 401);
  const response = await h.call('/session', { method: 'POST', body: { key: secret } });
  const setCookie = response.headers.get('Set-Cookie');
  assert.match(setCookie, /^__Host-luna-links=[a-f0-9]{64};/);
  assert.match(setCookie, /HttpOnly; SameSite=Strict; Max-Age=2592000; Secure/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const cookie = setCookie.split(';')[0];
  const stored = h.sqlite.prepare('SELECT * FROM sessions').get();
  assert.notEqual(stored.token_hash, cookie.split('=')[1]);
  assert.equal((await h.call('/session', { cookie })).status, 200);
  await h.call('/session', { method: 'DELETE', cookie });
  assert.equal((await h.call('/library', { cookie })).status, 401);
  const second = await h.login();
  h.env.SYNC_KEY = 'different-long-random-key-at-least-32-characters';
  assert.equal((await h.call('/session', { cookie: second })).status, 401);
});
test('expired sessions and rate-limited or unconfigured login fail closed', async t => {
  const h = harness(t);
  const cookie = await h.login();
  h.sqlite.exec('UPDATE sessions SET expires_at = 0');
  assert.equal((await h.call('/library', { cookie })).status, 401);
  h.env.LOGIN_RATE_LIMITER.limit = async () => ({ success: false });
  const limited = await h.call('/session', { method: 'POST', body: { key: secret } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  h.env.SYNC_KEY = 'short';
  assert.equal((await h.call('/session', { method: 'POST', body: { key: 'short' } })).status, 503);
});
test('compare-and-swap prevents two devices from overwriting one another', async t => {
  const h = harness(t);
  const a = await h.login(), b = await h.login();
  const initial = await (await h.call('/library', { cookie: a })).json();
  assert.deepEqual(initial, { data: null, revision: 0, updatedAt: null });
  const first = await h.call('/library', { method: 'PUT', cookie: a, body: { revision: 0, data: dataWith('设备 A') } });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).revision, 1);
  assert.equal((await h.call('/library', { method: 'PUT', cookie: b, body: { revision: 0, data: dataWith('设备 B') } })).status, 409);
  assert.equal((await h.call('/library', { method: 'PUT', cookie: b, body: { revision: 1, data: dataWith('设备 B 新改动') } })).status, 200);
  assert.equal((await h.call('/library', { method: 'PUT', cookie: a, body: { revision: 1, data: dataWith('设备 A 旧版本') } })).status, 409);
  const saved = await (await h.call('/library', { cookie: a })).json();
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.data, dataWith('设备 B 新改动'));
});
test('invalid records and malformed requests cannot replace saved notes', async t => {
  const h = harness(t);
  const cookie = await h.login();
  await h.call('/library', { method: 'PUT', cookie, body: { revision: 0, data: dataWith('保留') } });
  for (const body of [null, { revision: -1, data: newData(entries) }, { revision: 1, data: { ...newData(entries), tags: [{ id: 'invalid id', name: '坏标签' }] } }, { revision: 1, data: dataWith('a'.repeat(2001)) }]) {
    assert.equal((await h.call('/library', { method: 'PUT', cookie, body })).status, 400);
  }
  assert.deepEqual((await (await h.call('/library', { cookie })).json()).data, dataWith('保留'));
});

test('oversized personal libraries are rejected without truncating saved notes', async t => {
  const h = harness(t);
  const cookie = await h.login();
  await h.call('/library', { method: 'PUT', cookie, body: { revision: 0, data: dataWith('保留原记录') } });
  const large = { ...newData(entries), records: Object.fromEntries(entries.map(entry => [entry.id, { note: '字'.repeat(2000), level: 0, seen: 1 }])) };
  assert.equal((await h.call('/library', { method: 'PUT', cookie, body: { revision: 1, data: large } })).status, 413);
  assert.deepEqual((await (await h.call('/library', { cookie })).json()).data, dataWith('保留原记录'));
});

test('recycle bin syncs across sessions and restores original associations without reverting notes', async t => {
  const h = harness(t);
  const a = await h.login(), b = await h.login();
  const data = dataWith('保留笔记');
  data.tags = [{ id: 'tag-uke', name: 'uke' }];
  data.assignments = { [entries[0].id]: ['tag-uke'] };
  await h.call('/library', { method: 'PUT', cookie: a, body: { revision: 0, data } });
  const archived = archiveTag(data, 'tag-uke', 1000);
  const saved = await h.call('/library', { method: 'PUT', cookie: a, body: { revision: 1, data: archived } });
  assert.equal(saved.status, 200);
  const onB = await (await h.call('/library', { cookie: b })).json();
  assert.deepEqual(onB.data, archived);
  onB.data.records[entries[0].id].note = '删除后继续编辑';
  const restored = restoreTag(onB.data, 'tag-uke');
  assert.equal((await h.call('/library', { method: 'PUT', cookie: b, body: { revision: onB.revision, data: restored } })).status, 200);
  const result = await (await h.call('/library', { cookie: a })).json();
  assert.deepEqual(result.data, restored);
});

test('older pages cannot overwrite a personal snapshot or resurrect deleted default links', async t => {
 const h=harness(t),cookie=await h.login();
 const data=deleteLibraryEntry(dataWith('仍保留'),entries[0]);
 assert.equal((await h.call('/library',{method:'PUT',cookie,body:{revision:0,data}})).status,200);
 for(const version of [1,2,3,4,5,6,7]){
  const legacy={version,tags:[],assignments:{},records:{},customEntries:[],feeOverrides:{},deletedTags:[],journal:[],activityLog:[]};
  const response=await h.call('/library',{method:'PUT',cookie,body:{revision:1,data:legacy}});
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/刷新/);
  assert.deepEqual((await (await h.call('/library',{cookie})).json()).data,data);
 }
});

test('all links support edits, deletion and re-adding across devices with full history retained', async t => {
 const h=harness(t),a=await h.login(),b=await h.login();
 const data=dataWith('我的笔记');
 const original=data.entries[0];
 const edited=editLibraryEntry(original,{name:'我改的名称',url:'https://example.org/mine',description:'我的说明'},data.entries);
 data.entries=data.entries.map(entry=>entry.id===edited.id?edited:entry);
 assert.equal((await h.call('/library',{method:'PUT',cookie:a,body:{revision:0,data}})).status,200);
 assert.deepEqual((await (await h.call('/library',{cookie:b})).json()).data,data);
 const deleted=deleteLibraryEntry(data,edited);
 deleted.activityLog=[{id:'act-deleted',date:'2026-11-15',entryId:edited.id,entryName:edited.name,entryUrl:edited.url,kind:'link-deleted',summary:'删除外链'}];
 assert.equal((await h.call('/library',{method:'PUT',cookie:b,body:{revision:1,data:deleted}})).status,200);
 const stored=(await (await h.call('/library',{cookie:a})).json()).data;
 assert.deepEqual(stored,deleted);
 assert.equal(stored.entries.some(entry=>entry.id===original.id),false);
 assert.equal((await h.call('/library',{method:'PUT',cookie:a,body:{revision:1,data}})).status,409);
 const added=createLibraryEntry({name:'重新添加',url:edited.url,description:''},stored.entries,'custom-readded');
 const next={...stored,entries:[added,...stored.entries]};
 assert.equal((await h.call('/library',{method:'PUT',cookie:a,body:{revision:2,data:next}})).status,200);
 assert.deepEqual((await (await h.call('/library',{cookie:b})).json()).data,next);
});

test('existing version 7 cloud data migrates into a full personal snapshot on first new-client save', async t => {
 const h=harness(t),cookie=await h.login();
 const custom=createLibraryEntry({name:'旧外链',url:'example.org/legacy',description:'原说明'},entries,'custom-legacy');
 const old={version:7,customEntries:[custom],feeOverrides:{[entries[0].id]:[]},tags:[{id:'tag-old',name:'保留'}],assignments:{[entries[0].id]:['tag-old'],[custom.id]:['tag-old']},records:{[custom.id]:{note:'保留笔记',level:1,seen:123}},deletedTags:[],journal:[],activityLog:[]};
 h.sqlite.prepare('INSERT INTO library(id,data_json,revision,updated_at) VALUES(1,?,1,?)').run(JSON.stringify(old),'2026-11-15T00:00:00Z');
 const cloud=(await (await h.call('/library',{cookie})).json());
 const migrated=validateBackup(cloud.data,entries);
 assert.equal(migrated.entries.length,entries.length+1);
 assert.deepEqual(migrated.entries.find(entry=>entry.id===entries[0].id).fees,[]);
 assert.deepEqual(migrated.records,old.records);
 assert.equal((await h.call('/library',{method:'PUT',cookie,body:{revision:cloud.revision,data:migrated}})).status,200);
 assert.deepEqual((await (await h.call('/library',{cookie})).json()).data,migrated);
});

test('permanent deletion syncs across devices and stale writes cannot resurrect the tag',async t=>{
 const h=harness(t),a=await h.login(),b=await h.login();
 const data=dataWith('保留我的笔记');
 data.tags=[{id:'tag-delete',name:'删除'},{id:'tag-keep',name:'保留'}];
 data.assignments={[entries[0].id]:['tag-delete','tag-keep']};
 const archived=archiveTag(data,'tag-delete',1000);
 await h.call('/library',{method:'PUT',cookie:a,body:{revision:0,data:archived}});
 const deleted=permanentlyDeleteTag(archived,'tag-delete');
 assert.equal((await h.call('/library',{method:'PUT',cookie:a,body:{revision:1,data:deleted}})).status,200);
 assert.deepEqual((await (await h.call('/library',{cookie:b})).json()).data,deleted);
 assert.equal((await h.call('/library',{method:'PUT',cookie:b,body:{revision:1,data:archived}})).status,409);

});

test('fee changes belong to each link and sync including explicit removal',async t=>{
 const h=harness(t),a=await h.login(),b=await h.login();
 const data=setEntryFees(dataWith('保留笔记'),entries[0],[]);
 assert.equal((await h.call('/library',{method:'PUT',cookie:a,body:{revision:0,data}})).status,200);
 assert.deepEqual((await (await h.call('/library',{cookie:b})).json()).data,data);
 const changed=setEntryFees(data,entries[0],['paid']);
 assert.equal((await h.call('/library',{method:'PUT',cookie:b,body:{revision:1,data:changed}})).status,200);
 assert.deepEqual((await (await h.call('/library',{cookie:a})).json()).data,changed);
 const malformed={...changed,entries:[{...changed.entries[0],fees:['invalid']},...changed.entries.slice(1)]};
 assert.equal((await h.call('/library',{method:'PUT',cookie:a,body:{revision:2,data:malformed}})).status,400);
 assert.deepEqual((await (await h.call('/library',{cookie:b})).json()).data,changed);
});

test('automatic activity syncs across sessions and older writes cannot erase history', async t => {
  const h = harness(t);
  const a = await h.login(), b = await h.login();
  const item = { id: 'act-history', date: '2026-11-13', entryId: entries[0].id, entryName: entries[0].name, entryUrl: entries[0].url, kind: 'tag-added', summary: '添加标签', after: 'SEO' };
  const data = { ...newData(entries), activityLog: [item] };
  assert.equal((await h.call('/library', { method: 'PUT', cookie: a, body: { revision: 0, data } })).status, 200);
  assert.deepEqual((await (await h.call('/library', { cookie: b })).json()).data.activityLog, [item]);
  const { activityLog, ...legacy } = data;
  assert.equal((await h.call('/library', { method: 'PUT', cookie: b, body: { revision: 1, data: { ...legacy, version: 6 } } })).status, 409);
  assert.deepEqual((await (await h.call('/library', { cookie: a })).json()).data.activityLog, [item]);
});
