import "fake-indexeddb/auto";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, it, expect, vi } from "vitest";
import { Workspace } from "../apps/web/src/Workspace";
import { App } from "../apps/web/src/App";
import { PianoWorkspace } from "../apps/web/src/piano/PianoWorkspace";
import { LoopController } from "../packages/core/controller";
import { PianoController } from "../packages/piano/controller";
import { TestEngine, lyrics } from "./helpers";
import { PianoTestAudio, demoXml } from "./piano-fixtures";
import { DEMO_SONG } from "../packages/core/song";
import {
  materialStore,
  preferences,
  savePreferences,
  practiceRecords,
  rememberPractice,
} from "../packages/core/app-state";
vi.mock("../apps/web/src/piano/ScoreView", () => ({
  ScoreView: ({ onSelect }: { onSelect: (n: number) => void }) => (
    <button onClick={() => onSelect(4)}>真实谱面选择回调</button>
  ),
}));
vi.mock("../apps/web/src/bundled-audio.json", () => ({
  default: {
    available: false,
    src: "",
    sha256: "",
    bytes: 0,
    lyrics: null,
    score: null,
  },
}));
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, text: async () => demoXml }),
  );
});
it("home, library, new song association and settings use the same song without autoplay", async () => {
  const user = userEvent.setup(),
    ui = render(<Workspace />);
  expect(
    screen.getByRole("heading", { name: "今天，练一小段。" }),
  ).toBeVisible();
  expect(practiceRecords()).toEqual([]);
  await user.click(screen.getByRole("button", { name: "曲库" }));
  await user.click(screen.getByRole("button", { name: "＋ 导入" }));
  await user.type(
    screen.getByRole("textbox", { name: "新歌曲名称" }),
    "My local score",
  );
  await user.click(screen.getByRole("button", { name: "新建歌曲" }));
  expect(screen.getByRole("combobox", { name: "关联歌曲" })).toHaveDisplayValue(
    "My local score",
  );
  await screen.findByText("尚未关联音频，请导入本机音频。");
  expect(fetch).not.toHaveBeenCalled(); // Custom song must never fetch a different demo.
  await user.click(screen.getByRole("button", { name: "设置" }));
  fireEvent.change(screen.getByRole("combobox", { name: "默认练习速度" }), {
    target: { value: "0.5" },
  });
  expect(preferences().speed).toBe(0.5);
  await user.click(screen.getByRole("button", { name: "练习" }));
  expect(screen.getByRole("navigation", { name: "主导航" })).toBeVisible();
  ui.unmount();
});
it("lyrics focus jumps through real controller, sheets pause, exit saves and view change never restarts", async () => {
  const engine = new TestEngine(),
    c = new LoopController(engine);
  await c.load("fixture");
  c.setLyrics(lyrics);
  const exit = vi.fn(),
    user = userEvent.setup();
  const ui = render(
    <App
      controller={c}
      autoLoad={false}
      view="practice"
      initialSong={DEMO_SONG}
      onExit={exit}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "第 2 句 いつまでも覚えていたい" }),
  );
  expect(engine.range).toEqual({ start: 16.3, end: 21.1 });
  expect(engine.playing).toBe(true);
  await user.click(screen.getByRole("button", { name: "0.75× 速度" }));
  expect(engine.playing).toBe(false);
  await user.click(screen.getByRole("button", { name: "0.5×" }));
  expect(engine.speed).toBe(0.5);
  await user.click(screen.getByRole("button", { name: "关闭播放速度" }));
  await user.click(screen.getByRole("button", { name: "返回歌曲" }));
  expect(exit).toHaveBeenCalled();
  expect(practiceRecords()[0]).toMatchObject({
    module: "lyrics",
    range: [1, 1],
    speed: 0.5,
  });
  ui.rerender(
    <App
      controller={c}
      autoLoad={false}
      view="materials"
      initialSong={DEMO_SONG}
    />,
  );
  expect(engine.playing).toBe(false);
  expect(c.getSnapshot().range).toEqual({ start: 16.3, end: 21.1 });
  ui.unmount();
  c.dispose();
});
it("piano preparation selects settings without sounding; focus bar click plays; exit pauses and records", async () => {
  const audio = new PianoTestAudio(),
    c = new PianoController(audio),
    user = userEvent.setup(),
    exit = vi.fn();
  const ui = render(
    <PianoWorkspace song={DEMO_SONG} active controller={c} view="prepare" />,
  );
  await screen.findByRole("button", { name: /练习范围/ });
  await waitFor(() => expect(c.score).toBeDefined());
  expect(audio.calls).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: /练习范围/ }));
  await user.click(screen.getByRole("button", { name: "选择第 8 小节" }));
  await user.click(screen.getByRole("button", { name: "选择第 5 小节" }));
  await user.click(screen.getByRole("button", { name: "确认范围" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(c.getSnapshot().range).toEqual([4, 7]);
  expect(audio.calls).toHaveLength(0);
  ui.rerender(
    <PianoWorkspace
      song={DEMO_SONG}
      active
      controller={c}
      view="practice"
      onExit={exit}
    />,
  );
  expect(screen.getAllByRole("button", { name: /^琴键 / })).toHaveLength(13);
  await user.click(screen.getByRole("button", { name: "真实谱面选择回调" }));
  await waitFor(() => expect(c.getSnapshot().phase).toBe("playing"));
  expect(audio.calls.length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "退出钢琴练习" }));
  expect(c.getSnapshot().phase).toBe("paused");
  await user.click(screen.getByRole("button", { name: "暂停并返回" }));
  await waitFor(() => expect(exit).toHaveBeenCalled());
  expect(practiceRecords()[0]).toMatchObject({
    module: "piano",
    range: [4, 4],
  });
  ui.unmount();
  c.dispose();
});
it("saved materials and range restore under the correct song with no automatic play", async () => {
  const custom = { ...DEMO_SONG, id: "restoration-test", title: "Saved song" };
  await materialStore.put({
    id: `${custom.id}:audio`,
    name: "fixture.mp3",
    source: "content://fixture",
  });
  await materialStore.put({
    id: `${custom.id}:lyrics`,
    name: "fixture.lrc",
    text: "[00:01]one\n[00:04]two\n[00:08]three",
  });
  localStorage.setItem(
    `anisong:lyricsSession:${custom.id}`,
    JSON.stringify({
      selection: [1, 2],
      speed: 0.5,
      loop: false,
      range: { start: 4.1, end: 35.4 },
    }),
  );
  const engine = new TestEngine(),
    c = new LoopController(engine),
    load = vi.spyOn(engine, "load");
  const ui = render(
    <App initialSong={custom} view="practice" controller={c} />,
  );
  await waitFor(() => expect(c.getSnapshot().range?.start).toBe(4.1));
  expect(load).toHaveBeenCalledWith("content://fixture");
  expect(c.getSnapshot()).toMatchObject({
    selection: [1, 2],
    speed: 0.5,
    loop: false,
    phase: "paused",
  });
  expect(engine.playing).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  ui.unmount();
  c.dispose();
});
it("bottom navigation disappears in practice and feedback returns to paused context", async () => {
  const user = userEvent.setup();
  history.replaceState(null, "", "?song=haruhikage-crychic#piano");
  const ui = render(<Workspace />);
  await screen.findByRole("heading", { name: "春日影" });
  expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "更多钢琴操作" }));
  await user.click(screen.getByRole("button", { name: "反馈 ↗" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("textbox", {
          name: "完整反馈报告",
        }) as HTMLTextAreaElement
      ).value,
    ).toContain('"piano"'),
  );
  await user.click(screen.getByRole("button", { name: "关闭反馈" }));
  expect(screen.getByRole("heading", { name: "春日影" })).toBeVisible();
  ui.unmount();
});
it("practice records are actual per-song module records; invalid storage and defaults recover safely", () => {
  expect(practiceRecords()).toEqual([]);
  localStorage.setItem("anisong:recents", "broken");
  expect(practiceRecords()).toEqual([]);
  savePreferences({ speed: 0.5, labels: "solfege" });
  expect(preferences()).toEqual({ speed: 0.5, labels: "solfege" });
  const r = {
    songId: "song-a",
    module: "piano" as const,
    range: [2, 5] as [number, number],
    speed: 0.5,
    loop: true,
    mode: "wait",
    savedAt: new Date().toISOString(),
  };
  rememberPractice(r);
  rememberPractice({ ...r, range: [3, 3] });
  expect(practiceRecords()).toHaveLength(1);
  expect(practiceRecords()[0].range).toEqual([3, 3]);
});

