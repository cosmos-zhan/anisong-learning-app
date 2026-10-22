import "fake-indexeddb/auto";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { parseLrc } from "../packages/core/lrc";
import { currentLyric, lyricScrollTop, lyricsDisplay } from "../packages/core/lyrics-display";
import { LoopController } from "../packages/core/controller";
import { App } from "../apps/web/src/App";
import { TestEngine } from "./helpers";

vi.mock("../apps/web/src/bundled-audio.json", () => ({ default: { available:false, src:"", bytes:0, sha256:"" } }));
const source = `[00:00]one\n[00:10]two\n[00:10][romaji]ni\n[00:10][translation]二\n[00:20]three\n[00:30]four`;
beforeEach(() => { localStorage.clear(); history.replaceState(null,"","#lyrics"); });
it("parses explicit learning text without changing timing, selection count or ordinary duplicate LRC", () => {
  const { lines, warnings } = parseLrc(source);
  expect(lines).toHaveLength(4); expect(warnings).toEqual([]);
  expect(lines[1]).toEqual({ start:10, text:"two", romaji:"ni", translation:"二" });
  expect(parseLrc("[00:01]a\n[00:01]b").lines).toEqual([{start:1,text:"a / b"}]);
  const offset = parseLrc("[offset:-100]\n[00:02][translation]译\n[00:02]原\n[00:05][romaji]orphan");
  expect(offset.lines).toEqual([{start:1.9,text:"原",translation:"译"}]);
  expect(offset.warnings.join()).toContain("没有同时间戳");
  expect(parseLrc("[00:01][00:03]原\n[00:01][00:03][romaji]yuan").lines.map(l=>l.romaji)).toEqual(["yuan","yuan"]);
  expect(()=>parseLrc("[00:01][romaji]alone")).toThrow("没有找到");
});
it("derives highlight and scroll from actual time with intro, boundary, loop and short-view handling", () => {
  const lines = parseLrc(source).lines;
  expect(currentLyric(lines,9.99)).toBe(0); expect(currentLyric(lines,10)).toBe(1);
  expect(currentLyric(lines,30)).toBe(3); expect(currentLyric(lines,10)).toBe(1);
  expect(currentLyric([{start:5,text:"intro"}],0)).toBe(-1);
  expect(currentLyric([],10)).toBe(-1);
  expect(lyricScrollTop(500,140,190,1000)).toBe(475);
  expect(lyricScrollTop(0,140,190,1000)).toBe(0);
  expect(lyricScrollTop(990,140,190,1000)).toBe(810);
});
it("recovers safe defaults from corrupt or partial stored display settings", () => {
  localStorage.setItem("anisong:lyricsDisplay", "broken");
  expect(lyricsDisplay()).toEqual({romaji:true,translation:true,autoScroll:true});
  localStorage.setItem("anisong:lyricsDisplay", '{"romaji":false,"autoScroll":"false"}');
  expect(lyricsDisplay()).toEqual({romaji:false,translation:true,autoScroll:true});
});
async function setup(text=source) {
  const engine=new TestEngine(), controller=new LoopController(engine);
  await controller.load("fixture"); controller.setLyrics(parseLrc(text).lines); await controller.select(0,3,false);
  const ui=render(<App controller={controller} autoLoad={false} view="practice" />);
  const user=userEvent.setup();
  return { engine, controller, ui, user };
}
it("defaults to both annotations, toggles independently, persists, and does not pause or seek when opening display", async () => {
  const {engine,controller,ui,user}=await setup();
  await user.click(screen.getByRole("button",{name:"播放"}));
  const seek=vi.spyOn(engine,"seek");
  await user.click(screen.getByRole("button",{name:"歌词显示"}));
  expect(engine.playing).toBe(true); expect(seek).not.toHaveBeenCalled();
  const sheet=screen.getByRole("dialog",{name:"歌词显示"});
  await user.click(within(sheet).getByRole("checkbox",{name:"显示罗马音"}));
  const row=screen.getByRole("button",{name:"第 2 句 two"});
  expect(within(row).queryByText("ni")).toBeNull(); expect(within(row).getByText("二")).toBeVisible();
  expect(lyricsDisplay().romaji).toBe(false);
  await user.click(within(sheet).getByRole("button",{name:"完成"}));
  await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(row); expect(engine.position).toBe(10); expect(engine.playing).toBe(true);
  ui.unmount(); controller.dispose();
});
it("follows real position changes, suspends for manual browsing, resumes, and leaves scroll alone when disabled", async () => {
  const scrollTo=vi.fn(); Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:scrollTo});
  const {engine,controller,ui,user}=await setup();
  const tick=(position:number)=>act(()=>{ engine.position=position; engine.emit({type:"position",position}); });
  scrollTo.mockClear(); tick(10); expect(scrollTo).toHaveBeenCalled();
  expect(screen.getByRole("button",{name:"第 2 句 two"})).toHaveAttribute("aria-current","true");
  fireEvent.wheel(screen.getByLabelText("歌词列表")); scrollTo.mockClear(); tick(20);
  expect(scrollTo).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"回到当前句"})); expect(scrollTo).toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"自动滚动 开"})); scrollTo.mockClear(); tick(30);
  expect(scrollTo).not.toHaveBeenCalled(); expect(lyricsDisplay().autoScroll).toBe(false);
  await user.click(screen.getByRole("button",{name:"自动滚动 关"}));
  await user.click(screen.getByRole("button",{name:"多句连续"}));
  await user.click(screen.getByRole("button",{name:"第 2 句 two"})); scrollTo.mockClear(); tick(0);
  expect(scrollTo).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"第 4 句 four"}));
  expect(engine.range).toEqual({start:10,end:35.5}); expect(engine.position).toBe(10);
  expect(scrollTo).toHaveBeenCalled(); ui.unmount(); controller.dispose();
  delete (HTMLElement.prototype as {scrollTo?:unknown}).scrollTo;
});
it("missing annotations are explicit and disabled without changing original lyrics", async () => {
  const {controller,ui,user}=await setup("[00:00]one\n[00:10]two\n[00:20]three\n[00:30]four");
  await user.click(screen.getByRole("button",{name:"歌词显示"}));
  expect(screen.getByRole("checkbox",{name:"显示罗马音"})).toBeDisabled();
  expect(screen.getByText("这首歌暂无中文译文")).toBeVisible();
  ui.unmount(); controller.dispose();
});
it("display panel remains usable on HTTP previews without randomUUID", async () => {
  const descriptor=Object.getOwnPropertyDescriptor(crypto,"randomUUID");
  Object.defineProperty(crypto,"randomUUID",{configurable:true,value:undefined});
  const {controller,ui,user}=await setup();
  try {
    await user.click(screen.getByRole("button",{name:"歌词显示"}));
    expect(screen.getByRole("dialog",{name:"歌词显示"})).toBeVisible();
    await user.click(screen.getByRole("button",{name:"完成"}));
    await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("歌词列表")).toBeVisible();
  } finally {
    if(descriptor)Object.defineProperty(crypto,"randomUUID",descriptor);
    ui.unmount();controller.dispose();
  }
});
