import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const bridge = vi.hoisted(() => ({
  installed: vi.fn(), releases: vi.fn(), status: vi.fn(), buildInfo: vi.fn(), download: vi.fn(), install: vi.fn(), cancel: vi.fn(),
}));
vi.mock('../packages/audio-native', () => ({ isNative: () => true }));
vi.mock('../packages/audio-native/updates', () => ({ updates: bridge }));
vi.mock('../apps/web/src/version.json', () => ({ default: { appVersion: '0.6.8-alpha.1' } }));
import { AppUpdates } from '../apps/web/src/components/AppUpdates';
import { RELEASES_PAGE } from '../packages/core/updates';
const oldHash = 'a'.repeat(64), newHash = 'b'.repeat(64), signer = 'c'.repeat(64);
const tag = 'v0.6.9-alpha.1', version = tag.slice(1), apkName = `anisong-${version}-debug.apk`, size = 10000000;
const asset = (name: string, bytes: number) => ({ name, state: 'uploaded', size: bytes, digest: `sha256:${newHash}`, browser_download_url: `${RELEASES_PAGE}/download/${tag}/${name}` });
const installed = { version: '0.6.8-alpha.1', versionCode: 2026102701, signerSha256: signer };
const info = { repository: 'cosmos-zhan/anisong-learning-app', tag, version, apkName, apkSha256: newHash, signerSha256: signer, versionCode: 2026102801, publicMediaOnly: true };
beforeEach(() => {
  vi.clearAllMocks();
  bridge.installed.mockResolvedValue(installed);
  bridge.releases.mockResolvedValue({ releases: [{ tag_name: tag, draft: false, prerelease: true, assets: [asset(apkName, size), asset('build-info.json', 1000)] }] });
  bridge.buildInfo.mockResolvedValue({ info });
  bridge.status.mockResolvedValue({ state: 'ready', received: size, total: size, sha256: oldHash, versionCode: installed.versionCode });
});
it('does not present an older cached APK as the newly discovered release and offers an actual download', async () => {
  bridge.download.mockImplementation(async () => { bridge.status.mockResolvedValue({ state: 'ready', received: size, total: size, sha256: newHash, versionCode: info.versionCode }); });
  bridge.install.mockResolvedValue({ permissionRequired: false });
  render(<AppUpdates/>);
  await waitFor(() => expect(bridge.status).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: '安装更新' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
  expect(await screen.findByText('发现新版本 0.6.9-alpha.1')).toBeVisible();
  expect(screen.queryByRole('button', { name: '安装更新' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '下载安装包' }));
  const install = await screen.findByRole('button', { name: '安装更新' });
  expect(bridge.download).toHaveBeenCalledWith(expect.objectContaining({ sha256: newHash, versionCode: info.versionCode }));
  fireEvent.click(install);
  await waitFor(() => expect(bridge.install).toHaveBeenCalledTimes(1));
});
it('a stale or incomplete ready status never hides the download button', async () => {
  bridge.status.mockResolvedValue({ state: 'ready', received: size, total: size });
  render(<AppUpdates/>);
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
  expect(await screen.findByRole('button', { name: '下载安装包' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '安装更新' })).toBeNull();
});
it('an installed cached release is not shown after checking when no newer version exists', async () => {
  bridge.installed.mockResolvedValue({ ...installed, version, versionCode: info.versionCode });
  bridge.status.mockResolvedValue({ state: 'idle', received: 0, total: 0 });
  render(<AppUpdates/>);
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
  expect(await screen.findByText('当前已是最新版本（包含 Alpha 测试版）。')).toBeVisible();
  expect(screen.queryByRole('button', { name: '安装更新' })).toBeNull();
});
