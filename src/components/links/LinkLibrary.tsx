import { useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import allEntries from '../../data/external-links.json';
import { assignedTags, buildReviewQueue, getRecord, groups, levelNames, matchesTagFilters, newData, validateBackup, type Entry, type LibraryData, type Tag } from '../../lib/link-library';

const entries: Entry[]=allEntries;
const storageKey='luna-link-library-v1';
const source='https://new.web.cafe/ask/bounty/wlhmhdaoqg';
const pageSize=20;
const collectionDownload=`${import.meta.env.BASE_URL}data/external-links.csv`;

export default function LinkLibrary(){
  const [data,setData]=useState<LibraryData>(newData);
  const [ready,setReady]=useState(false);
  const [storageWarning,setStorageWarning]=useState('');
  const [message,setMessage]=useState('');
  const [query,setQuery]=useState('');const [level,setLevel]=useState('all');
  const [selected,setSelected]=useState<string[]>([]);const [unclassified,setUnclassified]=useState(false);
  const [page,setPage]=useState(1);const [expanded,setExpanded]=useState<string|null>(null);const [editing,setEditing]=useState<string|null>(null);
  const [manager,setManager]=useState(false);const [tagName,setTagName]=useState('');const [tagGroup,setTagGroup]=useState<Tag['group']>('topic');
  const [managedTag,setManagedTag]=useState('code');const [rename,setRename]=useState('');
  const [deleted,setDeleted]=useState<{tag:Tag;links:string[]}|null>(null);
  const [review,setReview]=useState<{queue:Entry[];index:number;revealed:boolean;answers:Record<string,number>;thoughts:Record<string,string>;done:boolean;scope:string}|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const reviewHeading=useRef<HTMLHeadingElement>(null);
  const lastSaved=useRef(data);

  useEffect(()=>{
    try{const saved=localStorage.getItem(storageKey);if(saved)setData(validateBackup(JSON.parse(saved),entries));}
    catch{setStorageWarning('本地记录暂时无法读取或格式不兼容。请先导出备份；本次编辑会尝试重新保存。');}
    setReady(true);
  },[]);
  useEffect(()=>{
    if(!ready||lastSaved.current===data)return;
    lastSaved.current=data;
    try{localStorage.setItem(storageKey,JSON.stringify(data));setStorageWarning('');}
    catch{setStorageWarning('浏览器未能保存这些改动，离开前请导出备份。');}
  },[data,ready]);
  useEffect(()=>{if(review)reviewHeading.current?.focus();},[review?.index,review?.done]);
  const tagsFor=(entry:Entry)=>assignedTags(data,entry);
  const hasType=(entry:Entry)=>tagsFor(entry).some(id=>data.tags.some(t=>t.id===id&&t.group==='type'));
  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return entries.filter(entry=>(level==='all'||getRecord(data,entry.id).level===Number(level))&&(!unclassified||!assignedTags(data,entry).some(id=>data.tags.some(t=>t.id===id&&t.group==='type')))&&matchesTagFilters(data,entry,selected)&&[entry.name,entry.domain,...entry.reasons,getRecord(data,entry.id).note,...assignedTags(data,entry).map(id=>data.tags.find(t=>t.id===id)?.name)].join(' ').toLowerCase().includes(needle));
  },[data,query,level,unclassified,selected]);
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const currentPage=Math.min(page,pages);
  const resetPage=()=>{setPage(1);setMessage('');};
  const toggleFilter=(id:string)=>{setSelected(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);resetPage();};
  const updateRecord=(id:string,patch:Partial<{level:number;note:string;seen:number}>)=>setData(old=>({...old,records:{...old.records,[id]:{...getRecord(old,id),...patch}}}));
  const setFamiliarity=(id:string,value:number)=>{updateRecord(id,{level:value,seen:Date.now()});setMessage('熟悉度已记录。');};
  const clearFilters=()=>{setQuery('');setLevel('all');setSelected([]);setUnclassified(false);resetPage();};
  const startReview=()=>{
    const queue=buildReviewQueue(data,filtered);
    if(!queue.length){setMessage('当前筛选下没有外链，请放宽筛选。');return;}
    setReview({queue,index:0,revealed:false,answers:{},thoughts:{},done:false,scope:selected.map(id=>data.tags.find(t=>t.id===id)?.name).concat(query?['搜索：'+query]:[],level!=='all'?['熟悉度：'+(level==='-1'?'还没看':levelNames[Number(level)])]:[],unclassified?['待分类']:[]).join(' · ')||'全部外链'});setMessage('');
  };
  const uniqueName=(name:string,exclude?:string)=>!data.tags.some(t=>t.id!==exclude&&t.name.toLowerCase()===name.toLowerCase());
  const createTag=(event:FormEvent)=>{
    event.preventDefault();const name=tagName.trim();
    if(!name||name.length>24||!uniqueName(name)){setMessage('请输入 1～24 个字符，标签名称不能重复。');return;}
    if(data.tags.length>=200){setMessage('最多保留 200 个标签，请先整理已有标签。');return;}
    const tag:Tag={id:'tag-'+crypto.randomUUID(),group:tagGroup,name};
    setData({...data,tags:[...data.tags,tag]});setManagedTag(tag.id);setRename(name);setTagName('');setMessage('标签已创建，可在卡片里勾选。');
  };
  const renameTag=(event:FormEvent)=>{
    event.preventDefault();const name=rename.trim();
    if(!name||name.length>24||!uniqueName(name,managedTag)){setMessage('请输入 1～24 个字符，标签名称不能重复。');return;}
    setData({...data,tags:data.tags.map(t=>t.id===managedTag?{...t,name}:t)});setMessage('所有外链上的标签名称已同步更新。');
  };
  const deleteTag=()=>{
    const tag=data.tags.find(t=>t.id===managedTag);if(!tag)return;
    const affected=entries.filter(e=>tagsFor(e).includes(managedTag));
    setDeleted({tag,links:affected.map(e=>e.id)});setData({...data,tags:data.tags.filter(t=>t.id!==managedTag),assignments:{...data.assignments,...Object.fromEntries(affected.map(e=>[e.id,tagsFor(e).filter(id=>id!==managedTag)]))}});
    setSelected(selected.filter(id=>id!==managedTag));setManagedTag('');setRename('');setMessage('标签已删除，外链仍然保留。可以撤销。');
  };
  const toggleAssignment=(entry:Entry,id:string)=>{
    const assigned=tagsFor(entry);setData({...data,assignments:{...data.assignments,[entry.id]:assigned.includes(id)?assigned.filter(x=>x!==id):[...assigned,id]}});setMessage('标签已更新。');
  };
  const undoDelete=()=>{
    if(!deleted)return;
    if(data.tags.some(t=>t.id===deleted.tag.id||t.name.toLowerCase()===deleted.tag.name.toLowerCase())){setMessage('已有同名标签，请先改名后再撤销。');return;}
    const assignments={...data.assignments};
    for(const id of deleted.links){const entry=entries.find(e=>e.id===id);if(entry)assignments[id]=[...new Set([...tagsFor(entry),deleted.tag.id])];}
    setData({...data,tags:[...data.tags,deleted.tag],assignments});setDeleted(null);setMessage('标签和分类已恢复。');
  };
  const exportBackup=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='luna-links-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('已导出熟悉度、笔记和标签备份。');
  };
  const importBackup=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{
      if(file.size>5_000_000)throw new Error('备份文件过大。');
      const imported=validateBackup(JSON.parse(await file.text()),entries);
      if(!window.confirm('导入会替换本浏览器中的熟悉度、笔记和标签。建议先导出当前备份。继续导入？'))return;
      setData(imported);setSelected([]);setReview(null);setPage(1);setDeleted(null);setManagedTag('');setRename('');setMessage('备份已导入。');
    }catch(error){setMessage(error instanceof Error?error.message:'无法读取备份文件。');}
  };
  const ratings=(entry:Entry,value:number,onChoose:(level:number)=>void,recall=false)=><div className="ll-ratings" role="group" aria-label={recall?'回忆结果':'熟悉度'}>{levelNames.map((name,i)=><button key={i} type="button" aria-pressed={value===i} onClick={()=>onChoose(i)}>{recall?['没想起','有点印象','想起来了'][i]:name}</button>)}</div>;
  const visit=(entry:Entry)=><a className="ll-button ll-quiet" href={entry.url} target="_blank" rel="noopener noreferrer" aria-label={'在新标签页访问 '+entry.name}>访问 ↗</a>;
  const details=(entry:Entry)=><div className="ll-details">
    <div><span className="ll-label">我的一句话理解</span><label><span className="ll-sr">{entry.name} 的笔记</span><textarea maxLength={2000} value={getRecord(data,entry.id).note} onChange={e=>updateRecord(entry.id,{note:e.target.value})} placeholder="它能做什么？我会在什么时候用到它？" /></label></div>
    <div><span className="ll-label">现在对它有多熟悉？</span>{ratings(entry,getRecord(data,entry.id).level,value=>setFamiliarity(entry.id,value))}</div>
    <details><summary>原帖推荐理由 · 已保存 {entry.reasons.length} 条{entry.votes!==null?` · ${entry.votes} 票推荐`:""}</summary><p className="ll-small">原帖经验可能有时效性；费用、DR 和收录效果以平台当前情况为准。{entry.recommendationTotal>entry.reasons.length?`原帖显示 ${entry.recommendationTotal} 条推荐理由，存档保存了其中 ${entry.reasons.length} 条理由。`:''}</p><ul className="ll-reasons">{entry.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul></details>
  </div>;

  return <section className="ll" aria-label="外链手册">
    <header className="ll-header"><p className="ll-kicker">LUNA / PERSONAL COLLECTION</p><h1>外链手册</h1><p className="ll-sub">收下来，也慢慢记住它。</p>
      <div className="ll-nav"><button aria-pressed={!review} onClick={()=>setReview(null)}>外链库</button><button aria-pressed={!!review} onClick={()=>review?setReview(review):startReview()}>复习 {Math.min(3,filtered.length)} 个 ↗</button></div>
    </header>
    <div className="ll-personal"><span className="ll-small">个人记录保存在当前浏览器，可导出备份。</span><div className="ll-actions"><button onClick={exportBackup} disabled={!ready}>导出备份</button><button onClick={()=>fileInput.current?.click()} disabled={!ready}>导入备份</button><input className="ll-sr" ref={fileInput} type="file" accept=".json,application/json" onChange={importBackup} aria-label="选择备份文件" /></div></div>
    {storageWarning&&<p role="alert" className="ll-warning">{storageWarning}</p>}
    <p className="ll-message" role="status" aria-live="polite">{message}</p>
    {review ? review.done ? <div className="ll-complete"><h2 ref={reviewHeading} tabIndex={-1}>又和它们熟悉了一点。</h2><p>复习了 {review.queue.length} 个，其中 {Object.values(review.answers).filter(v=>v===2).length} 个能自己想起用途。</p><ul>{review.queue.map(entry=><li key={entry.id}><span>{entry.name}</span><span>{['再熟悉一下','有点印象','想起来了'][review.answers[entry.id]]}</span></li>)}</ul><div className="ll-actions"><button onClick={()=>setReview(null)}>回外链库</button><button className="ll-primary" onClick={startReview}>再复习几个</button></div></div> : (()=>{
      const entry=review.queue[review.index],answer=review.answers[entry.id],thought=review.thoughts[entry.id]||'';
      return <div className="ll-review"><p className="ll-small">本轮范围：{review.scope}</p><div className="ll-review-meta"><span>优先复习还不熟悉的外链</span><span>{review.index+1} / {review.queue.length}</span></div><progress value={review.index} max={review.queue.length} aria-label="本轮已完成" />
        <article className="ll-review-card"><span className="ll-small">{entry.domain}</span><h2 ref={reviewHeading} tabIndex={-1}>{entry.name}</h2><h3>什么情况下，你会想到它？</h3><p className="ll-sub">先在心里想一句，再展开看看。</p>
          {!review.revealed?<><label><span className="ll-label">我的回忆（选填）</span><textarea maxLength={2000} value={thought} onChange={e=>setReview({...review,thoughts:{...review.thoughts,[entry.id]:e.target.value}})} placeholder="我记得它好像可以……" /></label><button className="ll-primary" onClick={()=>setReview({...review,revealed:true})}>看看说明 ↓</button></>:<>
            {thought&&<p className="ll-thought">刚才的回忆：{thought}</p>}
            <div className="ll-answer"><span className="ll-label">原帖中的说明</span><p>{entry.reasons[0]||'存档没有提供说明，可以先访问网站了解。'}</p>{getRecord(data,entry.id).note&&<p><span className="ll-label">我的笔记</span>{getRecord(data,entry.id).note}</p>}<div className="ll-tags">{tagsFor(entry).map(id=><span className="ll-tag" key={id}>{data.tags.find(t=>t.id===id)?.name}</span>)}</div></div>
            {visit(entry)}<span className="ll-label">刚才想起来了吗？</span>{ratings(entry,answer,value=>{setFamiliarity(entry.id,value);setReview({...review,answers:{...review.answers,[entry.id]:value}});},true)}
            <details className="ll-review-details"><summary>更多理由与我的笔记</summary>{details(entry)}</details>
          </>}
        </article><div className="ll-review-bottom"><button disabled={review.index===0} onClick={()=>setReview({...review,index:review.index-1,revealed:true})}>上一个</button><button className="ll-primary" disabled={answer===undefined} onClick={()=>setReview(review.index===review.queue.length-1?{...review,done:true}:{...review,index:review.index+1,revealed:false})}>{review.index===review.queue.length-1?'完成这轮':'下一个'}</button></div>
      </div>;
    })() : <>
      <div className="ll-toolbar"><label className="ll-search"><span className="ll-sr">搜索外链</span><input type="search" value={query} onChange={e=>{setQuery(e.target.value);resetPage();}} placeholder="搜索名称、标签、笔记或推荐理由" /></label><select aria-label="按熟悉度筛选" value={level} onChange={e=>{setLevel(e.target.value);resetPage();}}><option value="all">全部熟悉度</option><option value="-1">还没看</option>{levelNames.map((name,i)=><option value={i} key={i}>{name}</option>)}</select></div>
      <div className="ll-filter-heading"><span className="ll-small">按标签找外链 · 可以多选</span><div className="ll-actions">{(selected.length>0||unclassified)&&<button className="ll-quiet" onClick={()=>{setSelected([]);setUnclassified(false);resetPage();}}>清空标签筛选</button>}<button className="ll-quiet" aria-expanded={manager} onClick={()=>{setManager(!manager);setRename(data.tags.find(t=>t.id===managedTag)?.name||'');}}>管理标签</button></div></div>
      <div className="ll-filter-groups">{groups.map(group=><div className="ll-tag-row" key={group.id}><span>{group.name}</span><div className="ll-tags" role="group" aria-label={group.name+'筛选'}>{data.tags.filter(t=>t.group===group.id).map(tag=><button key={tag.id} className="ll-tag" aria-pressed={selected.includes(tag.id)} onClick={()=>toggleFilter(tag.id)}>{tag.name} <span>{entries.filter(entry=>tagsFor(entry).includes(tag.id)).length}</span></button>)}{group.id==='type'&&<button className="ll-tag" aria-pressed={unclassified} onClick={()=>{setUnclassified(!unclassified);resetPage();}}>待分类 {entries.filter(entry=>!hasType(entry)).length}</button>}</div></div>)}</div>
      <p className="ll-small ll-filter-tip">同组任选其一，跨组同时满足。初始标签按名称和原帖整理，可自行调整。</p>
      {manager&&<section className="ll-manager" aria-label="管理标签"><form onSubmit={createTag}><h2>新增标签</h2><div className="ll-form-row"><label><span className="ll-label">所属分组</span><select value={tagGroup} onChange={e=>setTagGroup(e.target.value as Tag['group'])}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><label><span className="ll-label">名称</span><input maxLength={24} required value={tagName} onChange={e=>setTagName(e.target.value)} placeholder="例如：SEO、摄影" /></label></div><button className="ll-primary" type="submit">创建标签</button></form>
        <form onSubmit={renameTag}><h2>整理已有标签</h2><label><span className="ll-label">选择标签</span><select value={managedTag} onChange={e=>{setManagedTag(e.target.value);setRename(data.tags.find(t=>t.id===e.target.value)?.name||'');}}><option value="">请选择</option>{data.tags.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label><span className="ll-label">修改名称</span><input maxLength={24} required value={rename} onChange={e=>setRename(e.target.value)} /></label><div className="ll-actions"><button type="submit" disabled={!managedTag}>保存名称</button><button type="button" disabled={!managedTag} onClick={deleteTag}>删除标签</button></div><p className="ll-small">删除会从关联外链上移除标签，保留所有外链。</p></form>{deleted&&<button onClick={undoDelete}>撤销刚才的删除</button>}</section>}
      <div className="ll-overview" aria-live="polite"><span>{filtered.length} 个外链 / 共 {entries.length} 个</span><span>{entries.filter(e=>getRecord(data,e.id).level===2).length} 个熟悉了</span></div>
      <div className="ll-list">{filtered.slice((currentPage-1)*pageSize,currentPage*pageSize).map(entry=><article key={entry.id} className="ll-card"><div className="ll-card-top"><div><h2>{entry.name}</h2><span className="ll-domain">{entry.domain}</span></div><span className={'ll-status '+(getRecord(data,entry.id).level===2?'ll-known':'')}>{getRecord(data,entry.id).level===-1?'还没看':levelNames[getRecord(data,entry.id).level]}</span></div>
        <div className="ll-tags ll-card-tags">{tagsFor(entry).map(id=><button key={id} className="ll-tag" aria-pressed={selected.includes(id)} onClick={()=>toggleFilter(id)}>{data.tags.find(t=>t.id===id)?.name}</button>)}{!hasType(entry)&&<span className="ll-small">待分类</span>}</div>
        <div className="ll-card-actions"><button className="ll-quiet" aria-expanded={editing===entry.id} onClick={()=>setEditing(editing===entry.id?null:entry.id)}>编辑标签</button><div className="ll-actions">{visit(entry)}<button aria-expanded={expanded===entry.id} onClick={()=>setExpanded(expanded===entry.id?null:entry.id)}>{expanded===entry.id?'收起':'了解一下'}</button></div></div>
        {editing===entry.id&&<div className="ll-tag-editor">{groups.map(group=><div className="ll-tag-row" key={group.id}><span>{group.name}</span><div className="ll-tags" role="group" aria-label={'编辑'+group.name}>{data.tags.filter(t=>t.group===group.id).map(tag=><button key={tag.id} className="ll-tag" aria-pressed={tagsFor(entry).includes(tag.id)} onClick={()=>toggleAssignment(entry,tag.id)}>{tagsFor(entry).includes(tag.id)?'✓ ':''}{tag.name}</button>)}</div></div>)}<button onClick={()=>setEditing(null)}>完成</button></div>}
        {expanded===entry.id&&details(entry)}
      </article>)}</div>
      {!filtered.length&&<div className="ll-empty"><p>没有匹配的外链，放宽筛选再试试。</p><button onClick={clearFilters}>清空全部筛选</button></div>}
      {filtered.length>pageSize&&<nav className="ll-pagination" aria-label="外链列表分页"><button disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>上一页</button><span>{currentPage} / {pages}</span><button disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>下一页</button></nav>}
      <footer className="ll-source"><p>来源：<a href={source} target="_blank" rel="noopener noreferrer">Web.Cafe「网站上线之后，你会去哪些地方提交外链？」</a></p><p>收集于 2026-11-06 · 保留 575 个平台、693 条存档可见的推荐理由。未展开的理由未包含在存档中。</p><p><a href={collectionDownload} download>下载外链列表 CSV</a></p></footer>
    </>}
  </section>;
}
