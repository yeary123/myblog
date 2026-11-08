"""Refresh source counts from a saved Web.Cafe page, keeping curated descriptions and fee tags by URL.

Usage: python3 scripts/refresh-webcafe-metadata.py /absolute/path/to/saved-page.html
"""
import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []

    def text(self):
        return ''.join(c if isinstance(c, str) else c.text() for c in self.children)


class Tree(HTMLParser):
    void = set('area base br col embed hr img input link meta param source track wbr'.split())

    def __init__(self):
        super().__init__()
        self.root = Node('root', [], None)
        self.current = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in self.void:
            self.current = node

    def handle_endtag(self, tag):
        node = self.current
        while node is not self.root and node.tag != tag:
            node = node.parent
        if node.parent:
            self.current = node.parent

    def handle_data(self, data):
        if data.strip():
            self.current.children.append(data)


def walk(node):
    yield node
    for child in node.children:
        if isinstance(child, Node):
            yield from walk(child)


target = Path(__file__).resolve().parent.parent / 'src/data/external-links.json'
records = json.loads(target.read_text())
by_url = {entry['url']: entry for entry in records}
tree = Tree()
tree.feed(Path(sys.argv[1]).read_text())
found = set()
for anchor in walk(tree.root):
    url = anchor.attrs.get('href', '')
    if anchor.tag != 'a' or url not in by_url or 'text-xs shrink-0 text-blue-600' not in anchor.attrs.get('class', ''):
        continue
    card = anchor
    while card and not {'rounded-xl', 'border'}.issubset(card.attrs.get('class', '').split()):
        card = card.parent
    if not card:
        continue
    nodes = list(walk(card))
    entry = by_url[url]
    votes = [re.fullmatch(r'(\d+)\s*票', node.text().strip()) for node in nodes if node.tag == 'span']
    vote = next((match for match in votes if match), None)
    expanded = re.search(r'展开全部\s*(\d+)\s*条推荐理由', card.text())
    recommenders = re.search(r'(\d+)\s*人推荐', card.text())
    entry['id'] = 'link-' + hashlib.sha256(url.encode()).hexdigest()[:12]
    entry['votes'] = int(vote.group(1)) if vote else None
    entry['recommendationTotal'] = int(expanded.group(1)) if expanded else entry.get('sourceReasonCount', len(entry['reasons']))
    entry['recommenders'] = int(recommenders.group(1)) if recommenders else None
    found.add(url)
if len(found) != len(records):
    raise ValueError(f'Archive only matches {len(found)} of {len(records)} records; no file written.')
target.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
print(f'Refreshed {len(records)} records; preserved all curated descriptions and fee tags.')
