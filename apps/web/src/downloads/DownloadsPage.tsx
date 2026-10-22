import { useEffect, useRef, useState } from "react";
import { downloadSong, loadCatalog, type MediaCatalog, type DownloadProgress, type RemoteSong } from "../../../../packages/core/downloads";
import { materialStore, type LocalMaterial } from "../../../../packages/core/app-state";
import media from "../bundled-audio.json";
import "./downloads.css";
const size = (bytes:number) => bytes < 1024*1024 ? `${Math.ceil(bytes/1024)} KB` : `${(bytes/1024/1024).toFixed(1)} MB`;
export function DownloadsPage({onSaved,onOpen}:{onSaved:(row:LocalMaterial)=>void;onOpen:(id:string,title:string)=>void}) {
  const [address,setAddress]=useState(()=>{try{return localStorage.getItem('anisong:mediaSource')??'';}catch{return '';}});
  const [catalog,setCatalog]=useState<MediaCatalog>();
  const [records,setRecords]=useState<LocalMaterial[]>([]);
  const [busy,setBusy]=useState(false),[active,setActive]=useState('');
  const [progress,setProgress]=useState<DownloadProgress>(),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const request=useRef<AbortController|null>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;void materialStore.all().then(rows=>{if(mounted.current)setRecords(rows.filter(r=>r.download));}).catch(()=>setError('无法读取本地下载记录。'));return()=>{mounted.current=false;request.current?.abort();};},[]);
  const run = async (action:(signal:AbortSignal)=>Promise<void>) => {
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setBusy(true);setError('');setNotice('');
    const timeout=setTimeout(()=>controller.abort(new Error('下载超时，请检查网络后重试。')),120000);
    try{await action(controller.signal);}catch(e){if(mounted.current){setError(controller.signal.aborted?(controller.signal.reason instanceof Error&&controller.signal.reason.name!=='AbortError'?controller.signal.reason.message:'已取消，原有本地资料已保留。'):(e instanceof DOMException&&e.name==='QuotaExceededError'?'本地空间不足，原有资料已保留。请清理设备空间后重试。':e instanceof TypeError?'无法连接素材源。请检查网络、访问权限和素材服务的跨域设置。':(e as Error).message));}}
    finally{clearTimeout(timeout);if(mounted.current&&request.current===controller){setBusy(false);setActive('');setProgress(undefined);}}
  };
  const read = (url:string) => {setCatalog(undefined);void run(async signal=>{const next=await loadCatalog(url,signal);if(!mounted.current||signal.aborted)return;setCatalog(next);setAddress(url);try{localStorage.setItem('anisong:mediaSource',url);}catch{/* URL preference is optional. */}});};
  const download = (song:RemoteSong) => {setActive(song.id);void run(async signal=>{
    const row=await downloadSong(song,signal,p=>{if(mounted.current)setProgress(p);});
    if(!mounted.current)return;
    setRecords(previous=>[row,...previous.filter(r=>r.download?.songId!==song.id)]);
    onSaved(row);setNotice('已下载并保存到此设备，可以离线练习。');
  });};
  return <div className="downloads-page">
    <div className="page-heading"><div><p className="eyebrow">保存一次，随时练习</p><h1>在线素材</h1></div></div>
    <form className="download-source" onSubmit={e=>{e.preventDefault();read(address.trim());}}>
      <label>素材源地址<input type="url" required value={address} onChange={e=>setAddress(e.target.value)} disabled={busy} placeholder="https://…/catalog.json" /></label>
      <button className="primary" disabled={busy||!address.trim()}>查看歌曲</button>
      {media.catalog&&<button type="button" disabled={busy} onClick={()=>read(new URL(`${import.meta.env.BASE_URL}${media.catalog}`,location.href).href)}>下载本站私人练习素材</button>}
      <button type="button" disabled={busy} onClick={()=>read(new URL(`${import.meta.env.BASE_URL}demo/catalog.json`,location.href).href)}>试用原创示例源</button>
    </form>
    <p className="helper">下载音频、歌词和乐谱到本地。更新应用后继续使用；清除数据或卸载应用会删除本地素材。</p>
    {busy&&<div className="download-progress" role="status"><strong>{progress?.phase??'读取歌曲目录…'}</strong>{progress&&<><progress aria-label="素材下载进度" max={progress.total} value={progress.received}/><span>{size(progress.received)} / {size(progress.total)}</span></>}<button onClick={()=>request.current?.abort()}>取消下载</button></div>}
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="download-notice" role="status">{notice}</p>}
    {catalog&&<section aria-label="在线歌曲列表"><h2>{catalog.title}</h2>{catalog.songs.map(song=>{
      const saved=records.find(r=>r.download?.songId===song.id)?.download;
      const total=song.audio.bytes+(song.lyrics?.bytes??0)+(song.score?.bytes??0);
      return <article className="download-row" key={song.id}><div><h3>{song.title}</h3><p>{['音频',song.lyrics&&'歌词',song.score&&'乐谱'].filter(Boolean).join(' · ')} · {size(total)}</p><small>{saved?(saved.revision===song.revision?'已下载到此设备':'本地有旧版，可更新'):`素材版本 ${song.revision}`}</small></div><button className="primary" disabled={busy} onClick={()=>download(song)}>{active===song.id?'下载中…':saved?'重新下载并替换':'下载到本地'}</button></article>;
    })}<p className="helper">重新下载会替换此歌曲对应的素材；练习设置保留。</p></section>}
    <section aria-label="本地下载"><h2>本地下载</h2>{records.length?records.map(row=><button className="download-local" key={row.id} disabled={busy} onClick={()=>onOpen(row.download!.songId,row.download!.title)}><strong>{row.download!.title}</strong><span>{size(row.download!.bytes)} · 已保存 · 开始练习 ›</span></button>):<p className="helper">还没有下载的素材。可以先试用原创示例源。</p>}</section>
    <section className="download-storage"><h2>本地保存</h2><p className="helper">网页素材属于当前站点，换域名不会自动迁移。Android 覆盖更新须使用同包名、同签名；请保留旧版。</p><button onClick={()=>{if(!navigator.storage?.persist){setNotice('当前环境未提供持久存储保护，建议保留原文件。');return;}void navigator.storage.persist().then(ok=>setNotice(ok?'已获得持久存储保护。清除数据或卸载仍会删除。':'浏览器未授予持久存储，素材目前已保存，建议保留原文件。')).catch(()=>setNotice('当前环境未提供持久存储保护，建议保留原文件。'));}}>申请持久存储保护</button></section>
  </div>;
}
