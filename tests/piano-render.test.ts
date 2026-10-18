import { it, expect, vi } from "vitest";
import { demoScore, fixture, note } from "./piano-fixtures";
import { parseMusicXml } from "../packages/piano/musicxml";
import { engrave } from "../apps/web/src/piano/engraver";
it("real OSMD produces SVG and maps eight bars / selected voice note coordinates (jsdom text metric shim)", async () => {
  // jsdom has no canvas rasterizer. This exercises real OSMD/VexFlow SVG layout,
  // with deterministic text widths, not a browser visual/typography acceptance test.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      new Proxy(
        {
          font: "",
          measureText: (text: string) => ({ width: String(text).length * 7 }),
          getImageData: () => ({ data: new Uint8ClampedArray(400) }),
        },
        {
          get(target, key) {
            return key in target
              ? target[key as keyof typeof target]
              : () => {};
          },
        },
      ) as unknown as CanvasRenderingContext2D,
  );
  const host = document.createElement("div");
  host.style.width = "800px";
  document.body.append(host);
  try {
    const s = demoScore(),
      part = s.parts[0],
      layout = await engrave(host, s, part, part.tracks[0]);
    expect(host.querySelector("svg")).not.toBeNull();
    expect(host.querySelectorAll("svg path").length).toBeGreaterThan(30);
    expect(layout.bars).toHaveLength(8);
    expect(layout.notes).toHaveLength(25);
    for (const bar of layout.bars) {
      expect(bar.width).toBeGreaterThan(20);
      expect(bar.height).toBeGreaterThan(30);
    }
    for (const n of layout.notes) {
      const bar = layout.bars[n.event.measure];
      expect(n.x).toBeGreaterThanOrEqual(bar.x - 1);
      expect(n.x).toBeLessThan(bar.x + bar.width + 1);
    }
    layout.notes[0].graphic.setColor("#087b76", {
      applyToNoteheads: true,
      applyToStem: true,
    });
    expect(host.innerHTML).toContain("#087b76");
  } finally {
    host.remove();
  }
}, 15000);

it("selected lower staff keeps real notation and maps global measure/note IDs", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      new Proxy(
        {
          font: "",
          measureText: (text: string) => ({ width: text.length * 7 }),
        },
        {
          get: (target, key) =>
            key in target ? target[key as keyof typeof target] : () => {},
        },
      ) as unknown as CanvasRenderingContext2D,
  );
  const xml = fixture(
    Array.from(
      { length: 6 },
      () =>
        note("E", 480, "<staff>1</staff>") +
        "<backup><duration>480</duration></backup>" +
        note("C", 480, "<staff>2</staff>", "2"),
    ),
    '<staves>2</staves><clef number="2"><sign>F</sign><line>4</line></clef>',
  );
  const score = parseMusicXml(xml),
    part = score.parts[0],
    track = part.tracks.find((t) => t.staff === "2")!;
  const host = document.createElement("div");
  host.style.width = "716px";
  document.body.append(host);
  try {
    const layout = await engrave(host, score, part, track, 1, [2, 5]);
    expect(
      layout.osmd.Sheet.Instruments[0].Staves.map((s) => s.Visible),
    ).toEqual([false, true]);
    expect(layout.bars.map((b) => b.index)).toEqual([2, 3, 4, 5]);
    expect(layout.notes.map((n) => n.event.id)).toEqual(
      part.measures
        .slice(2, 6)
        .flatMap((m) =>
          m.events.filter((n) => n.staff === "2").map((n) => n.id),
        ),
    );
    expect(layout.notes).toHaveLength(4);
    for (const n of layout.notes) {
      const bar = layout.bars.find((b) => b.index === n.event.measure)!;
      expect(n.x).toBeGreaterThanOrEqual(bar.x - 1);
      expect(n.x).toBeLessThan(bar.x + bar.width + 1);
    }
    expect(host.querySelectorAll("svg path").length).toBeGreaterThan(10);
  } finally {
    host.remove();
  }
}, 15000);
