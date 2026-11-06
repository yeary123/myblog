import test from 'node:test';
import assert from 'node:assert/strict';
import { assignedTags, buildReviewQueue, matchesTagFilters, newData, validateBackup } from '../src/lib/link-library.ts';
const make=(id,order,tags)=>({id,order,tags,name:id,url:'https://example.com',domain:'example.com',votes:null,recommendationTotal:0,reasons:[]});
const entries=[make('first',1,['community','writing']),make('second',2,['content','writing']),make('third',3,['community','research']),make('fourth',4,['directory'])];
test('tag filters combine alternatives within a group and require all groups',()=>{
 const data=newData();
 assert.deepEqual(entries.filter(e=>matchesTagFilters(data,e,['community','content','writing'])).map(e=>e.id),['first','second']);
 data.assignments.first=[];
 assert.deepEqual(assignedTags(data,entries[0]),[]);
 assert.equal(matchesTagFilters(data,entries[0],['community']),false);
});
test('review prioritizes unseen entries, then weaker and older memories without mutating source order',()=>{
 const data=newData();data.records={first:{level:2,note:'',seen:10},second:{level:0,note:'',seen:20},third:{level:0,note:'',seen:5}};
 assert.deepEqual(buildReviewQueue(data,entries).map(e=>e.id),['fourth','third','second']);
 assert.equal(entries[0].id,'first');
});
test('backup round trip retains notes, explicit empty classifications and rejects invalid records',()=>{
 const data=newData();data.records.first={level:1,note:'下次做产品时看',seen:123};data.assignments.first=[];
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data)),entries),data);
 assert.throws(()=>validateBackup({...data,records:{first:{level:9,note:'',seen:1}}},entries));
 assert.throws(()=>validateBackup({...data,assignments:{first:['unknown-tag']}},entries));
});
