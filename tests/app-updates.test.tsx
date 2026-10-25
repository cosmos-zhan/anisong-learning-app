import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppUpdates } from '../apps/web/src/components/AppUpdates';
import { RELEASES_PAGE } from '../packages/core/updates';
vi.mock('../packages/audio-native', () => ({ isNative: () => false }));
afterEach(() => vi.unstubAllGlobals());
it('checks releases on demand and offers the actual APK rather than the source ZIP', async () => {
  const tag = 'v99.0.0-alpha.1';
  const assets = [{ name: 'anisong-99.0.0-alpha.1-debug.apk', size: 10000000 }, { name: 'build-info.json', size: 900 }]
    .map(a => ({ ...a, state: 'uploaded', digest: `sha256:${'a'.repeat(64)}`, browser_download_url: `${RELEASES_PAGE}/download/${tag}/${a.name}` }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ tag_name: tag, draft: false, prerelease: true, assets }]))));
  render(<AppUpdates/>);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
  expect(await screen.findByRole('link', { name: /下载 Android 安装包/ })).toHaveAttribute('href', assets[0].browser_download_url);
});
it('shows network failure and leaves a retry available', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('无法连接更新服务')));
  render(<AppUpdates/>);
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('无法连接');
  expect(screen.getByRole('button', { name: '检查更新' })).toBeEnabled();
});
