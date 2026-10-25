import type { LyricLine } from "../../../../packages/core/types";
import type { LyricsDisplay } from "../../../../packages/core/lyrics-display";

export function LyricsDisplayPanel({ lines, value, onChange, onClose }: {
  lines: LyricLine[]; value: LyricsDisplay;
  onChange: (value: LyricsDisplay) => void; onClose: () => void;
}) {
  const sample = lines.find(line => line.romaji || line.translation) ?? lines[0];
  return <div className="lyrics-display-panel">
    <div className="lyrics-display-preview" aria-label="歌词样式预览">
      <p className="display-original">{sample?.text ?? "关联歌词后预览显示效果"}</p>
      {value.romaji && sample?.romaji && <p className="display-romaji">{sample.romaji}</p>}
      {value.translation && sample?.translation && <p className="display-translation">{sample.translation}</p>}
    </div>
    {(["romaji", "translation"] as const).map(key => {
      const available = lines.some(line => !!line[key]);
      const label = key === "romaji" ? "罗马音" : "中文译文";
      return <label className="lyrics-display-toggle" key={key}>
        <span><strong>{label}</strong><small>{available ? (key === "romaji" ? "在原文下方显示发音" : "在原文下方显示释义") : `这首歌暂无${label}`}</small></span>
        <input type="checkbox" aria-label={`显示${label}`} checked={available && value[key]} disabled={!available}
          onChange={event => onChange({ ...value, [key]: event.target.checked })} />
      </label>;
    })}
    <p className="helper">原文始终显示。偏好保存在此设备。没有译文或罗马音时，可在歌曲资料中导入带学习文本的 LRC。</p>
    <button className="primary" onClick={onClose}>完成</button>
  </div>;
}
