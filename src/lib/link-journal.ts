import type { JournalEntry } from './link-library.ts';

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
