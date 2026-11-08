import { useId, useState, type FormEvent } from 'react';
import type { Tag } from '../../lib/link-library';

export default function AddTagForm({ onAdd, tags, entryName }: {
  onAdd: (name: string) => string | null; tags: Tag[]; entryName?: string;
}) {
  const [name, setName] = useState('');
  const [feedback, setFeedback] = useState('');
  const listId = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const error = onAdd(name.trim());
    setFeedback(error || `已添加「${name.trim()}」。`);
    if (!error) setName('');
  };
  return <form className="ll-add-tag" onSubmit={submit} aria-label={entryName ? `为 ${entryName} 添加标签` : '添加标签'}>
    <div className="ll-actions"><label><span className="ll-sr">{entryName ? `${entryName} 的标签名称` : '新标签名称'}</span><input list={entryName ? listId : undefined} maxLength={24} required value={name} onChange={event => setName(event.target.value)} placeholder={entryName ? '输入或选择标签' : '新标签名称'} /></label><button type="submit">添加标签</button></div>
    {entryName && <datalist id={listId}>{tags.map(tag => <option key={tag.id} value={tag.name} />)}</datalist>}
    {feedback && <p className="ll-small" role="status">{feedback}</p>}
  </form>;
}
