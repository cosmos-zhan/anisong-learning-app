import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { downloadManager } from '../packages/core/download-manager';
import { DownloadsPage } from '../apps/web/src/downloads/DownloadsPage';
import { defaultCatalog, DEFAULT_SOURCE, PREVIOUS_DEMO_SOURCE, preferredSource } from '../packages/core/default-source';
vi.mock('../apps/web/src/bundled-audio.json', () => ({ default: { catalog: null, package: null } }));
beforeEach(() => { history.replaceState(null, '', '/#downloads'); localStorage.clear(); vi.stubGlobal('fetch', vi.fn(async()=>new Response(JSON.stringify(defaultCatalog())))); });
afterEach(() => vi.unstubAllGlobals());
it('migrates the previous example default while preserving a user-selected source', () => {
  expect(preferredSource()).toBe(DEFAULT_SOURCE);
  localStorage.setItem('anisong:mediaSource', PREVIOUS_DEMO_SOURCE);
  expect(preferredSource()).toBe(DEFAULT_SOURCE);
  localStorage.setItem('anisong:mediaSource', new URL('demo/catalog.json', location.href).href);
  expect(preferredSource()).toBe(DEFAULT_SOURCE);
  localStorage.setItem('anisong:mediaSource', 'https://mine.test/catalog.json');
  expect(preferredSource()).toBe('https://mine.test/catalog.json');
});
it('one click queues Haruhikage with no access dialog, token or manual source URL', async () => {
  const enqueue=vi.spyOn(downloadManager,'enqueue').mockImplementation(()=>{});
  render(<DownloadsPage onSaved={vi.fn()} onRemoved={vi.fn()} onOpen={vi.fn()} onExit={vi.fn()} onMaterials={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:/在线歌曲/}));
  await screen.findByRole('heading', { name: '春日影 · CRYCHIC' });
  await waitFor(()=>expect(fetch).toHaveBeenCalledWith(DEFAULT_SOURCE,expect.objectContaining({credentials:'same-origin'})));
  expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toBeUndefined();
  fireEvent.click(screen.getByRole('button', { name: '下载到本地' }));
  expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({id:'haruhikage-crychic'}),undefined);
  expect(screen.getByRole('tabpanel',{name:'下载任务'})).toBeVisible();
  expect(screen.queryByLabelText('访问码（私人素材源可选）')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('素材源地址')).not.toBeInTheDocument();
});
it('the default source settings contain no access-code input',async()=>{
  render(<DownloadsPage onSaved={vi.fn()} onRemoved={vi.fn()} onOpen={vi.fn()} onExit={vi.fn()} onMaterials={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:/下载源设置/}));
  expect(screen.getByLabelText('素材源地址')).toHaveValue(DEFAULT_SOURCE);
  expect(screen.queryByLabelText('访问码（私人素材源可选）')).not.toBeInTheDocument();
});
it('keeps source connection errors on source pages instead of unrelated workflows',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));
  render(<DownloadsPage onSaved={vi.fn()} onRemoved={vi.fn()} onOpen={vi.fn()} onExit={vi.fn()} onMaterials={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'在线歌曲'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('无法读取在线歌曲');
  fireEvent.click(screen.getByRole('button',{name:'返回上一页'}));
  await waitFor(()=>expect(screen.getByRole('heading',{name:'下载与导入'})).toBeVisible());
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'下载任务'}));
  expect(screen.queryByRole('alert')).toBeNull();
});
