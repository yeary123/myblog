import { assignedTags, entryFees, feeLabels, getRecord, type Entry, type Fee, type LibraryData, type Tag } from '../../lib/link-library';
import { handbookEntryPath, type HandbookMention } from '../../lib/handbooks';
import AddTagForm from './AddTagForm';

type Props = {
  entry: Entry; data: LibraryData; mentions: HandbookMention[]; anchor?: boolean;
  selectedTags: string[]; selectedFee: Fee | null;
  onFilterTag: (id: string) => void; onFilterFee: (fee: Fee) => void;
  onToggleFee: (entry: Entry, fee: Fee) => void;
  onRemoveTag: (entry: Entry, tag: Tag) => void;
  onAddTag: (name: string, entry: Entry) => string | null;
  onUpdateNote: (id: string, note: string) => void;
};

export default function LinkCard({ entry, data, mentions, anchor, selectedTags, selectedFee, onFilterTag, onFilterFee, onToggleFee, onRemoveTag, onAddTag, onUpdateNote }: Props) {
  return <article className="ll-card" id={anchor ? `entry-${entry.id}` : undefined} data-entry-id={entry.id}>
    <div className="ll-card-top"><div><h2>{entry.name}</h2><span className="ll-domain">{entry.domain}{entry.id.startsWith('custom-') && ' · 我添加的'}</span></div></div>
    <div className="ll-tags ll-card-tags">
      {entryFees(entry, data).map(value => <span className="ll-tag-pair ll-fee-pair" key={'fee-' + value}><button className="ll-tag ll-fee-tag" aria-label={`查看${feeLabels[value]}外链`} aria-pressed={selectedFee === value} onClick={() => onFilterFee(value)}>{feeLabels[value]}</button><button className="ll-remove-tag" aria-label={`从 ${entry.name} 移除费用标签 ${feeLabels[value]}`} onClick={() => onToggleFee(entry, value)}>×</button></span>)}
      {assignedTags(data, entry).map(id => {
        const tag = data.tags.find(tag => tag.id === id)!;
        return <span className="ll-tag-pair" key={id}><button className="ll-tag" aria-pressed={selectedTags.includes(id)} onClick={() => onFilterTag(id)}>{tag.name}</button><button className="ll-remove-tag" aria-label={`从 ${entry.name} 移除标签 ${tag.name}`} onClick={() => onRemoveTag(entry, tag)}>×</button></span>;
      })}
    </div>
    <details className="ll-fee-editor"><summary>编辑费用标签</summary><div className="ll-actions" role="group" aria-label={`${entry.name} 的费用标签`}>{(Object.keys(feeLabels) as Fee[]).map(value => <button key={value} className="ll-tag ll-fee-tag" aria-pressed={entryFees(entry, data).includes(value)} onClick={() => onToggleFee(entry, value)}>{feeLabels[value]}</button>)}</div><p className="ll-small">点击添加或移除；都不选则不显示费用标签。</p></details>
    <div className="ll-card-actions"><AddTagForm onAdd={name => onAddTag(name, entry)} tags={data.tags} entryName={entry.name} /><a className="ll-button ll-quiet" href={entry.url} target="_blank" rel="noopener noreferrer" aria-label={'在新标签页访问 ' + entry.name}>访问 ↗</a></div>
    <div className="ll-description"><span className="ll-label">平台说明</span><p>{entry.reasons.join(' ') || '暂无说明，可以先访问网站了解。'}</p></div>
    {mentions.length > 0 && <div className="ll-handbook-descriptions"><span className="ll-label">手册说明</span>{mentions.map(mention => <div className="ll-handbook-mention" key={mention.handbookId}>
      <a href={handbookEntryPath(mention, import.meta.env.BASE_URL)}>{mention.title} →</a><p>{mention.description}</p>
    </div>)}</div>}
    <details className="ll-note-details" open><summary>我的笔记</summary><div className="ll-details"><div><span className="ll-label">我的一句话理解</span><label><span className="ll-sr">{entry.name} 的笔记</span><textarea maxLength={2000} value={getRecord(data, entry.id).note} onChange={event => onUpdateNote(entry.id, event.target.value)} placeholder="它能做什么？我会在什么时候用到它？" /></label></div></div></details>
  </article>;
}
