import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GrammarPage } from '../apps/web/src/lyrics/GrammarPage';
import { GrammarMarkdown } from '../apps/web/src/lyrics/GrammarMarkdown';
import { grammarMessages, parseGrammar, saveGrammarSettings } from '../packages/core/grammar';

const result = { meaning:'想再一次唱歌', pieces:[{text:'歌っていたい',explanation:'表示**持续**的愿望',segments:[{text:'歌',reading:'うた'},{text:'っていたい'}]}], points:[{title:'ている＋たい',explanation:'想继续做某事。'}] };
beforeEach(()=>{localStorage.clear();history.replaceState(null,'','#lyrics');vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Unexpected network'));});
afterEach(()=>vi.restoreAllMocks());
it('retains only valid reading segments whose text exactly matches the word',()=>{
 const valid=parseGrammar(JSON.stringify(result));
 expect(valid.pieces[0].segments).toEqual([{text:'歌',reading:'うた'},{text:'っていたい'}]);
 const invalid=parseGrammar(JSON.stringify({...result,pieces:[{...result.pieces[0],segments:[{text:'別',reading:'べつ'}]}]}));
 expect(invalid.pieces[0].segments).toBeUndefined();
 const unsafe=parseGrammar(JSON.stringify({...result,pieces:[{...result.pieces[0],segments:[{text:'歌',reading:'<script>'},{text:'っていたい'}]}]}));
 expect(unsafe.pieces[0].segments?.[0].reading).toBeUndefined();
});
it('shows furigana above the matching kanji and allows it to be hidden and restored',async()=>{
 saveGrammarSettings({endpoint:'https://model.example/v1/chat/completions',model:'fixture',key:'test-secret'});
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200}));
 const ui=render(<GrammarPage line={{start:0,text:'歌っていたい'}} index={0} audioAvailable onPlayLine={async()=>{}} onStopLine={async()=>{}} onClose={()=>{}}/>);
 const dialog=screen.getByRole('dialog',{name:'语法解读'});
 await waitFor(()=>expect(within(dialog).getByText('想再一次唱歌')).toBeVisible());
 expect(ui.container.querySelector('ruby rt')).toHaveTextContent('うた');
 fireEvent.click(within(dialog).getByRole('button',{name:'假名开'}));
 expect(ui.container.querySelector('ruby')).toBeNull();
 fireEvent.click(within(dialog).getByRole('button',{name:'假名关'}));
 expect(ui.container.querySelector('ruby rt')).toHaveTextContent('うた'); ui.unmount();
});
it('renders common Markdown as structured elements and leaves raw HTML inert',()=>{
 const ui=render(<GrammarMarkdown text={'## 语法重点\n\n这是 **持续状态**，不是 `过去式`。\n\n- 第一项\n- 第二项\n\n|形式|意思|\n|---|---|\n|たい|愿望|\n\n<script>alert(1)</script> [危险](javascript:alert)'} />);
 expect(screen.getByRole('heading',{name:'语法重点'})).toBeVisible();
 expect(screen.getByText('持续状态').tagName).toBe('STRONG');
 expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(2);
 expect(screen.getByRole('table')).toBeVisible();
 expect(ui.container.querySelector('script')).toBeNull();
 expect(ui.container.querySelector('a[href^="javascript"]')).toBeNull();
 expect(screen.getByText(/<script>/)).toBeVisible();
});
it('renders the actual follow-up reply with Markdown emphasis and lists',async()=>{
 saveGrammarSettings({endpoint:'https://model.example/v1/chat/completions',model:'fixture',key:'test-secret'});
 const reply=(content:string)=>new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200});
 vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(reply(JSON.stringify(result))).mockResolvedValueOnce(reply('## 区别\n\n表示 **持续**。\n\n- 想继续唱\n- 并非过去式'));
 render(<GrammarPage line={{start:0,text:'歌っていたい'}} index={0} audioAvailable onPlayLine={async()=>{}} onStopLine={async()=>{}} onClose={()=>{}}/>);
 const dialog=screen.getByRole('dialog',{name:'语法解读'});
 await waitFor(()=>expect(within(dialog).getByText('想再一次唱歌')).toBeVisible());
 fireEvent.click(within(dialog).getByRole('button',{name:'围绕这句追问'}));
 fireEvent.click(within(dialog).getByRole('button',{name:'这句的动词是怎么变化的？'}));
 expect(await within(dialog).findByRole('heading',{name:'区别'})).toBeVisible();
 expect(within(dialog).getByText('持续').tagName).toBe('STRONG');
 expect(within(dialog).getByRole('list').querySelectorAll('li')).toHaveLength(2);
});