it("LRC can be associated before audio, then the imported recording uses those actual timestamps", async () => {
  const song = { ...DEMO_SONG, id: "lrc-first-test", title: "LRC first" };
  const engine = new TestEngine(),
    c = new LoopController(engine),
    user = userEvent.setup();
  const originalURL = URL;
  vi.stubGlobal(
    "URL",
    class extends originalURL {
      static createObjectURL() {
        return "blob:test-audio";
      }
      static revokeObjectURL() {}
    },
  );
  const ui = render(
    <App initialSong={song} controller={c} autoLoad={false} view="materials" />,
  );
  expect(screen.getByLabelText("导入 LRC")).toBeEnabled();
  fireEvent.change(screen.getByLabelText("导入 LRC"), {
    target: {
      files: [
        { name: "first.lrc", text: async () => "[00:01]one\n[00:04]two" },
      ],
    },
  });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("歌词已关联"),
  );
  expect((await materialStore.get(`${song.id}:lyrics`))?.text).toContain(
    "[00:04]",
  );
  fireEvent.change(screen.getByLabelText("导入音频"), {
    target: { files: [new File(["test"], "test.mp3", { type: "audio/mpeg" })] },
  });
  await waitFor(() => expect(c.getSnapshot().lines).toHaveLength(2));
  ui.rerender(
    <App initialSong={song} controller={c} autoLoad={false} view="practice" />,
  );
  await user.click(screen.getByRole("button", { name: "第 1 句 one" }));
  expect(engine.range).toEqual({ start: 1, end: 4 });
  expect(engine.playing).toBe(true);
  ui.unmount();
  c.dispose();
  vi.unstubAllGlobals();
});
it("a failed local save leaves the imported audio usable and reports the need to reselect", async () => {
  const engine = new TestEngine(),
    c = new LoopController(engine),
    song = { ...DEMO_SONG, id: "save-failure" };
  const originalURL = URL;
  vi.stubGlobal(
    "URL",
    class extends originalURL {
      static createObjectURL() {
        return "blob:test-audio";
      }
      static revokeObjectURL() {}
    },
  );
  vi.spyOn(materialStore, "put").mockRejectedValue(new Error("quota"));
  const ui = render(
    <App initialSong={song} controller={c} autoLoad={false} view="materials" />,
  );
  fireEvent.change(screen.getByLabelText("导入音频"), {
    target: { files: [new File(["test"], "test.mp3", { type: "audio/mpeg" })] },
  });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("本地保存失败"),
  );
  expect(c.getSnapshot().duration).toBeGreaterThan(0);
  expect(engine.playing).toBe(false);
  ui.unmount();
  c.dispose();
  vi.unstubAllGlobals();
});
