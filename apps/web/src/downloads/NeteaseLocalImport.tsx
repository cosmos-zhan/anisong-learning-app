import {useEffect,useRef,useState} from 'react';
import {parseNetease,importNetease,type NeteaseParsed} from '../../../../packages/core/netease';
import type {LocalMaterial} from '../../../../packages/core/app-state';
import {NeteaseAccountPanel} from './NeteaseAccountPanel';
import {deviceNeteaseAccount} from '../../../../packages/core/netease-account-client';
import {audioFormats} from '../../../../packages/core/netease-audio.mjs';
import type {NeteaseAudioDiagnostic} from '../../../../packages/core/netease';
export function describeAudioDiagnostic(row:NeteaseAudioDiagnostic):string{
  const source:Record<string,string>={'download-v1':'下载接口','player-v1':'播放接口','player-legacy':'兼容播放接口','player-linux':'Linux 播放接口'};
  const quality:Record<string,string>={standard:'标准音质',exhigh:'极高音质',lossless:'无损音质'};
  const reason:Record<string,string>={available:'检查通过',http:'请求失败',provider:'接口拒绝',empty:'未返回音频地址',trial:'只返回试听',source:'返回了不支持的来源',format:'格式暂不支持',size:'超过 25 MiB',timeout:'请求超时',network:'网络连接失败','invalid-response':'接口响应无法读取','invalid-audio':'返回内容不是预期的音频',redirect:'未跳转到可用音频'};
  return `${source[row.source]??'音频接口'} / ${quality[row.quality]??'音质'}：${row.stage==='address'?'获取地址':'检查文件'}，${reason[row.reason]??'未完成'}${row.http?`（HTTP ${row.http}）`:row.code?`（返回码 ${row.code}）`:''}${row.format?` · ${row.format.toUpperCase()}`:''}`;
}
export function NeteaseLocalImport({disabled,onBusy,onSaved}:{disabled:boolean;onBusy:(value:boolean)=>void;onSaved:(row:LocalMaterial)=>void}){
  const [accountBusy,setAccountBusy]=useState(false);
  const [input,setInput]=useState(''),[parsed,setParsed]=useState<NeteaseParsed|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current?.abort();};},[]);
  async function run(save=false){
    if(busy||disabled||accountBusy)return;const controller=new AbortController();active.current=controller;setBusy(true);onBusy(true);setError('');setMessage(save?'正在下载音频与歌词…':'正在解析分享链接…');
    try{
      if(save&&parsed){const row=await importNetease(parsed,controller.signal,p=>{if(mounted.current)setMessage(p.phase);});if(mounted.current&&!controller.signal.aborted){onSaved(row);setMessage('已保存并导入本机，可以离线学唱。');setParsed(null);setInput('');}}
      else{const data=await parseNetease(input,controller.signal);if(mounted.current&&!controller.signal.aborted){setParsed(data);setMessage('请核对歌曲后下载到本机。');}}
    }catch(e){if(mounted.current){setMessage('');setError(controller.signal.aborted?'已取消，本次未完成的内容不会导入。':e instanceof Error?e.message:'网易云导入失败，请重试。');}}
    finally{active.current=null;if(mounted.current){setBusy(false);onBusy(false);}}
  }
  return <details className="download-netease"><summary>从网易云分享链接导入</summary><section aria-label="网易云本地导入"><h2>网易云歌曲</h2><p className="helper">获取音频、原词、罗马音与翻译，只保存到本机。不会上传或加入在线曲库。</p>
    <NeteaseAccountPanel client={deviceNeteaseAccount} disabled={busy||disabled} onBusy={value=>{setAccountBusy(value);onBusy(value);}} onChanged={()=>{active.current?.abort();setParsed(null);setError('');setMessage('登录状态已改变，请重新解析歌曲。');}}/>
    <form onSubmit={e=>{e.preventDefault();void run();}}><label>分享链接或歌曲 ID<input value={input} maxLength={2048} disabled={busy||disabled||accountBusy} onChange={e=>{setInput(e.target.value);setParsed(null);setError('');setMessage('');}} placeholder="粘贴网易云分享文字或链接"/></label><button className="primary" disabled={busy||disabled||accountBusy||!input.trim()}>解析歌曲</button></form>
    {parsed&&<div className="download-netease-result"><h3>{parsed.song.title}</h3><p>{parsed.song.artists}</p><p>{parsed.audio.status==='available'?`${parsed.audio.format?audioFormats[parsed.audio.format].label:'音频'} 可获取`:parsed.audio.message}</p>{!!parsed.audio.diagnostics?.length&&<details><summary>音频获取详情</summary><ul>{parsed.audio.diagnostics.map((row,index)=><li key={index}>{describeAudioDiagnostic(row)}</li>)}</ul></details>}<p>原词 {parsed.lyrics.counts.original} 行 · 罗马音 {parsed.lyrics.counts.romaji} 行 · 翻译 {parsed.lyrics.counts.translation} 行</p>{parsed.lyrics.warnings.map(text=><p className="helper" key={text}>{text}</p>)}<button type="button" className="primary" disabled={busy||disabled||accountBusy||parsed.audio.status!=='available'} onClick={()=>void run(true)}>下载并导入本机</button></div>}
    {message&&<p role="status" className="helper">{message}</p>}{error&&<p role="alert" className="error">{error}</p>}{busy&&<button type="button" onClick={()=>active.current?.abort()}>取消</button>}
  </section></details>;
}
