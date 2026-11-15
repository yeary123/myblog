import { useEffect, useRef, useState, type RefObject } from 'react';
import { canResumeReading, parseReadingPosition, readingKey, type ReadingPosition, type ReadingView } from '../../lib/reading-position';

export function useReadingPosition({ viewKey, ready, active, view, root, onRestore }: {
  viewKey: string; ready: boolean; active: boolean; view: ReadingView;
  root: RefObject<HTMLElement | null>; onRestore: (position: ReadingPosition) => void;
}) {
  const current = useRef({ view, onRestore });
  current.current = { view, onRestore };
  const pending = useRef<ReadingPosition | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [restored, setRestored] = useState(false);
  const [warning, setWarning] = useState('');
  const settled = useRef(false);
  const scheduleSave = useRef<() => void>(() => {});

  useEffect(() => {
    if (!ready || !active) return;
    // Explicit chapter/platform links take precedence over a saved reading position.
    try {
      const saved = parseReadingPosition(JSON.parse(localStorage.getItem(readingKey(viewKey)) || 'null'));
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (saved && canResumeReading(saved, window.location.hash, navigation?.type ?? 'navigate')) {
        pending.current = saved;
        current.current.onRestore(saved);
        setRestored(true);
      }
    } catch { /* An unavailable or invalid position never blocks the library. */ }
    setLoaded(true);
  }, [ready, active, viewKey]);

  useEffect(() => {
    if (!loaded || !active) return;
    const previous = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstFrame = 0, secondFrame = 0;
    settled.current = false;
    const save = () => {
      if (!settled.current || !root.current || root.current.dataset.readingActive !== 'true') return;
      const card = [...root.current.querySelectorAll<HTMLElement>('[data-entry-id]')].find(element => {
        const rect = element.getBoundingClientRect();
        return rect.height > 0 && rect.bottom > 0 && rect.top <= 128;
      });
      const position: ReadingPosition = { version: 1, ...current.current.view, hash: location.hash, scrollY: window.scrollY, entryId: card?.dataset.entryId ?? null, entryOffset: card?.getBoundingClientRect().top ?? 0, updatedAt: Date.now() };
      try { localStorage.setItem(readingKey(viewKey), JSON.stringify(position)); setWarning(''); }
      catch { setWarning('浏览器未能保存阅读位置，请检查存储空间或隐私设置。'); }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 250);
    };
    scheduleSave.current = schedule;
    const onVisibility = () => { if (document.visibilityState === 'hidden') save(); };
    const onClick = (event: MouseEvent) => { if ((event.target as Element | null)?.closest('a[href]')) save(); };
    // Let the restored filters/page and font metrics render before positioning the viewport.
    void document.fonts.ready.then(() => {
      if (disposed) return;
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          if (disposed) return;
          const position = pending.current;
          if (position) {
            const card = [...(root.current?.querySelectorAll<HTMLElement>('[data-entry-id]') ?? [])].find(element => element.dataset.entryId === position.entryId && element.getBoundingClientRect().height > 0);
            const offset = card ? Math.max(position.entryOffset, -card.getBoundingClientRect().height + 24) : 0;
            window.scrollTo({ top: card ? window.scrollY + card.getBoundingClientRect().top - offset : position.scrollY, behavior: 'instant' });
            pending.current = null;
          }
          settled.current = true;
          save();
        });
      });
    });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('click', onClick, true);
    return () => {
      save();
      disposed = true;
      scheduleSave.current = () => {};
      clearTimeout(timer);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('click', onClick, true);
      history.scrollRestoration = previous;
    };
  }, [active, loaded, root, viewKey]);

  useEffect(() => {
    if (!loaded || !active || !settled.current) return;
    // A page/filter change may occur without scrolling.
    scheduleSave.current();
  }, [active, loaded, view.page, view.query, view.tagIds, view.fee, view.sectionId]);

  return { restored, warning };
}
