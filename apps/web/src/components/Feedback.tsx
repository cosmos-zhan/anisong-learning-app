import { useEffect, useRef, useState } from "react";
import {
  feedbackReport,
  diagnosticReport,
  issueUrl,
} from "../../../../packages/core/feedback";
import type { PlayerState } from "../../../../packages/core/types";
import version from "../version.json";
import { Sheet } from "./Sheet";

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
  const [preview, setPreview] = useState(false);
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
    <Sheet title={preview ? "预览反馈" : "反馈与建议"} className="feedback-modal" closeLabel="关闭反馈" onClose={onClose}>
      <div hidden={preview}>
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
              rows={key === "description" ? 3 : 2}
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
          <span><strong>附带诊断信息</strong><small>版本、设备和当前练习设置</small></span>
        </label>
        <button className="primary full" onClick={() => setPreview(true)}>预览和提交</button>
      </div>
      <div hidden={!preview}>
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
          报告可编辑。请在 GitHub 确认后提交，音频、歌词和原始谱文件不会随报告上传。
        </small>
        <button className="quiet full" onClick={() => setPreview(false)}>返回编辑</button>
      </div>
    </Sheet>
  );
}
