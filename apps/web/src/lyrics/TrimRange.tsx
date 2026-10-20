import { useEffect, useRef, useState } from "react";
import type { Range } from "../../../../packages/core/types";
import { assertRange } from "../../../../packages/core/range";
import { practiceTime } from "./LyricsPractice";
export function TrimRange({
  range,
  duration,
  selection,
  onApply,
  onClose,
}: {
  range: Range;
  duration: number;
  selection: string;
  onApply: (range: Range) => Promise<string | null>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ ...range }),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const adjust = (edge: "start" | "end", delta: number) => {
    try {
      const next = assertRange(
        {
          ...draft,
          [edge]:
            Math.round(
              Math.max(0, Math.min(duration, draft[edge] + delta)) * 1000,
            ) / 1000,
        },
        duration,
      );
      setDraft(next);
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  const apply = async () => {
    setPending(true);
    setError("");
    try {
      const message = await onApply({ ...draft });
      if (!alive.current) return;
      if (message) {
        setError(message);
        setPending(false);
      } else onClose();
    } catch (reason) {
      if (alive.current) {
        setError((reason as Error).message);
        setPending(false);
      }
    }
  };
  return (
    <div className="trim-draft">
      <p className="helper">{selection} · 使用原曲时间</p>
      <div className="trim-edges">
        {(["start", "end"] as const).map((edge) => (
          <div className="trim-edge" key={edge}>
            <div>
              <span>{edge === "start" ? "起点" : "终点"}</span>
              <output aria-label={`预览${edge === "start" ? "起点" : "终点"}`}>
                {practiceTime(draft[edge])}
              </output>
            </div>
            <button
              aria-label={`${edge === "start" ? "起点" : "终点"}提前 0.1 秒`}
              disabled={pending}
              onClick={() => adjust(edge, -0.1)}
            >
              −0.1
            </button>
            <button
              aria-label={`${edge === "start" ? "起点" : "终点"}延后 0.1 秒`}
              disabled={pending}
              onClick={() => adjust(edge, 0.1)}
            >
              ＋0.1
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="helper trim-explanation">
        确认后从新起点重新练习；关闭循环会在片段结束时停止。关闭面板不会应用本次预览。
      </p>
      <button
        className="primary full"
        disabled={pending}
        onClick={() => void apply()}
      >
        {pending ? "正在应用…" : "应用并返回"}
      </button>
    </div>
  );
}
