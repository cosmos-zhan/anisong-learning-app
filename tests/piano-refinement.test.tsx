import "fake-indexeddb/auto";
import {
  render,
  screen,
  within,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, it, expect, vi } from "vitest";
import { PianoWorkspace } from "../apps/web/src/piano/PianoWorkspace";
import { MeasurePicker } from "../apps/web/src/piano/MeasurePicker";
import { PianoController } from "../packages/piano/controller";
import { PianoTestAudio, demoXml, fixture, note } from "./piano-fixtures";
import { DEMO_SONG } from "../packages/core/song";
import { Workspace } from "../apps/web/src/Workspace";
vi.mock("../apps/web/src/piano/ScoreView", () => ({
  ScoreView: ({ onSelect }: { onSelect: (i: number) => void }) => (
    <button onClick={() => onSelect(4)}>选择真实小节回调</button>
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
  history.replaceState(null, "", "?song=demo-original#piano");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, text: async () => demoXml }),
  );
});
async function practice() {
  const audio = new PianoTestAudio(),
    controller = new PianoController(audio),
    user = userEvent.setup();
  const ui = render(
    <PianoWorkspace
      song={DEMO_SONG}
      active
      view="practice"
      controller={controller}
    />,
  );
  await waitFor(() => expect(controller.score).toBeDefined());
  return { audio, controller, user, ui };
}
it("range grid pauses, previews reverse selection, commits only on confirm and cancels without changing audio range", async () => {
  const { audio, controller: c, user, ui } = await practice();
  await user.click(screen.getByRole("button", { name: "选择真实小节回调" }));
  await waitFor(() => expect(c.getSnapshot().phase).toBe("playing"));
  await user.click(screen.getByRole("button", { name: /第 5 小节 ▾/ }));
  expect(c.getSnapshot().phase).toBe("paused");
  const dialog = screen.getByRole("dialog", { name: "练习小节范围" });
  expect(within(dialog).queryByRole("spinbutton")).toBeNull();
  await user.click(
    within(dialog).getByRole("button", { name: "选择第 8 小节" }),
  );
  expect(
    within(dialog).getByRole("button", { name: "确认范围" }),
  ).toBeDisabled();
  await user.click(
    within(dialog).getByRole("button", { name: "选择第 5 小节" }),
  );
  expect(c.getSnapshot().range).toEqual([4, 4]);
  for (let i = 5; i <= 8; i++)
    expect(
      within(dialog).getByRole("button", { name: `选择第 ${i} 小节` }),
    ).toHaveAttribute("aria-pressed", "true");
  const voices = audio.calls.length;
  await user.click(within(dialog).getByRole("button", { name: "确认范围" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(c.getSnapshot().range).toEqual([4, 7]);
  expect(audio.calls).toHaveLength(voices);
  await user.click(screen.getByRole("button", { name: /第 5–8 小节 ▾/ }));
  await user.click(screen.getByRole("button", { name: "选择第 1 小节" }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(c.getSnapshot().range).toEqual([4, 7]);
  await user.click(screen.getByRole("button", { name: "播放" }));
  await waitFor(() => expect(c.getSnapshot().phase).toBe("playing"));
  expect(audio.calls.length).toBeGreaterThan(voices);
  ui.unmount();
  c.dispose();
});
it("speed entry opens only four speed choices and preserves the selected range and paused audio", async () => {
  const { controller: c, user, ui } = await practice();
  act(() => c.select(2, 5, false));
  await user.click(screen.getByRole("button", { name: "钢琴速度 0.75 倍" }));
  const dialog = screen.getByRole("dialog", { name: "练习速度" });
  expect(within(dialog).queryByRole("combobox")).toBeNull();
  expect(within(dialog).queryByRole("button", { name: /自动试听/ })).toBeNull();
  const group = within(dialog).getByRole("group", { name: "钢琴练习速度" });
  expect(within(group).getAllByRole("button")).toHaveLength(4);
  await user.click(within(group).getByRole("button", { name: "0.5×" }));
  expect(c.getSnapshot()).toMatchObject({
    range: [2, 5],
    speed: 0.5,
    phase: "paused",
  });
  expect(within(group).getByRole("button", { name: /0.5×/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "关闭练习速度" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  ui.unmount();
  c.dispose();
});
it("range can span picker pages and a single measure uses the same two-touch confirmation", async () => {
  const apply = vi.fn(),
    dismiss = vi.fn((after?: () => void) => after?.()),
    user = userEvent.setup();
  const ui = render(
    <MeasurePicker
      count={40}
      range={[4, 7]}
      onApply={apply}
      dismiss={dismiss}
    />,
  );
  await user.click(screen.getByRole("button", { name: "选择第 8 小节" }));
  await user.click(screen.getByRole("button", { name: "后一组小节" }));
  await user.click(screen.getByRole("button", { name: "选择第 20 小节" }));
  expect(screen.getByRole("status")).toHaveTextContent("已选第 8–20 小节");
  await user.click(screen.getByRole("button", { name: "确认范围" }));
  expect(apply).toHaveBeenCalledWith(7, 19);
  await user.click(screen.getByRole("button", { name: "选择第 18 小节" }));
  await user.click(screen.getByRole("button", { name: "选择第 18 小节" }));
  await user.click(screen.getByRole("button", { name: "确认范围" }));
  expect(apply).toHaveBeenLastCalledWith(17, 17);
  ui.unmount();
});
it("browser Back closes the range panel first; a second Back returns to preparation with no stale overlay", async () => {
  history.replaceState(null, "", "?song=demo-original#piano-prep");
  const user = userEvent.setup(),
    ui = render(<Workspace />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /练习范围/ })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "进入钢琴练习 →" }));
  await user.click(screen.getByRole("button", { name: /第 1 小节 ▾/ }));
  expect(screen.getByRole("dialog")).toBeVisible();
  act(() => history.back());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(location.hash).toBe("#piano");
  expect(screen.getByLabelText("钢琴播放控制")).toBeVisible();
  act(() => history.back());
  await waitFor(() => expect(location.hash).toBe("#piano-prep"));
  expect(screen.getByRole("button", { name: "进入钢琴练习 →" })).toBeVisible();
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(screen.getByRole("button", { name: "进入钢琴练习 →" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  ui.unmount();
});
it("explicit panel close consumes its history entry, so the next Back changes the page once", async () => {
  history.replaceState(null, "", "?song=demo-original#piano-prep");
  const user = userEvent.setup(),
    ui = render(<Workspace />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /练习范围/ })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "进入钢琴练习 →" }));
  await user.click(screen.getByRole("button", { name: "钢琴速度 0.75 倍" }));
  await user.click(screen.getByRole("button", { name: "关闭练习速度" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  act(() => history.back());
  await waitFor(() => expect(location.hash).toBe("#piano-prep"));
  expect(screen.queryByRole("dialog")).toBeNull();
  ui.unmount();
});
it("more-menu navigation consumes panel history before changing module", async () => {
  const user = userEvent.setup(),
    ui = render(<Workspace />);
  await screen.findByRole("button", { name: "钢琴声部与轨道" });
  await user.click(screen.getByRole("button", { name: "更多钢琴操作" }));
  await user.click(screen.getByRole("button", { name: "返回练习准备" }));
  await waitFor(() => expect(location.hash).toBe("#piano-prep"));
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => history.back());
  await waitFor(() => expect(location.hash).toBe("#piano"));
  expect(screen.queryByRole("dialog")).toBeNull();
  ui.unmount();
});

async function closePanel(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
) {
  await user.click(screen.getByRole("button", { name: `关闭${title}` }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

it("preparation shows four summaries and each entry opens only its own parameter panel", async () => {
  const c = new PianoController(new PianoTestAudio()),
    user = userEvent.setup();
  const ui = render(
    <PianoWorkspace song={DEMO_SONG} active view="prepare" controller={c} />,
  );
  await waitFor(() => expect(c.score).toBeDefined());
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "钢琴练习参数" })).getAllByRole(
      "button",
    ),
  ).toHaveLength(4);
  await user.click(screen.getByRole("button", { name: "练习方式：自动试听" }));
  const mode = screen.getByRole("dialog", { name: "练习方式" });
  expect(
    within(mode).getAllByRole("button", {
      name: /^(自动试听|等待弹对|自由弹奏)/,
    }),
  ).toHaveLength(3);
  expect(within(mode).queryByRole("combobox")).toBeNull();
  await closePanel(user, "练习方式");
  await user.click(screen.getByRole("button", { name: "选择声部与轨道" }));
  const tracks = screen.getByRole("dialog", { name: "声部与轨道" });
  expect(within(tracks).getAllByRole("combobox")).toHaveLength(2);
  expect(
    within(tracks).queryByRole("group", { name: "钢琴练习方式" }),
  ).toBeNull();
  expect(
    within(tracks).queryByRole("group", { name: "钢琴练习速度" }),
  ).toBeNull();
  await closePanel(user, "声部与轨道");
  expect(c.getSnapshot().phase).not.toBe("playing");
  ui.unmount();
  c.dispose();
});

it("dedicated modes preserve range and speed; only actual virtual-key events advance waiting", async () => {
  const { controller: c, audio, user, ui } = await practice();
  act(() => c.select(2, 5, false));
  await user.click(screen.getByRole("button", { name: "练习方式：自动试听" }));
  const panel = screen.getByRole("dialog", { name: "练习方式" });
  await user.click(within(panel).getByRole("button", { name: /^等待弹对/ }));
  expect(c.getSnapshot()).toMatchObject({
    mode: "wait",
    range: [2, 5],
    speed: 0.75,
  });
  expect(audio.calls).toHaveLength(0);
  await closePanel(user, "练习方式");
  await user.click(screen.getByRole("button", { name: "开始等待" }));
  await waitFor(() => expect(c.getSnapshot().phase).toBe("waiting"));
  const target =
    document.querySelector<HTMLButtonElement>(".piano-key.target")!;
  expect(target).toHaveAccessibleName("琴键 F4");
  const wrong = screen.getByRole("button", { name: "琴键 C4" });
  fireEvent.keyDown(wrong, { key: "Enter" });
  fireEvent.keyUp(wrong, { key: "Enter" });
  expect(c.getSnapshot().step).toBe(0);
  expect(audio.calls.at(-1)?.midi).toBe(60);
  fireEvent.keyDown(target, { key: "Enter" });
  fireEvent.keyUp(target, { key: "Enter" });
  expect(c.getSnapshot().step).toBe(1);
  expect(audio.calls.at(-1)?.midi).toBe(65);
  expect(audio.releases.length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "练习方式：等待弹对" }));
  await user.click(screen.getByRole("button", { name: /^自由弹奏/ }));
  expect(c.getSnapshot()).toMatchObject({
    mode: "free",
    range: [2, 5],
    speed: 0.75,
  });
  await closePanel(user, "练习方式");
  expect(screen.getByRole("button", { name: "播放" })).toBeDisabled();
  ui.unmount();
  c.dispose();
});

it("label panel changes the actual keyboard, persists session and includes the real label setting in feedback", async () => {
  const { controller: c, user, ui } = await practice();
  act(() => c.select(2, 5, false));
  await user.click(screen.getByRole("button", { name: "音名辅助" }));
  const panel = screen.getByRole("dialog", { name: "音符辅助" });
  expect(within(panel).queryByRole("combobox")).toBeNull();
  expect(within(panel).getAllByRole("button")).toHaveLength(4); // three choices and close
  await user.click(within(panel).getByRole("button", { name: /^固定唱名/ }));
  expect(screen.getByRole("button", { name: "琴键 C4" })).toHaveTextContent(
    "Do",
  );
  await closePanel(user, "音符辅助");
  expect(c.getSnapshot().range).toEqual([2, 5]);
  await user.click(screen.getByRole("button", { name: "更多钢琴操作" }));
  expect(
    screen.queryByRole("button", { name: "模式 / 声部 / 速度 / 标记" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "反馈 ↗" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("textbox", {
          name: "完整反馈报告",
        }) as HTMLTextAreaElement
      ).value,
    ).toContain('"labels": "solfege"'),
  );
  await user.click(screen.getByRole("button", { name: "关闭反馈" }));
  ui.unmount();
  c.dispose();
  const restored = await practice();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "琴键 C4" })).toHaveTextContent(
      "Do",
    ),
  );
  expect(restored.controller.getSnapshot().range).toEqual([2, 5]);
  expect(restored.audio.calls).toHaveLength(0);
  restored.ui.unmount();
  restored.controller.dispose();
});

