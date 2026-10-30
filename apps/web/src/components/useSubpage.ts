import { useCallback, useEffect, useState } from 'react';

/** Nested pages stay in the same mounted workflow and have real Back history. */
export function useSubpage<T extends string>(key: string, initial: T) {
  const [page, setPage] = useState<T>(() => (history.state?.[key] as T | undefined) ?? initial);
  useEffect(() => {
    const onPop = (event: PopStateEvent) => setPage((event.state?.[key] as T | undefined) ?? initial);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [key, initial]);
  const open = useCallback((next: T) => {
    if (next === page) return;
    history.pushState({ ...history.state, [key]: next }, '', location.href);
    setPage(next);
  }, [key, page]);
  const back = useCallback(() => {
    if (history.state?.[key]) history.back();
    else setPage(initial);
  }, [key, initial]);
  const replace = useCallback((next: T) => {
    history.replaceState({ ...history.state, [key]: next }, '', location.href);
    setPage(next);
  }, [key]);
  return { page, open, back, replace };
}
