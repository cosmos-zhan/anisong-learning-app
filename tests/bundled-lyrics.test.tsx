import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {App} from '../apps/web/src/App';
import {LoopController} from '../packages/core/controller';
import {HARUHIKAGE} from '../packages/core/presets';
import {TestEngine} from './helpers';

// Synthetic words only: private uploaded lyrics are never committed as fixtures.
const fixture='[00:15.045]fixture one\n[00:19.371]fixture two\n[00:25.586]fixture three';
const audio={available:true,src:'private-media/audio-fixture.mp3',sha256:'fixture',bytes:1024,lyrics:{src:'private-media/lyrics-fixture.lrc',sha256:'fixture',bytes:90}};
beforeEach(()=>vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,text:async()=>fixture})));
afterEach(()=>vi.unstubAllGlobals());
function setup(){const engine=new TestEngine();vi.spyOn(engine,'load').mockResolvedValueOnce(257.880816).mockResolvedValue(35.5);const c=new LoopController(engine);const ui=render(<App controller={c} initialSong={HARUHIKAGE} bundledAudio={audio}/>);return {engine,c,ui,user:userEvent.setup()};}
it('loads bundled LRC automatically without autoplay; actual milliseconds drive single and multiple loops',async()=>{
 const {engine,c,ui,user}=setup();
 await screen.findByRole('button',{name:'第 2 句 fixture two'});
 expect(fetch).toHaveBeenCalledWith('/private-media/lyrics-fixture.lrc',expect.objectContaining({signal:expect.any(AbortSignal)}));
 expect(c.getSnapshot()).toMatchObject({selection:null,range:{start:0,end:257.880816},phase:'paused'});expect(engine.playing).toBe(false);
 await user.click(screen.getByRole('button',{name:'第 2 句 fixture two'}));
 expect(engine.playing).toBe(true);expect(engine.range).toEqual({start:19.371,end:25.586});
 await user.click(screen.getByRole('button',{name:'0.75×'}));expect(engine.speed).toBe(.75);expect(engine.range).toEqual({start:19.371,end:25.586});
 await user.click(screen.getByRole('button',{name:'多句连续'}));
 await user.click(screen.getByRole('button',{name:'第 2 句 fixture two'}));await user.click(screen.getByRole('button',{name:'第 1 句 fixture one'}));
 expect(engine.range).toEqual({start:15.045,end:25.586});
 await user.click(screen.getByRole('button',{name:'返回整曲试听'}));expect(c.getSnapshot().selection).toBeNull();expect(engine.range?.start).toBe(0);expect(engine.playing).toBe(false);
 ui.unmount();c.dispose();
});
it('failed bundled lyrics keep genuine whole-track audio available and can be retried',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce({ok:false} as Response);
 const {engine,c,ui,user}=setup();
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('内置歌词载入失败'));
 expect(c.getSnapshot().lines).toEqual([]);expect(screen.getByRole('button',{name:'播放'})).toBeEnabled();
 await user.click(screen.getByRole('button',{name:'播放'}));expect(engine.playing).toBe(true);
 await user.click(screen.getByRole('button',{name:'内置春日影'}));await screen.findByRole('button',{name:'第 1 句 fixture one'});
 expect(engine.playing).toBe(false);ui.unmount();c.dispose();
});
it('invalid LRC reports its failure instead of fabricating rows or blocking whole-track playback',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce({ok:true,text:async()=>'<html>not LRC</html>'} as Response);
 const {c,ui}=setup();await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('内置歌词载入失败'));
 expect(c.getSnapshot().lines).toHaveLength(0);expect(c.getSnapshot().range).toEqual({start:0,end:257.880816});
 expect(screen.getByRole('button',{name:'播放'})).toBeEnabled();ui.unmount();c.dispose();
});
it('a late bundled LRC cannot overwrite an explicitly imported local LRC',async()=>{
 let finish!:(response:Response)=>void;vi.mocked(fetch).mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 const {c,ui}=setup();await waitFor(()=>expect(screen.getByLabelText('导入 LRC')).toBeEnabled());
 fireEvent.change(screen.getByLabelText('导入 LRC'),{target:{files:[{text:async()=>'[00:02.345]local fixture'}]}});
 await screen.findByRole('button',{name:'第 1 句 local fixture'});
 await act(async()=>finish({ok:true,text:async()=>fixture} as Response));
 expect(c.getSnapshot().lines).toHaveLength(1);expect(c.getSnapshot().lines[0].text).toBe('local fixture');expect(c.getSnapshot().lines[0].start).toBeCloseTo(2.345,9);expect(c.getSnapshot().selection).toEqual([0,0]);
 ui.unmount();c.dispose();
});
it('switching audio invalidates a late bundled lyric response and preserves the chosen demo',async()=>{
 let finish!:(response:Response)=>void;vi.mocked(fetch).mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 const {c,ui,user}=setup();await waitFor(()=>expect(c.getSnapshot().duration).toBe(257.880816));
 await user.click(screen.getByRole('button',{name:'原创演示'}));await screen.findByRole('heading',{name:'小小的练习曲'});
 await act(async()=>finish({ok:true,text:async()=>'[00:01]stale fixture'} as Response));
 expect(c.getSnapshot().duration).toBe(35.5);expect(c.getSnapshot().lines).toHaveLength(3);expect(c.getSnapshot().lines[0].text).toBe('fixture one');
 ui.unmount();c.dispose();
});
