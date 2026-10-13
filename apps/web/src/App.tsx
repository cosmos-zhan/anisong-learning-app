import { useCallback,useEffect,useRef,useState,useSyncExternalStore } from 'react';
import { LoopController } from '../../../packages/core/controller';
import { WebAudioEngine } from '../../../packages/audio-web';
import { NativeAudioEngine,isNative,bridge } from '../../../packages/audio-native';
import { parseLrc } from '../../../packages/core/lrc';
import { feedbackReport,issueUrl } from '../../../packages/core/feedback';
import type { PlayerState } from '../../../packages/core/types';
import version from './version.json';
const format=(v:number)=>`${Math.floor(v/60).toString().padStart(2,'0')}:${(v%60).toFixed(2).padStart(5,'0')}`;
export function App({controller:provided,autoLoad=true}:{controller?:LoopController;autoLoad?:boolean}){
 const [controller]=useState(()=>provided??new LoopController(isNative()?new NativeAudioEngine():new WebAudioEngine()));
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
 const [title,setTitle]=useState('小小的练习曲');const [demo,setDemo]=useState(true);const [notice,setNotice]=useState('');
 const [multi,setMulti]=useState(false);const [anchor,setAnchor]=useState<number|null>(null);
 const [feedback,setFeedback]=useState<PlayerState|null>(null);const closeFeedback=useCallback(()=>setFeedback(null),[]);const fileUrl=useRef<string|null>(null);const loadToken=useRef(0);
 const loadDemo=async()=>{const token=++loadToken.current;controller.pause();setAnchor(null);setNotice('正在载入原创演示旋律…');
  try{const response=await fetch(`${import.meta.env.BASE_URL}demo/demo.lrc`);if(!response.ok)throw new Error('无法读取演示歌词。');const parsed=parseLrc(await response.text());if(token!==loadToken.current)return;
   const source=isNative()?'file:///android_asset/public/demo/demo.wav':`${import.meta.env.BASE_URL}demo/demo.wav`;
   const loaded=await controller.load(source);if(!loaded||token!==loadToken.current)return;
   controller.setLyrics(parsed.lines,parsed.warnings);await controller.select(1,1,false);if(token!==loadToken.current)return;
   if(fileUrl.current){URL.revokeObjectURL(fileUrl.current);fileUrl.current=null;}setTitle('小小的练习曲');setDemo(true);setNotice('演示已就绪，点播放试听。');
  }catch{if(token===loadToken.current)setNotice('演示载入失败，请重试，或导入本地音频与 LRC。');}};
 useEffect(()=>{if(autoLoad)void loadDemo();const hidden=()=>{if(document.hidden&&controller.getSnapshot().phase==='playing'){controller.pause();setNotice('离开页面后已暂停，返回时点播放继续。');}};
  document.addEventListener('visibilitychange',hidden);
  return ()=>{++loadToken.current;document.removeEventListener('visibilitychange',hidden);if(!provided)controller.dispose();if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);};
 // Controller is created once; demo is loaded once, without autoplay.
 },[]);
 const importAudio=async(file?:File)=>{const token=++loadToken.current;setAnchor(null);setNotice('正在读取本地音频…');let url:string|undefined;
  try {let source:string;let name:string;
   if(isNative()){const picked=await bridge.pickAudio();source=picked.source;name=picked.name;}else{if(!file)return;url=URL.createObjectURL(file);source=url;name=file.name;}
   if(token!==loadToken.current){if(url)URL.revokeObjectURL(url);return;}
   const loaded=await controller.load(source);if(!loaded||token!==loadToken.current){if(url)URL.revokeObjectURL(url);return;}
   if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);fileUrl.current=url??null;setTitle(name);setDemo(false);setNotice('音频已载入。请继续导入对应 LRC。');
  }catch{if(url)URL.revokeObjectURL(url);if(token===loadToken.current)setNotice('音频选择已取消或读取失败，请重试。');}};
 const importLyrics=async(file:File)=>{const token=loadToken.current;try{const parsed=parseLrc(await file.text());if(token!==loadToken.current)return;
  setAnchor(null);if(controller.setLyrics(parsed.lines,parsed.warnings)){await controller.select(0,0,false);setNotice('歌词已载入。点击一句立即播放。');}
 }catch(e){setNotice((e as Error).message);}};
 const select=(i:number)=>{if(!multi){void controller.select(i);return;}if(anchor===null){controller.pause();setAnchor(i);}else{void controller.select(anchor,i);setAnchor(null);}};
 const chooseMode=(value:boolean)=>{setMulti(value);setAnchor(null);};
 const range=state.range;const playing=state.phase==='playing';const selection=state.selection;const disabled=!range||state.phase==='loading';
 const move=(delta:number)=>{if(!selection)return;setAnchor(null);const i=Math.max(0,Math.min(state.lines.length-1,(delta<0?selection[0]:selection[1])+delta));void controller.select(i);};
 return <main className="app">
  <header><div className="brand" aria-label="Anisong"><span className="brand-icon">♫</span><span>ANISONG<small>一小段，也能慢慢学会</small></span></div><button className="text-button" onClick={()=>setFeedback({...state})}>反馈问题 ↗</button></header>
  <section className="song-card" aria-label="音频导入"><div className="song-top"><div className="cover" aria-hidden="true"><span>♪</span><i/><i/><i/></div><div className="song-info"><span className="eyebrow">{demo?'原创旋律 · 可直接试听':'本地音频 · 留在设备上'}</span><h1>{title}</h1><p>{state.duration>0?`${format(state.duration)} · ${isNative()?'Media3 原生音频':'浏览器真实音频'}`:'准备你的第一段练习'}</p></div></div>
   <div className="imports">{isNative()?<button onClick={()=>void importAudio()}>＋ 导入音频</button>:<label className="file-button">＋ 导入音频<input aria-label="导入音频" type="file" accept="audio/*,.mp3,.m4a,.wav" onChange={e=>{const file=e.target.files?.[0];if(file)void importAudio(file);e.target.value='';}}/></label>}
    <label className={`file-button ${state.duration?'':'disabled'}`}>＋ 导入 LRC<input aria-label="导入 LRC" type="file" accept=".lrc,.txt,text/plain" disabled={!state.duration||state.phase==='loading'} onChange={e=>{const file=e.target.files?.[0];if(file)void importLyrics(file);e.target.value='';}}/></label><button onClick={()=>void loadDemo()}>演示曲</button></div>
   <p className="notice" role="status">{notice||'音频与歌词只在此设备处理，不上传。'}</p>
  </section>
  {demo&&<p className="demo-note">演示是原创器乐旋律；日文句仅用于界面示例，音频没有人声。</p>}
  <section className="practice-card" aria-labelledby="practice-title"><div className="section-title"><h2 id="practice-title">选择练习片段</h2><span>{selection?`第 ${selection[0]+1}${selection[1]!==selection[0]?`–${selection[1]+1}`:''} 句`:'待选择'}</span></div>
   <div className="mode" role="group" aria-label="选择模式"><button aria-pressed={!multi} className={!multi?'active':''} onClick={()=>chooseMode(false)}>单句循环</button><button aria-pressed={multi} className={multi?'active':''} onClick={()=>chooseMode(true)}>多句连续</button></div>
   <div className="selection-help">{multi?(anchor===null?'① 点起始句，再点结束句（可反向选择）':`② 已选第 ${anchor+1} 句，请点结束句`):'点一句，立即从该句开始播放'}{anchor!==null&&<button onClick={()=>setAnchor(null)}>取消</button>}</div>
   <div className="lyrics" aria-label="歌词列表">{state.lines.length===0?<div className="empty">{state.phase==='loading'?'正在读取音频…':'导入 LRC，或载入演示曲开始练习'}</div>:state.lines.map((line,i)=>{const selected=!!selection&&i>=selection[0]&&i<=selection[1];return <button key={`${line.start}-${i}`} aria-label={`第 ${i+1} 句 ${line.text}`} aria-pressed={selected||anchor===i} className={`lyric ${selected?'selected':''} ${anchor===i?'anchor':''}`} onClick={()=>select(i)}><span className="line-number">{String(i+1).padStart(2,'0')}</span><span className="lyric-text">{line.text}<small>{format(line.start)}</small></span>{selected&&<span className="line-mark" aria-hidden="true">{playing?'♫':'↻'}</span>}</button>;})}</div>
  </section>
  <section className="controls" aria-label="播放器"><div className="range-summary"><span className="tag">{playing?'● 播放中':state.phase==='ended'?'片段已结束':state.phase==='loading'?'载入中':'准备练习'}</span><span>{range?`${(range.end-range.start).toFixed(2)}s / ${( (range.end-range.start)/state.speed).toFixed(2)}s 每轮`:'原曲时间 / 变速耗时'}</span></div>
   <input aria-label="片段进度" className="progress" type="range" min={range?.start??0} max={range?.end??1} step="0.01" value={range?Math.max(range.start,Math.min(range.end,state.position)):0} disabled={disabled} onChange={e=>void controller.seek(Number(e.target.value))}/>
   <div className="time-labels"><span>{format(range?Math.max(range.start,Math.min(range.end,state.position)):0)}</span><span>{range?format(range.end):'00:00.00'} · 原曲坐标</span></div>
   <div className="transport"><button aria-label="上一句" disabled={disabled||selection?.[0]===0} onClick={()=>move(-1)}>｜◀</button><button className="play-button" aria-label={playing?'暂停':'播放'} disabled={disabled||anchor!==null} onClick={()=>playing?controller.pause():void controller.play()}>{playing?'Ⅱ':'▶'}<span>{playing?'暂停':'播放'}</span></button><button aria-label="下一句" disabled={disabled||selection?.[1]===state.lines.length-1} onClick={()=>move(1)}>▶｜</button></div>
   <div className="play-options"><div className="speeds" role="group" aria-label="播放速度">{[0.5,0.75,1].map(speed=><button key={speed} aria-pressed={state.speed===speed} className={state.speed===speed?'active':''} onClick={()=>void controller.setSpeed(speed)}>{speed}×</button>)}</div><button className={`loop-button ${state.loop?'active':''}`} aria-pressed={state.loop} onClick={()=>void controller.setLoop(!state.loop)}>↻ 循环{state.loop?'开':'关'}</button></div>
   <details className="fine-tune"><summary>片段边界微调 <span>± 0.1s</span></summary>{(['start','end'] as const).map(edge=><div className="edge" key={edge}><label>{edge==='start'?'起点':'终点'}<strong>{range?format(range[edge]):'—'}</strong></label><button disabled={disabled} aria-label={`${edge==='start'?'起点':'终点'}提前 0.1 秒`} onClick={()=>void controller.adjust(edge,-0.1)}>−0.1</button><button disabled={disabled} aria-label={`${edge==='start'?'起点':'终点'}延后 0.1 秒`} onClick={()=>void controller.adjust(edge,0.1)}>＋0.1</button></div>)}<p>微调后从新起点练习；关闭循环会在本片段结束时停止。</p></details>
   {state.error&&<p className="error" role="alert">{state.error}</p>}{state.warnings.map(w=><p className="warning" key={w}>{w}</p>)}
  </section>
  <footer><p>{isNative()?'原生裁剪与单项重复；后台主动暂停。':'保持音高 · 网页循环可能有短暂停顿，后台主动暂停。'}</p><p>v0.1.0 · {version.sha} · {version.branch}</p><small>构建于 {version.builtAt} · 本地文件刷新后需重新导入</small></footer>
  {feedback&&<Feedback state={feedback} onClose={closeFeedback}/>}
 </main>;
}
function Feedback({state,onClose}:{state:PlayerState;onClose:()=>void}){
 const [fields,setFields]=useState({kind:'功能 Bug',description:'',steps:'',expected:''});const [diagnostics,setDiagnostics]=useState(true);const [report,setReport]=useState('');const [copied,setCopied]=useState(false);const textArea=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{setReport(feedbackReport(fields,state,version,navigator.userAgent,diagnostics));setCopied(false);},[fields,state,diagnostics]);
 useEffect(()=>{const focus=document.activeElement as HTMLElement|null;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',escape);textArea.current?.focus();return ()=>{document.removeEventListener('keydown',escape);focus?.focus();};},[onClose]);
 const copy=async()=>{try{await navigator.clipboard.writeText(report);setCopied(true);}catch{textArea.current?.focus();textArea.current?.select();}};
 return <div className="modal-backdrop"><section className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title"><div className="section-title"><h2 id="feedback-title">把问题留下来</h2><button aria-label="关闭反馈" onClick={onClose}>✕</button></div><p>不会附带音频、歌词文本或文件路径。报告可编辑；GitHub 需要你确认后提交。</p>
 <label>反馈类型<select value={fields.kind} onChange={e=>setFields({...fields,kind:e.target.value})}><option>功能 Bug</option><option>交互建议</option></select></label>
 {(['description','steps','expected'] as const).map(key=><label key={key}>{key==='description'?'问题描述 / 实际行为':key==='steps'?'复现步骤':'预期行为'}<textarea aria-label={key==='description'?'问题描述':key==='steps'?'复现步骤':'预期行为'} value={fields[key]} onChange={e=>setFields({...fields,[key]:e.target.value})} maxLength={1000}/></label>)}
 <label className="check"><input type="checkbox" checked={diagnostics} onChange={e=>setDiagnostics(e.target.checked)}/>包含版本、设备和播放器设置（点击反馈时的快照）</label>
 <label>完整报告（可删除任意信息）<textarea aria-label="完整反馈报告" ref={textArea} className="report" value={report} onChange={e=>setReport(e.target.value)}/></label>
 <div className="feedback-actions"><button onClick={()=>void copy()}>{copied?'已复制 ✓':'复制完整报告'}</button><a href={issueUrl(report,fields.kind)} target="_blank" rel="noreferrer">打开 GitHub Issue ↗</a></div><small>仓库需先创建并启用 Issues。截图可在 GitHub 提交页面添加；复制失败时可长按报告全选。</small>
 </section></div>;
}
