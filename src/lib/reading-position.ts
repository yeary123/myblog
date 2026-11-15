import type { Fee } from './link-library.ts';

export type ReadingView = { page: number; query: string; tagIds: string[]; fee: Fee | null; sectionId: string };
export type ReadingPosition = ReadingView & { version: 1; hash: string; scrollY: number; entryId: string | null; entryOffset: number; updatedAt: number };
export const readingKey = (view: string) => `luna-links-reading-v1:${view}`;

export function parseReadingPosition(raw: unknown): ReadingPosition | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as ReadingPosition;
  if (r.version !== 1 || typeof r.hash !== 'string' || r.hash.length > 500 || !Number.isSafeInteger(r.page) || r.page < 1 || r.page > 10000 || typeof r.query !== 'string' || r.query.length > 10000 || !Array.isArray(r.tagIds) || r.tagIds.length > 200 || r.tagIds.some(id => typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id)) || ![null, 'free', 'paid'].includes(r.fee) || typeof r.sectionId !== 'string' || r.sectionId.length > 100 || !Number.isFinite(r.scrollY) || r.scrollY < 0 || r.scrollY > 10000000 || (r.entryId !== null && (typeof r.entryId !== 'string' || !/^[a-z0-9-]{1,100}$/.test(r.entryId))) || !Number.isFinite(r.entryOffset) || Math.abs(r.entryOffset) > 100000 || !Number.isSafeInteger(r.updatedAt) || r.updatedAt < 0) return null;
  return { version: 1, hash: r.hash, page: r.page, query: r.query, tagIds: [...new Set(r.tagIds)], fee: r.fee, sectionId: r.sectionId, scrollY: r.scrollY, entryId: r.entryId, entryOffset: r.entryOffset, updatedAt: r.updatedAt };
}

export function canResumeReading(position: ReadingPosition, hash: string, navigationType: string): boolean {
  return !hash || ((navigationType === 'reload' || navigationType === 'back_forward') && position.hash === hash);
}

export function readingPage(position: Pick<ReadingPosition, 'page' | 'entryId'>, entryIds: string[], pageSize: number): number {
  const index = position.entryId ? entryIds.indexOf(position.entryId) : -1;
  return index >= 0 ? Math.floor(index / pageSize) + 1 : Math.max(1, Math.min(position.page, Math.ceil(entryIds.length / pageSize)));
}
