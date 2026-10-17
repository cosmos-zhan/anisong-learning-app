import { it,expect,vi,afterEach } from 'vitest';
import { WebAudioEngine } from '../packages/audio-web';
class Media extends EventTarget {
 currentTime=0;duration=35.5;paused=true;ended=false;preload='';src='';playbackRate=1;preservesPitch=false;
 async play(){this.paused=false;}pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}load(){}removeAttribute(){}
}
afterEach(()=>vi.useRealTimers());
it('真实媒体 API 适配器在计时边界回跳，不使用UI事件',async()=>{vi.useFakeTimers();const media=new Media();const engine=new WebAudioEngine(media as unknown as HTMLAudioElement);engine.setRange({start:16.3,end:21.1},true);engine.setSpeed(.75);await engine.play();expect(media.currentTime).toBe(16.3);expect(media.playbackRate).toBe(.75);expect(media.preservesPitch).toBe(true);media.currentTime=21.11;await vi.advanceTimersByTimeAsync(10);expect(media.currentTime).toBe(16.3);expect(media.paused).toBe(false);engine.dispose();});
it('关闭循环时在片段终点停下',async()=>{vi.useFakeTimers();const media=new Media();const engine=new WebAudioEngine(media as unknown as HTMLAudioElement);const events:string[]=[];engine.onEvent(e=>events.push(e.type));engine.setRange({start:16.3,end:21.1},false);await engine.play();media.currentTime=21.2;await vi.advanceTimersByTimeAsync(10);expect(media.paused).toBe(true);expect(media.currentTime).toBe(21.1);expect(events).toContain('end');engine.dispose();});
it('到回跳时暂停可取消后续循环',async()=>{vi.useFakeTimers();const media=new Media();const engine=new WebAudioEngine(media as unknown as HTMLAudioElement);engine.setRange({start:16.3,end:21.1},true);await engine.play();engine.pause();media.currentTime=21.2;await vi.advanceTimersByTimeAsync(100);expect(media.currentTime).toBe(21.2);expect(media.paused).toBe(true);engine.dispose();});
it('切歌取消旧 metadata promise',async()=>{vi.useFakeTimers();const media=new Media();const engine=new WebAudioEngine(media as unknown as HTMLAudioElement);const old=engine.load('blob:old').catch(e=>e.message);const current=engine.load('blob:new');media.dispatchEvent(new Event('loadedmetadata'));expect(await old).toContain('取消');expect(await current).toBe(35.5);engine.dispose();});
it('系统暂停取消边界计时',async()=>{vi.useFakeTimers();const media=new Media();const engine=new WebAudioEngine(media as unknown as HTMLAudioElement);const events:string[]=[];engine.onEvent(e=>events.push(e.type));engine.setRange({start:16.3,end:21.1},true);await engine.play();media.pause();media.currentTime=21.2;await vi.advanceTimersByTimeAsync(100);expect(media.currentTime).toBe(21.2);expect(events).toContain('playing');engine.dispose();});

it('过期pause事件不打断新播放，音频自然结束仍能循环最后句',async()=>{vi.useFakeTimers();const media=new Media();const engine=new WebAudioEngine(media as unknown as HTMLAudioElement);engine.setRange({start:30.7,end:35.5},true);await engine.play();media.dispatchEvent(new Event('pause'));media.currentTime=35.5;media.paused=true;media.ended=true;media.dispatchEvent(new Event('pause'));media.dispatchEvent(new Event('ended'));await Promise.resolve();expect(media.currentTime).toBe(30.7);expect(media.paused).toBe(false);engine.dispose();});

class DelayedMedia extends EventTarget {
 private time=0;target=0;seeking=false;duration=35.5;paused=true;ended=false;preload='';src='';playbackRate=1;preservesPitch=false;plays=0;
 get currentTime(){return this.time;}set currentTime(p:number){this.target=p;this.seeking=true;}
 completeSeek(p=this.target){this.time=p;this.seeking=false;this.dispatchEvent(new Event('seeked'));}
 async play(){this.plays++;this.paused=false;}pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}load(){}removeAttribute(){}
}
it('delayed seek must finish at the requested lyric before real play is called',async()=>{
 const media=new DelayedMedia(),engine=new WebAudioEngine(media as unknown as HTMLAudioElement);engine.setRange({start:19.371,end:25.586},true);
 const pending=engine.play();expect(media.plays).toBe(0);expect(media.target).toBe(19.371);media.completeSeek();await pending;expect(media.plays).toBe(1);expect(media.currentTime).toBe(19.371);engine.dispose();
});
it('a silently refused media seek fails instead of playing from the beginning',async()=>{
 vi.useFakeTimers();const media=new DelayedMedia(),engine=new WebAudioEngine(media as unknown as HTMLAudioElement);engine.setRange({start:19.371,end:25.586},true);
 const result=engine.play().catch(e=>e.message);media.completeSeek(0);await vi.advanceTimersByTimeAsync(4001);expect(await result).toBe('SEEK');expect(media.plays).toBe(0);engine.dispose();
});
it('pause during pending seek cancels later playback',async()=>{
 const media=new DelayedMedia(),engine=new WebAudioEngine(media as unknown as HTMLAudioElement);engine.setRange({start:16.3,end:21.1},true);const pending=engine.play();engine.pause();media.completeSeek();await pending;expect(media.plays).toBe(0);engine.dispose();
});
it('a later seek supersedes an earlier one and reports only actual media position',async()=>{
 const media=new DelayedMedia(),engine=new WebAudioEngine(media as unknown as HTMLAudioElement);const old=engine.seek(16.3).catch(e=>e.message);const latest=engine.seek(25.9);media.completeSeek();await latest;expect(await old).toBe('SEEK_CANCELLED');expect(engine.getPosition()).toBe(25.9);engine.dispose();
});
it('remote audio is downloaded to a Blob before metadata load, with URL cleanup',async()=>{
 const originalFetch=globalThis.fetch,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 const createUrl=vi.fn(()=> 'blob:buffered'),revokeUrl=vi.fn();Object.defineProperty(URL,'createObjectURL',{configurable:true,value:createUrl});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revokeUrl});
 globalThis.fetch=vi.fn().mockResolvedValue({ok:true,blob:async()=>new Blob(['audio fixture'],{type:'audio/mpeg'})});
 try{const media=new Media(),engine=new WebAudioEngine(media as unknown as HTMLAudioElement);const pending=engine.load('/private/song.mp3');await Promise.resolve();await Promise.resolve();expect(media.src).toBe('blob:buffered');media.dispatchEvent(new Event('loadedmetadata'));expect(await pending).toBe(35.5);engine.dispose();expect(revokeUrl).toHaveBeenCalledWith('blob:buffered');}
 finally{globalThis.fetch=originalFetch;Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});}
});
it('an immediate resume after canceling a seek starts a fresh confirmed seek',async()=>{
 const media=new DelayedMedia(),engine=new WebAudioEngine(media as unknown as HTMLAudioElement);engine.setRange({start:16.3,end:21.1},true);
 const first=engine.play();engine.pause();const second=engine.play();media.completeSeek();await Promise.all([first,second]);expect(media.plays).toBe(1);expect(media.currentTime).toBe(16.3);engine.dispose();
});