it('sends the selected lyric context and bounds full lyrics without including annotations',()=>{
 const lines=Array.from({length:10},(_,i)=>({text:`歌词${i}`,romaji:`secret${i}`}));
 const near=grammarMessages('歌词5',[],{title:'歌名',lines,index:5,scope:'nearby'})[1].content;
 expect(near).toContain('歌名'); expect(near).toContain('歌词2'); expect(near).toContain('歌词8'); expect(near).not.toContain('歌词1'); expect(near).not.toContain('secret');
 const full=grammarMessages('歌词5',[],{title:'歌名',lines,index:5,scope:'full'})[1].content;
 expect(full).toContain('歌词0'); expect(full).toContain('歌词9');
 const long=grammarMessages('当前',[],{lines:Array.from({length:30},()=>({text:'文'.repeat(1000)})),index:1,scope:'full'})[1].content;
 expect(long).toContain('过长已截断'); expect(long.length).toBeLessThan(18000);
});
it('persists per-line history, lets the user hide it and restores it after reopening',async()=>{
 saveGrammarSettings({endpoint:'https://model.example/v1/chat/completions',model:'fixture',key:'test-secret'});
 const reply=(content:string)=>new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200});
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(reply(JSON.stringify(result))).mockResolvedValueOnce(reply('保留的回答'));
 const props={line:{start:1,text:'歌っていたい',romaji:'utatte itai'}, lines:[{start:1,text:'歌っていたい'}], songId:'song-a',index:0,audioAvailable:true,onPlayLine:async()=>{},onStopLine:async()=>{},onClose:()=>{}};
 const ui=render(<GrammarPage {...props}/>); const dialog=screen.getByRole('dialog',{name:'语法解读'});
 await within(dialog).findByText('想再一次唱歌');
 fireEvent.click(within(dialog).getByRole('button',{name:'罗马音开'})); expect(within(dialog).queryByText('utatte itai')).toBeNull();
 fireEvent.click(within(dialog).getByRole('button',{name:'罗马音关'})); expect(within(dialog).getByText('utatte itai')).toBeVisible();
 fireEvent.click(within(dialog).getByRole('button',{name:'围绕这句追问'}));
 fireEvent.click(within(dialog).getByRole('button',{name:'这句的动词是怎么变化的？'})); await within(dialog).findByText('保留的回答');
 fireEvent.click(within(dialog).getByRole('button',{name:'隐藏历史'})); expect(within(dialog).queryByText('保留的回答')).toBeNull();
 fireEvent.click(within(dialog).getByRole('button',{name:'显示历史'})); expect(within(dialog).getByText('保留的回答')).toBeVisible();
 ui.unmount(); render(<GrammarPage {...props}/>); const reopened=screen.getByRole('dialog',{name:'语法解读'});
 fireEvent.click(within(reopened).getByRole('tab',{name:'本句追问 1'})); expect(within(reopened).getByText('保留的回答')).toBeVisible(); expect(fetcher).toHaveBeenCalledTimes(2);
});
it('keeps an unsent question when opening settings and returning to chat',async()=>{
 saveGrammarSettings({endpoint:'https://model.example/v1/chat/completions',model:'fixture',key:'test-secret'});
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200}));
 const close=vi.fn();
 render(<GrammarPage line={{start:0,text:'歌っていたい'}} index={0} audioAvailable onPlayLine={async()=>{}} onStopLine={async()=>{}} onClose={close}/>);
 const dialog=screen.getByRole('dialog',{name:'语法解读'});
 await within(dialog).findByText('想再一次唱歌');
 fireEvent.click(within(dialog).getByRole('button',{name:'围绕这句追问'}));
 fireEvent.change(within(dialog).getByLabelText('对当前句子的追问'),{target:{value:'这个时态为什么这样用？'}});
 fireEvent.click(within(dialog).getByRole('button',{name:/上下文/}));
 fireEvent.change(within(dialog).getByLabelText('发送歌词上下文'),{target:{value:'full'}});
 fireEvent.click(within(dialog).getByRole('button',{name:'保存并返回'}));
 await waitFor(()=>expect(within(dialog).getByLabelText('对当前句子的追问')).toHaveValue('这个时态为什么这样用？'));
 expect(within(dialog).getByRole('button',{name:/上下文：全文/})).toBeVisible();
 expect(close).not.toHaveBeenCalled();
});
