import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import allEntries from '../../data/external-links.json';
import { validateBackup, type LibraryData } from '../../lib/link-library';
import { cloudData, planSync, sameLibrary, type CloudLibrary, type SyncBase } from '../../lib/link-sync';

const endpoint = (import.meta.env.PUBLIC_LINK_SYNC_URL || '').replace(/\/$/, '');
const baseKey = 'luna-links-sync-base-v1';
const recoveryKey = 'luna-links-sync-recovery-v1';
type Recovery = { data: LibraryData; savedAt: string; source: 'local' | 'cloud' };
type Status = 'local' | 'checking' | 'signed-out' | 'syncing' | 'synced' | 'error' | 'conflict';
class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
async function api(path: string, init?: RequestInit) {
  const response = await fetch(endpoint + path, {
    ...init, credentials: 'include', signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body.error || '同步失败，请稍后重试。');
  return body;
}
function parseCloud(raw: CloudLibrary): CloudLibrary {
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 0 || (raw.data === null) !== (raw.revision === 0)) throw new Error('云端记录格式不正确，本机记录已保留。');
  return { ...raw, data: raw.data === null ? null : validateBackup(raw.data, allEntries) };
}
export function downloadLibrary(data: LibraryData, prefix = 'luna-links-backup') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useLibrarySync(data: LibraryData, setData: Dispatch<SetStateAction<LibraryData>>, ready: boolean) {
  const [status, setStatus] = useState<Status>(endpoint ? 'checking' : 'local');
  const [detail, setDetail] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<CloudLibrary | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const local = useRef(data);
  local.current = data;
  const base = useRef<SyncBase | null>(null);
  const authenticated = useRef(false);
  const inFlight = useRef(false);
  const blocked = useRef(false);
  const pending = useRef(false);
  const active = useRef(true);
  const schedule = useRef<() => void>(() => {});

  const remember = useCallback((snapshot: LibraryData, cloud: CloudLibrary) => {
    base.current = { data: snapshot, revision: cloud.revision };
    try { localStorage.setItem(baseKey, JSON.stringify({ endpoint, ...base.current })); }
    catch { /* The baseline is an optimization; losing it causes a safe conflict prompt. */ }
    setUpdatedAt(cloud.updatedAt);
  }, []);
  const markConflict = useCallback((cloud: CloudLibrary) => {
    blocked.current = true;
    setConflict(cloud);
    setStatus('conflict');
    setDetail('本机和云端都有不同的记录，请选择保留哪份。替换前会在本机保留一份恢复备份。');
  }, []);
  const fail = useCallback((error: unknown) => {
    if (!active.current) return;
    if (error instanceof ApiError && error.status === 401) {
      authenticated.current = false;
      blocked.current = false;
      setConflict(null);
      setConnected(false);
      setStatus('signed-out');
      setDetail(error.message === '同步密钥不正确。' ? error.message : '连接已过期，请重新输入同步密钥。本机改动已保留。');
    } else {
      setStatus('error');
      setDetail(error instanceof ApiError ? error.message : error instanceof Error && error.message.startsWith('云端记录') ? error.message : '暂时无法连接云端，改动仍保存在本机，恢复网络后可重试。');
    }
  }, []);
  const sync = useCallback(async () => {
    if (!endpoint || !authenticated.current || blocked.current || !active.current) return;
    if (inFlight.current) { pending.current = true; return; }
    inFlight.current = true;
    setBusy(true);
    setStatus('syncing');
    setDetail('');
    try {
      const cloud = parseCloud(await api('/library'));
      if (!active.current || !authenticated.current) return;
      const snapshot = local.current;
      const plan = planSync(snapshot, cloud, base.current);
      if (plan === 'conflict') { markConflict(cloud); return; }
      if (plan === 'pull') {
        const next = cloudData(cloud);
        local.current = next;
        setData(next);
        remember(next, cloud);
      } else if (plan === 'push') {
        const saved = parseCloud(await api('/library', { method: 'PUT', body: JSON.stringify({ data: snapshot, revision: cloud.revision }) }));
        if (!active.current || !authenticated.current) return;
        remember(snapshot, saved);
        if (!sameLibrary(local.current, snapshot)) pending.current = true;
      } else remember(snapshot, cloud);
      setStatus('synced');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try { markConflict(parseCloud(await api('/library'))); } catch (nextError) { fail(nextError); }
      } else fail(error);
    } finally {
      inFlight.current = false;
      if (active.current) {
        setBusy(false);
        if (pending.current && !blocked.current) { pending.current = false; schedule.current(); }
      }
    }
  }, [fail, markConflict, remember, setData]);
  schedule.current = () => { void sync(); };

  useEffect(() => {
    if (!ready || !endpoint) return;
    active.current = true;
    try {
      const raw = JSON.parse(localStorage.getItem(baseKey) || 'null');
      if (raw?.endpoint === endpoint && Number.isSafeInteger(raw.revision) && raw.revision >= 0) base.current = { revision: raw.revision, data: validateBackup(raw.data, allEntries) };
      const saved = JSON.parse(localStorage.getItem(recoveryKey) || 'null');
      if (saved?.endpoint === endpoint) setRecovery({ ...saved, data: validateBackup(saved.data, allEntries) });
    } catch { /* A damaged baseline never prevents reading the actual local library. */ }
    void api('/session').then(() => {
      if (!active.current) return;
      authenticated.current = true;
      setConnected(true);
      void sync();
    }).catch(error => {
      if (!active.current) return;
      if (error instanceof ApiError && error.status === 401) setStatus('signed-out');
      else fail(error);
    });
    const onFocus = () => { if (document.visibilityState === 'visible') void sync(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const poll = window.setInterval(onFocus, 30_000);
    return () => {
      active.current = false;
      window.clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [ready, sync, fail]);
  useEffect(() => {
    if (!ready || !connected || blocked.current) return;
    setStatus('syncing');
    const timer = window.setTimeout(() => { void sync(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [data, ready, connected, sync]);

  const connect = async (key: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await api('/session', { method: 'POST', body: JSON.stringify({ key }) });
      authenticated.current = true;
      setConnected(true);
      setDetail('');
      inFlight.current = false;
      await sync();
    } catch (error) { fail(error); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const disconnect = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await api('/session', { method: 'DELETE' });
      authenticated.current = false;
      blocked.current = false;
      setConnected(false);
      setConflict(null);
      setStatus('signed-out');
      setDetail('已断开云端同步，本机记录仍保留。');
    } catch (error) { fail(error); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const saveRecovery = (snapshot: LibraryData, source: Recovery['source']) => {
    const saved: Recovery = { data: snapshot, savedAt: new Date().toISOString(), source };
    try { localStorage.setItem(recoveryKey, JSON.stringify({ endpoint, ...saved })); }
    catch { throw new ApiError(400, '本机无法保存恢复备份，请先导出记录并腾出浏览器存储空间。'); }
    setRecovery(saved);
  };
  const resolve = async (keep: 'local' | 'cloud') => {
    if (!conflict || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const snapshot = local.current;
    try {
      if (keep === 'cloud') {
        const latest = parseCloud(await api('/library'));
        if (!sameLibrary(snapshot, local.current)) { markConflict(latest); setDetail('本机刚有新改动，请重新选择保留的记录。'); return; }
        saveRecovery(snapshot, 'local');
        const next = cloudData(latest);
        local.current = next;
        setData(next);
        remember(next, latest);
      } else {
        saveRecovery(cloudData(conflict), 'cloud');
        const saved = parseCloud(await api('/library', { method: 'PUT', body: JSON.stringify({ data: snapshot, revision: conflict.revision }) }));
        remember(snapshot, saved);
        if (!sameLibrary(snapshot, local.current)) pending.current = true;
      }
      blocked.current = false;
      setConflict(null);
      setStatus('synced');
      setDetail('已同步。替换前的记录可从“导出恢复备份”下载。');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try { markConflict(parseCloud(await api('/library'))); } catch (nextError) { fail(nextError); }
      } else fail(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (pending.current && !blocked.current) { pending.current = false; void sync(); }
    }
  };
  return { enabled: !!endpoint, status, detail, connected, busy, conflict, updatedAt, recovery, sync, connect, disconnect, resolve };
}
