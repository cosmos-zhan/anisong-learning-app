import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import {
  fitScore,
  scorePageSize,
  pianoKeyHeight,
} from "../apps/web/src/piano/score-layout";
import { ScoreView } from "../apps/web/src/piano/ScoreView";
import { engrave } from "../apps/web/src/piano/engraver";
import { parseMusicXml } from "../packages/piano/musicxml";
import { fixture, note } from "./piano-fixtures";
vi.mock("../apps/web/src/piano/engraver", () => ({ engrave: vi.fn() }));
it("preserves readable staff spacing at short and narrow viewports instead of making a thumbnail", () => {
  for (const [width, height] of [
    [716, 110],
    [628, 89],
    [540, 67],
    [230, 300],
  ]) {
    const fit = fitScore(980, 125, width, height);
    expect(fit.scale).toBeGreaterThanOrEqual(0.75);
    expect(fit.width / fit.height).toBeCloseTo(980 / 125);
    expect(scorePageSize(width, height)).toBe(4);
  }
  expect(fitScore(980, 125, 716, 40).height).toBeGreaterThan(40);
  for (const height of [280, 320, 344, 360, 390])
    expect(pianoKeyHeight(height)).toBeGreaterThanOrEqual(112);
});
it("rotation resizes notation and hitboxes together without restarting playback; short views preserve four bars and readable geometry", async () => {
  let width = 716,
    height = 110;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("score-viewport") ? width : 800;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("score-viewport") ? height : 160;
    },
  );
  vi.mocked(engrave).mockImplementation(async (host) => {
    host.innerHTML =
      '<svg width="900" height="120" viewBox="0 0 900 120"></svg>';
    return {
      osmd: {} as never,
      bars: [{ index: 0, x: 10, y: 10, width: 200, height: 80 }],
      notes: [],
    };
  });
  const s = parseMusicXml(fixture(Array.from({ length: 12 }, () => note()))),
    p = s.parts[0],
    select = vi.fn();
  const ui = render(
    <ScoreView
      score={s}
      part={p}
      track={p.tracks[0]}
      range={[0, 0]}
      labels="none"
      onSelect={select}
    />,
  );
  await screen.findByRole("button", { name: "谱面小节 1" });
  const calls = vi.mocked(engrave).mock.calls.length;
  expect(
    document.querySelector(".score-sheet")?.getAttribute("data-score-scale"),
  ).toBe(String(716 / 900));
  width = 620;
  height = 90;
  fireEvent(window, new Event("resize"));
  await waitFor(() =>
    expect(
      document.querySelector(".score-sheet")?.getAttribute("data-score-scale"),
    ).toBe(String(0.75)),
  );
  expect(engrave).toHaveBeenCalledTimes(calls);
  fireEvent.click(screen.getByRole("button", { name: "谱面小节 1" }));
  expect(select).toHaveBeenCalledWith(0);
  width = 540;
  height = 67;
  fireEvent(window, new Event("resize"));
  await screen.findByRole("button", { name: "后 4 小节" });
  await waitFor(() =>
    expect(engrave).toHaveBeenLastCalledWith(
      expect.anything(),
      s,
      p,
      p.tracks[0],
      1,
      [0, 3],
      true,
    ),
  );
  ui.unmount();
  const count = vi.mocked(engrave).mock.calls.length;
  fireEvent(window, new Event("resize"));
  expect(engrave).toHaveBeenCalledTimes(count);
});

it("compatibility fallback keeps four bars without repeated layout attempts", async () => {
  vi.mocked(engrave)
    .mockReset()
    .mockRejectedValue(new TypeError("renderer unavailable"));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(716);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.closest(".is-compatible") ? 76 : 100;
    },
  );
  class ObservedResize {
    observer: MutationObserver;
    constructor(callback: ResizeObserverCallback) {
      this.observer = new MutationObserver(() =>
        callback([], this as unknown as ResizeObserver),
      );
    }
    observe(el: Element) {
      this.observer.observe(el.closest(".score-window")!, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    disconnect() {
      this.observer.disconnect();
    }
  }
  vi.stubGlobal("ResizeObserver", ObservedResize);
  const s = parseMusicXml(fixture(Array.from({ length: 12 }, () => note()))),
    p = s.parts[0];
  const ui = render(
    <ScoreView
      score={s}
      part={p}
      track={p.tracks[0]}
      range={[0, 0]}
      labels="none"
      onSelect={() => {}}
    />,
  );
  try {
    await screen.findByRole("button", { name: "后 4 小节" });
    await screen.findByRole("button", { name: "谱面小节 1" });
    expect(screen.getByText(/兼容谱面 ·/)).toBeVisible();
    expect(engrave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "后 4 小节" }));
    await screen.findByRole("button", { name: "谱面小节 5" });
    expect(engrave).toHaveBeenCalledTimes(2);
  } finally {
    ui.unmount();
    vi.unstubAllGlobals();
  }
});

it("follows an actual active note inside an overflowing four-bar page", async () => {
  vi.mocked(engrave).mockReset();
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(90);
  const s = parseMusicXml(fixture(Array.from({ length: 4 }, () => note()))),
    p = s.parts[0],
    event = p.measures[2].events[0];
  vi.mocked(engrave).mockImplementation(async (host) => {
    host.innerHTML = '<svg width="1000" height="125"></svg>';
    return {
      osmd: {} as never,
      bars: [{ index: 2, x: 650, y: 0, width: 250, height: 110 }],
      notes: [{ event, x: 850, y: 108, graphic: { setColor: vi.fn() } }],
    };
  });
  const props = {
    score: s,
    part: p,
    track: p.tracks[0],
    range: [0, 3] as [number, number],
    labels: "none" as const,
    onSelect: vi.fn(),
  };
  const ui = render(<ScoreView {...props} />);
  await screen.findByRole("button", { name: "谱面小节 3" });
  const el = document.querySelector(".score-viewport")!;
  expect(el.scrollLeft).toBe(0);
  ui.rerender(<ScoreView {...props} activeId={event.id} />);
  await waitFor(() => expect(el.scrollLeft).toBeGreaterThan(0));
  expect(el.scrollTop).toBeGreaterThan(0);
  expect(engrave).toHaveBeenCalledTimes(1);
});
