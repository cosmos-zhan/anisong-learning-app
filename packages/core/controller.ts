import type { AudioEngine,PlayerState,LyricLine } from './types';
import { rangeFor,adjustRange } from './range';
import { validateLyrics } from './lrc';
const messages:Record<string,string>={PLAY_BLOCKED:'浏览器阻止了播放，请再点一次播放。',DECODE:'无法解码音频，请尝试 MP3、M4A 或 WAV。',LOAD:'音频读取失败，请重新选择文件。',NATIVE:'原生播放器发生错误，请重新载入音频。'};
export class LoopController {
 private state:PlayerState={phase:'empty',duration:0,position:0,speed:0.75,loop:true,lines:[],selection:null,range:null,rounds:0,error:null,warnings:[],logs:[]};
 private listeners=new Set<()=>void>();private operation=0;private loadOperation=0;private unsubscribe:()=>void;
 constructor(private engine:AudioEngine){this.unsubscribe=engine.onEvent(e=>{
  if(this.state.phase==='loading'||this.state.phase==='empty')return;
  if(e.type==='position')this.patch({position:e.position});
  if(e.type==='end')this.patch({phase:'ended',position:this.state.range?.end??0});
  if(e.type==='loop')this.patch({rounds:this.state.rounds+1});
  if(e.type==='playing'&&!e.playing&&this.state.phase==='playing')this.patch({phase:'paused'});
  if(e.type==='error')this.fail(e.code);
 });}
 getSnapshot=()=>this.state;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return ()=>this.listeners.delete(fn);};
 private patch(data:Partial<PlayerState>){this.state={...this.state,...data};for(const fn of this.listeners)fn();}
 private fail(code:string){this.engine.pause();this.patch({phase:'error',error:messages[code]??code,logs:[...this.state.logs,`${new Date().toISOString()} ${Object.hasOwn(messages,code)?code:'VALIDATION'}`].slice(-12)});}
 async load(source:string){const token=++this.loadOperation;++this.operation;this.engine.pause();this.patch({phase:'loading',range:null,selection:null,lines:[],error:null,warnings:[],rounds:0,position:0,duration:0});
  try {const duration=await this.engine.load(source);if(token!==this.loadOperation)return false;
   if(!Number.isFinite(duration)||duration<=0)throw new Error('音频没有有效时长。');
   await this.engine.setSpeed(this.state.speed);if(token!==this.loadOperation)return false;
   this.patch({duration,phase:'ready'});return true;
  }catch(e){if(token===this.loadOperation)this.fail(e instanceof Error?e.message:'LOAD');return false;}}
 setLyrics(lines:LyricLine[],warnings:string[]=[]){++this.operation;this.engine.pause();try{const valid=validateLyrics(lines,this.state.duration);this.patch({lines:valid.lines,warnings:[...warnings,...valid.warnings],selection:null,range:null,phase:'ready',error:null});return true;}catch(e){this.fail((e as Error).message);return false;}}
 async select(first:number,last=first,autoplay=true){const token=++this.operation;this.engine.pause();try{
  const range=rangeFor(this.state.lines,first,last,this.state.duration);
  this.patch({selection:[Math.min(first,last),Math.max(first,last)],range,position:range.start,rounds:0,phase:'paused',error:null});
  await this.engine.setRange(range,this.state.loop);if(token!==this.operation)return;
  await this.engine.seek(range.start);if(token!==this.operation)return;
  if(autoplay)await this.play();
 }catch(e){if(token===this.operation)this.fail((e as Error).message);}}
 async selectTrack(autoplay=false){if(this.state.duration<=0||this.state.phase==='loading')return;const token=++this.operation;this.engine.pause();try{
  const range={start:0,end:this.state.duration};
  this.patch({selection:null,range,position:0,rounds:0,phase:'paused',error:null});
  await this.engine.setRange(range,this.state.loop);if(token!==this.operation)return;
  await this.engine.seek(0);if(token!==this.operation)return;
  if(autoplay)await this.play();
 }catch(e){if(token===this.operation)this.fail((e as Error).message);}}
 async play(){if(!this.state.range||this.state.phase==='loading')return;const token=++this.operation;
  try{if(this.state.phase==='ended')await this.engine.seek(this.state.range.start);
   if(token!==this.operation)return;await this.engine.play();if(token===this.operation)this.patch({phase:'playing',error:null});
  }catch{if(token===this.operation)this.fail('PLAY_BLOCKED');}}
 pause(){++this.operation;this.engine.pause();this.patch({phase:this.state.range?'paused':this.state.phase,position:this.engine.getPosition()});}
 async setSpeed(speed:number){if(![0.5,0.75,1].includes(speed))return;try{await this.engine.setSpeed(speed);this.patch({speed});}catch{this.fail('NATIVE');}}
 async setLoop(loop:boolean){try{if(this.state.range)await this.engine.setRange(this.state.range,loop);this.patch({loop});}catch{this.fail('NATIVE');}}
 async seek(position:number){const range=this.state.range;if(!range)return;try{const p=Math.max(range.start,Math.min(range.end-0.001,position));await this.engine.seek(p);this.patch({position:p,phase:this.state.phase==='ended'?'paused':this.state.phase});}catch{this.fail('NATIVE');}}
 async adjust(edge:'start'|'end',delta:number){if(!this.state.range)return;try{const range=adjustRange(this.state.range,edge,delta,this.state.duration);const wasPlaying=this.state.phase==='playing';const token=++this.operation;this.engine.pause();this.patch({range,phase:'paused',position:range.start,error:null});await this.engine.setRange(range,this.state.loop);if(token!==this.operation)return;await this.engine.seek(range.start);if(token!==this.operation)return;if(wasPlaying)await this.play();}catch(e){this.patch({error:(e as Error).message});}}
 dispose(){++this.operation;++this.loadOperation;this.unsubscribe();this.engine.dispose();this.listeners.clear();}
}
