import type { JournalEntry, LinkActivity } from './link-library.ts';

export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function validJournalDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '0001-01-01' && date <= '9999-12-31' && Number.isFinite(Date.parse(date + 'T00:00:00Z')) && new Date(date + 'T00:00:00Z').toISOString().slice(0,10) === date;
}

export function validateJournal(raw: unknown): JournalEntry[] {
  if (!Array.isArray(raw) || raw.length > 10000) throw new Error('日志格式不正确，最多保留 10000 天的记录。');
  const dates = new Set<string>();
  return raw.map(item => {
    if (!item || typeof item.date !== 'string' || !validJournalDate(item.date) || dates.has(item.date) || typeof item.work !== 'string' || !item.work.trim() || item.work.length > 10000 || !Number.isSafeInteger(item.published) || item.published < 0 || item.published > 100000 || !Array.isArray(item.urls) || item.urls.length > 100 || typeof item.next !== 'string' || item.next.length > 5000 || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0 || item.updatedAt > 8_640_000_000_000_000) throw new Error('日志包含无效日期、重复日期或不完整的工作记录。');
    const urls: string[] = item.urls.map((value: unknown) => {
      if (typeof value !== 'string' || value.length > 2000) throw new Error('成果链接格式不正确。');
      let url: URL;
      try { url = new URL(value); } catch { throw new Error('成果链接请填写完整的 http:// 或 https:// 地址。'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('成果链接请填写完整的 http:// 或 https:// 地址。');
      return url.href;
    });
    dates.add(item.date);
    return { date: item.date, work: item.work.trim(), published: item.published, urls: [...new Set(urls)], next: item.next.trim(), updatedAt: item.updatedAt };
  }).sort((a,b) => b.date.localeCompare(a.date));
}

const activityKinds = new Set<LinkActivity['kind']>(['link-added','link-edited','link-deleted','tag-added','tag-removed','note-updated']);
export function validateActivityLog(raw: unknown): LinkActivity[] {
  if (!Array.isArray(raw) || raw.length > 20000) throw new Error('操作记录格式不正确，最多保留 20000 条。');
  const ids = new Set<string>();
  return raw.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9-]{1,100}$/.test(item.id) || ids.has(item.id) || typeof item.date !== 'string' || !validJournalDate(item.date) || typeof item.entryId !== 'string' || !item.entryId || item.entryId.length > 100 || typeof item.entryName !== 'string' || !item.entryName.trim() || item.entryName.length > 120 || !activityKinds.has(item.kind) || typeof item.summary !== 'string' || !item.summary.trim() || item.summary.length > 500 || (item.before !== undefined && (typeof item.before !== 'string' || item.before.length > 5000)) || (item.after !== undefined && (typeof item.after !== 'string' || item.after.length > 5000))) throw new Error('操作记录包含无效或不完整的内容。');
    ids.add(item.id);
    return { id: item.id, date: item.date, entryId: item.entryId, entryName: item.entryName.trim(), kind: item.kind, summary: item.summary.trim(), ...(typeof item.before === 'string' ? { before: item.before } : {}), ...(typeof item.after === 'string' ? { after: item.after } : {}) };
  }).sort((a,b) => b.date.localeCompare(a.date));
}
