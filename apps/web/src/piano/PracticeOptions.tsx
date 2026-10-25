import type {
  Labels,
  PracticeMode,
  Score,
  ScorePart,
  Track,
} from "../../../../packages/piano/types";

export const practiceModes = [
  { value: "listen", title: "自动试听", detail: "按乐谱演奏选中原轨" },
  { value: "wait", title: "等待弹对", detail: "真实按对目标键后前进" },
  { value: "free", title: "自由弹奏", detail: "不自动前进，自由按放琴键" },
] as const;
export const labelOptions = [
  { value: "name", title: "音名", detail: "C4 / F♯4" },
  { value: "solfege", title: "固定唱名", detail: "Do / Re / Mi" },
  { value: "none", title: "关闭", detail: "只看五线谱" },
] as const;

export function ModeOptions({
  mode,
  hasScore,
  onChoose,
}: {
  mode: PracticeMode;
  hasScore: boolean;
  onChoose: (mode: PracticeMode) => void;
}) {
  return (
    <div className="practice-options" role="group" aria-label="钢琴练习方式">
      {practiceModes.map((option) => (
        <button
          key={option.value}
          aria-pressed={mode === option.value}
          disabled={!hasScore && option.value !== "free"}
          onClick={() => onChoose(option.value)}
        >
          <span>
            <strong>{option.title}</strong>
            <small>{option.detail}</small>
          </span>
          <span aria-hidden="true">{mode === option.value ? "✓" : ""}</span>
        </button>
      ))}
    </div>
  );
}

export function LabelOptions({
  labels,
  onChoose,
}: {
  labels: Labels;
  onChoose: (labels: Labels) => void;
}) {
  return (
    <>
      <div className="practice-options" role="group" aria-label="钢琴音符辅助">
        {labelOptions.map((option) => (
          <button
            key={option.value}
            aria-pressed={labels === option.value}
            onClick={() => onChoose(option.value)}
          >
            <span>
              <strong>{option.title}</strong>
              <small>{option.detail}</small>
            </span>
            <span aria-hidden="true">{labels === option.value ? "✓" : ""}</span>
          </button>
        ))}
      </div>
      <p className="helper">
        固定唱名 C 永远读 Do，与调号无关；辅助文字不改变实际音高。
      </p>
    </>
  );
}

export function trackTitle(track: Track) {
  return `谱表 ${track.staff} · 声部 ${track.voice}（${track.projection === "highest" ? "最高音单音" : "原轨"}）`;
}

export function TrackOptions({
  score,
  part,
  track,
  onChoose,
}: {
  score: Score;
  part: ScorePart;
  track: Track;
  onChoose: (partId: string, trackId?: string) => void;
}) {
  const original = part.tracks.find(
    (t) => !t.projection && t.staff === track.staff && t.voice === track.voice,
  );
  const highest = part.tracks.find(
    (t) =>
      t.projection === "highest" &&
      t.staff === track.staff &&
      t.voice === track.voice,
  );
  return (
    <div className="track-options">
      <label className="field-label">
        乐器声部
        <select
          aria-label="练习声部"
          value={part.id}
          onChange={(event) => onChoose(event.target.value)}
        >
          {score.parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} / {p.id}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        原始轨道
        <select
          aria-label="旋律轨道"
          value={original?.id ?? track.id}
          onChange={(event) => onChoose(part.id, event.target.value)}
        >
          {part.tracks
            .filter((t) => !t.projection)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {trackTitle(t)}
                {(t.listenBlocked ?? t.blocked).length ? " · 仅看谱" : ""}
              </option>
            ))}
        </select>
      </label>
      <p className="current-track" role="status">
        当前：{part.name} · {trackTitle(track)}
      </p>
      {track.projection === "highest" ? (
        <div className="track-alert">
          <p>单音简化：每组和弦只演奏最高音，不是完整原轨。</p>
          {original && (
            <button onClick={() => onChoose(part.id, original.id)}>
              返回原轨
            </button>
          )}
        </div>
      ) : highest ? (
        <button
          className="quiet full"
          onClick={() => onChoose(part.id, highest.id)}
        >
          练习此轨最高音（单音）
        </button>
      ) : null}
      {!!track.blocked.length && (
        <p className="helper">{track.blocked.join(" ")}</p>
      )}
      <p className="helper">
        只播放当前轨道；谱面保留完整乐器谱。合成钢琴音色，乐谱与 MP3
        时间轴独立。
      </p>
    </div>
  );
}
