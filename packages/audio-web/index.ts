import type { AudioEngine, EngineEvent, Range } from '../core/types';

/** Buffer remote sources locally so seeking does not depend on HTTP Range support. */
export class WebAudioEngine implements AudioEngine {
 readonly audio: HTMLAudioElement;
 private range: Range|null=null;
 private loop=true;
 private intended=false;
 private timer: ReturnType<typeof setInterval>|null=null;
 private lastUiUpdate=0;
 private revision=0;
 private loadRevision=0;
 private cancelLoad: (()=>void)|null=null;
 private cancelSeek: (()=>void)|null=null;
 private pendingSeek: Promise<void>|null=null;
 private boundaryPending=false;
 private ownedUrl: string|null=null;
 private listeners=new Set<(e:EngineEvent)=>void>();
 constructor(audio?:HTMLAudioElement){
  this.audio=audio??new Audio();this.audio.preload='auto';this.audio.preservesPitch=true;
  this.audio.addEventListener('ended',this.atBoundary);
  this.audio.addEventListener('pause',this.onPause);
  this.audio.addEventListener('error',this.onError);
  this.audio.addEventListener('timeupdate',this.onTimeUpdate);
  if(navigator.mediaSession){
   navigator.mediaSession.setActionHandler('play',()=>{void this.play().then(()=>this.emit({type:'playing',playing:true})).catch(()=>this.emit({type:'error',code:'PLAY_BLOCKED'}));});
   navigator.mediaSession.setActionHandler('pause',()=>{this.pause();this.emit({type:'playing',playing:false});});
  }
 }
 private emit(e:EngineEvent){for(const fn of this.listeners)fn(e);}
 private onTimeUpdate=()=>{if(this.intended&&this.range){if(this.audio.currentTime>=this.range.end)this.atBoundary();else this.emit({type:'position',position:this.audio.currentTime});}};
 private onPause=()=>{if(this.intended&&this.audio.paused&&!this.audio.ended){this.intended=false;this.stopTimer();this.emit({type:'playing',playing:false});}};
 private onError=()=>{this.pause();this.emit({type:'error',code:'DECODE'});};
 private releaseUrl(){if(this.ownedUrl){URL.revokeObjectURL(this.ownedUrl);this.ownedUrl=null;}}
 async load(source:string){
  this.cancelLoad?.();this.pause();this.range=null;this.releaseUrl();
  const revision=++this.loadRevision,abort=new AbortController();
  this.cancelLoad=()=>abort.abort();const timeout=setTimeout(()=>abort.abort(),60000);
  try{
   let local=source;
   if(!/^(blob:|data:)/i.test(source)){
    const response=await fetch(source,{signal:abort.signal,credentials:'same-origin'});
    if(!response.ok)throw new Error('LOAD');
    const blob=await response.blob();
    if(!blob.size||blob.size>30*1024*1024||/^(text\/html|application\/json)/i.test(blob.type))throw new Error('LOAD');
    if(abort.signal.aborted||revision!==this.loadRevision)throw new Error('LOAD');
    local=URL.createObjectURL(blob);this.ownedUrl=local;
   }
   if(abort.signal.aborted)throw new Error('LOAD');
   return await new Promise<number>((resolve,reject)=>{
    const clean=()=>{this.audio.removeEventListener('loadedmetadata',ready);this.audio.removeEventListener('error',error);abort.signal.removeEventListener('abort',cancel);};
    const ready=()=>{clean();resolve(this.audio.duration);};
    const error=()=>{clean();reject(new Error('DECODE'));};
    const cancel=()=>{clean();reject(new Error('音频加载已被新选择替代。'));};
    this.audio.addEventListener('loadedmetadata',ready,{once:true});this.audio.addEventListener('error',error,{once:true});abort.signal.addEventListener('abort',cancel,{once:true});
    this.audio.src=local;this.audio.load();
   });
  }catch(error){if(revision===this.loadRevision)this.releaseUrl();throw error instanceof Error&&error.message==='DECODE'?error:new Error(abort.signal.aborted?'音频加载已被取消或超时，请重试。':'LOAD');}
  finally{clearTimeout(timeout);if(revision===this.loadRevision)this.cancelLoad=null;}
 }
 setRange(range:Range,loop:boolean){this.range=range;this.loop=loop;}
 setSpeed(speed:number){this.audio.preservesPitch=true;this.audio.playbackRate=speed;}
 async play(){
  if(!this.range)throw new Error('请先选择片段。');
  const revision=++this.revision;
  try{
   if(this.pendingSeek)await this.pendingSeek;
   if(this.audio.currentTime<this.range.start-.01||this.audio.currentTime>=this.range.end)await this.seek(this.range.start);
   if(revision!==this.revision)return;
   this.intended=true;await this.audio.play();
   if(revision!==this.revision){if(!this.intended)this.audio.pause();return;}
   if(this.intended)this.startTimer();
  }catch(error){if(revision===this.revision){this.intended=false;this.stopTimer();throw error;}}
 }
 pause(){++this.revision;this.intended=false;this.stopTimer();this.pendingSeek=null;this.cancelSeek?.();this.audio.pause();}
 seek(position:number):Promise<void>{
  this.cancelSeek?.();
  const operation=new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>finish(new Error('SEEK')),4000);
   const clean=()=>{clearTimeout(timeout);this.audio.removeEventListener('seeked',check);this.audio.removeEventListener('error',error);if(this.cancelSeek===cancel)this.cancelSeek=null;};
   const finish=(failure?:Error)=>{clean();if(failure)reject(failure);else{this.emit({type:'position',position:this.audio.currentTime});resolve();}};
   const check=()=>{if(!this.audio.seeking&&Math.abs(this.audio.currentTime-position)<=.08)finish();};
   const error=()=>finish(new Error('SEEK'));const cancel=()=>finish(new Error('SEEK_CANCELLED'));
   this.cancelSeek=cancel;this.audio.addEventListener('seeked',check);this.audio.addEventListener('error',error,{once:true});
   try{this.audio.currentTime=position;check();}catch{error();}
  });
  this.pendingSeek=operation;
  void operation.then(()=>{if(this.pendingSeek===operation)this.pendingSeek=null;},()=>{if(this.pendingSeek===operation)this.pendingSeek=null;});
  return operation;
 }
 getPosition(){return this.audio.currentTime;}
 private startTimer(){this.stopTimer();this.timer=setInterval(()=>{if(!this.intended||!this.range||this.pendingSeek)return;const p=this.audio.currentTime;if(p>=this.range.end)this.atBoundary();else if(Date.now()-this.lastUiUpdate>=60){this.lastUiUpdate=Date.now();this.emit({type:'position',position:p});}},10);}
 private stopTimer(){if(this.timer!==null)clearInterval(this.timer);this.timer=null;}
 private atBoundary=()=>{
  if(!this.intended||!this.range||this.boundaryPending)return;
  if(!this.loop){this.pause();this.audio.currentTime=this.range.end;this.emit({type:'end'});return;}
  const revision=this.revision;this.boundaryPending=true;
  void this.seek(this.range.start).then(async()=>{
   if(revision!==this.revision||!this.intended)return;
   this.emit({type:'loop'});if(this.audio.paused)await this.play();
  }).catch(()=>{if(revision===this.revision&&this.intended){this.pause();this.emit({type:'error',code:'SEEK'});}}).finally(()=>{this.boundaryPending=false;});
 };
 onEvent(fn:(event:EngineEvent)=>void){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 dispose(){++this.loadRevision;this.cancelLoad?.();this.pause();this.releaseUrl();this.audio.removeEventListener('ended',this.atBoundary);this.audio.removeEventListener('pause',this.onPause);this.audio.removeEventListener('error',this.onError);this.audio.removeEventListener('timeupdate',this.onTimeUpdate);if(navigator.mediaSession){navigator.mediaSession.setActionHandler('play',null);navigator.mediaSession.setActionHandler('pause',null);}this.audio.removeAttribute('src');this.audio.load();this.listeners.clear();}
}
