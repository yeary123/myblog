export type HandbookSection = { id: string; title: string; paragraphs?: string[] };
export type Handbook = { id: string; title: string; description: string; sections: HandbookSection[] };
export type HandbookEntry = { handbookId: string; sectionId: string; entryId: string; description: string };
export type HandbookMention = HandbookEntry & { title: string };

export function handbookPath(id: string, base = '/') {
  return `${base.replace(/\/?$/, '/')}handbooks/${encodeURIComponent(id)}/`;
}

export function handbookEntryPath(mention: HandbookEntry, base = '/') {
  return `${handbookPath(mention.handbookId, base)}#entry-${encodeURIComponent(mention.entryId)}`;
}

export function handbookMentions(entryId: string, handbooks: Handbook[], links: HandbookEntry[]): HandbookMention[] {
  return links.flatMap(link => {
    const handbook = handbooks.find(item => item.id === link.handbookId);
    return link.entryId === entryId && handbook?.sections.some(section => section.id === link.sectionId)
      ? [{ ...link, title: handbook.title }] : [];
  });
}
