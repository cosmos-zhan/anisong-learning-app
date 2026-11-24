import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { PlayerState } from "../../../../packages/core/types";
import { currentLyric, type LyricsDisplay } from "../../../../packages/core/lyrics-display";
import { Cover } from "../components/Cover";
import { Icon } from "../components/Icon";
import { RomajiLyrics } from "./RomajiLyrics";
import { useLyricFollow } from "./useLyricFollow";
import recordArtwork from "./record-artwork.webp";
import "./lyrics.css";

export const practiceTime = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const centiseconds = Math.round(safe * 100);
  return `${Math.floor(centiseconds / 6000).toString().padStart(2, "0")}:${((centiseconds % 6000) / 100).toFixed(2).padStart(5, "0")}`;
};

export function LyricsPractice({
  state,
  songId,
  title,
  subtitle,
  multi,
  anchor,
  notice,
  display,
  sheetOpen,
  onSelect,
  onInterpret,
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
  songId: string;
  title: string;
  subtitle: string;
  multi: boolean;
  anchor: number | null;
  notice: string;
  display: LyricsDisplay;
  sheetOpen: boolean;
  onSelect: (index: number, multiple: boolean) => void;
  onInterpret: (index: number) => void;
  onMode: (multi: boolean) => void;
  onCancel: () => void;
  onSeek: (position: number) => void;
  onPlay: () => void;
  onMove: (delta: number) => void;
  onLoop: () => void;
  onSheet: (sheet: "speed" | "trim" | "more" | "display") => void;
  onExit: () => void;
}) {
  const { range, selection, lines } = state;
  const playing = state.phase === "playing";
  const [coverView, setCoverView] = useState(false);
  const [choosingRange, setChoosingRange] = useState(false);
  const lyricsTab = useRef<HTMLButtonElement>(null);
  const rangePicker = !coverView && (choosingRange || anchor !== null) && lines.length > 0;
  const selectingMultiple = rangePicker && multi;

  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const held = useRef(false);
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  useEffect(() => () => cancelHold(), []);
  const startHold = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelHold();
    held.current = false;
    const { clientX: x, clientY: y } = event;
    hold.current = { x, y, timer: setTimeout(() => {
      hold.current = null;
      held.current = true;
      onInterpret(index);
    }, 520) };
  };

  const changeView = (cover: boolean) => {
    cancelHold();
    if (cover) {
      setChoosingRange(false);
      if (anchor !== null) onCancel();
    }
    setCoverView(cover);
  };

  const currentIndex = currentLyric(lines, state.position);
  const interpretIndex = currentIndex < 0 ? selection?.[0] ?? 0 : currentIndex;
  const follow = useLyricFollow(
    currentIndex,
    display.autoScroll,
    coverView || anchor !== null || sheetOpen || state.phase === "loading",
    `${display.romaji}:${display.translation}:${lines.length}:${rangePicker}`,
  );
  const disabled = !range || state.phase === "loading";
  const urgentNotice = /失败|无法|超时|不足|不可用|失效/.test(notice);
  const position = range ? Math.max(range.start, Math.min(range.end, state.position)) : 0;
  const length = range ? range.end - range.start : 0;
  const elapsed = range ? position - range.start : 0;
  const percent = length ? (elapsed / length) * 100 : 0;
  const selectionTitle = selection
    ? `第 ${selection[0] + 1}${selection[0] === selection[1] ? "" : `–${selection[1] + 1}`} 句`
    : range ? "整曲试听" : "待选片段";
  const loopLabel = !state.loop ? "循环关" : selection ? selection[0] === selection[1] ? "单句" : "多句" : "循环";

  return (
    <div className="lyrics-focus">
      <header className="lyrics-header">
        <button className="lyrics-back" aria-label="返回歌曲" onClick={onExit}>
          <Icon name="back" />
        </button>
        <div className="lyrics-song-heading">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="lyrics-header-actions">
          {!coverView && (
            <button aria-label="歌词显示" onClick={() => onSheet("display")}>
              <Icon name="settings" /><span>显示</span>
            </button>
          )}
          <button aria-label="更多学唱操作" onClick={() => onSheet("more")}>
            <Icon name="more" />
          </button>
        </div>
        <div className="lyrics-view-switch" role="group" aria-label="学唱视图">
          <button aria-pressed={coverView} onClick={() => changeView(true)}>封面</button>
          <button ref={lyricsTab} aria-pressed={!coverView} onClick={() => changeView(false)}>歌词</button>
        </div>
      </header>

      {rangePicker && (
        <section className="lyrics-selection" aria-label="选择练习片段">
          <div className="lyrics-modes" role="group" aria-label="选择模式">
            <button aria-label="单句循环" aria-pressed={!multi} onClick={() => onMode(false)}>单句</button>
            <button aria-label="多句连续" aria-pressed={multi} onClick={() => onMode(true)}>多句</button>
          </div>
          <p role="status">
            {anchor !== null ? `已点第 ${anchor + 1} 句，请点结束句` : multi ? "依次点选起句和止句" : "点选要练习的一句"}
          </p>
          {anchor !== null && <button onClick={onCancel}>取消</button>}
        </section>
      )}

      <div className="lyrics-stage">
        <div className="lyrics-view" hidden={coverView}>
          <div className="lyrics" aria-label="歌词列表" ref={follow.list}
            onWheel={follow.suspend} onTouchMove={follow.suspend}
            onKeyDown={event => {
              if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) follow.suspend();
            }}>
            {!lines.length ? (
              <div className="lyrics-empty">
                {state.phase === "loading" ? "正在准备音频与歌词…" : "关联 LRC 歌词后，就能从任意一句开始练习。"}
              </div>
            ) : (
              lines.map((line, index) => {
                const selected = !!selection && index >= selection[0] && index <= selection[1];
                const current = index === currentIndex;
                const start = rangePicker && (anchor === index || (anchor === null && selection?.[0] === index));
                const end = rangePicker && anchor === null && selection?.[1] === index && selection[0] !== index;
                return (
                  <div className="lyric-row" key={`${line.start}-${index}`}
                    data-current={current || undefined}
                    data-range={selected || undefined}
                    data-range-start={rangePicker && selected && selection?.[0] === index || undefined}
                    data-range-end={rangePicker && selected && selection?.[1] === index || undefined}
                    data-anchor={anchor === index || undefined}>
                    <button
                      data-line={index}
                      aria-label={`第 ${index + 1} 句 ${line.text}`}
                      aria-pressed={selected || anchor === index}
                      aria-current={current ? "true" : undefined}
                      className="lyric"
                      onPointerDown={event => startHold(event, index)}
                      onPointerMove={event => {
                        if (hold.current && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 10) cancelHold();
                      }}
                      onPointerUp={cancelHold}
                      onPointerCancel={cancelHold}
                      onPointerLeave={cancelHold}
                      onContextMenu={event => event.preventDefault()}
                      onClick={() => {
                        if (held.current) { held.current = false; return; }
                        if (!selectingMultiple || anchor !== null) follow.resume();
                        onSelect(index, selectingMultiple);
                      }}
                    >
                      {rangePicker && <span className="line-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}
                      <span className="lyric-content">
                        {display.romaji && line.romaji
                          ? <RomajiLyrics text={line.text} romaji={line.romaji} />
                          : <span className="lyric-text">{line.text}</span>}
                        {display.translation && line.translation && <span className="lyric-translation">{line.translation}</span>}
                      </span>
                      {start && <span className="lyrics-edge">起句</span>}
                      {end && <span className="lyrics-edge">止句</span>}
                    </button>
                    {index === interpretIndex && !rangePicker && (
                      <button className="lyrics-interpret" onClick={() => onInterpret(index)}>
                        <Icon name="sparkle" />解读本句
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {display.autoScroll && follow.browsing && (
            <button className="lyrics-return" onClick={follow.resume}>回到当前句</button>
          )}
        </div>
        {coverView && (
          <div className="lyrics-cover-view">
            <div className="lyrics-record" data-playing={playing}>
              <div className="lyrics-vinyl"><Cover id={songId} fallback={recordArtwork} /></div>
              <button aria-label="点唱片查看歌词" onClick={() => { changeView(false); lyricsTab.current?.focus(); }} />
            </div>
            {lines[currentIndex] && <p>{lines[currentIndex].text}</p>}
          </div>
        )}
      </div>

      <section className="controls lyrics-player" aria-label="播放器">
        <div className="lyrics-player-details">
          <button aria-label={`${state.speed}× 速度`} onClick={() => onSheet("speed")}>{state.speed}×</button>
          <div className="lyrics-range-summary" role="status">
            <span aria-label="当前选中歌词">{selectionTitle}</span>
            {range && <span className={rangePicker ? "lyrics-boundaries" : "lyrics-sr-only"} aria-label="片段原曲边界">
              {`${range.start.toFixed(2)}–${range.end.toFixed(2)}`}
            </span>}
          </div>
          <button aria-label="微调片段" disabled={disabled} onClick={() => onSheet("trim")}>
            <Icon name="settings" />微调
          </button>
        </div>
        <div className="lyrics-time-line" aria-label="片段内时间">
          <span>{practiceTime(elapsed)}</span>
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
            onChange={event => onSeek(Number(event.target.value))}
          />
          <span>{practiceTime(length)}</span>
        </div>
        <div className="transport">
          <button className="loop-button" aria-label={state.loop ? "循环开" : "循环关"} aria-pressed={state.loop} onClick={onLoop}>
            <Icon name="repeat" /><span>{loopLabel}</span>
          </button>
          <button aria-label="上一句" disabled={disabled || !selection || selection[0] === 0}
            onClick={() => { follow.resume(); onMove(-1); }}>
            <Icon name="previous" />
          </button>
          <button className="play-button" aria-label={playing ? "暂停" : "播放"} disabled={disabled || anchor !== null} onClick={onPlay}>
            <Icon name={playing ? "pause" : "play"} />
          </button>
          <button aria-label="下一句" disabled={disabled || !selection || selection[1] === lines.length - 1}
            onClick={() => { follow.resume(); onMove(1); }}>
            <Icon name="next" />
          </button>
          <button aria-label="选段" aria-expanded={rangePicker} disabled={!lines.length} onClick={() => {
            if (rangePicker && anchor !== null) onCancel();
            changeView(false);
            setChoosingRange(!rangePicker);
          }}>
            <Icon name="segment" /><span>{rangePicker ? "收起" : "选段"}</span>
          </button>
        </div>
        {(state.error || state.warnings.length > 0 || notice) && (
          <div className="lyrics-messages">
            {state.error && <p className="error" role="alert">{state.error}</p>}
            {state.warnings.map(warning => <p className="warning" key={warning}>{warning}</p>)}
            {urgentNotice ? <p className="warning" role="status">{notice}</p> : notice && (
              <details className="load-details">
                <summary>{state.phase === "loading" ? "正在准备歌曲…" : "歌曲与保存状态"}</summary>
                <p role="status">{notice}</p>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
