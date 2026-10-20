import {act,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect} from 'vitest';
import {App} from '../apps/web/src/App';
import {WebAudioEngine} from '../packages/audio-web';
import {LoopController} from '../packages/core/controller';
import {lyrics} from './helpers';
class AsyncMedia extends EventTarget{
 private time=0;target=0;seeking=false;duration=35.5;paused=true;ended=false;preload='';src='';playbackRate=1;preservesPitch=true;plays=0;
 get currentTime(){return this.time;}set currentTime(n:number){this.target=n;this.seeking=true;}
 finish(){this.time=this.target;this.seeking=false;this.dispatchEvent(new Event('seeked'));}
 async play(){this.plays++;this.paused=false;}pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}load(){}removeAttribute(){}
}
it('clicking a lyric through UI waits for actual media seek and cancels a superseded click',async()=>{
 const media=new AsyncMedia(),c=new LoopController(new WebAudioEngine(media as unknown as HTMLAudioElement));const ready=c.load('blob:fixture');media.dispatchEvent(new Event('loadedmetadata'));await ready;c.setLyrics(lyrics);
 const ui=render(<App controller={c} autoLoad={false} view="practice"/>);fireEvent.click(screen.getByRole('button',{name:'第 2 句 いつまでも覚えていたい'}));
 await waitFor(()=>expect(media.target).toBe(16.3));expect(media.plays).toBe(0);act(()=>media.finish());await waitFor(()=>expect(media.plays).toBe(1));expect(media.currentTime).toBe(16.3);
 fireEvent.click(screen.getByRole('button',{name:'第 3 句 three'}));fireEvent.click(screen.getByRole('button',{name:'第 4 句 four'}));
 await waitFor(()=>expect(media.target).toBe(25.9));act(()=>media.finish());await waitFor(()=>expect(c.getSnapshot().phase).toBe('playing'));expect(media.currentTime).toBe(25.9);expect(c.getSnapshot().error).toBeNull();ui.unmount();c.dispose();
});
