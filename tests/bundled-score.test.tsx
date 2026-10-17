import 'fake-indexeddb/auto';
import {act,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PianoWorkspace} from '../apps/web/src/piano/PianoWorkspace';
import {PianoController} from '../packages/piano/controller';
import {HARUHIKAGE} from '../packages/core/presets';
import {PianoTestAudio,fixture,note} from './piano-fixtures';
vi.mock('../apps/web/src/piano/ScoreView',()=>({ScoreView:()=> <div>Real score tested separately with OSMD</div>}));
const asset={src:'private-media/score-fixture.musicxml',sha256:'fixture',bytes:100};
const xml=fixture([note('C')+note('G',480,'<chord/>'),note('D')]);
beforeEach(()=>{localStorage.clear();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,text:async()=>xml}));});
afterEach(()=>vi.unstubAllGlobals());
it('loads the private preset and enables an explicitly chosen projection with real-key waiting and snapshot',async()=>{
 const audio=new PianoTestAudio(),c=new PianoController(audio),user=userEvent.setup(),ui=render(<PianoWorkspace song={HARUHIKAGE} active controller={c} bundledScore={asset}/>);
 await screen.findByRole('button',{name:'第 2 小节'});expect(c.score?.xml).toBe(xml);expect(audio.calls).toHaveLength(0);expect(c.track?.projection).toBeUndefined();
 await user.click(screen.getByRole('button',{name:'练习此轨最高音（单音）'}));expect(c.track?.projection).toBe('highest');
 expect(screen.getByText(/单音简化：只演奏/)).toBeVisible();await user.click(screen.getByRole('button',{name:'等待弹对'}));await user.click(screen.getByRole('button',{name:'开始等待'}));
 act(()=>c.press('wrong',60));expect(c.getSnapshot().step).toBe(0);act(()=>c.press('right',67));expect(c.getSnapshot().step).toBe(1);
 await user.click(screen.getByRole('button',{name:'反馈 ↗'}));expect((screen.getByRole('textbox',{name:'完整反馈报告'}) as HTMLTextAreaElement).value).toContain('"practiceTrack": "highest"');
 await user.click(screen.getByRole('button',{name:'关闭反馈'}));await user.click(screen.getByRole('button',{name:'返回原轨'}));expect(c.track?.projection).toBeUndefined();
 ui.unmount();c.dispose();
});
it('reports a missing preset and retries the actual configured source',async()=>{
 // A different score ID isolates this test from IndexedDB writes in other cases.
 vi.mocked(fetch).mockResolvedValueOnce({ok:false} as Response).mockResolvedValueOnce({ok:true,text:async()=>xml.replace('Melody','Retry fixture')} as Response);
 const c=new PianoController(new PianoTestAudio());const ui=render(<PianoWorkspace song={{...HARUHIKAGE,id:HARUHIKAGE.id}} active controller={c} bundledScore={asset}/>);
 // Remove the last-score pointer before restoration reads it (beforeEach clears it).
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('内置曲谱读取失败'));
 expect(c.score).toBeUndefined();await userEvent.setup().click(screen.getByRole('button',{name:'内置曲谱'}));await screen.findByRole('button',{name:'第 2 小节'});
 expect(fetch).toHaveBeenCalledTimes(2);ui.unmount();c.dispose();
});
it('restores a saved projection without fetching or starting audio',async()=>{
 const first=new PianoController(new PianoTestAudio()),ui=render(<PianoWorkspace song={HARUHIKAGE} active controller={first} bundledScore={asset}/>);
 await screen.findByRole('button',{name:'第 2 小节'});await userEvent.setup().click(screen.getByRole('button',{name:'练习此轨最高音（单音）'}));
 await waitFor(()=>expect(localStorage.getItem(`anisong:lastScore:${HARUHIKAGE.id}`)).not.toBeNull());ui.unmount();first.dispose();vi.mocked(fetch).mockClear();
 const audio=new PianoTestAudio(),restored=new PianoController(audio),next=render(<PianoWorkspace song={HARUHIKAGE} active controller={restored} bundledScore={asset}/>);
 await screen.findByRole('button',{name:'第 2 小节'});expect(restored.track?.projection).toBe('highest');expect(audio.calls).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();next.unmount();restored.dispose();
});

it('a new built-in revision replaces the old default once while preserving the old saved score',async()=>{
 const {scoreStore,scoreKey}=await import('../packages/piano/storage');const {parseMusicXml}=await import('../packages/piano/musicxml');const old=parseMusicXml(xml.replace('Melody','Old saved fixture')),key=scoreKey(HARUHIKAGE.id,old.id);
 await scoreStore.put({id:key,scoreId:old.id,songId:HARUHIKAGE.id,xml:old.xml,format:old.format,title:old.title,savedAt:''});localStorage.setItem(`anisong:lastScore:${HARUHIKAGE.id}`,key);localStorage.setItem(`anisong:bundledScore:${HARUHIKAGE.id}`,'old-revision');
 const c=new PianoController(new PianoTestAudio()),ui=render(<PianoWorkspace song={HARUHIKAGE} active controller={c} bundledScore={{...asset,sha256:'new-revision'}}/>);
 await screen.findByRole('button',{name:'第 2 小节'});expect(c.score?.xml).toBe(xml);expect(fetch).toHaveBeenCalledOnce();expect((await scoreStore.get(key))?.xml).toBe(old.xml);expect(localStorage.getItem(`anisong:bundledScore:${HARUHIKAGE.id}`)).toBe('new-revision');ui.unmount();c.dispose();
});
