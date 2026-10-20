import { Capacitor,registerPlugin,type PluginListenerHandle } from '@capacitor/core';
import type { PianoPlaybackEvent, PianoSequence } from '../piano/types';
import type { AudioEngine,EngineEvent,Range } from '../core/types';
interface NativeBridge {playPiano(sequence:PianoSequence):Promise<void>;stopPiano():Promise<void>;pianoLoop(o:{loop:boolean}):Promise<void>;syncPiano():Promise<void>;load(o:{source:string}):Promise<{duration:number}>;setRange(o:Range&{loop:boolean}):Promise<void>;setSpeed(o:{speed:number}):Promise<void>;play():Promise<void>;pause():Promise<void>;seek(o:{position:number}):Promise<void>;pickAudio():Promise<{source:string;name:string}>;addListener(name:'audioEvent',fn:(e:EngineEvent)=>void):Promise<PluginListenerHandle>;addListener(name:'pianoEvent',fn:(e:PianoPlaybackEvent)=>void):Promise<PluginListenerHandle>;}
export const bridge=registerPlugin<NativeBridge>('AnisongAudio');
export const isNative=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
export class NativeAudioEngine implements AudioEngine {
 private pauseErrorReported=false;private position=0;private listeners=new Set<(e:EngineEvent)=>void>();private handle:Promise<PluginListenerHandle>;
 constructor(){this.handle=bridge.addListener('audioEvent',e=>{if(e.type==='position')this.position=e.position;for(const fn of this.listeners)fn(e);});}
 async load(source:string){await this.handle;return (await bridge.load({source})).duration;}
 setRange(range:Range,loop:boolean){return bridge.setRange({...range,loop});}
 setSpeed(speed:number){return bridge.setSpeed({speed});}
 play(){return bridge.play();}
 pause(){void bridge.pause().then(()=>{this.pauseErrorReported=false;}).catch(()=>{if(this.pauseErrorReported)return;this.pauseErrorReported=true;for(const fn of this.listeners)fn({type:'error',code:'NATIVE'});});}
 async seek(position:number){await bridge.seek({position});this.position=position;}
 getPosition(){return this.position;}
 onEvent(fn:(e:EngineEvent)=>void){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 dispose(){this.pause();void this.handle.then(h=>h.remove()).catch(()=>undefined);this.listeners.clear();}
}
