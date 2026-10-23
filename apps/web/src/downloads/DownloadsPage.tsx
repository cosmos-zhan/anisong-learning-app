import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { loadCatalog, sourceAccess, type SourceAccess, type MediaCatalog, type DownloadProgress } from "../../../../packages/core/downloads";
import { PRIVATE_SOURCE, preferredSource, defaultCatalog, isDefaultSource } from "../../../../packages/core/default-source";
import { downloadManager } from "../../../../packages/core/download-manager";
import { materialStore, type LocalMaterial } from "../../../../packages/core/app-state";
import { importMediaPackage } from "../../../../packages/core/media-package";
import media from "../bundled-audio.json";
import "./downloads.css";
const size=(bytes:number)=>bytes<1024*1024?`${Math.ceil(bytes/1024)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;
const sample=()=>new URL(`${import.meta.env.BASE_URL}demo/catalog.json`,location.href).href;
const defaultSource=()=>media.catalog?new URL(`${import.meta.env.BASE_URL}${media.catalog}`,location.href).href:PRIVATE_SOURCE;
const running=(status:string)=>['queued','downloading','cancelling'].includes(status);
type Destination='lyrics'|'piano-prep';
export function DownloadsPage({onSaved,onRemoved,onOpen}:{onSaved:(row:LocalMaterial)=>void;onRemoved:(id:string)=>void;onOpen:(id:string,title:string,destination?:Destination)=>void}) {
  const [tab,setTab]=useState<'songs'|'tasks'|'local'>('songs');
  const [address,setAddress]=useState(()=>preferredSource(media.catalog?defaultSource():null));
  const [catalog,setCatalog]=useState<MediaCatalog|undefined>(()=>isDefaultSource(address)?defaultCatalog():undefined),[records,setRecords]=useState<LocalMaterial[]>([]);
  const [token,setToken]=useState(''),[sourceOpen,setSourceOpen]=useState(false),[loading,setLoading]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState(''),[removing,setRemoving]=useState('');
  const [importing,setImporting]=useState(false),[importProgress,setImportProgress]=useState<DownloadProgress>();
  const [deleting,setDeleting]=useState(false);
  const access=useRef<SourceAccess|undefined>(undefined),request=useRef<AbortController|null>(null),importRequest=useRef<AbortController|null>(null),mounted=useRef(true),pendingSong=useRef<string|null>(null);
  const codeInput=useRef<HTMLInputElement>(null);
  const tasks=useSyncExternalStore(downloadManager.subscribe,downloadManager.snapshot);
  const active=tasks.filter(t=>running(t.status)),finished=tasks.filter(t=>!running(t.status));
  const privatePackage=media.package as {src:string;bytes:number}|null;
  useEffect(()=>{
    mounted.current=true;
    void materialStore.all().then(rows=>{if(mounted.current)setRecords(rows.filter(r=>r.download));}).catch(()=>{if(mounted.current)setError('无法读取本地下载记录。');});
    const stop=downloadManager.onSaved(row=>{if(mounted.current){setRecords(previous=>[row,...previous.filter(r=>r.download?.songId!==row.download?.songId)]);setNotice('已下载并保存到此设备，可以离线练习。');}});
    return()=>{mounted.current=false;request.current?.abort();importRequest.current?.abort();stop();};
  },[]);
  const read=async(url:string,code=token,activate=true)=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setLoading(true);setError('');if(!isDefaultSource(url))setCatalog(undefined);access.current=undefined;
    const timeout=setTimeout(()=>controller.abort(new Error('读取歌曲列表超时，请检查网络后重试。')),30000);
    try{
      const auth=sourceAccess(url,code);
      const next=isDefaultSource(url)&&!auth?defaultCatalog():await loadCatalog(url,controller.signal,auth);
      if(!mounted.current||controller.signal.aborted)return;
      access.current=auth;setCatalog(next);setAddress(url);
      if(pendingSong.current&&auth){const chosen=next.songs.find(s=>s.id===pendingSong.current);if(!chosen)throw new Error('素材源中没有这首歌曲，请刷新后重试。');downloadManager.enqueue(chosen,auth);pendingSong.current=null;setTab('tasks');setSourceOpen(false);setNotice('');}
      else if(activate)setTab('songs');
      try{localStorage.setItem('anisong:mediaSource',url);}catch{/* Source preference is optional. */}
    }catch(e){if(mounted.current&&request.current===controller){if(!controller.signal.aborted)setError(e instanceof TypeError?'无法读取在线歌曲，请检查网络和素材源权限。已下载歌曲仍可使用。':(e as Error).message);else if(controller.signal.reason instanceof Error&&controller.signal.reason.name!=='AbortError')setError(controller.signal.reason.message);}}
    finally{clearTimeout(timeout);if(mounted.current&&request.current===controller)setLoading(false);}
  };
  useEffect(()=>{void read(address,'',false);},[]); // Loading a source must not override a tab selected meanwhile.
  const importPackage=async(file:File)=>{
    const controller=new AbortController();importRequest.current=controller;setImporting(true);setError('');setNotice('');
    try{
      const row=await importMediaPackage(file,controller.signal,p=>{if(mounted.current)setImportProgress(p);});
      if(!mounted.current)return;
      setRecords(previous=>[row,...previous.filter(r=>r.download?.songId!==row.download?.songId)]);onSaved(row);setNotice('素材包已导入并保存到此设备，可以离线练习。');setTab('local');
    }catch(e){if(mounted.current)setError(controller.signal.aborted?'已取消导入，原资料已保留。':(e as Error).message);}
    finally{if(mounted.current){setImporting(false);setImportProgress(undefined);}}
  };
  const remove=async(id:string)=>{
    if(active.some(t=>t.songId===id))return;
    setDeleting(true);setError('');
    try{await materialStore.removeDownload(id);if(!mounted.current)return;setRecords(rows=>rows.filter(r=>r.download?.songId!==id));onRemoved(id);setRemoving('');setNotice('已移除下载副本，歌曲和练习设置保留。');}
    catch{if(mounted.current)setError('未能移除下载，请重试。');}finally{if(mounted.current)setDeleting(false);}
  };
  const total=records.reduce((n,r)=>n+(r.download?.bytes??0),0);
  return <div className="downloads-page">
    <div className="download-heading"><div><p className="eyebrow">DOWNLOADS · 随时开始练习</p><h1>下载管理</h1><p>{records.length} 首已下载 · {size(total)} 素材</p></div><button className="download-source-toggle" aria-expanded={sourceOpen} onClick={()=>setSourceOpen(!sourceOpen)}>下载源设置</button></div>
    <div className="download-tabs" role="tablist" aria-label="下载分类">{[['songs','在线歌曲',catalog?.songs.length??0],['tasks','下载任务',active.length],['local','已下载',records.length]].map(([key,label,count])=><button role="tab" aria-label={String(label)} aria-selected={tab===key} key={key} onClick={()=>setTab(key as typeof tab)}>{label}<span aria-hidden="true">{count}</span></button>)}</div>
    {sourceOpen&&<form className="download-source" onSubmit={e=>{e.preventDefault();void read(address.trim());}}>
      <h2>连接素材源</h2><p className="helper">配置一次，之后在歌曲列表直接点下载。默认提供春日影的音频、歌词和乐谱。填写素材访问码后即可下载，地址已配置。</p>
      <label>素材源地址<input type="url" required value={address} onChange={e=>{setAddress(e.target.value);setToken('');pendingSong.current=null;}} disabled={loading} placeholder="https://…/catalog.json"/></label>
      <label>访问码（私人素材源可选）<input ref={codeInput} type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} disabled={loading} maxLength={128}/></label>
      <p className="helper">访问码仅在本次运行中临时使用，不写入下载记录或反馈。不要填写账号密码或平台API密钥。</p>
      <button className="primary" disabled={loading||!address.trim()}>查看歌曲</button>
      <button type="button" disabled={loading} onClick={()=>{setToken('');pendingSong.current=null;void read(PRIVATE_SOURCE,'');}}>使用默认春日影素材源</button>
      {media.catalog&&<button type="button" disabled={loading} onClick={()=>{setToken('');void read(defaultSource(),'');}}>下载本站私人练习素材</button>}
      <button type="button" disabled={loading} onClick={()=>{setToken('');void read(sample(),'');}}>试用原创示例源</button>
    </form>}
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="download-notice" role="status">{notice}</p>}
    {tab==='songs'&&<section role="tabpanel" aria-label="在线歌曲"><div className="download-section-title"><div><h2>{catalog?.title??'在线歌曲'}</h2><p>音频、歌词、乐谱一起下载</p></div><button disabled={loading} onClick={()=>void read(address,token)}>刷新</button></div>
      <input className="search-field" aria-label="搜索下载歌曲" placeholder="搜索歌曲名称" value={search} onChange={e=>setSearch(e.target.value)}/>
      {loading&&<p role="status" className="helper">正在读取在线歌曲…</p>}
      {catalog?.songs.filter(s=>s.title.toLowerCase().includes(search.toLowerCase())).map(song=>{
        const saved=records.find(r=>r.download?.songId===song.id)?.download,task=active.find(t=>t.songId===song.id);
        const bytes=song.audio.bytes+(song.lyrics?.bytes??0)+(song.score?.bytes??0);
        return <article className="download-row" key={song.id}><div className="download-cover" aria-hidden="true">♪</div><div className="download-row-info"><h3>{song.title}</h3><p>{['音频',song.lyrics&&'歌词',song.score&&'乐谱'].filter(Boolean).join(' · ')} · {size(bytes)}</p><small>{saved?(saved.revision===song.revision?'已下载到此设备':'有素材更新'):task?'已加入下载任务':'下载后可离线练习'}</small></div><div className="download-actions">{saved&&<button onClick={()=>onOpen(song.id,song.title)}>开始练习</button>}<button className="primary" disabled={!!task||importing} onClick={()=>{setNotice('');if(isDefaultSource(address)&&!access.current){pendingSong.current=song.id;setSourceOpen(true);setNotice('请输入私人素材访问码，然后点“查看歌曲”开始下载。');requestAnimationFrame(()=>codeInput.current?.focus());return;}downloadManager.enqueue(song,access.current);setTab('tasks');}}>{task?'下载中…':saved?'重新下载并替换':'下载到本地'}</button></div></article>;
      })}
      {!loading&&!catalog&&<div className="download-empty"><span>♫</span><p>在线列表暂不可用</p><small>可在下载源设置中重新连接，或继续练习已下载歌曲。</small><button onClick={()=>setTab('local')}>查看已下载</button></div>}
    </section>}
    {tab==='tasks'&&<section role="tabpanel" aria-label="下载任务"><div className="download-section-title"><div><h2>{active.length?'正在下载':'下载任务'}</h2><p>切换App内页面，任务会继续</p></div>{active.length>0&&<button onClick={()=>downloadManager.cancelAll()}>全部取消</button>}</div>
      {!tasks.length&&<div className="download-empty"><span>↓</span><p>还没有下载任务</p><button onClick={()=>setTab('songs')}>去下载歌曲</button></div>}
      {tasks.map(task=><article className="download-task" key={task.songId}><div className="download-task-title"><strong>{task.title}</strong><span>{task.phase}</span></div>{running(task.status)&&<><progress aria-label={`${task.title}下载进度`} max={task.total} value={task.received}/><p>{size(task.received)} / {size(task.total)}</p></>}{task.error&&<p className="error">{task.error}</p>}<div className="download-actions">{running(task.status)?<button disabled={task.status==='cancelling'} onClick={()=>downloadManager.cancel(task.songId)}>取消下载</button>:task.status==='completed'?<button onClick={()=>{setTab('local');}}>查看已下载</button>:<button disabled={importing} onClick={()=>downloadManager.retry(task.songId)}>重试下载</button>}</div></article>)}
      {finished.length>0&&<button className="quiet" onClick={()=>downloadManager.clearFinished()}>清除已结束任务</button>}
      <p className="helper">下载按队列依次进行。关闭App或刷新页面会中断未完成任务，重新下载从头开始。</p>
    </section>}
    {tab==='local'&&<section role="tabpanel" aria-label="已下载"><section aria-label="本地下载"><div className="download-section-title"><div><h2>本地下载</h2><p>{records.length} 首 · {size(total)} 素材，随时开始</p></div></div>
      {!records.length&&<div className="download-empty"><span>♫</span><p>还没有下载歌曲</p><small>下载完成后，音频、歌词和乐谱会一起保存在这里。</small><button className="primary" onClick={()=>setTab('songs')}>去下载歌曲</button></div>}
      {records.map(row=>{const d=row.download!,busy=active.some(t=>t.songId===d.songId);return <article className="download-local" key={row.id}><div className="download-local-title"><div className="download-cover" aria-hidden="true">♪</div><div><h3>{d.title}</h3><p>{size(d.bytes)} · 已保存到本机</p><small>{['音频 ✓',d.summary.lyrics&&'歌词 ✓',d.summary.score&&'乐谱 ✓'].filter(Boolean).join(' · ')}</small></div></div><div className="download-actions"><button className="primary" onClick={()=>onOpen(d.songId,d.title,'lyrics')}>歌词学唱</button>{d.summary.score&&<button onClick={()=>onOpen(d.songId,d.title,'piano-prep')}>钢琴学谱</button>}<button className="quiet" disabled={busy||deleting||importing} onClick={()=>setRemoving(d.songId)}>移除下载</button></div>{removing===d.songId&&<div className="download-remove" role="alertdialog" aria-label="确认移除下载"><p>移除“{d.title}”的下载副本？歌曲、练习设置和已另存乐谱会保留。</p><button disabled={deleting||importing} onClick={()=>void remove(d.songId)}>确认移除</button><button disabled={deleting} onClick={()=>setRemoving('')}>保留下载</button></div>}</article>;})}
    </section></section>}
    <details className="download-extras"><summary>本地导入与存储</summary><section className="download-package" aria-label="素材包"><h2>本地文件补充导入</h2><p className="helper">已有素材包也可直接导入，在线歌曲在上方列表下载。</p>{privatePackage&&<a className="download-package-export" href={`${import.meta.env.BASE_URL}${privatePackage.src}`} download="春日影-CRYCHIC.anisong.zip">下载春日影素材包 · {size(privatePackage.bytes)}</a>}<label className={`download-package-import${importing||active.length?' is-disabled':''}`}>选择素材包导入<input type="file" aria-label="选择素材包导入" accept=".zip,.anisong.zip,application/zip" disabled={importing||active.length>0} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void importPackage(file);}}/></label></section>
      {importing&&<div role="status"><p>{importProgress?.phase??'读取素材包'}</p><button onClick={()=>importRequest.current?.abort()}>取消导入</button></div>}
      <p className="helper">下载和导入只在本机保存。更新同域网页、同签名App不会清空；卸载或清除数据会删除。网页换域名不会自动迁移。</p><button onClick={()=>{void navigator.storage?.persist?.().then(ok=>setNotice(ok?'已获得持久存储保护，清除数据仍会删除。':'浏览器未授予持久存储保护，建议保留原文件。'));}}>申请持久存储保护</button>
    </details>
  </div>;
}
