import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import allEntries from '../../data/external-links.json';
import { archiveTag, assignedTags, createCustomEntry, entryFees, feeLabels, matchesFeeFilter, getRecord, maxCustomEntries, matchesTagFilters, newData, setEntryFees, permanentlyDeleteTag, restoreTag, validateBackup, type Entry, type Fee, type LibraryData, type Tag, type LinkActivity } from '../../lib/link-library';
import PersonalSync from './PersonalSync';
import LinkJournal from './LinkJournal';
import { useLibrarySync } from './useLibrarySync';
import ConfirmTagRemoval from './ConfirmTagRemoval';
import AddTagForm from './AddTagForm';
import LinkCard from './LinkCard';
import { HandbookIndex, HandbookView } from './Handbooks';
import { handbooks, handbookEntries } from '../../data/handbooks';
import { handbookMentions } from '../../lib/handbooks';
import { localDate } from '../../lib/link-journal';

const storageKey='luna-link-library-v1';
const pageSize=20;
const appendActivities=(current:LinkActivity[], added:LinkActivity[])=>[...added,...current].slice(0,20000);

function AddLinkForm({onSave,onCancel,initial}:{onSave:(input:{name:string;url:string;description:string})=>string|null;onCancel:()=>void;initial?:Entry}){
  const [name,setName]=useState(initial?.name??''),[url,setUrl]=useState(initial?.url??''),[description,setDescription]=useState(initial?.reasons.join(' ')??''),[error,setError]=useState('');
  const nameInput=useRef<HTMLInputElement>(null);
  const errorId=useId();
  useEffect(()=>{nameInput.current?.focus();},[]);
  return <form id="ll-add-link" className="ll-add-link ll-card" aria-label={initial?'编辑外链':'添加外链'} onSubmit={event=>{event.preventDefault();setError(onSave({name,url,description})||'');}}>
    <div className="ll-form-row">
      <label><span className="ll-label">外链名称</span><input ref={nameInput} required maxLength={120} value={name} onChange={event=>setName(event.target.value)} placeholder="例如：我的新平台" /></label>
      <label><span className="ll-label">网址</span><input required type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={2048} value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://example.com" aria-describedby={error?errorId:undefined} /></label>
    </div>
    <label><span className="ll-label">说明（选填）</span><textarea maxLength={2000} value={description} onChange={event=>setDescription(event.target.value)} placeholder="这个平台有什么用途？可以怎样发布外链？" /></label>
    <p className="ll-small">{initial?'保存后会记录本次修改。':'添加后可继续设置标签和笔记。'}</p>
    {error&&<p id={errorId} className="ll-warning" role="alert">{error}</p>}
    <div className="ll-actions"><button type="submit" className="ll-primary">{initial?'保存修改':'保存外链'}</button><button type="button" onClick={onCancel}>取消</button></div>
  </form>;
}

type LibrarySection = 'library' | 'journal' | 'handbooks' | 'handbook';

