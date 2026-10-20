import "fake-indexeddb/auto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "../apps/web/src/App";
import { LoopController } from "../packages/core/controller";
import { HARUHIKAGE } from "../packages/core/presets";
import { TestEngine, lyrics } from "./helpers";
vi.mock("../apps/web/src/bundled-audio.json", () => ({
  default: {
    available: false,
    src: "",
    bytes: 0,
    sha256: "",
    lyrics: null,
    score: null,
  },
}));
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "?song=haruhikage-crychic#lyrics");
});
async function practice(lines = lyrics) {
  const engine = new TestEngine(),
    controller = new LoopController(engine),
    user = userEvent.setup();
  await controller.load("fixture");
  controller.setLyrics(lines);
  await controller.select(1, 1, false);
  const ui = render(
    <App
      controller={controller}
      autoLoad={false}
      view="practice"
      initialSong={HARUHIKAGE}
    />,
  );
  return { engine, controller, user, ui };
}
it("displays relative clip progress while the real slider and seek keep original-song seconds", async () => {
  const { engine, controller: c, ui } = await practice();
  expect(screen.getByRole("heading", { name: "春日影" })).toBeVisible();
  expect(screen.getByText("CRYCHIC ver. · 歌词学唱")).toBeVisible();
  act(() => {
    engine.position = 18;
    engine.emit({ type: "position", position: 18 });
  });
  const time = screen.getByLabelText("片段内时间");
  expect(within(time).getByText("00:01.70")).toBeVisible();
  expect(within(time).getByText("00:04.80")).toBeVisible();
  expect(screen.getByLabelText("片段原曲边界")).toHaveTextContent(
    "16.30–21.10",
  );
  const slider = screen.getByRole("slider", { name: "片段进度" });
  expect(slider).toHaveAttribute("min", "16.3");
  expect(slider).toHaveAttribute("max", "21.1");
  fireEvent.change(slider, { target: { value: "19.25" } });
  await waitFor(() => expect(engine.position).toBe(19.25));
  expect(within(time).getByText("00:02.95")).toBeVisible();
  ui.unmount();
  c.dispose();
});
it("new lyric rows still seek and play; reverse multi-selection pauses at the anchor and selects the full range", async () => {
  const { engine, controller: c, user, ui } = await practice();
  await user.click(screen.getByRole("button", { name: "第 4 句 four" }));
  expect(engine.range).toEqual({ start: 25.9, end: 30.7 });
  expect(engine.position).toBe(25.9);
  expect(engine.playing).toBe(true);
  await user.click(screen.getByRole("button", { name: "多句连续" }));
  await user.click(screen.getByRole("button", { name: "第 4 句 four" }));
  expect(engine.playing).toBe(false);
  expect(screen.getByRole("button", { name: "播放" })).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "第 2 句 いつまでも覚えていたい" }),
  );
  expect(engine.range).toEqual({ start: 16.3, end: 30.7 });
  expect(engine.position).toBe(16.3);
  expect(engine.playing).toBe(true);
  expect(screen.getByLabelText("当前选中歌词")).toHaveTextContent("第 2–4 句");
  ui.unmount();
  c.dispose();
});
it("speed panel pauses audio, changes actual speed, preserves range and consumes only the panel Back entry", async () => {
  const { engine, controller: c, user, ui } = await practice();
  await user.click(screen.getByRole("button", { name: "播放" }));
  await user.click(screen.getByRole("button", { name: "0.75× 速度" }));
  expect(engine.playing).toBe(false);
  const panel = screen.getByRole("dialog", { name: "练习速度" });
  await user.click(within(panel).getByRole("button", { name: "0.5×" }));
  expect(engine.speed).toBe(0.5);
  expect(engine.range).toEqual({ start: 16.3, end: 21.1 });
  act(() => history.back());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(location.hash).toBe("#lyrics");
  expect(engine.playing).toBe(false);
  ui.unmount();
  c.dispose();
});
it("trim previews preserve milliseconds, cancel discards, and confirm applies both edges once without playback", async () => {
  const {
    engine,
    controller: c,
    user,
    ui,
  } = await practice([
    { start: 0, text: "intro" },
    { start: 15.045, text: "tone" },
    { start: 19.371, text: "breath" },
  ]);
  const setRange = vi.spyOn(engine, "setRange");
  await user.click(screen.getByRole("button", { name: "微调片段" }));
  await user.click(screen.getByRole("button", { name: "起点延后 0.1 秒" }));
  expect(screen.getByLabelText("预览起点")).toHaveTextContent("00:15.15");
  expect(c.getSnapshot().range).toEqual({ start: 15.045, end: 19.371 });
  expect(setRange).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(screen.getByRole("button", { name: "微调片段" }));
  expect(screen.getByLabelText("预览起点")).toHaveTextContent("00:15.05");
  await user.click(screen.getByRole("button", { name: "起点延后 0.1 秒" }));
  await user.click(screen.getByRole("button", { name: "终点延后 0.1 秒" }));
  await user.click(screen.getByRole("button", { name: "应用并返回" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(setRange).toHaveBeenCalledTimes(1);
  expect(engine.range).toEqual({ start: 15.145, end: 19.471 });
  expect(engine.position).toBe(15.145);
  expect(engine.playing).toBe(false);
  expect(
    JSON.parse(localStorage.getItem(`anisong:lyricsSession:${HARUHIKAGE.id}`)!)
      .range,
  ).toEqual(engine.range);
  ui.unmount();
  c.dispose();
});
it("failed range apply remains in the panel with an error and can be retried", async () => {
  const { engine, controller: c, user, ui } = await practice();
  await user.click(screen.getByRole("button", { name: "微调片段" }));
  await user.click(screen.getByRole("button", { name: "起点延后 0.1 秒" }));
  const original = engine.setRange.bind(engine);
  vi.spyOn(engine, "setRange").mockImplementationOnce(() => {
    throw new Error("NATIVE");
  });
  await user.click(screen.getByRole("button", { name: "应用并返回" }));
  const panel = screen.getByRole("dialog", { name: "微调片段" });
  await waitFor(() =>
    expect(within(panel).getByRole("alert")).toHaveTextContent("原生播放器"),
  );
  engine.setRange = original;
  await user.click(within(panel).getByRole("button", { name: "应用并返回" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(engine.position).toBe(16.4);
  expect(engine.playing).toBe(false);
  ui.unmount();
  c.dispose();
});
it("a late trim completion cannot close a subsequently opened speed panel or restart audio", async () => {
  const { engine, controller: c, user, ui } = await practice();
  await user.click(screen.getByRole("button", { name: "微调片段" }));
  await user.click(screen.getByRole("button", { name: "起点延后 0.1 秒" }));
  let finish!: () => void;
  vi.spyOn(engine, "setRange").mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const seek = vi.spyOn(engine, "seek");
  await user.click(screen.getByRole("button", { name: "应用并返回" }));
  expect(screen.getByRole("button", { name: "正在应用…" })).toBeDisabled();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(screen.getByRole("button", { name: "0.75× 速度" }));
  await act(async () => {
    finish();
    await Promise.resolve();
  });
  expect(screen.getByRole("dialog", { name: "练习速度" })).toBeVisible();
  expect(seek).not.toHaveBeenCalled();
  expect(engine.playing).toBe(false);
  await user.click(screen.getByRole("button", { name: "关闭练习速度" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  ui.unmount();
  c.dispose();
});
