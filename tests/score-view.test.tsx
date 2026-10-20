import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, it, expect, vi } from "vitest";
import { ScoreView } from "../apps/web/src/piano/ScoreView";
import { engrave } from "../apps/web/src/piano/engraver";
import { parseMusicXml } from "../packages/piano/musicxml";
import { fixture, note } from "./piano-fixtures";
vi.mock("../apps/web/src/piano/engraver", () => ({ engrave: vi.fn() }));
beforeEach(() => {
  vi.mocked(engrave)
    .mockReset()
    .mockRejectedValue(new TypeError("simulated renderer failure"));
});
it("renderer failure still produces actual note SVG and globally numbered selectable bars", async () => {
  const s = parseMusicXml(fixture(Array.from({ length: 12 }, () => note("D")))),
    p = s.parts[0],
    select = vi.fn(),
    diagnostic = vi.fn();
  render(
    <ScoreView
      score={s}
      part={p}
      track={p.tracks[0]}
      range={[0, 0]}
      labels="name"
      onSelect={select}
      onRenderStatus={diagnostic}
    />,
  );
  await screen.findByRole("img", { name: "兼容五线谱" });
  expect(document.querySelectorAll("ellipse").length).toBe(4);
  expect(screen.getByText(/兼容谱面 ·/)).toBeVisible();
  expect(diagnostic).toHaveBeenCalledWith({
    backend: "compatible",
    code: "SCORE_LAYOUT_TypeError",
  });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "后 4 小节" }));
  await screen.findByRole("button", { name: "谱面小节 5" });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "谱面小节 5" }));
  expect(select).toHaveBeenCalledWith(4);
  expect(screen.queryByRole("button", { name: "谱面小节 1" })).toBeNull();
});
it("does not engrave while the module is hidden; active notes can turn to the next window", async () => {
  const s = parseMusicXml(fixture(Array.from({ length: 12 }, () => note()))),
    p = s.parts[0],
    props = {
      score: s,
      part: p,
      track: p.tracks[0],
      range: [0, 0] as [number, number],
      labels: "none" as const,
      onSelect: vi.fn(),
    };
  const ui = render(<ScoreView {...props} active={false} />);
  expect(engrave).not.toHaveBeenCalled();
  ui.rerender(
    <ScoreView {...props} active activeId={p.measures[9].events[0].id} />,
  );
  await screen.findByRole("button", { name: "谱面小节 10" });
  expect(screen.getByText(/谱面 9–12 \/ 12 小节 · 谱表 1/)).toBeVisible();
});
it("retry can recover the precise renderer after a fallback", async () => {
  const s = parseMusicXml(fixture([note()])),
    p = s.parts[0];
  render(
    <ScoreView
      score={s}
      part={p}
      track={p.tracks[0]}
      range={[0, 0]}
      labels="none"
      onSelect={() => {}}
    />,
  );
  await screen.findByText(/兼容谱面 ·/);
  vi.mocked(engrave).mockResolvedValueOnce({
    osmd: {} as never,
    bars: [],
    notes: [],
  });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "重试精细谱面" }));
  await waitFor(() => expect(screen.queryByText(/兼容谱面 ·/)).toBeNull());
});

it("compatible notation fills four normal bars without shrinking the staff spacing", async () => {
  const { compatibleEngrave } = await import(
    "../apps/web/src/piano/compatible-engraver"
  );
  const s = parseMusicXml(fixture(Array.from({ length: 4 }, () => note("D")))),
    p = s.parts[0],
    host = document.createElement("div");
  const result = compatibleEngrave(host, p, p.tracks[0], [0, 3], 716);
  expect(result.bars).toHaveLength(4);
  expect(
    Number(host.querySelector("svg")?.getAttribute("width")),
  ).toBeLessThanOrEqual(716);
  const lines = Array.from(host.querySelectorAll("line")).filter(
    (l) => l.getAttribute("x1") === "8",
  );
  expect(
    Number(lines[1].getAttribute("y1")) - Number(lines[0].getAttribute("y1")),
  ).toBe(10);
  expect(host.querySelectorAll("ellipse")).toHaveLength(4);
});
