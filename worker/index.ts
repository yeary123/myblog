import entries from '../src/data/external-links.json' with { type: 'json' };
import { validateBackup } from '../src/lib/link-library.ts';

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};
export type Env = {
  DB: { prepare(sql: string): Statement };
  SITE_ORIGIN: string;
  SYNC_KEY: string;
  TAG_RECOVERY_MODE?: string;
  LOGIN_RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
};

const sessionAge = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
async function hash(value: string) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
function equalHash(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
function cookieName(request: Request) { return new URL(request.url).protocol === 'https:' ? '__Host-luna-links' : 'luna-links-local'; }
function cookie(request: Request, token: string, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
function sessionToken(request: Request) {
  const value = request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName(request) + '='))?.split('=')[1];
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
async function jsonBody(request: Request, limit: number): Promise<any> {
  if (Number(request.headers.get('Content-Length')) > limit) throw new HttpError(413, '数据过大，请先导出备份。');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '缺少请求数据。');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, '数据过大，请先导出备份。'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(400, '请求格式不正确。'); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin',
    });
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
    if (origin === env.SITE_ORIGIN) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Credentials', 'true');
    }
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    if (path === '/health' && request.method === 'GET') return reply({ ok: true });
    // All private operations, including reads and login, are restricted to this site.
    if (origin !== env.SITE_ORIGIN) return reply({ error: '不允许此来源访问个人同步。' }, 403);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Max-Age', '600');
      return new Response(null, { status: 204, headers });
    }
    if (env.TAG_RECOVERY_MODE === '1') return reply({ error: '正在恢复误删标签，请稍后同步；本机改动会继续保留。' }, 503);
    if (!env.SYNC_KEY || env.SYNC_KEY.length < 8 || env.SYNC_KEY.length > 256) return reply({ error: '个人同步服务尚未配置。' }, 503);
    try {
      const keyHash = await hash(env.SYNC_KEY);
      const token = sessionToken(request);
      const tokenHash = token ? await hash(token) : null;
      if (path === '/session' && request.method === 'POST') {
        const { success } = await env.LOGIN_RATE_LIMITER.limit({ key: 'personal-library-login' });
        if (!success) { headers.set('Retry-After', '60'); return reply({ error: '连接尝试过多，请一分钟后重试。' }, 429); }
        const body = await jsonBody(request, 1024);
        if (typeof body?.key !== 'string' || body.key.length > 256 || !equalHash(await hash(body.key), keyHash)) return reply({ error: '同步口令不正确。' }, 401);
        const newToken = hex(crypto.getRandomValues(new Uint8Array(32)));
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ? OR key_hash != ?').bind(now, keyHash).run();
        if (tokenHash) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
        await env.DB.prepare('INSERT INTO sessions (token_hash, key_hash, expires_at) VALUES (?, ?, ?)').bind(await hash(newToken), keyHash, now + sessionAge).run();
        headers.set('Set-Cookie', cookie(request, newToken, sessionAge));
        return reply({ authenticated: true });
      }
      const session = tokenHash ? await env.DB.prepare('SELECT token_hash FROM sessions WHERE token_hash = ? AND key_hash = ? AND expires_at > ?').bind(tokenHash, keyHash, Math.floor(Date.now() / 1000)).first() : null;
      if (!session) { headers.set('Set-Cookie', cookie(request, '', 0)); return reply({ error: '请连接个人同步。' }, 401); }
      if (path === '/session' && request.method === 'GET') return reply({ authenticated: true });
      if (path === '/session' && request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
        headers.set('Set-Cookie', cookie(request, '', 0));
        return reply({ authenticated: false });
      }
      if (path === '/library' && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT data_json, revision, updated_at FROM library WHERE id = 1').first<{ data_json: string; revision: number; updated_at: string }>();
        return reply(row ? { data: JSON.parse(row.data_json), revision: row.revision, updatedAt: row.updated_at } : { data: null, revision: 0, updatedAt: null });
      }
      if (path === '/library' && request.method === 'PUT') {
        const body = await jsonBody(request, 5_000_000);
        if (!Number.isSafeInteger(body?.revision) || body.revision < 0) throw new HttpError(400, '同步版本不正确。');
        let data;
        try { data = validateBackup(body.data, entries); }
        catch (error) { throw new HttpError(400, error instanceof Error ? error.message : '记录格式不正确。'); }
        const previous = await env.DB.prepare('SELECT data_json, revision FROM library WHERE id = 1').first<{ data_json: string; revision: number }>();
        if (previous && previous.revision !== body.revision) return reply({ error: '云端有新改动，请重新同步后选择保留的记录。' }, 409);
        if (previous) {
          const before = validateBackup(JSON.parse(previous.data_json), entries);
          if (body.data.version < 4) data.journal = before.journal;
          const activeIds = new Set(data.tags.map(tag => tag.id));
          const archivedIds = new Set(data.deletedTags.map(item => item.tag.id));
          // Older open tabs must not permanently erase tags or an existing recycle bin.
          if (body.data.version < 3) for (const archived of before.deletedTags) {
            if (!activeIds.has(archived.tag.id) && !archivedIds.has(archived.tag.id)) {
              data.deletedTags.push(archived);
              archivedIds.add(archived.tag.id);
            }
          }
          before.tags.forEach((tag, position) => {
            if (!activeIds.has(tag.id) && !archivedIds.has(tag.id)) data.deletedTags.push({
              tag, position, deletedAt: Date.now(),
              entryIds: Object.entries(before.assignments).filter(([, ids]) => ids.includes(tag.id)).map(([entryId]) => entryId),
            });
          });
          if (data.deletedTags.length > 200) throw new HttpError(400, '标签回收站已满，请先恢复部分标签。');
        }
        const serialized = JSON.stringify(data);
        if (encoder.encode(serialized).byteLength > 1_900_000) throw new HttpError(413, '个人记录超过当前云端容量，请先导出备份并精简笔记后重试。');
        const updatedAt = new Date().toISOString();
        // Compare-and-swap is executed by SQLite, not a racy read followed by a write.
        const row = body.revision === 0
          ? await env.DB.prepare('INSERT INTO library (id, data_json, revision, updated_at) VALUES (1, ?, 1, ?) ON CONFLICT(id) DO NOTHING RETURNING revision').bind(serialized, updatedAt).first<{ revision: number }>()
          : await env.DB.prepare('UPDATE library SET data_json = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ? RETURNING revision').bind(serialized, updatedAt, body.revision).first<{ revision: number }>();
        if (!row) return reply({ error: '云端有新改动，请重新同步后选择保留的记录。' }, 409);
        return reply({ data, revision: row.revision, updatedAt });
      }
      return reply({ error: '接口不存在。' }, 404);
    } catch (error) {
      if (error instanceof HttpError) return reply({ error: error.message }, error.status);
      // Never log keys, cookies, or the contents of personal notes.
      console.error('Personal library request failed', request.method, path);
      return reply({ error: '云端暂时无法保存，改动仍保存在本机，请稍后重试。' }, 500);
    }
  },
};
