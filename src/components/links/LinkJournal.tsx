import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import type { JournalEntry, LibraryData, LinkActivity } from '../../lib/link-library';
import { localDate, validateJournal } from '../../lib/link-journal';

type Draft = { work: string; published: string; next: string; base: string };
const fingerprint = (entry?: JournalEntry) => JSON.stringify(entry ?? null);
const fields = (entry?: JournalEntry): Draft => ({ work: entry?.work ?? '', published: String(entry?.published ?? 0), next: entry?.next ?? '', base: fingerprint(entry) });
const activityLabels: Record<LinkActivity['kind'], string> = { 'link-added':'新增外链', 'link-edited':'修改外链', 'link-deleted':'删除外链', 'tag-added':'添加标签', 'tag-removed':'移除标签', 'note-updated':'笔记变更' };

export default function LinkJournal({ data, setData, ready }: { data: LibraryData; setData: Dispatch<SetStateAction<LibraryData>>; ready: boolean }) {
  const [date, setDate] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [undo, setUndo] = useState<JournalEntry | null>(null);
  const editor = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setDate(localDate()); }, []);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  const saved = data.journal.find(entry => entry.date === date);
  const value = draft ?? fields(saved);
  const changedElsewhere = draft && draft.base !== fingerprint(saved);
  const patch = (key: keyof Omit<Draft, 'base'>, text: string) => { setDraft({ ...value, [key]: text }); setMessage(''); setError(''); };
  const selectDate = (next: string) => {
    if (!next || next === date) return;
    if (draft && !window.confirm('当前日志还有未保存的修改，放弃修改并切换日期？')) return;
    setDate(next); setDraft(null); setMessage(''); setError('');
    editor.current?.focus();
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    try {
      if (changedElsewhere) throw new Error('这一天的日志已被同步或导入更新。请先复制当前内容，再点击“重新载入”查看最新记录。');
      const entry = validateJournal([{ date, work: value.work, published: Number(value.published), urls: saved?.urls ?? [], next: value.next, updatedAt: Date.now() }])[0];
      if (!saved && data.journal.length >= 10000) throw new Error('已达到 10000 天的记录上限，请先导出备份。');
      setData(old => ({ ...old, journal: [...old.journal.filter(item => item.date !== date), entry].sort((a,b) => b.date.localeCompare(a.date)) }));
      setDraft(null); setError(''); setMessage(`${date} 的日志已保存。`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '日志暂时无法保存。'); }
  };
  const remove = (entry: JournalEntry) => {
    if (!window.confirm(`删除 ${entry.date} 的外链日志？删除后可以撤销。`)) return;
    if (entry.date === date && draft && !window.confirm('这一天还有未保存的修改，一并放弃？')) return;
    setData(old => ({ ...old, journal: old.journal.filter(item => item.date !== entry.date) }));
    if (entry.date === date) setDraft(null);
    setUndo(entry); setMessage(`已删除 ${entry.date} 的日志，可以撤销。`); setError('');
  };
  const restore = () => {
    if (!undo) return;
    if (data.journal.some(entry => entry.date === undo.date)) { setError('这一天已有新记录，请先保留当前内容，再恢复旧记录。'); return; }
    if (data.journal.length >= 10000) { setError('已达到 10000 天的记录上限，请先导出备份。'); return; }
    setData(old => ({ ...old, journal: [...old.journal, undo].sort((a,b) => b.date.localeCompare(a.date)) }));
    setUndo(null); setMessage('日志已恢复。'); setError('');
  };
  const needle = query.trim().toLowerCase();
  const dates = [...new Set([...data.journal.map(entry => entry.date), ...data.activityLog.map(item => item.date)])].sort().reverse();
  const journalMatches = (entry?: JournalEntry) => !!entry && [entry.date, entry.work, entry.next].join(' ').toLowerCase().includes(needle);
  const activitiesFor = (date: string) => data.activityLog.filter(item => item.date === date);
  const activityMatches = (item: LinkActivity) => [item.date, item.entryName, item.entryUrl, item.summary, item.before, item.after].filter(Boolean).join(' ').toLowerCase().includes(needle);
  const filtered = dates.filter(date => {
    if (month && !date.startsWith(month)) return false;
    const entry = data.journal.find(item => item.date === date);
    return !needle || journalMatches(entry) || activitiesFor(date).some(activityMatches);
  });
  const months = [...new Set(dates.map(date => date.slice(0,7)))].sort().reverse();
  const activityCount = data.activityLog.length;

  return <section className="ll-journal" aria-label="外链日志">
    <div className="ll-journal-heading"><div><h2>外链日志</h2><p className="ll-sub">自动记录标签、笔记和外链变更，也可以手动补充每天的工作。</p></div><button disabled={!ready} onClick={() => selectDate(localDate())}>写今天的日志</button></div>
    <div className="ll-journal-stats" aria-label="日志统计"><div><strong>{dates.length}</strong><span>记录天数</span></div><div><strong>{activityCount}</strong><span>自动操作</span></div><div><strong>{data.journal.reduce((sum, entry) => sum + entry.published, 0)}</strong><span>累计发布外链</span></div></div>
    <form className="ll-journal-editor ll-card" onSubmit={save}>
      <div className="ll-journal-heading"><h3 ref={editor} tabIndex={-1}>{saved ? '编辑当天日志' : '记录一天的工作'}</h3><span className="ll-small">{draft ? '有修改待保存' : saved ? '已保存，可继续补充' : '每个日期一篇，可随时补记'}</span></div>
      <fieldset disabled={!ready || !date}>
        <div className="ll-form-row"><label><span className="ll-label">日期</span><input type="date" required min="0001-01-01" max="9999-12-31" value={date} onChange={event => selectDate(event.target.value)} /></label><label><span className="ll-label">成功发布的外链数</span><input type="number" required min="0" max="100000" step="1" value={value.published} onChange={event => patch('published', event.target.value)} /></label></div>
        <label><span className="ll-label">今天做了什么 <span aria-hidden="true">*</span></span><textarea required maxLength={10000} rows={5} value={value.work} onChange={event => patch('work', event.target.value)} placeholder="推广了哪个网站？在哪些平台发了外链？提交、审核和沟通有什么进展？" /></label>
        <label><span className="ll-label">经验与下一步（选填）</span><textarea maxLength={5000} rows={3} value={value.next} onChange={event => patch('next', event.target.value)} placeholder="哪些方法有效？遇到了什么问题？明天继续做什么？" /></label>
        <div className="ll-actions"><button type="submit" className="ll-primary" disabled={!!changedElsewhere}>保存日志</button>{draft && <button type="button" onClick={() => { if (window.confirm('放弃当前未保存的修改，重新载入这一天的记录？')) { setDraft(null); setError(''); setMessage('已重新载入。'); } }}>{changedElsewhere ? '重新载入' : '放弃修改'}</button>}<span className="ll-small">保存后纳入备份与个人云端同步。</span></div>
      </fieldset>
      {changedElsewhere && <p className="ll-warning" role="alert">这一天的记录已在其他地方更新。请先复制未保存内容，再重新载入。</p>}
    </form>
    {error && <p className="ll-warning" role="alert">{error}</p>}
    <p className="ll-message" role="status">{message}</p>
    {undo && <div className="ll-undo"><span>已删除 {undo.date} 的日志。</span><button onClick={restore}>撤销删除</button></div>}
    <div className="ll-toolbar"><label className="ll-search"><span className="ll-sr">搜索日志</span><input type="search" placeholder="搜索日志内容、外链或变更" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="按月份筛选日志" value={month} onChange={event => setMonth(event.target.value)}><option value="">全部月份</option>{months.map(item => <option key={item} value={item}>{item.replace('-', ' 年 ')} 月</option>)}</select></div>
    <p className="ll-small ll-journal-count">共 {filtered.length} 天 · 按日期从新到旧</p>
    {!filtered.length ? <div className="ll-empty"><h2>{dates.length ? '没有找到匹配的日志' : '从今天的第一条记录开始'}</h2><p className="ll-sub">{dates.length ? '试试其他关键词或月份。' : '修改标签、笔记或外链后，系统会自动记下变化；也可以手动写日志。'}</p></div> : <div className="ll-list">{filtered.map(date => {
      const entry = data.journal.find(item => item.date === date);
      const showJournal = !needle || journalMatches(entry);
      const items = activitiesFor(date).filter(item => !needle || activityMatches(item));
      return <article className="ll-card ll-journal-entry" key={date}>
        <div className="ll-card-top"><h3><time dateTime={date}>{date}</time></h3><div className="ll-actions">{entry&&showJournal&&<span className="ll-journal-badge">发布 {entry.published} 条</span>}{items.length>0&&<span className="ll-journal-badge">自动操作 {items.length} 条</span>}</div></div>
        {entry&&showJournal&&<><p className="ll-journal-text">{entry.work}</p>{entry.next&&<div className="ll-journal-next"><span className="ll-label">经验与下一步</span><p className="ll-journal-text">{entry.next}</p></div>}<div className="ll-card-actions"><span className="ll-small">更新于 {new Date(entry.updatedAt).toLocaleString('zh-CN')}</span><div className="ll-actions"><button onClick={() => { selectDate(date); editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>编辑</button><button className="ll-quiet" onClick={() => remove(entry)}>删除</button></div></div></>}
        {items.length>0&&<ul className="ll-activity-list">{items.map(item=><li key={item.id}><div className="ll-activity-heading"><span className="ll-journal-badge">{activityLabels[item.kind]}</span><strong>{item.entryName}</strong>{item.entryUrl&&<a href={item.entryUrl} target="_blank" rel="noopener noreferrer" className="ll-small">{item.entryUrl}</a>}</div><p>{item.summary}</p>{item.before!==undefined&&<div className="ll-activity-change"><span className="ll-label">变更前</span><p>{item.before||'（空）'}</p></div>}{item.after!==undefined&&<div className="ll-activity-change"><span className="ll-label">变更后</span><p>{item.after||'（空）'}</p></div>}</li>)}</ul>}
      </article>;
    })}</div>}
  </section>;
}
