export interface LyricLine { start:number; text:string; romaji?:string; translation?:string }
export interface Range { start:number; end:number }
export type Phase='empty'|'loading'|'ready'|'playing'|'paused'|'ended'|'error';
export type EngineEvent={type:'position';position:number}|{type:'playing';playing:boolean}|{type:'end'}|{type:'loop'}|{type:'error';code:string};
export interface AudioEngine {
  load(source:string):Promise<number>;
  setRange(range:Range,loop:boolean):Promise<void>|void;
  setSpeed(speed:number):Promise<void>|void;
  play():Promise<void>; pause():void;
  seek(position:number):Promise<void>|void;
  getPosition():number;
  onEvent(listener:(event:EngineEvent)=>void):()=>void;
  dispose():void;
}
export interface PlayerState {
  phase:Phase;duration:number;position:number;speed:number;loop:boolean;
  lines:LyricLine[];selection:[number,number]|null;range:Range|null;
  rounds:number;error:string|null;warnings:string[];logs:string[];
}
