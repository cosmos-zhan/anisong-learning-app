import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GrammarPage } from '../apps/web/src/lyrics/GrammarPage';
import { GrammarMarkdown } from '../apps/web/src/lyrics/GrammarMarkdown';
import { parseGrammar, saveGrammarSettings } from '../packages/core/grammar';

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
 fireEvent.click(within(dialog).getByRole('button',{name:'这句的动词是怎么变化的？'}));
 expect(await within(dialog).findByRole('heading',{name:'区别'})).toBeVisible();
 expect(within(dialog).getByText('持续').tagName).toBe('STRONG');
 expect(within(dialog).getByRole('list').querySelectorAll('li')).toHaveLength(2);
});
