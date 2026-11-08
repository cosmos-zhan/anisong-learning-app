import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { lyricScrollTop } from "../../../../packages/core/lyrics-display";

export function useLyricFollow(current: number, enabled: boolean, blocked: boolean, layoutKey: string) {
  const list = useRef<HTMLDivElement>(null);
  const [browsing, setBrowsing] = useState(false);
  const resume = useCallback(() => setBrowsing(false), []);
  const suspend = useCallback(() => { if (enabled) { const el = list.current; if (el) el.scrollTo?.({top: el.scrollTop, behavior: 'auto'}); setBrowsing(true); } }, [enabled]);
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
  const centerRef = useRef(center);
  centerRef.current = center;
  useLayoutEffect(() => { center(); }, [center, layoutKey]);
  useLayoutEffect(() => {
    const container = list.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    let width = container.clientWidth, height = container.clientHeight;
    const observer = new ResizeObserver(() => {
      if (width === container.clientWidth && height === container.clientHeight) return;
      width = container.clientWidth; height = container.clientHeight;
      centerRef.current(true);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  return { list, browsing, resume, suspend, center };
}
