import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Score,
  ScorePart,
  Track,
  Labels,
} from "../../../../packages/piano/types";
import { pitchLabel } from "../../../../packages/piano/timeline";
import { compatibleEngrave } from "./compatible-engraver";
import type { BarBox, NoteBox } from "./engraver";
import { fitScore, scorePageSize } from "./score-layout";
import { Icon } from "../components/Icon";
import "./score.css";
export function ScoreView({
  score,
  part,
  track,
  range,
  activeId,
  labels,
  onSelect,
  active = true,
  onRenderStatus,
}: {
  score: Score;
  part: ScorePart;
  track: Track;
  range: [number, number];
  activeId?: string;
  labels: Labels;
  onSelect: (i: number) => void;
  active?: boolean;
  onRenderStatus?: (status: { backend: string; code: string }) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 800, height: 160 });
  const availableRef = useRef(available);
  availableRef.current = available;
  const [anchor, setAnchor] = useState(range[0]),
    [retry, setRetry] = useState(0);
  const pageSize = scorePageSize(available.width, available.height);
  // Four bars remain a page. A narrow phone lays them out in several systems
  // rather than hiding three bars to the right of a mostly empty paper.
  const wrapWidth =
    available.width < 600 || available.height > available.width * 0.6
      ? Math.max(280, Math.floor(available.width / 16) * 16)
      : 0;
  const eventMeasure = useMemo(
    () =>
      new Map(
        part.measures.flatMap((m) =>
          m.events.map((e) => [e.id, m.index] as const),
        ),
      ),
    [part],
  );
  const activeMeasure = activeId ? eventMeasure.get(activeId) : undefined;
  useEffect(() => setAnchor(range[0]), [range[0], part]);
  useEffect(() => {
    if (activeMeasure !== undefined) setAnchor(activeMeasure);
  }, [activeMeasure]);
  useEffect(() => {
    if (!active) return;
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0)
        setAvailable((previous) =>
          previous.width === el.clientWidth &&
          previous.height === el.clientHeight
            ? previous
            : { width: el.clientWidth, height: el.clientHeight },
        );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active]);
  const start =
      Math.floor(Math.min(anchor, part.measures.length - 1) / pageSize) *
      pageSize,
    end = Math.min(start + pageSize - 1, part.measures.length - 1),
    key = `${score.id}:${part.id}:${track.id}:${start}:${end}:${retry}:${wrapWidth}`;
  const [layout, setLayout] = useState<{
    key: string;
    bars: BarBox[];
    notes: NoteBox[];
    width: number;
    height: number;
  }>({ key: "", bars: [], notes: [], width: 1, height: 1 });
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [compatible, setCompatible] = useState(false);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const holder = document.createElement("div");
    // The initial fit frame is 1px until layout completes. OSMD must never
    // inherit that provisional width when engraving in a real WebView.
    holder.style.width = `${wrapWidth || 1024}px`;
    setLoading(true);
    // Keep the compatibility footer while a replacement page is loading.
    // Hiding/showing it per attempt would resize this viewport across the
    // two/four-bar breakpoint and repeatedly restart a failed engraver.
    setError("");
    host.current?.replaceChildren(holder);
    const install = (result: { bars: BarBox[]; notes: NoteBox[] }) => {
      const svg = holder.querySelector("svg");
      // OSMD's single-line SVG has its own intrinsic dimensions. Scale the entire
      // sheet and overlays together; no CSS width/height distortion or stale hitboxes.
      const width =
        parseFloat(svg?.getAttribute("width") ?? "") ||
        Math.max(1, ...result.bars.map((b) => b.x + b.width));
      const height = Math.max(
        parseFloat(svg?.getAttribute("height") ?? "") || 1,
        ...result.notes.map((n) => n.y + 18),
        ...result.bars.map((b) => b.y + b.height),
      );
      // The engraver's provisional 1024px holder must not create phantom
      // horizontal overflow beyond the intrinsic SVG and its hit targets.
      holder.style.width = `${width}px`;
      setLayout({ key, ...result, width, height });
    };
    void (async () => {
      let stage = "MODULE";
      try {
        const { engrave } = await import("./engraver");
        if (cancelled) return;
        stage = "LAYOUT";
        const result = await engrave(
          holder, score, part, track, 1, [start, end], !!wrapWidth,
        );
        if (cancelled) return;
        setCompatible(false);
        install(result);
        onRenderStatus?.({ backend: "osmd", code: "" });
      } catch (error) {
        if (cancelled) return;
        const code = `SCORE_${stage}_${error instanceof Error ? error.name : "UNKNOWN"}`;
        try {
          const result = compatibleEngrave(
            holder,
            part,
            track,
            [start, end],
            availableRef.current.width,
          );
          setCompatible(true);
          install(result);
          onRenderStatus?.({ backend: "compatible", code });
        } catch {
          setError(
            `谱面暂时无法绘制（${code}）。请重试；曲谱与练习记录已保留。`,
          );
          onRenderStatus?.({ backend: "failed", code });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      holder.remove();
    };
  }, [score, part, track, start, end, retry, active, onRenderStatus, key, wrapWidth]);
  useEffect(() => {
    if (layout.key !== key) return;
    for (const n of layout.notes)
      n.graphic.setColor(n.event.id === activeId ? "#286653" : "#304a3b", {
        applyToNoteheads: true,
        applyToStem: true,
        applyToFlag: true,
      });
  }, [activeId, layout, key]);
  const fit = fitScore(
    layout.width,
    layout.height,
    available.width,
    available.height,
  );
  useEffect(() => {
    if (!active || layout.key !== key) return;
    const el = viewport.current;
    const note = layout.notes.find((n) => n.event.id === activeId);
    if (!el || !note || !el.clientWidth || !el.clientHeight) return;
    const x = note.x * fit.scale,
      y = note.y * fit.scale;
    if (x < el.scrollLeft + 24 || x > el.scrollLeft + el.clientWidth - 24)
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.4);
    // If the complete sheet fits, don't scroll down to a label and clip the
    // clef/key signature at the top in a short landscape.
    if (fit.height <= el.clientHeight + 1) el.scrollTop = 0;
    else if (y < el.scrollTop + 24 || y > el.scrollTop + el.clientHeight - 16)
      el.scrollTop = Math.max(0, y - el.clientHeight * 0.75);
  }, [active, activeId, layout, key, fit.scale, fit.height]);
  const ready = layout.key === key && !loading && !error;
  return (
    <div
      className={`score-window score-fitted ${compatible ? "is-compatible" : ""}`}
      data-page-size={pageSize}
      data-overflow={
        fit.width > available.width || fit.height > available.height
      }
    >
      <div className="score-page-controls" aria-label="谱面翻页">
        <button
          aria-label={`前 ${pageSize} 小节`}
          disabled={start === 0}
          onClick={() => setAnchor(Math.max(0, start - pageSize))}
        >
          <Icon name="back" />
        </button>
        <span>
          谱面 {start + 1}–{end + 1} / {part.measures.length} 小节 · 谱表{" "}
          {track.staff}
          {fit.width > available.width + 1
            ? " · 左右滑动"
            : fit.height > available.height + 1
              ? " · 上下滑动"
              : ""}
        </span>
        <button
          className="score-page-next"
          aria-label={`后 ${pageSize} 小节`}
          disabled={end >= part.measures.length - 1}
          onClick={() => setAnchor(end + 1)}
        >
          <Icon name="back" />
        </button>
      </div>
      {compatible && (
        <div className="score-compatibility">
          <span>
            兼容谱面 · {start + 1}–{end + 1} 小节（简化连梁）
          </span>{" "}
          <button
            aria-label="重试精细谱面"
            onClick={() => setRetry((r) => r + 1)}
          >
            重试
          </button>
        </div>
      )}
      <div
        className="score-viewport"
        ref={viewport}
        aria-label="五线谱，可横向和纵向滚动"
      >
        {loading && (
          <p className="score-message" role="status">
            正在绘制五线谱…
          </p>
        )}
        {error && (
          <p className="score-message" role="alert">
            {error}
            <button onClick={() => setRetry((r) => r + 1)}>重试谱面</button>
          </p>
        )}
        <div
          className="score-fit-frame"
          style={{
            width: fit.width,
            height: fit.height,
            visibility: ready ? "visible" : "hidden",
          }}
        >
          <div
            className="score-sheet"
            data-score-scale={fit.scale}
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${fit.scale})`,
            }}
          >
            <div ref={host} />
            <div className="score-overlays">
              {ready &&
                layout.bars.map((b) => (
                  <button
                    key={b.index}
                    aria-label={`谱面小节 ${b.index + 1}`}
                    aria-current={
                      b.index === activeMeasure ? "true" : undefined
                    }
                    className={`measure-hit ${b.index >= range[0] && b.index <= range[1] ? "in-range" : ""} ${b.index === activeMeasure ? "active-measure" : ""}`}
                    style={{
                      left: b.x,
                      top: b.y,
                      width: b.width,
                      height: b.height,
                    }}
                    onClick={() => onSelect(b.index)}
                  />
                ))}
              {ready &&
                labels !== "none" &&
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
      </div>
    </div>
  );
}
