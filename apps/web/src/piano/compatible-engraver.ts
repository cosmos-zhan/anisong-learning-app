import type { ScorePart, Track } from "../../../../packages/piano/types";
import type { BarBox, NoteBox } from "./engraver";
/** Canvas-free SVG fallback from parsed notes; ornaments and beaming are simplified. */
export function compatibleEngrave(
  host: HTMLElement,
  part: ScorePart,
  track: Track,
  window: [number, number],
  availableWidth = 800,
) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "兼容五线谱");
  const measures = part.measures.slice(window[0], window[1] + 1),
    staffs = [track.staff];
  if (!staffs.length) staffs.push(track.staff);
  const left = 65,
    // Four ordinary bars fill the phone's paper. Dense bars can overflow;
    // staff spacing and noteheads never shrink to make a thumbnail.
    needed = Math.max(
      150,
      ...measures.map(
        (m) =>
          new Set(
            m.events.filter((e) => e.staff === track.staff).map((e) => e.tick),
          ).size *
            18 +
          30,
      ),
    ),
    barWidth = Math.max(
      needed,
      (Math.max(650, availableWidth) - left) / Math.max(1, measures.length),
    ),
    height = staffs.length * 100 + 20,
    width = left + barWidth * measures.length;
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const shape = (
    tag: string,
    attrs: Record<string, string | number>,
    text?: string,
  ) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text) el.textContent = text;
    svg.append(el);
    return el;
  };
  const bars: BarBox[] = [],
    notes: NoteBox[] = [];
  staffs.forEach((staff, si) => {
    const y = 35 + si * 130;
    for (let l = 0; l < 5; l++)
      shape("line", {
        x1: 8,
        x2: width - 4,
        y1: y + l * 10,
        y2: y + l * 10,
        stroke: "#546477",
        "stroke-width": 1,
      });
    shape(
      "text",
      { x: 12, y: y + 35, "font-size": 35, fill: "#202c40" },
      staff === "1" ? "𝄞" : "𝄢",
    );
  });
  for (const m of measures) {
    const index = m.index,
      x = left + (index - window[0]) * barWidth;
    bars.push({ index, x, y: 12, width: barWidth, height: height - 20 });
    shape(
      "text",
      { x: x + 3, y: 16, "font-size": 11, fill: "#52657b" },
      m.label,
    );
    staffs.forEach((staff, si) => {
      const y = 35 + si * 130;
      shape("line", {
        x1: x + barWidth,
        x2: x + barWidth,
        y1: y,
        y2: y + 40,
        stroke: "#546477",
      });
    });
    for (const e of m.events.filter((e) => e.staff === track.staff)) {
      const si = staffs.indexOf(e.staff),
        base = 35 + si * 130,
        px = x + 18 + ((e.tick - m.tick) / m.duration) * (barWidth - 40);
      let graphic: SVGElement;
      if (e.pitch) {
        const order = "CDEFGAB",
          diatonic = e.pitch.octave * 7 + order.indexOf(e.pitch.step),
          bottom = e.staff === "1" ? 4 * 7 + 2 : 2 * 7 + 4;
        const py = base + 40 - (diatonic - bottom) * 5;
        for (let ledger = base - 10; py <= ledger; ledger -= 10)
          shape("line", {
            x1: px - 10,
            x2: px + 10,
            y1: ledger,
            y2: ledger,
            stroke: "#202c40",
          });
        for (let ledger = base + 50; py >= ledger; ledger += 10)
          shape("line", {
            x1: px - 10,
            x2: px + 10,
            y1: ledger,
            y2: ledger,
            stroke: "#202c40",
          });
        const filled = e.duration < 960;
        graphic = shape("ellipse", {
          cx: px,
          cy: py,
          rx: 6,
          ry: 4,
          fill: filled ? "#202c40" : "white",
          stroke: "#202c40",
          transform: `rotate(-15 ${px} ${py})`,
        });
        if ([2880, 1440, 720, 360, 180, 90].includes(e.duration))
          shape("circle", { cx: px + 12, cy: py, r: 1.6, fill: "#202c40" });
        if (e.duration < 1920)
          shape("line", {
            x1: px + 5,
            x2: px + 5,
            y1: py,
            y2: py - 28,
            stroke: "#202c40",
            "stroke-width": 1.2,
          });
        if (e.duration <= 240)
          shape("path", {
            d: `M${px + 5} ${py - 28}q14 6 5 17`,
            fill: "none",
            stroke: "#202c40",
            "stroke-width": 2,
          });
        if (e.duration <= 120)
          shape("path", {
            d: `M${px + 5} ${py - 21}q14 6 5 17`,
            fill: "none",
            stroke: "#202c40",
            "stroke-width": 2,
          });
        if (e.pitch.alter)
          shape(
            "text",
            { x: px - 18, y: py + 4, "font-size": 15, fill: "#202c40" },
            e.pitch.alter > 0 ? "♯" : "♭",
          );
      } else
        graphic = shape(
          "text",
          { x: px - 5, y: base + 25, "font-size": 10, fill: "#52657b" },
          `休止 ${Number((e.duration / 480).toFixed(2))}拍`,
        );
      if (e.staff === track.staff && e.voice === track.voice)
        notes.push({
          event: e,
          x: px,
          y: base + 62,
          graphic: {
            setColor: (color: string) => {
              graphic.setAttribute(
                "fill",
                e.pitch && e.duration >= 960 ? "white" : color,
              );
              graphic.setAttribute("stroke", color);
            },
          },
        });
    }
  }
  host.replaceChildren(svg);
  return { bars, notes };
}
