import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppUpdates } from '../apps/web/src/components/AppUpdates';
import { RELEASES_PAGE } from '../packages/core/updates';
vi.mock('../packages/audio-native', () => ({ isNative: () => false }));
afterEach(() => vi.unstubAllGlobals());
it('checks releases on demand and offers the actual APK rather than the source ZIP', async () => {
  const tag = 'v99.0.0-alpha.1';
  const assets = [{ name: 'anisong-99.0.0-alpha.1-debug.apk', size: 10000000 }, { name: 'build-info.json', size: 900 }]
    .map(a => ({ ...a, state: 'uploaded', digest: `sha256:${'a'.repeat(64)}`, browser_download_url: `${RELEASES_PAGE}/download/${tag}/${a.name}` }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ tag_name: tag, draft: false, prerelease: true, assets, body:'## 本次更新\n\n- 页面导航更清晰\n\n## Android Alpha 测试版\n安装说明' }]))));
  render(<AppUpdates/>);
  expect(within(screen.getByRole('region',{name:'版本更新说明'})).getByText(/当前版本/)).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
  expect(await screen.findByRole('link', { name: /下载 Android 安装包/ })).toHaveAttribute('href', assets[0].browser_download_url);
  expect(screen.getByText('页面导航更清晰')).toBeVisible();
  expect(screen.queryByText('安装说明')).toBeNull();
});
it('shows network failure and leaves a retry available', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('无法连接更新服务')));
  render(<AppUpdates/>);
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('无法连接');
  expect(screen.getByRole('button', { name: '检查更新' })).toBeEnabled();
});
