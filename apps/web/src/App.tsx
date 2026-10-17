import { useCallback,useEffect,useRef,useState,useSyncExternalStore } from 'react';
import { LoopController } from '../../../packages/core/controller';
import { WebAudioEngine } from '../../../packages/audio-web';
import { NativeAudioEngine,isNative,bridge } from '../../../packages/audio-native';
import { parseLrc } from '../../../packages/core/lrc';
import { Feedback } from './components/Feedback';
import type { PlayerState } from '../../../packages/core/types';
import version from './version.json';
import type {Song} from '../../../packages/core/song';
import {HARUHIKAGE,isHaruhikage} from '../../../packages/core/presets';
import {OfficialReference} from './components/OfficialReference';
import bundledAudioConfig from './bundled-audio.json';
export interface BundledAudio {available:boolean;src:string;sha256:string;bytes:number;lyrics?:{src:string;sha256:string;bytes:number}|null}
const format=(v:number)=>`${Math.floor(v/60).toString().padStart(2,'0')}:${(v%60).toFixed(2).padStart(5,'0')}`;
export function App({controller:provided,autoLoad=true,active=true,onSong,onPiano,initialSong,bundledAudio=bundledAudioConfig}:{controller?:LoopController;autoLoad?:boolean;active?:boolean;onSong?:(title:string,demo:boolean)=>void;onPiano?:()=>void;initialSong?:Song;bundledAudio?:BundledAudio}){
 const [controller]=useState(()=>provided??new LoopController(isNative()?new NativeAudioEngine():new WebAudioEngine()));
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
 const [preset,setPreset]=useState(()=>isHaruhikage(initialSong));
 const [title,setTitle]=useState(initialSong?.title??'小小的练习曲');const [demo,setDemo]=useState(!initialSong||initialSong.id==='demo-original');const [notice,setNotice]=useState(isHaruhikage(initialSong)?bundledAudio.available?'正在载入你提供的春日影 MP3…':'此部署未包含内置音频。可导入本地 MP3 试听，再导入匹配 LRC 进行逐句循环。':'');
 const [multi,setMulti]=useState(false);const [anchor,setAnchor]=useState<number|null>(null);
 const [feedback,setFeedback]=useState<PlayerState|null>(null);const closeFeedback=useCallback(()=>setFeedback(null),[]);const fileUrl=useRef<string|null>(null);const loadToken=useRef(0);const lyricsToken=useRef(0);
 const loadPreset=async()=>{if(!bundledAudio.available)return;const token=++loadToken.current;const lyricToken=++lyricsToken.current;setAnchor(null);setNotice('正在载入你提供的春日影 MP3 和歌词…');
  const lyricsPromise=bundledAudio.lyrics?(async()=>{const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),10000);try{
   const response=await fetch(`${import.meta.env.BASE_URL}${bundledAudio.lyrics!.src}`,{signal:abort.signal});if(!response.ok)throw new Error('LRC');return {parsed:parseLrc(await response.text())};
  }catch{return {failed:true};}finally{clearTimeout(timeout);}})():Promise.resolve(null);
  const source=isNative()?`file:///android_asset/public/${bundledAudio.src}`:`${import.meta.env.BASE_URL}${bundledAudio.src}`;
  const loaded=await controller.load(source);if(token!==loadToken.current)return;
  if(!loaded){setNotice('内置 MP3 载入失败。可重新载入，或导入本地音频；不会替换成其他歌曲。');return;}
  await controller.setSpeed(1);if(token!==loadToken.current)return;
  if(fileUrl.current){URL.revokeObjectURL(fileUrl.current);fileUrl.current=null;}setPreset(true);setTitle(HARUHIKAGE.title);setDemo(false);
  const result=await lyricsPromise;if(token!==loadToken.current||lyricToken!==lyricsToken.current)return;
  const hasLyrics=!!result?.parsed&&controller.setLyrics(result.parsed.lines,result.parsed.warnings);
  await controller.selectTrack();if(token!==loadToken.current||lyricToken!==lyricsToken.current)return;
  setNotice(hasLyrics?`已内置 MP3 与 ${controller.getSnapshot().lines.length} 句歌词。点任一句循环，或点播放整曲，无需重新导入。`:bundledAudio.lyrics?'MP3 已就绪，但内置歌词载入失败。可整曲试听，点“内置春日影”重试或导入本地 LRC。':'已内置你提供的 MP3，点播放即可整曲试听，无需重新导入。匹配 LRC 导入后可逐句循环。');
 };
 const loadDemo=async()=>{const token=++loadToken.current;++lyricsToken.current;controller.pause();setAnchor(null);setNotice('正在载入原创演示旋律…');
  try{const response=await fetch(`${import.meta.env.BASE_URL}demo/demo.lrc`);if(!response.ok)throw new Error('无法读取演示歌词。');const parsed=parseLrc(await response.text());if(token!==loadToken.current)return;
   const source=isNative()?'file:///android_asset/public/demo/demo.wav':`${import.meta.env.BASE_URL}demo/demo.wav`;
   const loaded=await controller.load(source);if(!loaded||token!==loadToken.current)return;
   controller.setLyrics(parsed.lines,parsed.warnings);await controller.select(1,1,false);if(token!==loadToken.current)return;
   if(fileUrl.current){URL.revokeObjectURL(fileUrl.current);fileUrl.current=null;}setPreset(false);setTitle('小小的练习曲');setDemo(true);setNotice('演示已就绪，点播放试听。');
  }catch{if(token===loadToken.current)setNotice('演示载入失败，请重试，或导入本地音频与 LRC。');}};
 useEffect(()=>{if(autoLoad){if(isHaruhikage(initialSong))void loadPreset();else void loadDemo();}const hidden=()=>{if(document.hidden&&controller.getSnapshot().phase==='playing'){controller.pause();setNotice('离开页面后已暂停，返回时点播放继续。');}};
  document.addEventListener('visibilitychange',hidden);
  return ()=>{++loadToken.current;++lyricsToken.current;document.removeEventListener('visibilitychange',hidden);if(!provided)controller.dispose();if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);};
 // Controller and initial song are created once; loading never autoplays.
 },[]);
 useEffect(()=>{if(!active)controller.pause();},[active,controller]);
 useEffect(()=>{onSong?.(title,demo);},[title,demo]);
 const importAudio=async(file?:File)=>{const token=++loadToken.current;++lyricsToken.current;setAnchor(null);setNotice('正在读取本地音频…');let url:string|undefined;
  try {let source:string;let name:string;
   if(isNative()){const picked=await bridge.pickAudio();source=picked.source;name=picked.name;}else{if(!file)return;url=URL.createObjectURL(file);source=url;name=file.name;}
   if(token!==loadToken.current){if(url)URL.revokeObjectURL(url);return;}
   const loaded=await controller.load(source);if(!loaded||token!==loadToken.current){if(url)URL.revokeObjectURL(url);return;}
   await controller.selectTrack();if(token!==loadToken.current){if(url)URL.revokeObjectURL(url);return;}
   if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);fileUrl.current=url??null;setTitle(preset?HARUHIKAGE.title:name);setDemo(false);setNotice('音频已载入，点播放可整曲试听。导入对应 LRC 后可逐句循环。');
  }catch{if(url)URL.revokeObjectURL(url);if(token===loadToken.current)setNotice('音频选择已取消或读取失败，请重试。');}};
 const importLyrics=async(file:File)=>{const token=loadToken.current;const lyricToken=++lyricsToken.current;try{const parsed=parseLrc(await file.text());if(token!==loadToken.current||lyricToken!==lyricsToken.current)return;
  setAnchor(null);if(controller.setLyrics(parsed.lines,parsed.warnings)){await controller.select(0,0,false);if(token===loadToken.current&&lyricToken===lyricsToken.current)setNotice('歌词已载入。点击一句立即播放。');}
 }catch(e){if(token===loadToken.current&&lyricToken===lyricsToken.current)setNotice((e as Error).message);}};
 const select=(i:number)=>{if(!multi){void controller.select(i);return;}if(anchor===null){controller.pause();setAnchor(i);}else{void controller.select(anchor,i);setAnchor(null);}};
 const chooseMode=(value:boolean)=>{setMulti(value);setAnchor(null);};
 const range=state.range;const playing=state.phase==='playing';const selection=state.selection;const disabled=!range||state.phase==='loading';
 const move=(delta:number)=>{if(!selection)return;setAnchor(null);const i=Math.max(0,Math.min(state.lines.length-1,(delta<0?selection[0]:selection[1])+delta));void controller.select(i);};
 return <main className="app">
  <header><div className="brand" aria-label="Anisong"><span className="brand-icon">♫</span><span>ANISONG<small>一小段，也能慢慢学会</small></span></div><button className="text-button" onClick={()=>setFeedback({...state})}>反馈问题 ↗</button></header>
  <section className="song-card" aria-label="音频导入"><div className="song-top"><div className="cover" aria-hidden="true"><span>♪</span><i/><i/><i/></div><div className="song-info"><span className="eyebrow">{preset?'CRYCHIC · 默认练习歌曲':demo?'原创旋律 · 可直接试听':'本地音频 · 留在设备上'}</span><h1>{title}</h1><p>{state.duration>0?`${format(state.duration)} · ${isNative()?'Media3 原生音频':'浏览器真实音频'}`:'准备你的第一段练习'}</p></div></div>
   {preset&&<button className="whole-track-play" disabled={disabled} onClick={()=>playing&&!selection?controller.pause():selection?void controller.selectTrack(true):void controller.play()}>{playing&&!selection?'Ⅱ 暂停整曲':'▶ 播放整曲'}</button>}
   <div className="imports">{isNative()?<button onClick={()=>void importAudio()}>＋ 导入音频</button>:<label className="file-button">＋ 导入音频<input aria-label="导入音频" type="file" accept="audio/*,.mp3,.m4a,.wav" onChange={e=>{const file=e.target.files?.[0];if(file)void importAudio(file);e.target.value='';}}/></label>}
    <label className={`file-button ${state.duration?'':'disabled'}`}>＋ 导入 LRC<input aria-label="导入 LRC" type="file" accept=".lrc,.txt,text/plain" disabled={!state.duration||state.phase==='loading'} onChange={e=>{const file=e.target.files?.[0];if(file)void importLyrics(file);e.target.value='';}}/></label>{bundledAudio.available&&<button onClick={()=>void loadPreset()}>内置春日影</button>}<button onClick={()=>void loadDemo()}>原创演示</button>{preset&&<OfficialReference active={active} onOpen={()=>controller.pause()}/>}</div>
   {onPiano&&<button className="song-piano-entry" onClick={onPiano}>♩ 钢琴学谱 · 关联当前歌曲</button>}
   <p className="notice" role="status">{notice||'音频与歌词只在此设备处理，不上传。'}</p>
  </section>
  {demo&&<p className="demo-note">演示是原创器乐旋律；日文句仅用于界面示例，音频没有人声。</p>}
  <section className="practice-card" aria-labelledby="practice-title"><div className="section-title"><h2 id="practice-title">选择练习片段</h2><span>{selection?`第 ${selection[0]+1}${selection[1]!==selection[0]?`–${selection[1]+1}`:''} 句`:range?'整曲试听':'待选择'}</span></div>
   {state.lines.length>0&&<button className="text-button" onClick={()=>{setAnchor(null);void controller.selectTrack();}}>返回整曲试听</button>}
   <div className="mode" role="group" aria-label="选择模式"><button aria-pressed={!multi} className={!multi?'active':''} onClick={()=>chooseMode(false)}>单句循环</button><button aria-pressed={multi} className={multi?'active':''} onClick={()=>chooseMode(true)}>多句连续</button></div>
   <div className="selection-help">{multi?(anchor===null?'① 点起始句，再点结束句（可反向选择）':`② 已选第 ${anchor+1} 句，请点结束句`):'点一句，立即从该句开始播放'}{anchor!==null&&<button onClick={()=>setAnchor(null)}>取消</button>}</div>
   <div className="lyrics" aria-label="歌词列表">{state.lines.length===0?<div className="empty">{state.phase==='loading'?'正在读取音频…':preset?'春日影 · 等待导入匹配的 LRC':'导入 LRC，或载入演示曲开始练习'}</div>:state.lines.map((line,i)=>{const selected=!!selection&&i>=selection[0]&&i<=selection[1];return <button key={`${line.start}-${i}`} aria-label={`第 ${i+1} 句 ${line.text}`} aria-pressed={selected||anchor===i} className={`lyric ${selected?'selected':''} ${anchor===i?'anchor':''}`} onClick={()=>select(i)}><span className="line-number">{String(i+1).padStart(2,'0')}</span><span className="lyric-text">{line.text}<small>{format(line.start)}</small></span>{selected&&<span className="line-mark" aria-hidden="true">{playing?'♫':'↻'}</span>}</button>;})}</div>
  </section>
  <section className="controls" aria-label="播放器"><div className="range-summary"><span className="tag">{playing?'● 播放中':state.phase==='ended'?'片段已结束':state.phase==='loading'?'载入中':'准备练习'}</span><span>{range?`${(range.end-range.start).toFixed(2)}s / ${( (range.end-range.start)/state.speed).toFixed(2)}s 每轮`:'原曲时间 / 变速耗时'}</span></div>
   <input aria-label="片段进度" className="progress" type="range" min={range?.start??0} max={range?.end??1} step="0.01" value={range?Math.max(range.start,Math.min(range.end,state.position)):0} disabled={disabled} onChange={e=>void controller.seek(Number(e.target.value))}/>
   <div className="time-labels"><span>{format(range?Math.max(range.start,Math.min(range.end,state.position)):0)}</span><span>{range?format(range.end):'00:00.00'} · 原曲坐标</span></div>
   <div className="transport"><button aria-label="上一句" disabled={disabled||!selection||selection[0]===0} onClick={()=>move(-1)}>｜◀</button><button className="play-button" aria-label={playing?'暂停':'播放'} disabled={disabled||anchor!==null} onClick={()=>playing?controller.pause():void controller.play()}>{playing?'Ⅱ':'▶'}<span>{playing?'暂停':'播放'}</span></button><button aria-label="下一句" disabled={disabled||!selection||selection[1]===state.lines.length-1} onClick={()=>move(1)}>▶｜</button></div>
   <div className="play-options"><div className="speeds" role="group" aria-label="播放速度">{[0.5,0.75,1].map(speed=><button key={speed} aria-pressed={state.speed===speed} className={state.speed===speed?'active':''} onClick={()=>void controller.setSpeed(speed)}>{speed}×</button>)}</div><button className={`loop-button ${state.loop?'active':''}`} aria-pressed={state.loop} onClick={()=>void controller.setLoop(!state.loop)}>↻ 循环{state.loop?'开':'关'}</button></div>
   <details className="fine-tune"><summary>片段边界微调 <span>± 0.1s</span></summary>{(['start','end'] as const).map(edge=><div className="edge" key={edge}><label>{edge==='start'?'起点':'终点'}<strong>{range?format(range[edge]):'—'}</strong></label><button disabled={disabled} aria-label={`${edge==='start'?'起点':'终点'}提前 0.1 秒`} onClick={()=>void controller.adjust(edge,-0.1)}>−0.1</button><button disabled={disabled} aria-label={`${edge==='start'?'起点':'终点'}延后 0.1 秒`} onClick={()=>void controller.adjust(edge,0.1)}>＋0.1</button></div>)}<p>微调后从新起点练习；关闭循环会在本片段结束时停止。</p></details>
   {state.error&&<p className="error" role="alert">{state.error}</p>}{state.warnings.map(w=><p className="warning" key={w}>{w}</p>)}
  </section>
  <footer><p>{isNative()?'原生裁剪与单项重复；后台主动暂停。':'保持音高 · 网页循环可能有短暂停顿，后台主动暂停。'}</p><p>v0.2.0 · {version.sha} · {version.branch}</p><small>构建于 {version.builtAt} · 本地文件刷新后需重新导入</small></footer>
  {feedback&&<Feedback state={feedback} onClose={closeFeedback}/>}
 </main>;
}
