import type { AudioEngine,EngineEvent,Range } from '../core/types';
/** Real HTMLAudioElement playback. Boundary timer is independent from React/timeupdate. */
export class WebAudioEngine implements AudioEngine {
 readonly audio:HTMLAudioElement;private range:Range|null=null;private loop=true;private intended=false;private timer:ReturnType<typeof setInterval>|null=null;
 private lastUiUpdate=0;private revision=0;private cancelLoad:(()=>void)|null=null;private listeners=new Set<(e:EngineEvent)=>void>();
 constructor(audio?:HTMLAudioElement){this.audio=audio??new Audio();this.audio.preload='auto';this.audio.preservesPitch=true;
  this.audio.addEventListener('ended',this.atBoundary);this.audio.addEventListener('pause',this.onPause);this.audio.addEventListener('error',this.onError);}
 private emit(e:EngineEvent){for(const fn of this.listeners)fn(e);}
 private onPause=()=>{if(this.intended&&this.audio.paused&&!this.audio.ended){this.intended=false;this.stopTimer();this.emit({type:'playing',playing:false});}};
 private onError=()=>{this.pause();this.emit({type:'error',code:'DECODE'});};
 async load(source:string){this.cancelLoad?.();this.pause();this.range=null;const revision=++this.revision;
  return new Promise<number>((resolve,reject)=>{
   const clean=()=>{clearTimeout(timeout);this.audio.removeEventListener('loadedmetadata',ready);this.audio.removeEventListener('error',error);if(revision===this.revision)this.cancelLoad=null;};
   const ready=()=>{clean();resolve(this.audio.duration);};const error=()=>{clean();reject(new Error('LOAD'));};
   this.cancelLoad=()=>{clean();reject(new Error('音频加载已被新选择替代。'));};
   this.audio.addEventListener('loadedmetadata',ready,{once:true});this.audio.addEventListener('error',error,{once:true});
   const timeout=setTimeout(error,20000);this.audio.src=source;this.audio.load();});}
 setRange(range:Range,loop:boolean){this.range=range;this.loop=loop;}
 setSpeed(speed:number){this.audio.preservesPitch=true;this.audio.playbackRate=speed;}
 async play(){if(!this.range)throw new Error('请先选择歌词。');if(this.audio.currentTime<this.range.start||this.audio.currentTime>=this.range.end)this.audio.currentTime=this.range.start;
  this.intended=true;const revision=++this.revision;
  try{await this.audio.play();if(revision!==this.revision){if(!this.intended)this.audio.pause();return;}if(this.intended)this.startTimer();}catch(e){if(revision===this.revision){this.intended=false;this.stopTimer();}throw e;}}
 pause(){++this.revision;this.intended=false;this.stopTimer();this.audio.pause();}
 seek(position:number){this.audio.currentTime=position;this.emit({type:'position',position});}
 getPosition(){return this.audio.currentTime;}
 private startTimer(){this.stopTimer();this.timer=setInterval(()=>{if(!this.intended||!this.range)return;const p=this.audio.currentTime;if(p>=this.range.end)this.atBoundary();else if(Date.now()-this.lastUiUpdate>=60){this.lastUiUpdate=Date.now();this.emit({type:'position',position:p});}},10);}
 private stopTimer(){if(this.timer!==null)clearInterval(this.timer);this.timer=null;}
 private atBoundary=()=>{if(!this.intended||!this.range)return;
  if(this.loop){this.audio.currentTime=this.range.start;this.emit({type:'loop'});this.emit({type:'position',position:this.range.start});if(this.audio.paused)void this.play().catch(()=>this.emit({type:'error',code:'PLAY_BLOCKED'}));}
  else {this.pause();this.audio.currentTime=this.range.end;this.emit({type:'end'});}};
 onEvent(fn:(event:EngineEvent)=>void){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 dispose(){this.cancelLoad?.();this.pause();this.audio.removeEventListener('ended',this.atBoundary);this.audio.removeEventListener('pause',this.onPause);this.audio.removeEventListener('error',this.onError);this.audio.removeAttribute('src');this.audio.load();this.listeners.clear();}
}
