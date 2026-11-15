import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveTag, deleteLibraryEntry, newData, permanentlyDeleteTag, publicationStats, restoreTag, setTagWebsite, validateBackup } from '../src/lib/link-library.ts';
const entries=Array.from({length:3},(_,i)=>({id:`link-${i}`,order:i,name:`平台 ${i}`,url:`https://example.org/${i}`,domain:'example.org',votes:null,recommendationTotal:0,reasons:[]}));
function fixture(){
 return {...newData(entries),tags:[{id:'tag-site',name:'我的网站'},{id:'tag-other',name:'另一个网站',website:true},{id:'tag-work',name:'待提交'}],assignments:{'link-0':['tag-site','tag-other','tag-work'],'link-1':['tag-site']},records:{'link-0':{note:'已有笔记',level:1,seen:123}},journal:[{date:'2026-11-15',work:'历史手动填报',published:99,urls:[],next:'',updatedAt:123}]};
}

test('existing tags can become website tags without changing their IDs, notes or relationships',()=>{
 const before=fixture(),marked=setTagWebsite(before,'tag-site',true);
 assert.deepEqual(marked.tags[0],{id:'tag-site',name:'我的网站',website:true});
 assert.equal(before.tags[0].website,undefined);
 assert.deepEqual(marked.assignments,before.assignments);
 assert.deepEqual(marked.records,before.records);
 assert.deepEqual(marked.journal,before.journal);
 assert.equal(publicationStats(marked).total,3,'two websites on one platform plus one on another');
 assert.deepEqual(publicationStats(marked).websites.map(({tag,count})=>[tag.name,count]),[['我的网站',2],['另一个网站',1]]);
 assert.equal(publicationStats(setTagWebsite(marked,'tag-site',false)).total,1);
 assert.deepEqual(setTagWebsite(marked,'tag-site',false).tags,before.tags);
});

test('publication statistics deduplicate each website/platform pair and ignore ordinary tags, orphan data and manual counts',()=>{
 const data=setTagWebsite(fixture(),'tag-site',true);
 data.assignments['link-0'].push('tag-site','unknown-tag');
 data.assignments['removed-link']=['tag-site','tag-other'];
 data.activityLog=[{id:'act-old',date:'2026-11-15',entryId:'removed-link',entryName:'旧平台',kind:'tag-added',summary:'记录成功发布'}];
 assert.equal(publicationStats(data).total,3);
 data.assignments['link-1']=[];
 assert.equal(publicationStats(data).total,2);
 assert.equal(publicationStats(deleteLibraryEntry(data,entries[0])).total,0);
});

test('archiving, restoring and permanently deleting website tags keep the publication total consistent',()=>{
 const before=setTagWebsite(fixture(),'tag-site',true);
 const archived=archiveTag(before,'tag-site',123);
 assert.equal(publicationStats(archived).total,1);
 assert.equal(archived.deletedTags[0].tag.website,true);
 const roundTrip=validateBackup(JSON.parse(JSON.stringify(archived)),[]);
 assert.deepEqual(roundTrip,archived);
 assert.equal(publicationStats(restoreTag(roundTrip,'tag-site')).total,3);
 const deleted=permanentlyDeleteTag(roundTrip,'tag-site');
 assert.equal(publicationStats(restoreTag(deleted,'tag-site')).total,1);
});

test('restoring a same-name website tag merges its marker and relationships without double counting',()=>{
 const data=setTagWebsite(fixture(),'tag-site',true);
 const archived=archiveTag(data,'tag-site',123);
 archived.tags.push({id:'tag-new',name:'我的网站'});
 archived.assignments['link-0'].push('tag-new');
 const restored=restoreTag(archived,'tag-site');
 assert.equal(restored.tags.find(t=>t.id==='tag-new').website,true);
 assert.equal(publicationStats(restored).total,3);
 assert.deepEqual(restored.assignments['link-1'],['tag-new']);
});

test('version 8 migration keeps the exact owned list and existing tags without guessing which are websites',()=>{
 const data=fixture();data.tags=data.tags.map(({website,...tag})=>tag);
 const legacy={...data,version:8,entries:data.entries.slice(0,2)};
 const migrated=validateBackup(legacy,entries);
 assert.equal(migrated.version,9);
 assert.equal(migrated.entries.length,2);
 assert.deepEqual(migrated.tags,legacy.tags);
 assert.deepEqual(migrated.assignments,legacy.assignments);
 assert.deepEqual(migrated.records,legacy.records);
 assert.deepEqual(migrated.journal,legacy.journal);
 assert.equal(publicationStats(migrated).total,0);
 assert.equal(publicationStats(setTagWebsite(migrated,'tag-site',true)).total,2);
});

test('backup validation preserves website flags and rejects malformed markers in active and archived tags',()=>{
 const data=setTagWebsite(fixture(),'tag-site',true);
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data)),[]),data);
 for(const website of ['true',1,null,[],{}]){
  assert.throws(()=>validateBackup({...data,tags:[{...data.tags[0],website}]},[]));
  const archived=archiveTag(data,'tag-site',123);
  archived.deletedTags[0].tag.website=website;
  assert.throws(()=>validateBackup(archived,[]));
 }
});

test('tag-type activity snapshots survive backups without becoming publication counts',()=>{
 const data=fixture();
 data.activityLog=[{id:'act-type',date:'2026-11-15',entryId:entries[0].id,entryName:entries[0].name,kind:'tag-type-changed',summary:'设为网站标签（计入已有发布记录）',before:'我的网站 · 普通标签',after:'我的网站 · 网站标签'}];
 assert.deepEqual(validateBackup(data,[]).activityLog,data.activityLog);
 assert.equal(publicationStats(data).total,1);
});
