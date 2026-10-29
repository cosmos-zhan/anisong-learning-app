import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import * as netease from '../packages/core/netease';
import { cachedSongCover, songCover, validNeteaseCover } from '../packages/core/song-cover';
import { Cover } from '../apps/web/src/components/Cover';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
it('only accepts verified NetEase artwork hosts and strips query credentials', () => {
  expect(validNeteaseCover('http://p1.music.126.net/example.jpg?secret=1')).toBe('https://p1.music.126.net/example.jpg');
  expect(validNeteaseCover('https://music.126.net.evil.test/a.jpg')).toBeNull();
  expect(validNeteaseCover('https://user:pass@music.126.net/a.jpg')).toBeNull();
  expect(validNeteaseCover('javascript:alert(1)')).toBeNull();
});
it('loads existing NetEase song artwork by exact id, deduplicates and caches it', async () => {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  const fetcher = vi.spyOn(netease, 'nativeNeteaseFetch').mockResolvedValue(new Response(JSON.stringify({ songs: [{ id: 123, album: { picUrl: 'http://p1.music.126.net/cover.jpg' } }] }), { status: 200 }));
  const [a,b] = await Promise.all([songCover('netease-123'), songCover('netease-123')]);
  expect(a).toBe('https://p1.music.126.net/cover.jpg'); expect(b).toBe(a); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(cachedSongCover('netease-123')).toBe(a);
  expect(String(fetcher.mock.calls[0][0])).toContain('id=123');
});
it('renders artwork and falls back when the image fails; other songs remain placeholders', async () => {
  const ui = render(<Cover id="haruhikage-crychic" title="春日影" />);
  const img = document.querySelector('.art-cover img'); expect(img).toBeTruthy();
  fireEvent.error(img!); expect(document.querySelector('.art-cover img')).toBeNull();
  expect(screen.getByText('♪')).toBeInTheDocument();
  ui.rerender(<Cover id="demo-original" title="原创" />);
  await waitFor(() => expect(document.querySelector('.art-cover img')).toBeNull());
});
it('does not fetch by guessed title or render an unrelated response', async () => {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  const fetcher = vi.spyOn(netease, 'nativeNeteaseFetch').mockResolvedValue(new Response(JSON.stringify({songs:[{id:456,al:{picUrl:'https://p1.music.126.net/a.jpg'}}]})));
  expect(await songCover('local-song')).toBeNull();
  expect(await songCover('netease-123')).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
});
