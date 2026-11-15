import type { Tag } from '../../lib/link-library';

export default function TagSettings({ tags, countFor, onWebsiteChange }: {
  tags: Tag[]; countFor: (id: string) => number; onWebsiteChange: (tag: Tag, website: boolean) => void;
}) {
  if (!tags.length) return null;
  return <details className="ll-tag-settings">
    <summary>管理标签 · 设置网站标签</summary>
    <p className="ll-small">勾选已有的网站名称标签即可，原来的标签和外链关联都会保留。网站标签与一个外链的关联计为 1 条成功发布；取消标记或移除关联后不再计数。</p>
    <ul>{tags.map(tag=><li key={tag.id}><div><strong>{tag.name}</strong><span className="ll-small">已关联 {countFor(tag.id)} 个外链</span></div><label className="ll-checkbox"><input type="checkbox" aria-label={`将 ${tag.name} 设为网站标签`} checked={!!tag.website} onChange={event=>onWebsiteChange(tag,event.target.checked)} />网站标签</label></li>)}</ul>
  </details>;
}
