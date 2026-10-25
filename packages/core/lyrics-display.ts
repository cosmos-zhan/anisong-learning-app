import type { LyricLine } from "./types";

export interface LyricsDisplay {
  romaji: boolean;
  translation: boolean;
  autoScroll: boolean;
}
const KEY = "anisong:lyricsDisplay";
export function lyricsDisplay(): LyricsDisplay {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return {
      romaji: typeof value?.romaji === "boolean" ? value.romaji : true,
      translation: typeof value?.translation === "boolean" ? value.translation : true,
      autoScroll: typeof value?.autoScroll === "boolean" ? value.autoScroll : true,
    };
  } catch { return { romaji: true, translation: true, autoScroll: true }; }
}
export function saveLyricsDisplay(value: LyricsDisplay): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(value)); return true; }
  catch { return false; }
}

/** Real media position in original-track seconds. Keep the last lyric on pause/end. */
export function currentLyric(lines: LyricLine[], position: number): number {
  if (!Number.isFinite(position)) return -1;
  let lo = 0, hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid].start <= position) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export function lyricScrollTop(top: number, height: number, viewport: number, total: number): number {
  const anchor = Math.min(viewport * 0.3, Math.max(0, (viewport - height) / 2));
  return Math.max(0, Math.min(Math.max(0, total - viewport), top - anchor));
}