it("chord waiting requires an explicit projection; cancel keeps original and returning to original explains the conflict", async () => {
  const xml = fixture([note("C") + note("G", 480, "<chord/>"), note("D")]);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, text: async () => xml }),
  );
  const { controller: c, audio, user, ui } = await practice();
  act(() => c.select(0, 1, false));
  await user.click(screen.getByRole("button", { name: "练习方式：自动试听" }));
  await user.click(screen.getByRole("button", { name: /^等待弹对/ }));
  expect(
    screen.getByRole("dialog", { name: "等待弹对需要单音轨" }),
  ).toHaveFocus();
  expect(c.track?.projection).toBeUndefined();
  expect(c.getSnapshot().mode).toBe("listen");
  act(() => history.back());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(location.hash).toBe("#piano");
  expect(c.getSnapshot().mode).toBe("listen");
  await user.click(screen.getByRole("button", { name: "练习方式：自动试听" }));
  await user.click(screen.getByRole("button", { name: /^等待弹对/ }));
  await user.click(screen.getByRole("button", { name: "改练最高音（单音）" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(c.track?.projection).toBe("highest");
  expect(c.getSnapshot()).toMatchObject({
    mode: "wait",
    range: [0, 1],
    speed: 0.75,
  });
  expect(audio.calls).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "开始等待" }));
  await waitFor(() => expect(c.getSnapshot().phase).toBe("waiting"));
  const target =
    document.querySelector<HTMLButtonElement>(".piano-key.target")!;
  expect(target).toHaveAccessibleName("琴键 G4");
  fireEvent.keyDown(target, { key: "Enter" });
  fireEvent.keyUp(target, { key: "Enter" });
  expect(c.getSnapshot().step).toBe(1);
  await user.click(screen.getByRole("button", { name: "钢琴声部与轨道" }));
  await user.click(screen.getByRole("button", { name: "返回原轨" }));
  expect(c.track?.projection).toBeUndefined();
  expect(
    screen.getByRole("dialog", { name: "等待弹对需要单音轨" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "继续自动试听原轨" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(c.getSnapshot()).toMatchObject({
    mode: "listen",
    range: [0, 1],
    speed: 0.75,
  });
  const before = audio.calls.length;
  await user.click(screen.getByRole("button", { name: "播放" }));
  await waitFor(() => expect(c.getSnapshot().phase).toBe("playing"));
  expect(audio.calls.slice(before).map((call) => call.midi)).toEqual([60, 67]);
  ui.unmount();
  c.dispose();
});

it("part selection clamps a shorter part honestly, preserves mode/speed, and restores the chosen part and labels", async () => {
  const xml = fixture(
    Array.from({ length: 8 }, () => note("C")),
    "",
    '<part id="P2"><measure number="1"><attributes><divisions>480</divisions></attributes>' +
      note("E") +
      '</measure><measure number="2">' +
      note("F") +
      "</measure></part>",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, text: async () => xml }),
  );
  const { controller: c, audio, user, ui } = await practice();
  act(() => {
    c.select(4, 7, false);
    c.setSpeed(0.5);
  });
  await user.click(screen.getByRole("button", { name: "钢琴声部与轨道" }));
  const panel = screen.getByRole("dialog", { name: "声部与轨道" });
  await user.selectOptions(
    within(panel).getByRole("combobox", { name: "练习声部" }),
    "P2",
  );
  expect(c.part?.id).toBe("P2");
  expect(c.getSnapshot()).toMatchObject({
    range: [1, 1],
    speed: 0.5,
    mode: "listen",
  });
  expect(within(panel).getByRole("status")).toHaveTextContent("Second");
  expect(c.getSnapshot().message).toContain("范围已安全裁剪");
  expect(audio.calls).toHaveLength(0);
  await closePanel(user, "声部与轨道");
  await user.click(screen.getByRole("button", { name: "音名辅助" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: /^关闭\s*只看五线谱/,
    }),
  );
  await closePanel(user, "音符辅助");
  ui.unmount();
  c.dispose();
  const restored = await practice();
  expect(restored.controller.part?.id).toBe("P2");
  expect(restored.controller.getSnapshot()).toMatchObject({
    range: [1, 1],
    speed: 0.5,
    mode: "listen",
  });
  expect(screen.getByRole("button", { name: "琴键 C4" }).textContent).toBe("");
  expect(screen.getByRole("button", { name: "标记关闭" })).toBeVisible();
  expect(restored.audio.calls).toHaveLength(0);
  restored.ui.unmount();
  restored.controller.dispose();
});
