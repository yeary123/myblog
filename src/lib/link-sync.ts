import { newData, type LibraryData } from './link-library.ts';

export type CloudLibrary = { data: LibraryData | null; revision: number; updatedAt: string | null };
export type SyncBase = { data: LibraryData; revision: number };

// Object insertion order must not cause a false conflict between two devices.
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  return value;
}
export function sameLibrary(a: LibraryData, b: LibraryData) {
  const canonical = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    if (typeof record.version === 'number' && record.version < 7 && Array.isArray(record.tags) && record.records && record.assignments) return { ...record, version: 7, activityLog: record.activityLog ?? [] };
    return value;
  };
  return JSON.stringify(ordered(canonical(a))) === JSON.stringify(ordered(canonical(b)));
}
export function emptyLibrary(data: LibraryData) {
  return !Object.keys(data.feeOverrides).length && !data.customEntries.length && !data.journal.length && !data.activityLog.length && !data.tags.length && !data.deletedTags.length && !Object.values(data.assignments).some(tags => tags.length) &&
    !Object.values(data.records).some(record => record.note || record.level !== -1 || record.seen);
}
export function planSync(local: LibraryData, cloud: CloudLibrary, base: SyncBase | null): 'push' | 'pull' | 'equal' | 'conflict' {
  if (!cloud.data) return emptyLibrary(local) ? 'equal' : 'push';
  if (sameLibrary(local, cloud.data)) return 'equal';
  if (base && sameLibrary(local, base.data)) return 'pull';
  if (base && sameLibrary(cloud.data, base.data)) return 'push';
  if (!base && emptyLibrary(local)) return 'pull';
  return 'conflict';
}
export function cloudData(cloud: CloudLibrary) { return cloud.data ?? newData(); }
