import type { AudioEngine,EngineEvent,Range } from '../packages/core/types';
export class TestEngine implements AudioEngine {
 position=0;range:Range|null=null;loop=true;speed=1;playing=false;listeners=new Set<(e:EngineEvent)=>void>();
 load=async(_source:string)=>35.5;
 setRange(range:Range,loop:boolean){this.range=range;this.loop=loop;}
 setSpeed(speed:number){this.speed=speed;}
 async play(){this.playing=true;}
 pause(){this.playing=false;}
 seek(position:number){this.position=position;}
 getPosition(){return this.position;}
 onEvent(fn:(e:EngineEvent)=>void){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 emit(e:EngineEvent){for(const fn of this.listeners)fn(e);}
 dispose(){this.listeners.clear();}
}
export const lyrics=[{start:0,text:'intro'},{start:16.3,text:'いつまでも覚えていたい'},{start:21.1,text:'three'},{start:25.9,text:'four'},{start:30.7,text:'five'}];
