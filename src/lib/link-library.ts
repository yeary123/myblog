export type Tag = { id: string; group: 'type' | 'use' | 'topic'; name: string };
export type Entry = { id: string; order: number; name: string; domain: string; url: string; votes: number | null; recommendationTotal: number; reasons: string[]; tags: string[] };
export type RecordState = { level: number; note: string; seen: number };
export type LibraryData = { version: 1; tags: Tag[]; assignments: Record<string, string[]>; records: Record<string, RecordState> };
export const groups = [{ id: 'type', name: '平台类型' }, { id: 'use', name: '适用场景' }, { id: 'topic', name: '主题标签' }] as const;
export const levelNames = ['没记住', '有印象', '熟悉了'];
export const defaultTags: Tag[] = [
  {id:'code',group:'type',name:'代码托管'}, {id:'launch',group:'type',name:'产品发布'},
  {id:'content',group:'type',name:'内容平台'}, {id:'community',group:'type',name:'社区论坛'},
  {id:'directory',group:'type',name:'导航目录'}, {id:'profile',group:'type',name:'资料主页'},
  {id:'design',group:'type',name:'作品展示'}, {id:'reviews',group:'type',name:'软件评价'},
  {id:'social',group:'type',name:'社交媒体'},
  {id:'showcase',group:'use',name:'展示项目'}, {id:'writing',group:'use',name:'分享经验'},
  {id:'research',group:'use',name:'了解需求'}, {id:'inspiration',group:'use',name:'找灵感'},
  {id:'ai',group:'topic',name:'AI'},
];
export const newData = (): LibraryData => ({version:1,tags:defaultTags.map(t=>({...t})),assignments:{},records:{}});
export const getRecord = (data: LibraryData, id: string): RecordState => data.records[id] ?? { level:-1,note:'',seen:0 };
export const assignedTags = (data: LibraryData, entry: Entry): string[] => (data.assignments[entry.id] ?? entry.tags).filter(id=>data.tags.some(t=>t.id===id));
export function matchesTagFilters(data: LibraryData, entry: Entry, selected: string[]) {
  const assigned=assignedTags(data,entry);
  return groups.every(group=>{
    const choices=selected.filter(id=>data.tags.some(t=>t.id===id&&t.group===group.id));
    return !choices.length || choices.some(id=>assigned.includes(id));
  });
}
export function buildReviewQueue(data: LibraryData, entries: Entry[]) {
  return [...entries].sort((a,b)=>getRecord(data,a.id).level-getRecord(data,b.id).level || getRecord(data,a.id).seen-getRecord(data,b.id).seen || a.order-b.order).slice(0,3);
}
export function validateBackup(raw: unknown, entries: Entry[]): LibraryData {
  if(!raw||typeof raw!=='object')throw new Error('不是有效的备份文件。');
  const r=raw as LibraryData;
  if(r.version!==1||!Array.isArray(r.tags)||r.tags.length>200||!r.records||typeof r.records!=='object'||!r.assignments||typeof r.assignments!=='object')throw new Error('备份格式或版本不支持。');
  const ids=new Set<string>();const names=new Set<string>();
  const tags=r.tags.map(t=>{
    if(!t||typeof t.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(t.id)||!groups.some(g=>g.id===t.group)||typeof t.name!=='string'||!t.name.trim()||t.name.trim().length>24||ids.has(t.id)||names.has(t.name.trim().toLowerCase()))throw new Error('备份包含无效或重复的标签。');
    ids.add(t.id);names.add(t.name.trim().toLowerCase());return {...t,name:t.name.trim()};
  });
  const data: LibraryData={version:1,tags,assignments:{},records:{}};
  for(const entry of entries){
    const record=r.records[entry.id];
    if(record){
      if(![-1,0,1,2].includes(record.level)||typeof record.note!=='string'||record.note.length>2000||typeof record.seen!=='number'||!Number.isFinite(record.seen)||record.seen<0)throw new Error('备份包含无效的熟悉度或笔记。');
      data.records[entry.id]={level:record.level,note:record.note,seen:record.seen};
    }
    const assigned=r.assignments[entry.id];
    if(assigned!==undefined){
      if(!Array.isArray(assigned)||assigned.some(id=>typeof id!=='string'||!ids.has(id)))throw new Error('备份包含不存在的标签。');
      data.assignments[entry.id]=[...new Set(assigned)];
    }
  }
  return data;
}
