import { useEffect, useRef, useState } from "react";
import {
  feedbackReport,
  diagnosticReport,
  issueUrl,
} from "../../../../packages/core/feedback";
import type { PlayerState } from "../../../../packages/core/types";
import version from "../version.json";

export function Feedback({
  state,
  context,
  onClose,
}: {
  state?: PlayerState;
  context?: Record<string, unknown>;
  onClose: () => void;
}) {
  const [fields, setFields] = useState({
    kind: "功能 Bug",
    description: "",
    steps: "",
    expected: "",
  });
  const [diagnostics, setDiagnostics] = useState(true);
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);
  const textArea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setReport(
      state
        ? feedbackReport(
            fields,
            state,
            version,
            navigator.userAgent,
            diagnostics,
            context,
          )
        : diagnosticReport(
            fields,
            { version, platform: navigator.userAgent, ...context },
            diagnostics,
          ),
    );
    setCopied(false);
  }, [fields, state, context, diagnostics]);
  useEffect(() => {
    const focus = document.activeElement as HTMLElement | null;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    textArea.current?.focus();
    return () => {
      document.removeEventListener("keydown", escape);
      focus?.focus();
    };
  }, [onClose]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      textArea.current?.focus();
      textArea.current?.select();
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        className="feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        <div className="section-title">
          <h2 id="feedback-title">把问题留下来</h2>
          <button aria-label="关闭反馈" onClick={onClose}>
            ✕
          </button>
        </div>
        <p>
          不会附带音频、歌词、原始谱文件或文件路径。报告可编辑；GitHub
          需要你确认后提交。
        </p>
        <label>
          反馈类型
          <select
            value={fields.kind}
            onChange={(e) => setFields({ ...fields, kind: e.target.value })}
          >
            <option>功能 Bug</option>
            <option>交互建议</option>
          </select>
        </label>
        {(["description", "steps", "expected"] as const).map((key) => (
          <label key={key}>
            {key === "description"
              ? "问题描述 / 实际行为"
              : key === "steps"
                ? "复现步骤"
                : "预期行为"}
            <textarea
              aria-label={
                key === "description"
                  ? "问题描述"
                  : key === "steps"
                    ? "复现步骤"
                    : "预期行为"
              }
              value={fields[key]}
              onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
              maxLength={1000}
            />
          </label>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={diagnostics}
            onChange={(e) => setDiagnostics(e.target.checked)}
          />
          包含版本、设备和练习设置（点击反馈时的快照）
        </label>
        <label>
          完整报告（可删除任意信息）
          <textarea
            aria-label="完整反馈报告"
            ref={textArea}
            className="report"
            value={report}
            onChange={(e) => setReport(e.target.value)}
          />
        </label>
        <div className="feedback-actions">
          <button onClick={() => void copy()}>
            {copied ? "已复制 ✓" : "复制完整报告"}
          </button>
          <a
            href={issueUrl(report, fields.kind)}
            target="_blank"
            rel="noreferrer"
          >
            打开 GitHub Issue ↗
          </a>
        </div>
        <small>
          报告仅在你提交 Issue 后上传。截图可在 GitHub
          提交页面添加；复制失败时可长按报告全选。
        </small>
      </section>
    </div>
  );
}
