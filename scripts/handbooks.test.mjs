import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handbooks, handbookEntries } from '../src/data/handbooks.ts';
import { handbookPath, handbookEntryPath, handbookMentions } from '../src/lib/handbooks.ts';

test('one platform collects independent descriptions from multiple handbooks without duplicating personal records', () => {
  const books = [
    { id: 'writing', title: '文章推广', description: '', sections: [{ id: 'blogs', title: '博客' }] },
    { id: 'tutorials', title: '技术教程', description: '', sections: [{ id: 'technical', title: '开发社区' }] },
  ];
  const links = [
    { handbookId: 'writing', sectionId: 'blogs', entryId: 'medium', description: '文章经验' },
    { handbookId: 'tutorials', sectionId: 'technical', entryId: 'medium', description: '教程经验' },
    { handbookId: 'tutorials', sectionId: 'technical', entryId: 'dev', description: '其他平台' },
  ];
  const mentions = handbookMentions('medium', books, links);
  assert.deepEqual(mentions.map(item => [item.title, item.description]), [['文章推广', '文章经验'], ['技术教程', '教程经验']]);
  assert.equal(handbookEntryPath(mentions[1]), '/handbooks/tutorials/#entry-medium');
  assert.deepEqual(handbookMentions('unknown', books, links), []);
  assert.deepEqual(handbookMentions('medium', books, [...links, { ...links[0], handbookId: 'missing' }, { ...links[0], sectionId: 'missing' }]), mentions);
  assert.equal(links[0].title, undefined, 'shared public descriptions do not mutate their source');
});

test('handbook links retain site base paths and deep-link to the platform', () => {
  assert.equal(handbookPath('中文手册', '/project/'), '/project/handbooks/%E4%B8%AD%E6%96%87%E6%89%8B%E5%86%8C/');
  assert.equal(handbookPath('guide', '/project'), '/project/handbooks/guide/');
  assert.equal(handbookEntryPath({ handbookId: 'guide', entryId: 'link-123' }, '/project/'), '/project/handbooks/guide/#entry-link-123');
});

test('published handbooks reference existing platforms and sections with no prototype content or personal notes', () => {
  const entries = JSON.parse(fs.readFileSync(new URL('../src/data/external-links.json', import.meta.url), 'utf8'));
  const ids = new Set(entries.map(entry => entry.id));
  const pairs = new Set();
  assert(handbooks.length > 0);
  for (const book of handbooks) {
    assert(!book.title.includes('示例'));
    assert(/^[a-z0-9-]+$/.test(book.id));
    assert.equal(new Set(book.sections.map(section => section.id)).size, book.sections.length);
  }
  for (const link of handbookEntries) {
    const book = handbooks.find(book => book.id === link.handbookId);
    assert(book?.sections.some(section => section.id === link.sectionId));
    assert(ids.has(link.entryId), `unknown platform ${link.entryId}`);
    const pair = `${link.handbookId}:${link.entryId}`;
    assert(!pairs.has(pair), `duplicate description ${pair}`);
    pairs.add(pair);
    assert(link.description.trim());
    assert.deepEqual(Object.keys(link).sort(), ['description', 'entryId', 'handbookId', 'sectionId']);
  }
});
