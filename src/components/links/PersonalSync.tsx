import { useState, type FormEvent } from 'react';
import { downloadLibrary, type useLibrarySync } from './useLibrarySync';

const labels = { local: '仅保存在此浏览器', checking: '正在检查云端连接…', 'signed-out': '尚未连接个人云端', syncing: '正在同步…', synced: '已同步到个人云端', error: '云端同步未完成', conflict: '有两份不同的记录待确认' };

export default function PersonalSync({ sync }: { sync: ReturnType<typeof useLibrarySync> }) {
  const [showForm, setShowForm] = useState(false);
  const [key, setKey] = useState('');
  if (!sync.enabled) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const secret = key;
    setKey('');
    await sync.connect(secret);
  };
  return <div className="ll-sync" aria-label="个人云端同步">
    <div className="ll-personal">
      <div><p className="ll-small" role="status" aria-live="polite">{labels[sync.status]}</p>
        {sync.updatedAt && sync.connected && <p className="ll-small">云端更新于 {new Date(sync.updatedAt).toLocaleString('zh-CN')}</p>}
      </div>
      <div className="ll-actions">
        {sync.connected ? <><button disabled={sync.busy || !!sync.conflict} onClick={() => void sync.sync()}>立即同步</button><button disabled={sync.busy} onClick={() => void sync.disconnect()}>断开同步</button></> : <button disabled={sync.busy || sync.status === 'checking'} aria-expanded={showForm} onClick={() => setShowForm(!showForm)}>连接个人云端</button>}
      </div>
    </div>
    {!sync.connected && showForm && <form className="ll-sync-form" onSubmit={submit}>
      <label><span className="ll-label">个人同步口令</span><input type="password" autoComplete="off" required maxLength={256} value={key} onChange={event => setKey(event.target.value)} placeholder="输入你的同步口令" /></label>
      <button type="submit" disabled={sync.busy}>连接</button>
      <p className="ll-small">仅供你本人使用。在其他设备输入相同口令即可同步自定义外链、标签、笔记和外链日志；本机记录会继续保留。</p>
    </form>}
    {sync.detail && <p className={sync.status === 'error' || sync.conflict ? 'll-warning' : 'll-small'} role={sync.status === 'error' ? 'alert' : 'status'}>{sync.detail}</p>}
    {sync.conflict && <div className="ll-sync-conflict">
      <p className="ll-small">首次连接或离线编辑可能产生差异。选择一份后会继续自动同步。</p>
      <div className="ll-actions"><button disabled={sync.busy} onClick={() => void sync.resolve('cloud')}>保留云端，备份本机</button><button disabled={sync.busy} onClick={() => void sync.resolve('local')}>保留本机，备份云端</button></div>
    </div>}
    {sync.recovery && <button className="ll-recovery" onClick={() => downloadLibrary(sync.recovery!.data, 'luna-links-before-sync')}>导出恢复备份（{sync.recovery.source === 'local' ? '本机' : '云端'} · {new Date(sync.recovery.savedAt).toLocaleString('zh-CN')}）</button>}
    {sync.connected && <p className="ll-small">日志保存后自动同步；笔记等输入停止后自动同步；断网时先保存在本机。</p>}
  </div>;
}
