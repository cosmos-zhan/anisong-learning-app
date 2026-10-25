import type { CSSProperties } from "react";
import type { PlayerState } from "../../../../packages/core/types";
import { currentLyric, type LyricsDisplay } from "../../../../packages/core/lyrics-display";
import { useLyricFollow } from "./useLyricFollow";
import { Icon } from "../components/Icon";
import "./lyrics.css";

export const practiceTime = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const centiseconds = Math.round(safe * 100);
  return `${Math.floor(centiseconds / 6000)
    .toString()
    .padStart(
      2,
      "0",
    )}:${((centiseconds % 6000) / 100).toFixed(2).padStart(5, "0")}`;
};
export function LyricsPractice({
  state,
  title,
  subtitle,
  multi,
  anchor,
  notice,
  display,
  sheetOpen,
  onDisplay,
  onSelect,
  onMode,
  onCancel,
  onSeek,
  onPlay,
  onMove,
  onLoop,
  onSheet,
  onExit,
}: {
  state: PlayerState;
  title: string;
  subtitle: string;
  multi: boolean;
  anchor: number | null;
  notice: string;
  display: LyricsDisplay;
  sheetOpen: boolean;
  onDisplay: (value: LyricsDisplay) => void;
  onSelect: (index: number) => void;
  onMode: (multi: boolean) => void;
  onCancel: () => void;
  onSeek: (position: number) => void;
  onPlay: () => void;
  onMove: (delta: number) => void;
  onLoop: () => void;
  onSheet: (sheet: "speed" | "trim" | "more" | "display") => void;
  onExit: () => void;
}) {
  const { range, selection } = state,
    playing = state.phase === "playing";
  const currentIndex = currentLyric(state.lines, state.position);
  const follow = useLyricFollow(currentIndex, display.autoScroll,
    anchor !== null || sheetOpen || state.phase === "loading",
    `${display.romaji}:${display.translation}:${state.lines.length}`);
  const disabled = !range || state.phase === "loading";
  const urgentNotice = /失败|无法|超时|不足|不可用|失效/.test(notice);
  const position = range
    ? Math.max(range.start, Math.min(range.end, state.position))
    : 0;
  const length = range ? range.end - range.start : 0,
    elapsed = range ? position - range.start : 0;
  const percent = length ? (elapsed / length) * 100 : 0;
  const selectionTitle = selection
    ? `第 ${selection[0] + 1}${selection[0] === selection[1] ? "" : `–${selection[1] + 1}`} 句`
    : range
      ? "整曲试听"
      : "待选片段";
  const helper =
    anchor !== null
      ? `已点第 ${anchor + 1} 句，请点结束句`
      : multi
        ? selection
          ? "点起句，再点尾句"
          : "先点起始，再点结束，可反向选择"
        : "点一句，从这里开始练";
  return (
    <div className="lyrics-focus">
      <header className="focus-header lyrics-header">
        <button aria-label="返回歌曲" onClick={onExit}>
          <Icon name="back" />
        </button>
        <div className="lyrics-song-heading">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <button className="lyrics-display-entry" aria-label="歌词显示" onClick={() => onSheet("display")}>
          <Icon name="languages" /><span>显示</span>
        </button>
        <button aria-label="更多学唱操作" onClick={() => onSheet("more")}>
          <Icon name="more" />
        </button>
      </header>
      <section className="lyrics-selection" aria-label="选择练习片段">
        <div className="lyrics-selection-row">
          <div className="mode" role="group" aria-label="选择模式">
            <button
              aria-label="单句循环"
              aria-pressed={!multi}
              onClick={() => onMode(false)}
            >
              单句
            </button>
            <button
              aria-label="多句连续"
              aria-pressed={multi}
              onClick={() => onMode(true)}
            >
              多句
            </button>
          </div>
          <button className="lyrics-follow" aria-pressed={display.autoScroll}
            onClick={() => { follow.resume(); onDisplay({ ...display, autoScroll: !display.autoScroll }); }}>
            <Icon name="follow" />
            {display.autoScroll ? (follow.browsing ? "跟随已暂停" : "自动滚动 开") : "自动滚动 关"}
          </button>
        </div>
        <div className="selection-help" role="status">
          <span className="selection-badge" aria-label="当前选中歌词">{selectionTitle}</span>
          <span>{helper}</span>
          {anchor !== null && <button onClick={onCancel}>取消</button>}
        </div>
      </section>
      <div className="lyrics-stage">
      <div className="lyrics" aria-label="歌词列表" ref={follow.list}
        onWheel={follow.suspend} onTouchMove={follow.suspend}
        onKeyDown={event => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) follow.suspend(); }}
        onPointerDown={event => { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX >= rect.right - 16) follow.suspend(); }}>
        {!state.lines.length ? (
          <div className="empty">
            {state.phase === "loading"
              ? "正在准备音频与歌词…"
              : "关联 LRC 歌词后，就能从任意一句开始练习。"}
          </div>
        ) : (
          state.lines.map((line, index) => {
            const selected =
              !!selection && index >= selection[0] && index <= selection[1];
            const current = index === currentIndex;
            return (
              <button
                key={`${line.start}-${index}`}
                data-line={index}
                aria-label={`第 ${index + 1} 句 ${line.text}`}
                aria-pressed={selected || anchor === index}
                aria-current={current ? "true" : undefined}
                className={`lyric ${selected ? "selected" : ""} ${selection?.[0] === index ? "range-first" : ""} ${selection?.[1] === index ? "range-last" : ""} ${anchor === index ? "anchor" : ""}`}
                onClick={() => { if (!multi || anchor !== null) follow.resume(); onSelect(index); }}
              >
                <span className="line-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="lyric-content">
                  {current && <span className="lyric-current-label">当前句</span>}
                  <span className="lyric-text">{line.text}</span>
                  {display.romaji && line.romaji && <span className="lyric-romaji">{line.romaji}</span>}
                  {display.translation && line.translation && <span className="lyric-translation">{line.translation}</span>}
                </span>
              </button>
            );
          })
        )}
      </div>
      {display.autoScroll && follow.browsing && <button className="lyrics-return" onClick={() => { follow.resume(); }}>回到当前句</button>}
      </div>
      <section className="controls lyrics-player" aria-label="播放器">
        <div className="range-summary">
          <span>{selection ? "当前片段" : "整曲试听"}</span>
          <span aria-label="片段原曲边界">
            {range
              ? `${range.start.toFixed(2)}–${range.end.toFixed(2)}`
              : "等待选择"}
          </span>
        </div>
        <input
          aria-label="片段进度"
          aria-valuetext={`${practiceTime(elapsed)} / ${practiceTime(length)}`}
          className="progress"
          type="range"
          min={range?.start ?? 0}
          max={range?.end ?? 1}
          step="0.001"
          value={position}
          style={{ "--progress-fill": `${percent}%` } as CSSProperties}
          disabled={disabled}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
        <div className="time-labels" aria-label="片段内时间">
          <span>{practiceTime(elapsed)}</span>
          <span>{practiceTime(length)}</span>
        </div>
        <div className="transport">
          <button
            aria-label="上一句"
            disabled={disabled || !selection || selection[0] === 0}
            onClick={() => { follow.resume(); onMove(-1); }}
          >
            <Icon name="previous" />
          </button>
          <button
            className="play-button"
            aria-label={playing ? "暂停" : "播放"}
            disabled={disabled || anchor !== null}
            onClick={onPlay}
          >
            <Icon name={playing ? "pause" : "play"} />
          </button>
          <button
            aria-label="下一句"
            disabled={
              disabled || !selection || selection[1] === state.lines.length - 1
            }
            onClick={() => { follow.resume(); onMove(1); }}
          >
            <Icon name="next" />
          </button>
        </div>
        <div className="play-options" aria-label="练习参数">
          <button
            aria-label={`${state.speed}× 速度`}
            onClick={() => onSheet("speed")}
          >
            {state.speed}×
          </button>
          <button
            className="loop-button"
            aria-pressed={state.loop}
            onClick={onLoop}
          >
            循环{state.loop ? "开" : "关"}
          </button>
          <button
            className="trim-entry"
            disabled={disabled}
            onClick={() => onSheet("trim")}
          >
            微调片段
          </button>
        </div>
        <p className="player-caption" role="status">
          {playing ? "正在播放 · " : ""}
          {anchor !== null
            ? "选好结束句后开始练习"
            : "点歌词切换片段 · 离开练习后暂停"}
        </p>
        {(state.error || state.warnings.length > 0 || notice) && (
          <div className="lyrics-messages">
            {state.error && (
              <p className="error" role="alert">
                {state.error}
              </p>
            )}
            {state.warnings.map((warning) => (
              <p className="warning" key={warning}>
                {warning}
              </p>
            ))}
            {urgentNotice ? (
              <p className="warning" role="status">
                {notice}
              </p>
            ) : (
              notice && (
                <details className="load-details">
                  <summary>
                    {state.phase === "loading"
                      ? "正在准备歌曲…"
                      : "歌曲与保存状态"}
                  </summary>
                  <p role="status">{notice}</p>
                </details>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}
