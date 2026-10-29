import { Capacitor } from '@capacitor/core';
import { nativeNeteaseFetch } from './netease';

// This is the existing CRYCHIC image reference used by the standalone player.
const crychicCover = 'https://storage.moegirl.org.cn/moegirl/commons/0/00/Haruhikage%28Crychic%29.png';
const cachePrefix = 'anisong:cover:v1:';
const pending = new Map<string, Promise<string | null>>();
let running = 0;
const waiting: (() => void)[] = [];

export function validNeteaseCover(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !/^(?:[a-z0-9-]+\.)*music\.126\.net$/i.test(url.hostname)) return null;
    url.protocol = 'https:'; url.search = ''; url.hash = '';
    return url.href;
  } catch { return null; }
}
export function cachedSongCover(id: string): string | null {
  if (id === 'haruhikage-crychic') return crychicCover;
  if (!/^netease-\d{1,20}$/.test(id)) return null;
  try { return validNeteaseCover(localStorage.getItem(cachePrefix + id)); } catch { return null; }
}
async function acquire() {
  if (running >= 4) await new Promise<void>(resolve => waiting.push(resolve));
  running++;
}
function release() { running--; waiting.shift()?.(); }
/** Existing NetEase imports can recover artwork from their exact song ID. */
export function songCover(id: string): Promise<string | null> {
  const cached = cachedSongCover(id);
  if (cached) return Promise.resolve(cached);
  const match = /^netease-(\d{1,20})$/.exec(id);
  if (!match || !Capacitor.isNativePlatform()) return Promise.resolve(null);
  const existing = pending.get(id); if (existing) return existing;
  const task = (async () => {
    await acquire();
    try {
      const songId = match[1];
      const response = await nativeNeteaseFetch(`https://music.163.com/api/song/detail/?id=${songId}&ids=%5B${songId}%5D`, { headers: { Accept: 'application/json', Referer: 'https://music.163.com/' }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) return null;
      const data = await response.json() as { songs?: { id?: number | string; album?: { picUrl?: unknown }; al?: { picUrl?: unknown } }[] };
      const song = data.songs?.find(row => String(row.id) === songId);
      const cover = validNeteaseCover(song?.album?.picUrl ?? song?.al?.picUrl);
      if (cover) { try { localStorage.setItem(cachePrefix + id, cover); } catch { /* Display for this session. */ } }
      return cover;
    } catch { return null; } finally { release(); pending.delete(id); }
  })();
  pending.set(id, task); return task;
}
