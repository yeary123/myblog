import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import worker from '../worker/index.ts';
import entries from '../src/data/external-links.json' with { type: 'json' };
import { newData } from '../src/lib/link-library.ts';

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
const dataWith = note => ({ ...newData(), records: { [entries[0].id]: { note, level: 1, seen: 123 } } });

test('private data requires authentication and the exact website origin', async t => {
  const h = harness(t);
  assert.equal((await h.call('/library')).status, 401);
  assert.equal((await h.call('/library', { method: 'PUT', body: { revision: 0, data: newData() } })).status, 401);
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
  for (const body of [null, { revision: -1, data: newData() }, { revision: 1, data: { ...newData(), tags: [{ id: 'invalid id', name: '坏标签' }] } }, { revision: 1, data: dataWith('a'.repeat(2001)) }]) {
    assert.equal((await h.call('/library', { method: 'PUT', cookie, body })).status, 400);
  }
  assert.deepEqual((await (await h.call('/library', { cookie })).json()).data, dataWith('保留'));
});

test('oversized personal libraries are rejected without truncating saved notes', async t => {
  const h = harness(t);
  const cookie = await h.login();
  await h.call('/library', { method: 'PUT', cookie, body: { revision: 0, data: dataWith('保留原记录') } });
  const large = { ...newData(), records: Object.fromEntries(entries.map(entry => [entry.id, { note: '字'.repeat(2000), level: 0, seen: 1 }])) };
  assert.equal((await h.call('/library', { method: 'PUT', cookie, body: { revision: 1, data: large } })).status, 413);
  assert.deepEqual((await (await h.call('/library', { cookie })).json()).data, dataWith('保留原记录'));
});
