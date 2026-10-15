import "fake-indexeddb/auto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, it, expect, vi } from "vitest";
import { Keyboard } from "../apps/web/src/piano/Keyboard";
import { PianoWorkspace } from "../apps/web/src/piano/PianoWorkspace";
import { PianoController } from "../packages/piano/controller";
import { PianoTestAudio, demoXml } from "./piano-fixtures";
import { DEMO_SONG } from "../packages/core/song";
vi.mock("../apps/web/src/piano/ScoreView", () => ({
  ScoreView: () => <div>谱面组件（独立测试真实 OSMD）</div>,
}));
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, text: async () => demoXml }),
  );
});
it("two pointers have independent voice IDs, black keys map correctly, release/cancel/lost capture cleans up", () => {
  // jsdom does not implement PointerEvent; use a MouseEvent carrying pointer fields.
  class TestPointer extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "touch";
    }
  }
  vi.stubGlobal("PointerEvent", TestPointer);
  const down = vi.fn(),
    up = vi.fn();
  const ui = render(<Keyboard enabled onDown={down} onUp={up} />);
  const white = screen.getByRole("button", { name: "琴键 C4" }),
    black = screen.getByRole("button", { name: "琴键 C♯/D♭4" });
  fireEvent.pointerDown(white, { pointerId: 11 });
  fireEvent.pointerDown(black, { pointerId: 22 });
  expect(down.mock.calls.map((c) => c[1])).toEqual([60, 61]);
  expect(white).toHaveAttribute("aria-pressed", "true");
  expect(black).toHaveAttribute("aria-pressed", "true");
  fireEvent.pointerUp(white, { pointerId: 11 });
  expect(up).toHaveBeenCalledWith(down.mock.calls[0][0]);
  expect(black).toHaveAttribute("aria-pressed", "true");
  fireEvent.pointerCancel(black, { pointerId: 22 });
  expect(up).toHaveBeenCalledWith(down.mock.calls[1][0]);
  fireEvent.pointerDown(white, { pointerId: 33 });
  fireEvent.lostPointerCapture(white, { pointerId: 33 });
  expect(up).toHaveBeenCalledTimes(3);
  fireEvent.pointerDown(white, { pointerId: 44 });
  ui.unmount();
  expect(up).toHaveBeenCalledTimes(4);
});
it("bar 5, reverse range, relative speed, wait judgement, snapshot feedback and background pause work through UI", async () => {
  const audio = new PianoTestAudio(),
    controller = new PianoController(audio),
    user = userEvent.setup();
  const ui = render(
    <PianoWorkspace song={DEMO_SONG} active controller={controller} />,
  );
  await screen.findByRole("button", { name: "第 8 小节" });
  await user.click(screen.getByRole("button", { name: "第 5 小节" }));
  await waitFor(() => expect(controller.getSnapshot().phase).toBe("playing"));
  expect(controller.getSnapshot().range).toEqual([4, 4]);
  await user.click(screen.getByRole("button", { name: "选择范围" }));
  await user.click(screen.getByRole("button", { name: "第 8 小节" }));
  await user.click(screen.getByRole("button", { name: "第 5 小节" }));
  expect(controller.getSnapshot().range).toEqual([4, 7]);
  fireEvent.change(screen.getByRole("combobox", { name: "钢琴播放速度" }), {
    target: { value: "0.75" },
  });
  expect(controller.getSnapshot().speed).toBe(0.75);
  await user.click(screen.getByRole("button", { name: "等待弹对" }));
  expect(controller.getSnapshot().phase).toBe("ready");
  await user.click(screen.getByRole("button", { name: "开始等待" }));
  expect(controller.getSnapshot().phase).toBe("waiting");
  act(() => controller.press("wrong", 61));
  expect(controller.getSnapshot().step).toBe(0);
  act(() => controller.press("right", 60));
  expect(controller.getSnapshot().step).toBe(1);
  await user.click(screen.getByRole("button", { name: "反馈 ↗" }));
  const report = screen.getByRole("textbox", {
    name: "完整反馈报告",
  }) as HTMLTextAreaElement;
  expect(report.value).toContain('"piano"');
  expect(report.value).toContain('"speed": 0.75');
  expect(report.value).toContain('"bars"');
  expect(report.value).not.toContain("<score-partwise");
  expect(report.value).not.toContain("晨光");
  const field = screen.getByRole("textbox", { name: "问题描述" });
  await user.click(field);
  act(() => controller.press("next", 64));
  expect(field).toHaveFocus();
  await user.click(screen.getByRole("checkbox"));
  expect(report.value).not.toContain('"piano"');
  await user.click(screen.getByRole("button", { name: "关闭反馈" }));
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: true,
  });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(controller.getSnapshot().phase).toBe("paused");
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  ui.unmount();
  controller.dispose();
});
it("unsupported import leaves the previous score visible and reports the reason", async () => {
  const controller = new PianoController(new PianoTestAudio()),
    ui = render(
      <PianoWorkspace song={DEMO_SONG} active controller={controller} />,
    );
  await screen.findByRole("button", { name: "第 8 小节" });
  const before = controller.score;
  const file = {
    name: "bad.xml",
    size: 8,
    arrayBuffer: async () => new TextEncoder().encode("<broken>").buffer,
  };
  fireEvent.change(screen.getByLabelText("导入 MusicXML 或 MXL"), {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("无效 XML"),
  );
  expect(controller.score).toBe(before);
  expect(screen.getByRole("button", { name: "第 8 小节" })).toBeVisible();
  ui.unmount();
  controller.dispose();
});
it("refresh restores the actual local score, range, mode and labels without autoplay", async () => {
  const user = userEvent.setup(),
    first = new PianoController(new PianoTestAudio());
  const ui = render(
    <PianoWorkspace song={DEMO_SONG} active controller={first} />,
  );
  await screen.findByRole("button", { name: "第 8 小节" });
  await waitFor(() =>
    expect(
      localStorage.getItem(`anisong:lastScore:${DEMO_SONG.id}`),
    ).not.toBeNull(),
  );
  await user.click(screen.getByRole("button", { name: "选择范围" }));
  await user.click(screen.getByRole("button", { name: "第 5 小节" }));
  await user.click(screen.getByRole("button", { name: "第 8 小节" }));
  await user.click(screen.getByRole("button", { name: "等待弹对" }));
  await user.click(screen.getByRole("button", { name: "谱面设置" }));
  fireEvent.change(screen.getByRole("combobox", { name: "音符辅助显示" }), {
    target: { value: "solfege" },
  });
  ui.unmount();
  first.dispose();
  const audio = new PianoTestAudio(),
    restored = new PianoController(audio),
    again = render(
      <PianoWorkspace song={DEMO_SONG} active controller={restored} />,
    );
  await screen.findByRole("button", { name: "第 8 小节" });
  expect(restored.getSnapshot()).toMatchObject({
    range: [4, 7],
    mode: "wait",
    phase: "ready",
  });
  expect(audio.calls).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "谱面设置" }));
  expect(screen.getByRole("combobox", { name: "音符辅助显示" })).toHaveValue(
    "solfege",
  );
  again.unmount();
  restored.dispose();
});
