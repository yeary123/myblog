import { useEffect, useState, type ReactNode } from 'react';
import { handbookPath, type Handbook, type HandbookEntry } from '../../lib/handbooks';
import type { Entry } from '../../lib/link-library';

const indexPath = `${import.meta.env.BASE_URL}handbooks/`;

export function HandbookIndex({ handbooks }: { handbooks: Handbook[] }) {
  return <section className="ll-handbooks" aria-label="主题手册">
    <h2>我的手册</h2>
    {handbooks.map(handbook => <article className="ll-handbook-summary" key={handbook.id}><h3><a href={handbookPath(handbook.id, import.meta.env.BASE_URL)}>{handbook.title} →</a></h3><p className="ll-sub">{handbook.description}</p></article>)}
  </section>;
}

export function HandbookView({ handbook, links, entries, ready, hasFilters, onClearFilters, renderCard }: {
  handbook: Handbook; links: HandbookEntry[]; entries: Entry[]; ready: boolean; hasFilters: boolean;
  onClearFilters: () => void; renderCard: (entry: Entry) => ReactNode;
}) {
  const [sectionId, setSectionId] = useState(handbook.sections[0].id);
  const [hash, setHash] = useState('');
  useEffect(() => {
    const readHash = () => {
      const value = window.location.hash;
      setHash(value);
      const section = handbook.sections.find(section => value === `#section-${section.id}`);
      const entry = links.find(link => link.handbookId === handbook.id && value === `#entry-${link.entryId}`);
      if (section || entry) setSectionId(section?.id ?? entry!.sectionId);
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, [handbook, links]);
  useEffect(() => {
    if (!ready || !hash) return;
    const frame = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [ready, hash, sectionId]);
  const section = handbook.sections.find(section => section.id === sectionId) ?? handbook.sections[0];
  const sectionLinks = links.filter(link => link.handbookId === handbook.id && link.sectionId === section.id);
  const cards = sectionLinks.flatMap(link => {
    const entry = entries.find(entry => entry.id === link.entryId);
    return entry ? [entry] : [];
  });
  return <div className="ll-handbook-layout">
    <nav className="ll-handbook-toc" aria-label="手册目录"><span className="ll-small">手册目录</span>{handbook.sections.map(item => <a key={item.id} href={`#section-${item.id}`} aria-current={item.id === section.id ? 'location' : undefined}>{item.title}</a>)}</nav>
    <section className="ll-handbook-content" aria-label={handbook.title}>
      <p className="ll-small"><a href={indexPath}>全部手册</a> / {handbook.title}</p><h2>{handbook.title}</h2>
      <div className="ll-handbook-overview"><span className="ll-label">手册说明</span><p>{handbook.description}</p></div>
      <h3 id={`section-${section.id}`}>{section.title}</h3>
      {hasFilters && <div className="ll-handbook-filters"><span className="ll-small">已按所选标签筛选外链。</span><button onClick={onClearFilters}>清空筛选</button></div>}
      {section.paragraphs?.map(paragraph => <p className="ll-handbook-paragraph" key={paragraph}>{paragraph}</p>)}
      <div className="ll-list">{cards.map(entry => <div key={entry.id}>{renderCard(entry)}</div>)}</div>
      {!cards.length && !section.paragraphs?.length && <div className="ll-empty"><p>没有匹配的外链，放宽筛选再试试。</p>{hasFilters && <button onClick={onClearFilters}>清空筛选</button>}</div>}
    </section>
  </div>;
}