export default function LinkLibrary({ initialSection = 'library', handbookId }: { initialSection?: LibrarySection; handbookId?: string }){
  const [data,setData]=useState<LibraryData>(newData);
  const [ready,setReady]=useState(false);
  const entries = useMemo<Entry[]>(() => [...data.customEntries, ...allEntries], [data.customEntries]);
  const [addingLink,setAddingLink]=useState(false);
  const [editingLink,setEditingLink]=useState<Entry|null>(null);
  const addLinkButton=useRef<HTMLButtonElement>(null);
  const [section,setSection]=useState<LibrarySection>(initialSection);
  const currentHandbook = handbooks.find(handbook => handbook.id === handbookId);
  useEffect(()=>{
    if(initialSection==='handbook'||initialSection==='handbooks')return;
    const readHash=()=>setSection(window.location.hash==='#journal'?'journal':'library');
    readHash();window.addEventListener('hashchange',readHash);
    return ()=>window.removeEventListener('hashchange',readHash);
  },[initialSection]);
  const [storageWarning,setStorageWarning]=useState('');
  const [message,setMessage]=useState('');
  const [removal,setRemoval]=useState<{tag:Tag;entry?:Entry;permanent?:boolean;fee?:Fee}|null>(null);
  const [undo,setUndo]=useState<{tag:Tag;entry?:Entry;fee?:Fee}|null>(null);
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<string[]>([]);
  const [fee,setFee]=useState<Fee|null>(null);
  const [page,setPage]=useState(1);
  const fileInput=useRef<HTMLInputElement>(null);
  const lastSaved=useRef(data);
  const sync=useLibrarySync(data,setData,ready);

  useEffect(()=>{
    try{const saved=localStorage.getItem(storageKey);if(saved)setData(validateBackup(JSON.parse(saved),allEntries));}
    catch{setStorageWarning('本地记录暂时无法读取或格式不兼容。请先导出备份；本次编辑会尝试重新保存。');}
    setReady(true);
  },[]);
  useEffect(()=>{
    if(!ready||lastSaved.current===data)return;
    lastSaved.current=data;
    try{localStorage.setItem(storageKey,JSON.stringify(data));setStorageWarning('');}
    catch{setStorageWarning('浏览器未能保存这些改动，离开前请导出备份。');}
  },[data,ready]);
  const tagsFor=(entry:Entry)=>assignedTags(data,entry);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return entries.filter(entry=>matchesTagFilters(data,entry,selected)&&matchesFeeFilter(entry,fee,data)&&[entry.name,entry.domain,...entry.reasons,...entryFees(entry,data).map(fee=>feeLabels[fee]),getRecord(data,entry.id).note,...assignedTags(data,entry).map(id=>data.tags.find(t=>t.id===id)?.name),...handbookMentions(entry.id,handbooks,handbookEntries).flatMap(mention=>[mention.title,mention.description])].join(' ').toLowerCase().includes(needle));
  },[data,entries,query,selected,fee]);
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const currentPage=Math.min(page,pages);
  const resetPage=()=>{setPage(1);setMessage('');};
  const toggleFilter=(id:string)=>{setSelected(old=>old.includes(id)?[]:[id]);resetPage();};
  const makeActivity=(entry:Pick<Entry,'id'|'name'>,kind:LinkActivity['kind'],summary:string,before?:string,after?:string):LinkActivity=>({id:`act-${crypto.randomUUID()}`,date:localDate(),entryId:entry.id,entryName:entry.name,kind,summary,...(before!==undefined?{before}:{}),...(after!==undefined?{after}:{})});
  const updateNote=(id:string,note:string)=>{
    const entry=entries.find(item=>item.id===id);const previous=getRecord(data,id).note;
    if(!entry||previous===note)return;
    const activity=makeActivity(entry,'note-updated','更新笔记',previous,note);
    setData(old=>old.records[id]?.note===note?old:{...old,records:{...old.records,[id]:{...getRecord(old,id),note}},activityLog:appendActivities(old.activityLog,[activity])});
  };
  const clearFilters=()=>{setQuery('');setSelected([]);setFee(null);resetPage();};
  const addLink=(input:{name:string;url:string;description:string}):string|null=>{
    try {
      if(data.customEntries.length>=maxCustomEntries)return '最多添加 1000 个自定义外链。';
      const entry=createCustomEntry(input,entries,'custom-'+crypto.randomUUID());
      const activity=makeActivity(entry,'link-added','添加外链',undefined,`${entry.name}\n${entry.url}${entry.reasons[0]?`\n${entry.reasons[0]}`:''}`);
      setData(old=>({...old,customEntries:[entry,...old.customEntries],activityLog:appendActivities(old.activityLog,[activity])}));
      clearFilters();setAddingLink(false);setMessage(`已添加「${entry.name}」。`);
      addLinkButton.current?.focus();
      return null;
    } catch(error) {return error instanceof Error?error.message:'暂时无法添加外链。';}
  };
  const editLink=(original:Entry,input:{name:string;url:string;description:string}):string|null=>{
    try{
      if(!original.id.startsWith('custom-'))return '内置外链暂不支持修改。';
      const updated=createCustomEntry(input,entries.filter(entry=>entry.id!==original.id),original.id);
      const before=`${original.name}\n${original.url}${original.reasons[0]?`\n${original.reasons[0]}`:''}`;
      const after=`${updated.name}\n${updated.url}${updated.reasons[0]?`\n${updated.reasons[0]}`:''}`;
      if(before===after){setEditingLink(null);return null;}
      const activity=makeActivity(updated,'link-edited','修改外链',before,after);
      setData(old=>({...old,customEntries:old.customEntries.map(entry=>entry.id===original.id?updated:entry),activityLog:appendActivities(old.activityLog,[activity])}));
      setEditingLink(null);setMessage(`已更新「${updated.name}」。`);return null;
    }catch(error){return error instanceof Error?error.message:'暂时无法修改外链。';}
  };
  const deleteLink=(entry:Entry)=>{
    if(!entry.id.startsWith('custom-'))return;
    if(!window.confirm(`删除「${entry.name}」？外链会从列表移除，操作记录会保留。`))return;
    const before=`${entry.name}\n${entry.url}${entry.reasons[0]?`\n${entry.reasons[0]}`:''}`;
    const activity=makeActivity(entry,'link-deleted','删除外链',before);
    setData(old=>{const { [entry.id]:_record,...records}=old.records;const { [entry.id]:_assignment,...assignments}=old.assignments;const { [entry.id]:_fee,...feeOverrides}=old.feeOverrides;return {...old,customEntries:old.customEntries.filter(item=>item.id!==entry.id),records,assignments,feeOverrides,activityLog:appendActivities(old.activityLog,[activity])};});
    setMessage(`已删除「${entry.name}」，操作记录已保留。`);
  };
  const addTag=(name:string,entry?:Entry):string|null=>{
    if(!name||name.length>24)return '请输入 1～24 个字符的标签名称。';
    const existing=data.tags.find(t=>t.name.toLowerCase()===name.toLowerCase());
    if(existing&&!entry)return '这个标签已存在。';
    if(!existing&&data.tags.length>=200)return '最多保留 200 个标签。';
    const tag=existing??{id:'tag-'+crypto.randomUUID(),name};
    const already=entry?assignedTags(data,entry).includes(tag.id):false;
    const activity=entry&&!already?makeActivity(entry,'tag-added','添加标签',undefined,tag.name):null;
    setData(old=>({...old,tags:existing?old.tags:[...old.tags,tag],assignments:entry?{...old.assignments,[entry.id]:[...new Set([...assignedTags(old,entry),tag.id])]}:old.assignments,activityLog:activity?appendActivities(old.activityLog,[activity]):old.activityLog}));
    return null;
  };
  const toggleFee=(entry:Entry,value:Fee)=>{
    if(entryFees(entry,data).includes(value)){
      setRemoval({tag:{id:'fee-'+value,name:feeLabels[value]},entry,fee:value});
      return;
    }
    const activity=makeActivity(entry,'tag-added','添加费用标签',undefined,feeLabels[value]);
    setData(old=>({...setEntryFees(old,entry,[...entryFees(entry,old),value]),activityLog:appendActivities(old.activityLog,[activity])}));
    setMessage(`已为「${entry.name}」添加「${feeLabels[value]}」费用标签。`);
  };
  const confirmRemoval=()=>{
    if(!removal)return;
    const {tag,entry}=removal;
    try{
      if(removal.fee&&entry){
        const value=removal.fee;
        const activity=makeActivity(entry,'tag-removed','移除费用标签',feeLabels[value]);
        setData(old=>({...setEntryFees(old,entry,entryFees(entry,old).filter(fee=>fee!==value)),activityLog:appendActivities(old.activityLog,[activity])}));
        setMessage(`已从「${entry.name}」移除「${feeLabels[value]}」费用标签，可以撤销。`);
        setUndo(removal);setRemoval(null);
        return;
      }
      if(removal.permanent){
        setData(old=>permanentlyDeleteTag(old,tag.id));
        setUndo(old=>old?.tag.id===tag.id?null:old);
        setMessage(`已彻底删除「${tag.name}」及原来的标签关联。`);
        setRemoval(null);
        return;
      }
      if(entry){
        const activity=makeActivity(entry,'tag-removed','移除标签',tag.name);
        setData(old=>({...old,assignments:{...old.assignments,[entry.id]:assignedTags(old,entry).filter(tagId=>tagId!==tag.id)},activityLog:appendActivities(old.activityLog,[activity])}));
        setMessage(`已从「${entry.name}」移除「${tag.name}」，可以撤销。`);
      }else{
        const affected=Object.entries(data.assignments).filter(([,ids])=>ids.includes(tag.id)).map(([id])=>entries.find(item=>item.id===id)).filter((item):item is Entry=>!!item);
        const activities=affected.map(item=>makeActivity(item,'tag-removed','移除标签',tag.name));
        setData(old=>({...archiveTag(old,tag.id),activityLog:appendActivities(old.activityLog,activities)}));
        setSelected(old=>old.filter(tagId=>tagId!==tag.id));
        setMessage(`「${tag.name}」已移入回收站，原来的外链关联也已保留。`);
      }
      setUndo(removal);
      setRemoval(null);
    }catch(error){setMessage(error instanceof Error?error.message:'暂时无法移除标签。');setRemoval(null);}
  };
  const restoreArchivedTag=(id:string)=>{
    const archived=data.deletedTags.find(item=>item.tag.id===id);
    if(!archived)return;
    try{
      const affected=archived.entryIds.map(entryId=>entries.find(item=>item.id===entryId)).filter((item):item is Entry=>!!item);
      const activities=affected.map(item=>makeActivity(item,'tag-added','恢复标签',undefined,archived.tag.name));
      setData(old=>({...restoreTag(old,id),activityLog:appendActivities(old.activityLog,activities)}));
      setUndo(null);
      setMessage(`已恢复「${archived.tag.name}」及原来的 ${archived.entryIds.length} 个外链关联。`);
    }catch(error){setMessage(error instanceof Error?error.message:'暂时无法恢复标签。');}
  };
  const undoRemoval=()=>{
    if(!undo)return;
    if(undo.fee&&undo.entry){
      const entry=undo.entry,value=undo.fee;
      const activity=makeActivity(entry,'tag-added','恢复费用标签',undefined,feeLabels[value]);
      setData(old=>({...setEntryFees(old,entry,[...entryFees(entry,old),value]),activityLog:appendActivities(old.activityLog,[activity])}));
      setMessage(`已恢复「${entry.name}」上的「${feeLabels[value]}」费用标签。`);
      setUndo(null);return;
    }
    if(!undo.entry){restoreArchivedTag(undo.tag.id);return;}
    const entry=undo.entry;
    if(!data.tags.some(tag=>tag.id===undo.tag.id)){setMessage('请先从回收站恢复这个标签。');return;}
    const activity=makeActivity(entry,'tag-added','恢复标签',undefined,undo.tag.name);
    setData(old=>({...old,assignments:{...old.assignments,[entry.id]:[...new Set([...assignedTags(old,entry),undo.tag.id])]},activityLog:appendActivities(old.activityLog,[activity])}));
    setMessage(`已恢复「${entry.name}」上的「${undo.tag.name}」。`);
    setUndo(null);
  };
  const exportBackup=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='luna-links-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('已导出自定义外链、费用标签、笔记、个人标签、手动日志和操作记录备份。');
  };
  const importBackup=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{
      if(file.size>5_000_000)throw new Error('备份文件过大。');
      const imported=validateBackup(JSON.parse(await file.text()),allEntries);
      if(!window.confirm('导入会替换本浏览器中的自定义外链、费用标签、笔记、个人标签、手动日志和操作记录。建议先导出当前备份。继续导入？'))return;
      setData(imported);setUndo(null);setRemoval(null);setFee(null);setSelected([]);setAddingLink(false);setPage(1);setMessage('备份已导入。');
    }catch(error){setMessage(error instanceof Error?error.message:'无法读取备份文件。');}
  };
  const renderCard=(entry:Entry,anchor=false)=><LinkCard key={entry.id} entry={entry} data={data} mentions={handbookMentions(entry.id,handbooks,handbookEntries)} anchor={anchor}
    selectedTags={selected} selectedFee={fee} onFilterTag={toggleFilter}
    onFilterFee={value=>{setFee(fee===value?null:value);resetPage();}} onToggleFee={toggleFee}
    onRemoveTag={(entry,tag)=>setRemoval({tag,entry})} onAddTag={addTag} onUpdateNote={updateNote} onEditLink={entry=>{setAddingLink(false);setEditingLink(entry);}} onDeleteLink={deleteLink} />;

  return <section className="ll" aria-label="外链手册">
    <header className="ll-header"><p className="ll-kicker">LUNA / PERSONAL COLLECTION</p><h1>外链手册</h1><p className="ll-sub">用标签整理，随时找到需要的平台。</p>
      <div className="ll-nav"><a href={import.meta.env.BASE_URL} aria-current={section==='library'?'page':undefined}>外链库</a><a href={`${import.meta.env.BASE_URL}handbooks/`} aria-current={section==='handbooks'||section==='handbook'?'page':undefined}>主题手册</a><a href={`${import.meta.env.BASE_URL}#journal`} aria-current={section==='journal'?'page':undefined}>外链日志</a></div>
    </header>
    <div className="ll-personal"><span className="ll-small">个人记录保存在当前浏览器，可导出备份。</span><div className="ll-actions"><button onClick={exportBackup} disabled={!ready}>导出备份</button><button onClick={()=>fileInput.current?.click()} disabled={!ready}>导入备份</button><input className="ll-sr" ref={fileInput} type="file" accept=".json,application/json" onChange={importBackup} aria-label="选择备份文件" /></div></div>
    <PersonalSync sync={sync} />
    {storageWarning&&<p role="alert" className="ll-warning">{storageWarning}</p>}
    <p className="ll-message" role="status" aria-live="polite">{message}</p>
    {undo&&(undo.entry||data.deletedTags.some(item=>item.tag.id===undo.tag.id))&&<div className="ll-undo" role="status"><span>刚移除的「{undo.tag.name}」可以恢复。</span><button onClick={undoRemoval}>撤销</button></div>}
    {removal&&<ConfirmTagRemoval name={removal.tag.name} entryName={removal.entry?.name} permanent={removal.permanent} count={removal.permanent?(data.deletedTags.find(item=>item.tag.id===removal.tag.id)?.entryIds.length??0):Object.values(data.assignments).filter(ids=>ids.includes(removal.tag.id)).length} onCancel={()=>setRemoval(null)} onConfirm={confirmRemoval} />}
    <div hidden={section!=='library'}>
      <div className="ll-library-heading"><h2>我的外链库</h2><button ref={addLinkButton} className="ll-primary" disabled={!ready} aria-expanded={addingLink} aria-controls="ll-add-link" onClick={()=>setAddingLink(!addingLink)}>{addingLink?'收起表单':'＋ 添加外链'}</button></div>
      {addingLink&&<AddLinkForm onSave={addLink} onCancel={()=>{setAddingLink(false);addLinkButton.current?.focus();}} />}
      {editingLink&&<AddLinkForm key={editingLink.id} initial={editingLink} onSave={input=>editLink(editingLink,input)} onCancel={()=>setEditingLink(null)} />}
      <div className="ll-toolbar"><label className="ll-search"><span className="ll-sr">搜索外链</span><input type="search" value={query} onChange={e=>{setQuery(e.target.value);resetPage();}} placeholder="搜索名称、标签、笔记、平台说明或手册说明" /></label></div>
      <div className="ll-fee-filters"><span className="ll-small">费用标签</span><div className="ll-tags" role="group" aria-label="按费用标签筛选"><button className="ll-tag" aria-pressed={fee===null} onClick={()=>{setFee(null);resetPage();}}>全部</button>{(Object.keys(feeLabels) as Fee[]).map(value=><button className="ll-tag ll-fee-tag" key={value} aria-pressed={fee===value} onClick={()=>{setFee(fee===value?null:value);resetPage();}}>{feeLabels[value]}</button>)}</div></div>
      <p className="ll-small ll-source-note">说明与费用标签根据历史推荐整理，价格、提交条件和实际效果以网站为准；可在卡片中修改费用标签，费用不明可留空。</p>
      <div className="ll-filter-heading"><span className="ll-small">我的标签 · 点击查看同类外链</span></div>
      <div className="ll-tags ll-user-tags" role="group" aria-label="按标签查看外链"><button className="ll-tag" aria-pressed={!selected.length} onClick={()=>{setSelected([]);resetPage();}}>全部</button>{data.tags.map(tag=><span className="ll-tag-pair" key={tag.id}><button className="ll-tag" aria-pressed={selected.includes(tag.id)} onClick={()=>toggleFilter(tag.id)}>{tag.name} <span>{entries.filter(entry=>tagsFor(entry).includes(tag.id)).length}</span></button><button className="ll-remove-tag" aria-label={`删除标签 ${tag.name}`} onClick={()=>setRemoval({tag})}>×</button></span>)}</div>
      <AddTagForm onAdd={name=>addTag(name)} tags={data.tags} />
      {data.deletedTags.length>0&&<details className="ll-trash"><summary>标签回收站 · {data.deletedTags.length} 个</summary><p className="ll-small">可恢复标签和原来的外链关联，也可彻底删除。彻底删除后无法撤销，外链和笔记会保留。连接云端后，回收站的操作会跨设备同步。</p><ul>{[...data.deletedTags].reverse().map(item=><li key={item.tag.id}><div><span>{item.tag.name}</span><p className="ll-small">原关联 {item.entryIds.length} 个外链 · {new Date(item.deletedAt).toLocaleString('zh-CN')}</p></div><div className="ll-actions ll-trash-actions"><button aria-label={`恢复标签 ${item.tag.name}`} onClick={()=>restoreArchivedTag(item.tag.id)}>恢复标签和关联</button><button className="ll-danger" aria-label={`彻底删除标签 ${item.tag.name}`} onClick={()=>setRemoval({tag:item.tag,permanent:true})}>彻底删除</button></div></li>)}</ul></details>}
      <div className="ll-overview" aria-live="polite"><span>{filtered.length} 个外链 / 共 {entries.length} 个</span></div>
      <div className="ll-list">{filtered.slice((currentPage-1)*pageSize,currentPage*pageSize).map(entry=>renderCard(entry))}</div>
      {!filtered.length&&<div className="ll-empty"><p>没有匹配的外链，放宽筛选再试试。</p><button onClick={clearFilters}>清空全部筛选</button></div>}
      {filtered.length>pageSize&&<nav className="ll-pagination" aria-label="外链列表分页"><button disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>上一页</button><span>{currentPage} / {pages}</span><button disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>下一页</button></nav>}
    </div>
    <div hidden={section!=='journal'}><LinkJournal data={data} setData={setData} ready={ready} /></div>
    {section==='handbooks'&&<HandbookIndex handbooks={handbooks} />}
    {section==='handbook'&&currentHandbook&&<HandbookView handbook={currentHandbook} links={handbookEntries} entries={filtered} ready={ready} hasFilters={!!(selected.length||fee||query.trim())} onClearFilters={clearFilters} renderCard={entry=>renderCard(entry,true)} />}
  </section>;
}
