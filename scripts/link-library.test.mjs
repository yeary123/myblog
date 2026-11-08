import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveTag, assignedTags, buildReviewQueue, matchesTagFilters, newData, restoreTag, validateBackup } from '../src/lib/link-library.ts';
const make=(id,order)=>({id,order,name:id,url:'https://example.com',domain:'example.com',votes:null,recommendationTotal:0,reasons:[]});
const entries=[make('first',1),make('second',2),make('third',3),make('fourth',4)];
test('new libraries have no tags and never fall back to source classifications',()=>{
 const data=newData();
 assert.deepEqual(data.tags,[]);
 assert.deepEqual(assignedTags(data,{...entries[0],tags:['community']}),[]);
 assert.equal(matchesTagFilters(data,entries[0],[]),true);
});
test('a user tag brings together its assigned links',()=>{
 const data=newData();data.tags=[{id:'tag-seo',name:'SEO'},{id:'tag-later',name:'稍后看'}];
 data.assignments={first:['tag-seo'],second:['tag-seo','tag-later'],third:['tag-later']};
 assert.deepEqual(entries.filter(e=>matchesTagFilters(data,e,['tag-seo'])).map(e=>e.id),['first','second']);
 data.assignments.first=[];
 assert.equal(matchesTagFilters(data,entries[0],['tag-seo']),false);
});
test('v1 migration removes preset IDs, including renamed presets, and preserves user tags and records',()=>{
 const raw={version:1,tags:[{id:'community',group:'type',name:'改过名的预设'},{id:'ai',group:'topic',name:'AI'},{id:'tag-mine',group:'use',name:'我的收藏'},{id:'tag-ai',group:'topic',name:'AI'}],assignments:{first:['community','tag-mine','tag-ai'],second:['ai']},records:{first:{level:1,note:'保留笔记',seen:123}}};
 const migrated=validateBackup(raw,entries);
 assert.equal(migrated.version,4);
 assert.deepEqual(migrated.tags,[{id:'tag-mine',name:'我的收藏'},{id:'tag-ai',name:'AI'}]);
 assert.deepEqual(migrated.assignments,{first:['tag-mine','tag-ai'],second:[]});
 assert.deepEqual(migrated.records,raw.records);
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(migrated)),entries),migrated);
});
test('archiving and restoring a tag preserves its links and subsequent edits',()=>{
 const data=newData();
 data.tags=[{id:'tag-uke',name:'uke'},{id:'tag-other',name:'其他'}];
 data.assignments={first:['tag-uke','tag-other'],second:['tag-uke'],third:['tag-other']};
 data.records.first={level:2,note:'原来的笔记',seen:1};
 const archived=archiveTag(data,'tag-uke',1000);
 assert.deepEqual(data.assignments.first,['tag-uke','tag-other'],'the original snapshot must remain untouched');
 assert.deepEqual(archived.deletedTags[0].entryIds,['first','second']);
 assert.deepEqual(archived.assignments.first,['tag-other']);
 assert.equal(matchesTagFilters(archived,entries[0],['tag-uke']),false);
 archived.records={first:{level:1,note:'移入回收站后继续编辑的笔记',seen:2}};
 archived.assignments.second=['tag-other'];
 const restored=restoreTag(archived,'tag-uke');
 assert.deepEqual(restored.tags,data.tags);
 assert.deepEqual(restored.assignments.second,['tag-other','tag-uke']);
 assert.deepEqual(restored.records,archived.records,'restoring a tag must not roll back notes');
 assert.deepEqual(restored.deletedTags,[]);
});
test('recycle bin survives backup round trips and old v2 backups upgrade without losing records',()=>{
 const data=newData();data.tags=[{id:'tag-uke',name:'uke'}];data.assignments={first:['tag-uke']};
 const archived=archiveTag(data,'tag-uke',1000);
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(archived)),entries),archived);
 const {deletedTags,...legacy}=data;
 const migrated=validateBackup({...legacy,version:2},entries);
 assert.deepEqual(migrated,data);
 assert.throws(()=>validateBackup({...archived,deletedTags:[...archived.deletedTags,{...archived.deletedTags[0]}]},entries));
 assert.throws(()=>validateBackup({...archived,deletedTags:[{...archived.deletedTags[0],entryIds:[123]}]},entries));
});
test('restoring a deleted tag merges a newer tag with the same name without losing associations',()=>{
 const data=newData();data.tags=[{id:'tag-old',name:'uke'}];data.assignments={first:['tag-old']};
 const archived=archiveTag(data,'tag-old',1000);
 archived.tags=[{id:'tag-new',name:'UKE'}];archived.assignments.second=['tag-new'];
 const restored=restoreTag(archived,'tag-old');
 assert.deepEqual(restored.tags,archived.tags);
 assert.deepEqual(restored.assignments,{first:['tag-new'],second:['tag-new']});
 assert.deepEqual(restored.deletedTags,[]);
});
test('review prioritizes unseen entries, then weaker and older memories without mutating source order',()=>{
 const data=newData();data.records={first:{level:2,note:'',seen:10},second:{level:0,note:'',seen:20},third:{level:0,note:'',seen:5}};
 assert.deepEqual(buildReviewQueue(data,entries).map(e=>e.id),['fourth','third','second']);
 assert.equal(entries[0].id,'first');
});
test('backup round trip retains custom tags, notes and empty assignments and rejects broken data',()=>{
 const data=newData();data.tags=[{id:'tag-mine',name:'我的收藏'}];data.records.first={level:1,note:'下次做产品时看',seen:123};data.assignments={first:['tag-mine'],second:[]};
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data)),entries),data);
 assert.throws(()=>validateBackup({...data,records:{first:{level:9,note:'',seen:1}}},entries));
 assert.throws(()=>validateBackup({...data,assignments:{first:['unknown-tag']}},entries));
 assert.throws(()=>validateBackup({...data,tags:[...data.tags,{id:'tag-other',name:'我的收藏'}]},entries));
});
