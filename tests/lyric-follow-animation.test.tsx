import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLyricFollow } from '../apps/web/src/lyrics/useLyricFollow';

let notify: ResizeObserverCallback;
class FakeResizeObserver {
  constructor(callback: ResizeObserverCallback) { notify=callback; }
  observe() {} disconnect() {} unobserve() {}
}
function Follow({current,enabled=true}:{current:number;enabled?:boolean}) {
  const follow=useLyricFollow(current,enabled,false,'layout');
  return <div ref={follow.list} aria-label="list" onWheel={follow.suspend}><div data-line="0">zero</div><div data-line="1">one</div></div>;
}
afterEach(()=>vi.unstubAllGlobals());
it('keeps the smooth movement when playback changes line, but repositions immediately on an actual resize',()=>{
  const scroll=vi.fn();vi.stubGlobal('ResizeObserver',FakeResizeObserver);
  const original=HTMLElement.prototype.scrollTo;HTMLElement.prototype.scrollTo=scroll;
  try {
    const ui=render(<Follow current={0}/>);const list=screen.getByLabelText('list');
    Object.defineProperty(list,'clientHeight',{configurable:true,value:100});
    act(()=>notify([],{} as ResizeObserver));scroll.mockClear();
    ui.rerender(<Follow current={1}/>);
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({behavior:'smooth'}));
    scroll.mockClear();act(()=>notify([],{} as ResizeObserver));
    expect(scroll).not.toHaveBeenCalled();
    Object.defineProperty(list,'clientHeight',{configurable:true,value:120});
    act(()=>notify([],{} as ResizeObserver));
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({behavior:'auto'}));
    scroll.mockClear();fireEvent.wheel(list);
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({behavior:'auto'}));
    scroll.mockClear();ui.rerender(<Follow current={0}/>);expect(scroll).not.toHaveBeenCalled();
    ui.unmount();
  } finally { HTMLElement.prototype.scrollTo=original; }
});
it('respects reduced motion for a line change',()=>{
  const scroll=vi.fn();const original=HTMLElement.prototype.scrollTo;HTMLElement.prototype.scrollTo=scroll;
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));
  try {const ui=render(<Follow current={0}/>);scroll.mockClear();ui.rerender(<Follow current={1}/>);expect(scroll).toHaveBeenCalledWith(expect.objectContaining({behavior:'auto'}));ui.unmount();}
  finally {HTMLElement.prototype.scrollTo=original;}
});
