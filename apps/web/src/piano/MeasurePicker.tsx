import { useState } from "react";
import type { DismissSheet } from "../components/Sheet";

const PAGE_SIZE = 16;
export function MeasurePicker({
  count,
  range,
  onApply,
  dismiss,
}: {
  count: number;
  range: [number, number];
  onApply: (first: number, last: number) => void;
  dismiss: DismissSheet;
}) {
  const [page, setPage] = useState(Math.floor(range[0] / PAGE_SIZE));
  const [anchor, setAnchor] = useState<number | null>(null);
  const [selected, setSelected] = useState<[number, number]>(range);
  const first = page * PAGE_SIZE,
    end = Math.min(count, first + PAGE_SIZE);
  const choose = (i: number) => {
    if (anchor === null) {
      setAnchor(i);
      setSelected([i, i]);
    } else {
      setSelected([Math.min(anchor, i), Math.max(anchor, i)]);
      setAnchor(null);
    }
  };
  return (
    <div className="measure-picker">
      <p className="helper">先点起始，再点结束；可反向选择，包含首尾。</p>
      <div className="measure-pages">
        <button
          aria-label="前一组小节"
          disabled={page === 0}
          onClick={() => setPage((n) => n - 1)}
        >
          ←
        </button>
        <span>
          {first + 1}–{end} / {count} 小节
        </span>
        <button
          aria-label="后一组小节"
          disabled={end >= count}
          onClick={() => setPage((n) => n + 1)}
        >
          →
        </button>
      </div>
      <div className="measure-grid" role="group" aria-label="小节范围点选">
        {Array.from({ length: end - first }, (_, n) => first + n).map((i) => (
          <button
            key={i}
            aria-label={`选择第 ${i + 1} 小节`}
            aria-pressed={i >= selected[0] && i <= selected[1]}
            className={anchor === i ? "range-anchor" : ""}
            onClick={() => choose(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="range-preview" role="status">
        {anchor === null
          ? `已选第 ${selected[0] + 1}${selected[0] === selected[1] ? "" : `–${selected[1] + 1}`} 小节`
          : `已选起点 ${anchor + 1}，请点结束小节（同一小节点两次选单小节）`}
      </p>
      <button
        className="primary full"
        disabled={count === 0 || anchor !== null}
        onClick={() => dismiss(() => onApply(...selected))}
      >
        确认范围
      </button>
    </div>
  );
}
