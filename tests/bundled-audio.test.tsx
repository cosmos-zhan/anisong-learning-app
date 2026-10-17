import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/App';
import { LoopController } from '../packages/core/controller';
import { HARUHIKAGE } from '../packages/core/presets';
import { TestEngine } from './helpers';

// Only metadata and adapter doubles are tested here; no commercial recording in Git.
const bundledAudio = { available:true, src:'private-media/haruhikage-crychic-fixture.mp3', sha256:'fixture', bytes:1024 };
it('loads the configured recording, defaults to original speed, and can play without LRC', async () => {
 const engine=new TestEngine(), load=vi.spyOn(engine,'load'), c=new LoopController(engine);
 engine.load=load.mockResolvedValue(257.880816);
 const ui=render(<App initialSong={HARUHIKAGE} controller={c} bundledAudio={bundledAudio}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'▶ 播放整曲'})).toBeEnabled());
 expect(load).toHaveBeenCalledExactlyOnceWith('/private-media/haruhikage-crychic-fixture.mp3');
 expect(c.getSnapshot()).toMatchObject({duration:257.880816,selection:null,lines:[],range:{start:0,end:257.880816},phase:'paused',speed:1});
 expect(engine.playing).toBe(false);
 expect(screen.getByRole('button',{name:'上一句'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'下一句'})).toBeDisabled();
 const user=userEvent.setup();
 await user.click(screen.getByRole('button',{name:'▶ 播放整曲'}));
 expect(engine.playing).toBe(true);
 fireEvent.change(screen.getByRole('slider',{name:'片段进度'}),{target:{value:'123.4'}});
 expect(engine.position).toBe(123.4);
 await user.click(screen.getByRole('button',{name:'暂停'}));
 await user.click(screen.getByRole('button',{name:'播放'}));
 expect(engine.position).toBe(123.4);
 await user.click(screen.getByRole('button',{name:'0.5×'}));
 expect(engine.speed).toBe(.5);
 ui.unmount();c.dispose();
});
it('a missing private build input remains importable and never substitutes an unrelated audio', () => {
 const engine=new TestEngine(),load=vi.spyOn(engine,'load'),c=new LoopController(engine);
 const ui=render(<App initialSong={HARUHIKAGE} controller={c} bundledAudio={{...bundledAudio,available:false,src:''}}/>);
 expect(load).not.toHaveBeenCalled();
 expect(screen.getByRole('status')).toHaveTextContent('此部署未包含内置音频');
 expect(screen.getByRole('button',{name:'播放'})).toBeDisabled();
 expect(screen.getByLabelText('导入音频')).toBeEnabled();
 ui.unmount();c.dispose();
});
it('load failure shows recovery and never enables fake playback; retry uses the same recording',async()=>{
 const engine=new TestEngine(),load=vi.spyOn(engine,'load').mockRejectedValueOnce(new Error('LOAD')).mockResolvedValueOnce(257.88),c=new LoopController(engine);
 const ui=render(<App initialSong={HARUHIKAGE} controller={c} bundledAudio={bundledAudio}/>);
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('内置 MP3 载入失败'));
 expect(screen.getByRole('button',{name:'播放'})).toBeDisabled();
 expect(engine.playing).toBe(false);
 await userEvent.setup().click(screen.getByRole('button',{name:'内置春日影'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'播放'})).toBeEnabled());
 expect(load.mock.calls.map(c=>c[0])).toEqual(['/'+bundledAudio.src,'/'+bundledAudio.src]);
 ui.unmount();c.dispose();
});
it('importing LRC selects actual timestamps, then whole-track playback remains available',async()=>{
 const engine=new TestEngine(),c=new LoopController(engine),user=userEvent.setup();
 const ui=render(<App initialSong={HARUHIKAGE} controller={c} bundledAudio={bundledAudio}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'播放'})).toBeEnabled());
 fireEvent.change(screen.getByLabelText('导入 LRC'),{target:{files:[{text:async()=>'[00:01]fixture one\n[00:03]fixture two'}]}});
 await screen.findByRole('button',{name:'第 1 句 fixture one'});
 await user.click(screen.getByRole('button',{name:'第 1 句 fixture one'}));
 expect(engine.range).toEqual({start:1,end:3});expect(engine.playing).toBe(true);
 await user.click(screen.getByRole('button',{name:'返回整曲试听'}));
 expect(c.getSnapshot().selection).toBeNull();expect(engine.range).toEqual({start:0,end:35.5});
 expect(engine.playing).toBe(false);
 ui.unmount();c.dispose();
});
it('a newer song load cancels pending whole-track selection before old seek or play',async()=>{
 const engine=new TestEngine(),c=new LoopController(engine);await c.load('first');
 let finish!:()=>void;engine.setRange=()=>new Promise<void>(r=>{finish=r;});
 const pending=c.selectTrack(true);await c.load('second');finish();await pending;
 expect(engine.playing).toBe(false);expect(c.getSnapshot().range).toBeNull();c.dispose();
});
it('a slow default recording cannot replace a later explicit demo selection',async()=>{
 const engine=new TestEngine(),c=new LoopController(engine);let finish!:(duration:number)=>void;
 vi.spyOn(engine,'load').mockImplementationOnce(()=>new Promise<number>(r=>{finish=r;})).mockResolvedValueOnce(35.5);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,text:async()=>'[00:00]fixture\n[00:01]next'}));
 const ui=render(<App initialSong={HARUHIKAGE} controller={c} bundledAudio={bundledAudio}/>);
 await userEvent.setup().click(screen.getByRole('button',{name:'原创演示'}));
 await screen.findByRole('heading',{name:'小小的练习曲'});
 await act(async()=>finish(257.88));
 expect(screen.getByRole('heading',{name:'小小的练习曲'})).toBeVisible();
 expect(c.getSnapshot().duration).toBe(35.5);expect(engine.playing).toBe(false);
 ui.unmount();c.dispose();vi.unstubAllGlobals();
});
