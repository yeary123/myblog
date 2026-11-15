import test from 'node:test';
import assert from 'node:assert/strict';
import { canResumeReading, parseReadingPosition, readingKey, readingPage } from '../src/lib/reading-position.ts';

const position={version:1,hash:'',page:3,query:'博客',tagIds:['tag-writing'],fee:'free',sectionId:'english',scrollY:3500,entryId:'link-current',entryOffset:-170,updatedAt:123};

test('reading positions retain filters, page, chapter and the position inside a platform card',()=>{
 assert.deepEqual(parseReadingPosition(JSON.parse(JSON.stringify(position))),position);
 assert.notEqual(readingKey('library'),readingKey('handbook:writing'));
 assert.notEqual(readingKey('handbook:writing'),readingKey('handbook:other'));
 assert.deepEqual(parseReadingPosition({...position,tagIds:['tag-writing','tag-writing']}).tagIds,['tag-writing']);
});

test('invalid or outdated browser state is ignored instead of breaking the library',()=>{
 for(const raw of [null,[],{...position,version:2},{...position,page:0},{...position,page:1.5},{...position,scrollY:-1},{...position,scrollY:Infinity},{...position,entryOffset:NaN},{...position,entryId:'invalid id'},{...position,fee:'unknown'},{...position,tagIds:[123]},{...position,query:123},{...position,sectionId:null},{...position,updatedAt:-1},{...position,hash:null}]) assert.equal(parseReadingPosition(raw),null);
});

test('reordering or adding platforms resumes at the same platform even if its page changes',()=>{
 const ids=Array.from({length:80},(_,i)=>`link-${i}`);
 ids.splice(24,0,'link-current');
 assert.equal(readingPage(position,ids,20),2);
 assert.equal(readingPage(position,[...Array.from({length:20},(_,i)=>`new-${i}`),...ids],20),3);
 assert.equal(readingPage({...position,entryId:'deleted'},ids.slice(0,15),20),1);
 assert.equal(readingPage(position,[],20),1);
});

test('explicit deep links win, while refresh and Back can resume within the same chapter',()=>{
 const saved={...position,hash:'#section-english'};
 assert.equal(canResumeReading(saved,'','navigate'),true);
 assert.equal(canResumeReading(saved,'#entry-link-current','navigate'),false);
 assert.equal(canResumeReading(saved,'#section-english','navigate'),false);
 assert.equal(canResumeReading(saved,'#section-english','reload'),true);
 assert.equal(canResumeReading(saved,'#section-english','back_forward'),true);
 assert.equal(canResumeReading(saved,'#section-japanese','reload'),false);
});
