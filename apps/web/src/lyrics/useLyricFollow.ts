import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { lyricScrollTop } from "../../../../packages/core/lyrics-display";

export function useLyricFollow(current: number, enabled: boolean, blocked: boolean, layoutKey: string) {
  const list = useRef<HTMLDivElement>(null);
  const [browsing, setBrowsing] = useState(false);
  const resume = useCallback(() => setBrowsing(false), []);
  const suspend = useCallback(() => { if (enabled) setBrowsing(true); }, [enabled]);
  const center = useCallback((instant = false) => {
    const container = list.current;
    if (!container || !enabled || blocked || browsing || current < 0) return;
    const row = container.querySelector<HTMLElement>(`[data-line="${current}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    const target = lyricScrollTop(top, row.offsetHeight, container.clientHeight, container.scrollHeight);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo?.({ top: target, behavior: instant || reduce ? "auto" : "smooth" });
  }, [current, enabled, blocked, browsing]);
  useLayoutEffect(() => { center(); }, [center, layoutKey]);
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => center(true));
    if (list.current) observer.observe(list.current);
    return () => observer.disconnect();
  }, [center]);
  return { list, browsing, resume, suspend, center };
}
