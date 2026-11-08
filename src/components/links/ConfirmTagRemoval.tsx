import { useEffect, useId, useRef } from 'react';

export default function ConfirmTagRemoval({ name, entryName, count, permanent = false, onCancel, onConfirm }: {
  name: string; entryName?: string; permanent?: boolean; count: number; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    cancel.current?.focus();
    return () => { if (element?.open) element.close(); };
  }, []);
  return <dialog ref={dialog} className="ll-confirm" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={titleId}>{permanent ? '彻底删除这个标签？' : entryName ? '移除这个外链上的标签？' : '将标签移入回收站？'}</h2>
    <p className="ll-confirm-name">「{name}」</p>
    <p id={descriptionId}>{permanent
      ? `将永久删除这个标签及原来的 ${count} 个外链关联，无法撤销或从回收站恢复。外链和笔记会保留，连接云端后会同步删除。`
      : entryName
      ? `将从「${entryName}」移除这个标签，标签本身仍保留。操作后可点击“撤销”。`
      : `这个标签关联了 ${count} 个外链。移入回收站后，可以连同原来的关联一起恢复，笔记会保留。`}</p>
    <div className="ll-actions"><button ref={cancel} type="button" onClick={onCancel}>取消，保留标签</button>
      <button className="ll-danger" type="button" onClick={onConfirm}>{permanent ? '确认彻底删除' : entryName ? '确认移除' : '移入回收站'}</button></div>
  </dialog>;
}
