import { useEffect, useRef, useState } from 'react';
import { isNative } from '../../../../packages/audio-native';
import { updates, type UpdateStatus } from '../../../../packages/audio-native/updates';
import { fetchReleases, selectUpdate, verifyUpdateInfo, RELEASES_PAGE, type AppUpdate } from '../../../../packages/core/updates';
import version from '../version.json';

const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export function AppUpdates() {
  const native = isNative();
  const [candidate, setCandidate] = useState<AppUpdate>();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', received: 0, total: 0 });
  const controller = useRef<AbortController | null>(null), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let pending = false;
    const poll = async () => {
      if (!native || pending) return;
      pending = true;
      try { const next = await updates.status(); if (mounted.current) setStatus(next); }
      catch { /* Checking updates remains available if the native bridge is temporarily unavailable. */ }
      finally { pending = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), 700);
    return () => { mounted.current = false; clearInterval(timer); controller.current?.abort(); };
  }, [native]);
  const check = async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), 20000);
    setBusy(true); setError(''); setMessage(''); setCandidate(undefined);
    try {
      const installed = native ? await updates.installed() : { version: version.appVersion };
      const releases = native ? (await updates.releases()).releases : await fetchReleases(request.signal);
      if (!mounted.current || request.signal.aborted) return;
      const next = selectUpdate(releases, installed.version);
      setCandidate(next); setMessage(next ? `发现新版本 ${next.version}` : '当前已是最新版本（包含 Alpha 测试版）。');
    } catch (e) { if (mounted.current) setError(request.signal.aborted ? '检查更新超时，请重试。' : e instanceof Error ? e.message : '无法检查更新，请检查网络。'); }
    finally { clearTimeout(timeout); if (mounted.current) setBusy(false); }
  };
  const download = async () => {
    if (!candidate) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const installed = await updates.installed();
      const { info } = await updates.buildInfo({ url: candidate.infoUrl });
      await updates.download(verifyUpdateInfo(candidate, info, installed));
      if (mounted.current) setStatus(await updates.status());
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '无法开始下载安装包。'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const install = async () => {
    setBusy(true); setError('');
    try {
      const result = await updates.install();
      if (mounted.current) setMessage(result.permissionRequired ? '请允许“安装未知应用”，返回后再点“安装更新”。' : '请在系统安装窗口确认更新。');
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '无法打开安装窗口。'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const active = status.state === 'downloading' || status.state === 'verifying';
  return <section className="settings-card app-updates" aria-label="应用更新">
    <h2>应用更新</h2><p className="helper">当前版本 {version.appVersion} · 包含 Alpha 测试版更新</p>
    <button className="primary" disabled={busy || active} onClick={() => void check()}>{busy ? '请稍候…' : '检查更新'}</button>
    {message && <p role="status" className="helper">{message}</p>}
    {(error || status.error) && <p role="alert" className="error">{error || status.error}</p>}
    {candidate && !active && status.state !== 'ready' && <div className="update-result">
      <p>{candidate.version} · {size(candidate.apk.size)}</p>
      {native ? <button disabled={busy} onClick={() => void download()}>下载安装包</button> : <a className="back-link" href={candidate.apk.browser_download_url} rel="noreferrer">下载 Android 安装包 ↗</a>}
      <a href={candidate.page} target="_blank" rel="noreferrer">查看更新说明 ↗</a>
    </div>}
    {active && <div role="status"><p>{status.state === 'verifying' ? '正在校验安装包…' : `正在下载 ${size(status.received)} / ${size(status.total)}`}</p>
      <progress aria-label="安装包下载进度" max={status.total || 1} value={status.received}/>
      <button onClick={() => void updates.cancel().then(() => updates.status()).then(setStatus).catch(() => setError('取消失败，请重试。'))}>取消下载更新</button>
    </div>}
    {status.state === 'ready' && <div><p role="status">安装包已下载并校验，可以覆盖安装。</p><button className="primary" disabled={busy} onClick={() => void install()}>安装更新</button></div>}
    <p className="helper">{native ? '安装由 Android 系统确认。下载期间请保持 App 开启；同签名覆盖更新会保留本机资料。' : '网页会随站点发布更新。Android 手机可在这里检查并下载安装包。'}</p>
    <a className="back-link" href={RELEASES_PAGE} target="_blank" rel="noreferrer">所有发布版本 ↗</a>
  </section>;
}
