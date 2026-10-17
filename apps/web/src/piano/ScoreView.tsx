import {useEffect,useMemo,useRef,useState} from 'react';
import type {Score,ScorePart,Track,Labels} from '../../../../packages/piano/types';
import {pitchLabel} from '../../../../packages/piano/timeline';
import {compatibleEngrave} from './compatible-engraver';
import type {BarBox,NoteBox} from './engraver';
const PAGE=8;
export function ScoreView({score,part,track,range,activeId,labels,onSelect,active=true,onRenderStatus}:{score:Score;part:ScorePart;track:Track;range:[number,number];activeId?:string;labels:Labels;onSelect:(i:number)=>void;active?:boolean;onRenderStatus?:(status:{backend:string;code:string})=>void}){
 const host=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null);
 const [page,setPage]=useState(()=>Math.floor(range[0]/PAGE)),[retry,setRetry]=useState(0);
 const eventMeasure=useMemo(()=>new Map(part.measures.flatMap(m=>m.events.map(e=>[e.id,m.index] as const))),[part]);
 useEffect(()=>setPage(Math.floor(range[0]/PAGE)),[range[0],part]);
 useEffect(()=>{const measure=activeId?eventMeasure.get(activeId):undefined;if(measure!==undefined)setPage(Math.floor(measure/PAGE));},[activeId,eventMeasure]);
 const start=Math.min(page*PAGE,Math.max(0,part.measures.length-1)),end=Math.min(start+PAGE-1,part.measures.length-1),key=`${score.id}:${part.id}:${track.id}:${start}:${retry}`;
 const [layout,setLayout]=useState<{key:string;bars:BarBox[];notes:NoteBox[]}>({key:'',bars:[],notes:[]});
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[compatible,setCompatible]=useState(false);
 useEffect(()=>{
  if(!active)return;
  let cancelled=false;const holder=document.createElement('div');holder.style.width='800px';
  setLoading(true);setCompatible(false);setError('');setLayout({key:'',bars:[],notes:[]});host.current?.replaceChildren(holder);
  void (async()=>{
   let stage='MODULE';
   try{const {engrave}=await import('./engraver');if(cancelled)return;stage='LAYOUT';const result=await engrave(holder,score,part,track,.65,[start,end]);if(cancelled)return;setLayout({key,bars:result.bars,notes:result.notes});onRenderStatus?.({backend:'osmd',code:''});}
   catch(error){
    if(cancelled)return;
    const code=`SCORE_${stage}_${error instanceof Error?error.name:'UNKNOWN'}`;
    try{const result=compatibleEngrave(holder,part,track,[start,end]);setCompatible(true);setLayout({key,...result});onRenderStatus?.({backend:'compatible',code});}
    catch{setError(`谱面暂时无法绘制（${code}）。请重试；曲谱与练习记录已保留。`);onRenderStatus?.({backend:'failed',code});}
   }finally{if(!cancelled)setLoading(false);}
  })();
  return()=>{cancelled=true;holder.remove();};
 },[score,part,track,start,end,retry,active,onRenderStatus]);
 useEffect(()=>{
  if(layout.key!==key)return;
  for(const n of layout.notes)n.graphic.setColor(n.event.id===activeId?'#087b76':'#202c40',{applyToNoteheads:true,applyToStem:true,applyToFlag:true});
  const target=layout.notes.find(n=>n.event.id===activeId),el=scroller.current;
  if(el&&target&&(target.x<el.scrollLeft+30||target.x>el.scrollLeft+el.clientWidth-50))el.scrollLeft=Math.max(0,target.x-el.clientWidth*.35);
 },[activeId,layout,key]);
 return <div className="score-window">
  <div className="score-page-controls"><button disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>前 8 小节</button><span>谱面 {start+1}–{end+1} / {part.measures.length} 小节</span><button disabled={end>=part.measures.length-1} onClick={()=>setPage(p=>p+1)}>后 8 小节</button></div>
  {compatible&&<div className="score-compatibility">兼容谱面 · 装饰与连梁简化 <button onClick={()=>setRetry(r=>r+1)}>重试精细谱面</button></div>}
  <div className="score-scroll" ref={scroller} aria-label="五线谱，可横向滚动">
   {loading&&<p className="score-message" role="status">正在绘制五线谱…</p>}{error&&<p className="score-message" role="alert">{error}<button onClick={()=>setRetry(r=>r+1)}>重试谱面</button></p>}
   <div className="score-sheet"><div ref={host}/><div className="score-overlays">
    {layout.bars.map(b=><button key={b.index} aria-label={`谱面小节 ${b.index+1}`} className={`measure-hit ${b.index>=range[0]&&b.index<=range[1]?'in-range':''}`} style={{left:b.x,top:b.y,width:b.width,height:b.height}} onClick={()=>onSelect(b.index)}/>)}
    {labels!=='none'&&layout.notes.filter(n=>n.event.pitch).map(n=><span className={`note-label ${n.event.id===activeId?'current':''}`} key={n.event.id} style={{left:n.x,top:n.y}}>{pitchLabel(n.event.pitch!,labels==='solfege')}</span>)}
   </div></div>
  </div>
 </div>;
}
