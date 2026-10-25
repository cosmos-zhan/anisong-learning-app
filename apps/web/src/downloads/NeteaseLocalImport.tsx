import {useEffect,useRef,useState} from 'react';
import {parseNetease,importNetease,type NeteaseParsed} from '../../../../packages/core/netease';
import type {LocalMaterial} from '../../../../packages/core/app-state';
export function NeteaseLocalImport({disabled,onBusy,onSaved}:{disabled:boolean;onBusy:(value:boolean)=>void;onSaved:(row:LocalMaterial)=>void}){
  const [input,setInput]=useState(''),[parsed,setParsed]=useState<NeteaseParsed|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current?.abort();};},[]);
  async function run(save=false){
    if(busy||disabled)return;const controller=new AbortController();active.current=controller;setBusy(true);onBusy(true);setError('');setMessage(save?'正在下载音频与歌词…':'正在解析分享链接…');
    try{
      if(save&&parsed){const row=await importNetease(parsed,controller.signal,p=>{if(mounted.current)setMessage(p.phase);});if(mounted.current&&!controller.signal.aborted){onSaved(row);setMessage('已保存并导入本机，可以离线学唱。');setParsed(null);setInput('');}}
      else{const data=await parseNetease(input,controller.signal);if(mounted.current&&!controller.signal.aborted){setParsed(data);setMessage('请核对歌曲后下载到本机。');}}
    }catch(e){if(mounted.current){setMessage('');setError(controller.signal.aborted?'已取消，本次未完成的内容不会导入。':e instanceof Error?e.message:'网易云导入失败，请重试。');}}
    finally{active.current=null;if(mounted.current){setBusy(false);onBusy(false);}}
  }
  return <details className="download-netease"><summary>从网易云分享链接导入</summary><section aria-label="网易云本地导入"><h2>网易云歌曲</h2><p className="helper">获取音频、原词、罗马音与翻译，只保存到本机。不会上传或加入在线曲库。</p>
    <form onSubmit={e=>{e.preventDefault();void run();}}><label>分享链接或歌曲 ID<input value={input} maxLength={2048} disabled={busy||disabled} onChange={e=>{setInput(e.target.value);setParsed(null);setError('');setMessage('');}} placeholder="粘贴网易云分享文字或链接"/></label><button className="primary" disabled={busy||disabled||!input.trim()}>解析歌曲</button></form>
    {parsed&&<div className="download-netease-result"><h3>{parsed.song.title}</h3><p>{parsed.song.artists}</p><p>{parsed.audio.status==='available'?'MP3 可获取':parsed.audio.message}</p><p>原词 {parsed.lyrics.counts.original} 行 · 罗马音 {parsed.lyrics.counts.romaji} 行 · 翻译 {parsed.lyrics.counts.translation} 行</p>{parsed.lyrics.warnings.map(text=><p className="helper" key={text}>{text}</p>)}<button type="button" className="primary" disabled={busy||disabled||parsed.audio.status!=='available'} onClick={()=>void run(true)}>下载并导入本机</button></div>}
    {message&&<p role="status" className="helper">{message}</p>}{error&&<p role="alert" className="error">{error}</p>}{busy&&<button type="button" onClick={()=>active.current?.abort()}>取消</button>}
  </section></details>;
}
