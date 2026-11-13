import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveTag, assignedTags, createCustomEntry, entryFees, matchesFeeFilter, matchesTagFilters, normalizeLinkUrl, newData, setEntryFees, permanentlyDeleteTag, restoreTag, validateBackup } from '../src/lib/link-library.ts';
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
 assert.equal(migrated.version,newData().version);
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
test('backup round trip retains custom tags, notes and empty assignments and rejects broken data',()=>{
 const data=newData();data.tags=[{id:'tag-mine',name:'我的收藏'}];data.records.first={level:1,note:'下次做产品时看',seen:123};data.assignments={first:['tag-mine'],second:[]};
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data)),entries),data);
 assert.throws(()=>validateBackup({...data,records:{first:{level:9,note:'',seen:1}}},entries));
 assert.throws(()=>validateBackup({...data,assignments:{first:['unknown-tag']}},entries));
 assert.throws(()=>validateBackup({...data,tags:[...data.tags,{id:'tag-other',name:'我的收藏'}]},entries));
});

test('personal links accept bare domains and reject unsafe or duplicate URLs',()=>{
 const custom=createCustomEntry({name:' 我的平台 ',url:'EXAMPLE.org/new',description:' 发布教程 '},entries,'custom-test');
 assert.equal(custom.url,'https://example.org/new');
 assert.equal(custom.domain,'example.org');
 assert.equal(custom.name,'我的平台');
 assert.deepEqual(custom.reasons,['发布教程']);
 for(const url of ['javascript:alert(1)','data:text/html,test','https://user:secret@example.org','https://','']) assert.throws(()=>normalizeLinkUrl(url));
 assert.throws(()=>createCustomEntry({name:'重复',url:'https://EXAMPLE.com/#section',description:''},entries,'custom-duplicate'));
 assert.throws(()=>createCustomEntry({name:'   ',url:'example.org',description:''},entries,'custom-empty'));
});
test('personal links and associated notes, tags and recycle bin survive backup and migration',()=>{
 const custom=createCustomEntry({name:'新外链',url:'example.org/new',description:'用途'},entries,'custom-test');
 const data={...newData(),customEntries:[custom],tags:[{id:'tag-mine',name:'我的'}],assignments:{[custom.id]:['tag-mine']},records:{[custom.id]:{level:2,note:'个人笔记',seen:123}}};
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data)),entries),data);
 assert.deepEqual(assignedTags(data,custom),['tag-mine']);
 assert.equal(matchesTagFilters(data,custom,['tag-mine']),true);
 const archived=archiveTag(data,'tag-mine',1000);
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(archived)),entries),archived);
 const {customEntries,...legacy}=data;
 assert.deepEqual(validateBackup({...legacy,version:4},entries).customEntries,[]);
 for(const customEntries of [[{...custom,url:'javascript:alert(1)'}],[custom,custom],[{...custom,id:'first'}],[{...custom,reasons:[123]}],undefined]) assert.throws(()=>validateBackup({...data,customEntries},entries));
});

test('permanent deletion removes only the archived tag and its associations without reverting personal records',()=>{
 const data=newData();
 data.tags=[{id:'tag-delete',name:'删除'},{id:'tag-keep',name:'保留'}];
 data.assignments={first:['tag-delete','tag-keep'],second:['tag-delete']};
 data.records.first={level:2,note:'保留笔记',seen:123};
 const archived=archiveTag(data,'tag-delete',1000);
 const deleted=permanentlyDeleteTag(archived,'tag-delete');
 assert.equal(archived.deletedTags.length,1,'must not mutate the previous snapshot');
 assert.deepEqual(deleted.deletedTags,[]);
 assert.deepEqual(deleted.tags,[{id:'tag-keep',name:'保留'}]);
 assert.deepEqual(deleted.assignments,{first:['tag-keep'],second:[]});
 assert.deepEqual(deleted.records,data.records);
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(deleted)),entries),deleted);
 assert.equal(restoreTag(deleted,'tag-delete'),deleted,'a permanently deleted tag cannot be restored');
 assert.equal(permanentlyDeleteTag(data,'tag-keep'),data,'active tags must first be archived');
});

test('fee tags filter free and paid options without inventing a tag for unknown fees',()=>{
 const free={...entries[0],fees:['free']}, paid={...entries[1],fees:['paid']}, both={...entries[2],fees:['free','paid']}, unknown={...entries[3],reasons:['费用不明确']};
 assert.deepEqual([free,paid,both,unknown].filter(entry=>matchesFeeFilter(entry,'free')).map(entry=>entry.id),['first','third']);
 assert.deepEqual([free,paid,both,unknown].filter(entry=>matchesFeeFilter(entry,'paid')).map(entry=>entry.id),['second','third']);
 assert.deepEqual(entryFees(unknown),[]);
 assert.deepEqual(entryFees({...unknown,fees:['unknown']}),[]);
 assert.equal(matchesFeeFilter(unknown,null),true);
 const data=newData();data.tags=[{id:'tag-mine',name:'我的'}];data.assignments={third:['tag-mine']};
 assert.deepEqual([free,paid,both,unknown].filter(entry=>matchesFeeFilter(entry,'free')&&matchesTagFilters(data,entry,['tag-mine'])).map(entry=>entry.id),['third']);
});

test('personal fee edits override defaults, preserve empty choices and drive filtering',()=>{
 const entry={...entries[0],fees:['free']},data=newData();
 const removed=setEntryFees(data,entry,[]);
 assert.deepEqual(entryFees(entry,removed),[]);
 assert.equal(matchesFeeFilter(entry,'free',removed),false);
 assert.deepEqual(entryFees(entry,data),['free'],'source tags must remain unchanged');
 const changed=setEntryFees(removed,entry,['paid']);
 assert.deepEqual(entryFees(entry,changed),['paid']);
 assert.equal(matchesFeeFilter(entry,'paid',changed),true);
 assert.equal(matchesFeeFilter(entry,'free',changed),false);
 assert.deepEqual(setEntryFees(changed,entry,['paid','free','free']).feeOverrides[entry.id],['free','paid']);
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(removed)),entries),removed,'empty means explicitly untagged');
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(changed)),entries),changed);
});
test('fee edits support personal links and old backups migrate without losing notes or tags',()=>{
 const custom=createCustomEntry({name:'我的外链',url:'example.org/fees',description:''},entries,'custom-fees');
 const data={...newData(),customEntries:[custom],tags:[{id:'tag-mine',name:'我的'}],assignments:{[custom.id]:['tag-mine']},records:{[custom.id]:{note:'保留笔记',level:1,seen:123}}};
 const edited=setEntryFees(data,custom,['paid']);
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(edited)),entries),edited);
 const {feeOverrides,...old}=edited;
 const migrated=validateBackup({...old,version:5},entries);
 assert.deepEqual(migrated.feeOverrides,{});
 assert.deepEqual(migrated.records,data.records);
 assert.deepEqual(migrated.assignments,data.assignments);
 assert.deepEqual(entryFees(custom,migrated),[]);
});
test('fee override validation rejects missing fields, unknown links and malformed fee values',()=>{
 for(const feeOverrides of [undefined,null,[],{unknown:['free']},{first:['unknown']},{first:['free','free']},{first:'paid'},{first:['free','paid','free']}]) assert.throws(()=>validateBackup({...newData(),feeOverrides},entries));
});
