import "fake-indexeddb/auto";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, it, expect, vi } from "vitest";
import { PianoWorkspace } from "../apps/web/src/piano/PianoWorkspace";
import { MeasurePicker } from "../apps/web/src/piano/MeasurePicker";
import { PianoController } from "../packages/piano/controller";
import { PianoTestAudio, demoXml } from "./piano-fixtures";
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
  await screen.findByRole("button", { name: "钢琴练习设置" });
  await user.click(screen.getByRole("button", { name: "更多钢琴操作" }));
  await user.click(screen.getByRole("button", { name: "返回练习准备" }));
  await waitFor(() => expect(location.hash).toBe("#piano-prep"));
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => history.back());
  await waitFor(() => expect(location.hash).toBe("#piano"));
  expect(screen.queryByRole("dialog")).toBeNull();
  ui.unmount();
});
