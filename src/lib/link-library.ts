export type Tag = { id: string; name: string };
export type Entry = { id: string; order: number; name: string; domain: string; url: string; votes: number | null; recommendationTotal: number; reasons: string[] };
export type RecordState = { level: number; note: string; seen: number };
export type DeletedTag = { tag: Tag; entryIds: string[]; deletedAt: number; position: number };
export type LibraryData = { version: 3; tags: Tag[]; assignments: Record<string, string[]>; records: Record<string, RecordState>; deletedTags: DeletedTag[] };
export const levelNames = ['没记住', '有印象', '熟悉了'];
// Only used to remove the old built-in tags while migrating v1 browser data or backups.
const legacyTagIds = new Set(['code','launch','content','community','directory','profile','design','reviews','social','showcase','writing','research','inspiration','ai']);
export const newData = (): LibraryData => ({version:3,tags:[],assignments:{},records:{},deletedTags:[]});
export const getRecord = (data: LibraryData, id: string): RecordState => data.records[id] ?? { level:-1,note:'',seen:0 };
export const assignedTags = (data: LibraryData, entry: Entry): string[] => (data.assignments[entry.id] ?? []).filter(id=>data.tags.some(t=>t.id===id));
export function matchesTagFilters(data: LibraryData, entry: Entry, selected: string[]) {
  return !selected.length || assignedTags(data,entry).some(id=>selected.includes(id));
}
export function buildReviewQueue(data: LibraryData, entries: Entry[]) {
  return [...entries].sort((a,b)=>getRecord(data,a.id).level-getRecord(data,b.id).level || getRecord(data,a.id).seen-getRecord(data,b.id).seen || a.order-b.order).slice(0,3);
}
export function archiveTag(data: LibraryData, id: string, deletedAt = Date.now()): LibraryData {
  const position = data.tags.findIndex(tag => tag.id === id);
  if (position < 0) return data;
  if (data.deletedTags.length >= 200) throw new Error('标签回收站已满，请先恢复部分标签。');
  const archived: DeletedTag = {
    tag: { ...data.tags[position] }, position, deletedAt,
    entryIds: Object.entries(data.assignments).filter(([, tags]) => tags.includes(id)).map(([entryId]) => entryId),
  };
  return {
    ...data, tags: data.tags.filter(tag => tag.id !== id),
    assignments: Object.fromEntries(Object.entries(data.assignments).map(([entryId, tags]) => [entryId, tags.filter(tagId => tagId !== id)])),
    deletedTags: [...data.deletedTags, archived],
  };
}
export function restoreTag(data: LibraryData, id: string): LibraryData {
  const archived = data.deletedTags.find(item => item.tag.id === id);
  if (!archived) return data;
  const existing = data.tags.find(tag => tag.id === id || tag.name.toLowerCase() === archived.tag.name.toLowerCase());
  if (!existing && data.tags.length >= 200) throw new Error('最多保留 200 个标签，请先移出一个标签后再恢复。');
  const tag = existing ?? archived.tag;
  const tags = [...data.tags];
  if (!existing) tags.splice(Math.min(archived.position, tags.length), 0, tag);
  const assignments = { ...data.assignments };
  for (const entryId of archived.entryIds) assignments[entryId] = [...new Set([...(assignments[entryId] ?? []), tag.id])];
  return { ...data, tags, assignments, deletedTags: data.deletedTags.filter(item => item.tag.id !== id) };
}
export function validateBackup(raw: unknown, entries: Entry[]): LibraryData {
  if(!raw||typeof raw!=='object')throw new Error('不是有效的备份文件。');
  const r=raw as Omit<LibraryData,'version'> & {version:number};
  if(![1,2,3].includes(r.version)||!Array.isArray(r.tags)||r.tags.length>200||!r.records||typeof r.records!=='object'||Array.isArray(r.records)||!r.assignments||typeof r.assignments!=='object'||Array.isArray(r.assignments))throw new Error('备份格式或版本不支持。');
  const ids=new Set<string>();const names=new Set<string>();
  const tags:Tag[]=[];
  for(const t of r.tags){
    if(!t||typeof t.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(t.id)||typeof t.name!=='string'||!t.name.trim()||t.name.trim().length>24||ids.has(t.id))throw new Error('备份包含无效或重复的标签。');
    ids.add(t.id);
    if(r.version===1&&legacyTagIds.has(t.id))continue;
    const name=t.name.trim();
    if(names.has(name.toLowerCase()))throw new Error('备份包含无效或重复的标签。');
    names.add(name.toLowerCase());tags.push({id:t.id,name});
  }
  const keptIds=new Set(tags.map(t=>t.id));
  const data: LibraryData={version:3,tags,assignments:{},records:{},deletedTags:[]};
  if (r.version === 3) {
    if (!Array.isArray(r.deletedTags) || r.deletedTags.length > 200) throw new Error('标签回收站格式不正确。');
    const entryIds = new Set(entries.map(entry => entry.id));
    for (const item of r.deletedTags) {
      const tag = item?.tag;
      if (!tag || typeof tag.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(tag.id) || ids.has(tag.id) || typeof tag.name !== 'string' || !tag.name.trim() || tag.name.trim().length > 24 || !Array.isArray(item.entryIds) || item.entryIds.some(id => typeof id !== 'string') || !Number.isSafeInteger(item.deletedAt) || item.deletedAt < 0 || item.deletedAt > 8_640_000_000_000_000 || !Number.isInteger(item.position) || item.position < 0 || item.position > 200) throw new Error('标签回收站包含无效记录。');
      ids.add(tag.id);
      data.deletedTags.push({ tag: { id: tag.id, name: tag.name.trim() }, entryIds: [...new Set(item.entryIds.filter(id => entryIds.has(id)))], deletedAt: item.deletedAt, position: item.position });
    }
  }
  for(const entry of entries){
    const record=r.records[entry.id];
    if(record){
      if(![-1,0,1,2].includes(record.level)||typeof record.note!=='string'||record.note.length>2000||typeof record.seen!=='number'||!Number.isFinite(record.seen)||record.seen<0)throw new Error('备份包含无效的熟悉度或笔记。');
      data.records[entry.id]={level:record.level,note:record.note,seen:record.seen};
    }
    const assigned=r.assignments[entry.id];
    if(assigned!==undefined){
      if(!Array.isArray(assigned)||assigned.some(id=>typeof id!=='string'||!ids.has(id)))throw new Error('备份包含不存在的标签。');
      data.assignments[entry.id]=[...new Set(assigned.filter(id=>keptIds.has(id)))];
    }
  }
  return data;
}
