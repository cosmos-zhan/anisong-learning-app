import { useEffect, useRef, useState } from "react";
import type {
  Score,
  ScorePart,
  Track,
  Labels,
} from "../../../../packages/piano/types";
import { pitchLabel } from "../../../../packages/piano/timeline";
import type { BarBox, NoteBox } from "./engraver";
export function ScoreView({
  score,
  part,
  track,
  range,
  activeId,
  labels,
  onSelect,
}: {
  score: Score;
  part: ScorePart;
  track: Track;
  range: [number, number];
  activeId?: string;
  labels: Labels;
  onSelect: (i: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    scroller = useRef<HTMLDivElement>(null);
  const layoutKey = `${score.id}:${part.id}:${track.id}`;
  const [layout, setLayout] = useState<{
    key: string;
    bars: BarBox[];
    notes: NoteBox[];
  }>({ key: "", bars: [], notes: [] });
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const holder = document.createElement("div");
    holder.style.width = "800px";
    setLoading(true);
    setError("");
    setLayout({ key: "", bars: [], notes: [] });
    host.current?.replaceChildren(holder);
    void import("./engraver")
      .then(({ engrave }) => engrave(holder, score, part, track))
      .then((result) => {
        if (!cancelled) {
          setLayout({ key: layoutKey, bars: result.bars, notes: result.notes });
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "五线谱渲染失败。原文件已保留，请换一份常规 MusicXML，或报告此问题。",
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      holder.remove();
    };
  }, [score, part, track]);
  useEffect(() => {
    if (layout.key !== layoutKey) return;
    for (const note of layout.notes)
      note.graphic.setColor(
        note.event.id === activeId ? "#087b76" : "#202c40",
        { applyToNoteheads: true, applyToStem: true, applyToFlag: true },
      );
    const target = layout.notes.find((n) => n.event.id === activeId);
    const el = scroller.current;
    if (!el || !target) return;
    if (
      target.x < el.scrollLeft + 30 ||
      target.x > el.scrollLeft + el.clientWidth - 50
    )
      el.scrollLeft = Math.max(0, target.x - el.clientWidth * 0.35);
  }, [activeId, layout, layoutKey]);
  return (
    <div
      className="score-scroll"
      ref={scroller}
      aria-label="五线谱，可横向滚动"
    >
      {loading && (
        <p className="score-message" role="status">
          正在绘制真实五线谱…
        </p>
      )}
      {error && (
        <p className="score-message" role="alert">
          {error}
        </p>
      )}
      <div className="score-sheet">
        <div ref={host} />
        <div className="score-overlays">
          {layout.bars.map((box) => (
            <button
              key={box.index}
              aria-label={`谱面小节 ${box.index + 1}`}
              title={`选择第 ${box.index + 1} 小节`}
              className={`measure-hit ${box.index >= range[0] && box.index <= range[1] ? "in-range" : ""}`}
              style={{
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
              }}
              onClick={() => onSelect(box.index)}
            />
          ))}
          {labels !== "none" &&
            layout.notes
              .filter((n) => n.event.pitch)
              .map((n) => (
                <span
                  className={`note-label ${n.event.id === activeId ? "current" : ""}`}
                  key={n.event.id}
                  style={{ left: n.x, top: n.y }}
                >
                  {pitchLabel(n.event.pitch!, labels === "solfege")}
                </span>
              ))}
        </div>
      </div>
    </div>
  );
}
