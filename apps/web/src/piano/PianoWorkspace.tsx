import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PianoController } from "../../../../packages/piano/controller";
import { SynthPiano } from "../../../../packages/piano/audio";
import { parseMusicXml, readScore } from "../../../../packages/piano/musicxml";
import {
  scoreStore,
  scoreKey,
  readSession,
  saveSession,
} from "../../../../packages/piano/storage";
import { pitchLabel } from "../../../../packages/piano/timeline";
import type { Labels, Score } from "../../../../packages/piano/types";
import { rememberSong, type Song } from "../../../../packages/core/song";
import { Feedback } from "../components/Feedback";
import { Keyboard } from "./Keyboard";
import { ScoreView } from "./ScoreView";
import version from "../version.json";
import "./piano.css";

export function PianoWorkspace({
  song,
  active,
  controller: provided,
}: {
  song: Song;
  active: boolean;
  controller?: PianoController;
}) {
  const [controller] = useState(
    () => provided ?? new PianoController(new SynthPiano()),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [score, setScore] = useState<Score>(),
    [labels, setLabels] = useState<Labels>("name");
  const labelRef = useRef(labels);
  labelRef.current = labels;
  const [notice, setNotice] = useState("正在恢复练习…"),
    [busy, setBusy] = useState(false),
    [details, setDetails] = useState(false);
  const [recent, setRecent] = useState<{ id: string; title: string }[]>([]),
    [rangeMode, setRangeMode] = useState(false),
    [anchor, setAnchor] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<string, unknown> | null>(
      null,
    ),
    [ack, setAck] = useState(false),
    [keyboardStart, setKeyboardStart] = useState(60),
    [wide, setWide] = useState(() => window.innerWidth >= 600);
  const token = useRef(0);
  const currentSong = useRef(song);
  currentSong.current = song;
  const loadedSongId = useRef(song.id);
  const activeRef = useRef(active);
  activeRef.current = active;
  const closeFeedback = useCallback(() => setFeedback(null), []);
  const flush = useCallback(() => {
    const score = controller.score,
      part = controller.part,
      track = controller.track,
      s = controller.getSnapshot();
    if (!score || !part || !track) return;
    try {
      saveSession(scoreKey(loadedSongId.current, score.id), {
        partId: part.id,
        trackId: track.id,
        range: {
          startMeasureId: part.measures[s.range[0]].id,
          endMeasureId: part.measures[s.range[1]].id,
        },
        mode: s.mode,
        speed: s.speed,
        loop: s.loop,
        labels: labelRef.current,
        tick: s.tick,
        practicedAt: new Date().toISOString(),
      });
    } catch {
      setNotice("浏览器阻止保存练习设置；本次仍可使用，刷新后可能丢失。");
    }
  }, [controller]);
  const saveScore = async (next: Score, loadToken: number) => {
    try {
      const song = currentSong.current,
        key = scoreKey(song.id, next.id);
      await scoreStore.put({
        id: key,
        scoreId: next.id,
        songId: song.id,
        xml: next.xml,
        format: next.format,
        title: next.title,
        savedAt: new Date().toISOString(),
      });
      if (loadToken !== token.current) return;
      localStorage.setItem(`anisong:lastScore:${song.id}`, key);
      rememberSong({
        ...song,
        scoreIds: Array.from(new Set([...song.scoreIds, next.id])),
      });
      const stored = await scoreStore.all();
      if (loadToken === token.current)
        setRecent(
          stored
            .filter((s) => s.songId === song.id)
            .map((s) => ({ id: s.id, title: s.title })),
        );
      if (loadToken === token.current)
        setNotice(
          "乐谱已保存在此浏览器。练习设置每秒自动保存，离开页面时立即保存。",
        );
    } catch {
      if (loadToken === token.current)
        setNotice(
          "乐谱可练习，但本地存储不可用或空间不足；刷新前请保留源文件。",
        );
    }
  };
  const install = (next: Score, loadToken: number, restore: boolean) => {
    if (loadToken !== token.current) return;
    loadedSongId.current = currentSong.current.id;
    const saved = restore
      ? readSession(scoreKey(loadedSongId.current, next.id))
      : undefined;
    controller.load(next, undefined, undefined, saved);
    setLabels(saved?.labels ?? "name");
    setScore(next);
    setAck(false);
    setRangeMode(false);
    setAnchor(null);
    setBusy(false);
    setNotice("谱面已就绪。点“启用声音”弹琴，或点击小节试听。");
    void saveScore(next, loadToken);
  };
  const demo = async () => {
    const loadToken = ++token.current;
    flush();
    controller.pause();
    setBusy(true);
    setNotice("正在载入原创八小节谱…");
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}demo/piano-demo.musicxml`,
      );
      if (!response.ok) throw new Error("示例文件读取失败。");
      install(parseMusicXml(await response.text()), loadToken, true);
    } catch (error) {
      if (loadToken === token.current) {
        setBusy(false);
        setNotice((error as Error).message);
      }
    }
  };
  useEffect(() => {
    const loadToken = ++token.current;
    controller.pause();
    setBusy(true);
    void (async () => {
      try {
        const id = localStorage.getItem(`anisong:lastScore:${song.id}`);
        const saved = id ? await scoreStore.get(id) : undefined;
        if (saved) {
          install(
            parseMusicXml(saved.xml, saved.title, saved.format),
            loadToken,
            true,
          );
          return;
        }
      } catch {
        /* IndexedDB denied: still provide the built-in score. */
      }
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}demo/piano-demo.musicxml`,
        );
        if (!response.ok)
          throw new Error("示例载入失败，请重试或导入 MusicXML。");
        install(parseMusicXml(await response.text()), loadToken, true);
      } catch (error) {
        if (loadToken === token.current) {
          setBusy(false);
          setNotice((error as Error).message);
        }
      }
    })();
    return () => {
      ++token.current;
      flush();
    };
  }, [song.id]);
  useEffect(() => {
    if (!active) {
      controller.pause();
      flush();
    }
  }, [active, controller, flush]);
  useEffect(() => {
    const save = setInterval(() => {
      if (activeRef.current && !document.hidden) flush();
    }, 1000);
    const hide = () => {
      if (document.hidden) {
        controller.pause("切到后台已暂停，返回后点击播放继续。");
        flush();
      }
    };
    const leave = () => {
      controller.pause();
      flush();
    };
    const resize = () => {
      setWide(window.innerWidth >= 600);
      controller.pause("窗口尺寸变化后已暂停，请继续练习。");
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    window.addEventListener("resize", resize);
    return () => {
      clearInterval(save);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("resize", resize);
      flush();
      if (!provided) controller.dispose();
    };
  }, [controller, flush, provided]);
  useEffect(() => {
    flush();
  }, [labels, flush]);
  const part = controller.part,
    track = controller.track,
    target = controller.target;
  const midi = state.mode === "free" ? undefined : target?.pitch?.midi;
  const octaves = wide ? 2 : 1;
  useEffect(() => {
    if (
      midi !== undefined &&
      (midi < keyboardStart || midi > keyboardStart + octaves * 12)
    ) {
      setKeyboardStart(Math.max(0, Math.min(108, Math.floor(midi / 12) * 12)));
    }
  }, [midi, octaves]);
  const importFile = async (file: File) => {
    const loadToken = ++token.current;
    flush();
    controller.pause();
    setBusy(true);
    setNotice("正在解析乐谱…");
    try {
      install(await readScore(file), loadToken, false);
    } catch (error) {
      if (loadToken === token.current) {
        setBusy(false);
        setNotice((error as Error).message);
      }
    }
  };
  const choose = (i: number) => {
    if (busy) return;
    setNotice("");
    if (!rangeMode) {
      controller.select(i);
      return;
    }
    if (anchor === null) {
      controller.pause();
      setAnchor(i);
    } else {
      controller.select(anchor, i);
      setAnchor(null);
      setRangeMode(false);
    }
  };
  const selectRecent = async (id: string) => {
    if (!id) return;
    const loadToken = ++token.current;
    flush();
    controller.pause();
    setBusy(true);
    try {
      const saved = await scoreStore.get(id);
      if (!saved) throw new Error("保存的乐谱不存在，请重新导入。");
      install(
        parseMusicXml(saved.xml, saved.title, saved.format),
        loadToken,
        true,
      );
    } catch (error) {
      if (loadToken === token.current) {
        setBusy(false);
        setNotice((error as Error).message);
      }
    }
  };
  const snapshot = () => ({
    module: "piano",
    scoreId: score?.id,
    format: score?.format,
    part: score
      ? score.parts.findIndex((p) => p.id === part?.id) + 1
      : undefined,
    staff: track
      ? part!.tracks.findIndex((t) => t.id === track.id) + 1
      : undefined,
    bars: state.range.map((n) => n + 1),
    mode: state.mode,
    speed: state.speed,
    loop: state.loop,
    tick: Math.round(state.tick),
    phase: state.phase,
    sound: state.sound,
    writtenOrder: ack,
    hasError: !!state.error,
  });
  const currentSegment =
    target?.segments.find((s) => state.tick >= s.tick && state.tick < s.end) ??
    target?.segments[0];
  const currentMeasure = part?.measures.find(
    (m) => state.tick >= m.tick && state.tick < m.tick + m.duration,
  );
  const running = state.phase === "playing" || state.phase === "waiting";
  return (
    <main className="piano-workspace" aria-label="钢琴学谱">
      <div className="piano-heading">
        <div>
          <span className="piano-eyebrow">PIANO LAB · {song.title}</span>
          <h1>{score?.title ?? "导入你的旋律"}</h1>
        </div>
        <div className="piano-heading-actions">
          <label className="piano-file">
            导入乐谱
            <input
              aria-label="导入 MusicXML 或 MXL"
              type="file"
              accept=".musicxml,.xml,.mxl"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <button onClick={() => void demo()}>示例</button>
          <button aria-expanded={details} onClick={() => setDetails(!details)}>
            谱面设置
          </button>
          <button onClick={() => setFeedback(snapshot())}>反馈 ↗</button>
        </div>
      </div>
      <div className="piano-status" role="status">
        <span>
          {busy
            ? "读取中…"
            : state.error ||
              state.message ||
              notice ||
              "点小节试听；琴键按住发声、松开释放。"}
        </span>
        <span className="rotate-hint">↔ 演奏建议旋转手机</span>
      </div>
      {details && (
        <section className="piano-settings" aria-label="谱面设置">
          <div className="settings-title">
            <strong>谱面与本地记录</strong>
            <button onClick={() => setDetails(false)}>完成</button>
          </div>
          <p>关联歌曲：{song.title}。学唱与学谱共享歌曲身份，练习进度独立。</p>
          {score && part && track && (
            <>
              <p>
                {part.measures.length} 小节 · {part.measures[0].beats}/
                {part.measures[0].beatType} 拍 · 调号{" "}
                {Math.abs(part.measures[0].fifths)} 个
                {part.measures[0].fifths < 0 ? "降" : "升"}号 · 初始 ♩=
                {score.tempos[0].bpm}
              </p>
              <label>
                乐器 / 声部
                <select
                  aria-label="练习声部"
                  value={part.id}
                  onChange={(e) => {
                    controller.selectPart(e.target.value);
                    setAnchor(null);
                  }}
                >
                  {score.parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                单音轨道
                <select
                  aria-label="旋律轨道"
                  value={track.id}
                  onChange={(e) => {
                    controller.selectPart(part.id, e.target.value);
                    setAnchor(null);
                  }}
                >
                  {part.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      谱表 {t.staff} · 声部 {t.voice}
                      {t.blocked.length ? "（仅看谱）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                音符附近辅助标记
                <select
                  aria-label="音符辅助显示"
                  value={labels}
                  onChange={(e) => setLabels(e.target.value as Labels)}
                >
                  <option value="none">关闭</option>
                  <option value="name">音名 C4 / F♯4</option>
                  <option value="solfege">固定唱名 Do / Re / Mi</option>
                </select>
              </label>
              <p>
                固定唱名：C 永远读 Do，D 读
                Re；不是首调唱名。试听采用无采样合成钢琴音色。
              </p>
              {score.warnings.map((w) => (
                <p className="piano-warning" key={w}>
                  {w}
                </p>
              ))}
              {track.blocked.map((w) => (
                <p className="piano-warning" key={w}>
                  {w}
                </p>
              ))}
            </>
          )}
          <label>
            此歌曲已保存的乐谱
            <select
              aria-label="已保存乐谱"
              value={score ? scoreKey(song.id, score.id) : ""}
              onChange={(e) => void selectRecent(e.target.value)}
            >
              <option value="">选择乐谱</option>
              {recent.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <p>清理浏览器站点数据会删除练习记录；原始谱文件请自行保留。</p>
          <a className="piano-download" href={`${import.meta.env.BASE_URL}demo/piano-demo.musicxml`} download="anisong-original-8-bars.musicxml">下载合法示例 MusicXML，供手机重新导入测试 ↗</a>
        </section>
      )}
      {score?.needsWrittenOrder && !ack && (
        <label className="written-order">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => {
              controller.writtenOrderAccepted = e.target.checked;
              setAck(e.target.checked);
            }}
          />
          含反复/跳转；我确认按书写顺序练习（不展开反复）
        </label>
      )}
      {track?.blocked.length ? (
        <div className="piano-blocked" role="alert">
          {track.blocked[0]}{" "}
          <button onClick={() => setDetails(true)}>更换轨道</button>{" "}
          原谱仍可查看，自由弹琴可用。
        </div>
      ) : null}
      <section className="staff-region" aria-label="乐谱">
        {score && part && track ? (
          <ScoreView
            score={score}
            part={part}
            track={track}
            range={state.range}
            activeId={state.mode === "free" ? undefined : currentSegment?.id}
            labels={labels}
            onSelect={choose}
          />
        ) : (
          <div className="piano-empty">
            {busy ? "正在载入乐谱…" : "导入 MusicXML 或点击“示例”开始。"}
          </div>
        )}
      </section>
      <div className="bar-controls">
        <strong>
          练习 {state.range[0] + 1}
          {state.range[1] !== state.range[0]
            ? `–${state.range[1] + 1}`
            : ""}{" "}
          小节
        </strong>
        <button
          aria-pressed={rangeMode}
          onClick={() => {
            controller.pause();
            setRangeMode(!rangeMode);
            setAnchor(null);
          }}
        >
          {rangeMode
            ? anchor === null
              ? "点起始小节"
              : `从 ${anchor + 1} 到…`
            : "选择范围"}
        </button>
        <div className="bar-strip" aria-label="小节选择">
          {part?.measures.map((m) => (
            <button
              key={m.id}
              aria-label={`第 ${m.index + 1} 小节`}
              aria-pressed={
                m.index >= state.range[0] && m.index <= state.range[1]
              }
              className={m.index === anchor ? "anchor" : ""}
              onClick={() => choose(m.index)}
            >
              {m.index + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="piano-transport">
        <div role="group" aria-label="钢琴练习模式" className="piano-modes">
          {(["listen", "wait", "free"] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={state.mode === mode}
              onClick={() => {
                controller.mode(mode);
                setAnchor(null);
                setRangeMode(false);
              }}
            >
              {mode === "listen"
                ? "自动试听"
                : mode === "wait"
                  ? "等待弹对"
                  : "自由弹奏"}
            </button>
          ))}
        </div>
        <button
          aria-label="上一小节"
          disabled={!part || state.range[0] === 0}
          onClick={() => controller.select(state.range[0] - 1)}
        >
          ◀
        </button>
        <button
          className="piano-play"
          disabled={
            !score || busy || state.mode === "free" || !!controller.blocked
          }
          onClick={() =>
            running ? controller.pause() : void controller.play()
          }
        >
          {running ? "暂停" : state.mode === "wait" ? "开始等待" : "播放"}
        </button>
        <button
          aria-label="下一小节"
          disabled={!part || state.range[1] >= part.measures.length - 1}
          onClick={() => controller.select(state.range[1] + 1)}
        >
          ▶
        </button>
        <button
          onClick={() => controller.restart()}
          disabled={!score || state.mode === "free" || !!controller.blocked}
        >
          重练
        </button>
        <select
          aria-label="钢琴播放速度"
          value={state.speed}
          onChange={(e) => controller.setSpeed(Number(e.target.value))}
        >
          {[0.5, 0.75, 1, 1.25].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <button
          aria-pressed={state.loop}
          onClick={() => controller.setLoop(!state.loop)}
        >
          ↻ {state.loop ? "循环开" : "循环关"}
        </button>
      </div>
      <div className="keyboard-top">
        <button
          onClick={() => {
            controller.pause();
            setKeyboardStart((n) => Math.max(0, n - 12));
          }}
        >
          低八度
        </button>
        <span>
          {state.mode === "free"
            ? "自由弹奏 · 无自动推进"
            : `第 ${currentMeasure ? currentMeasure.index + 1 : state.range[1] + 1} 小节 · ${target?.pitch ? pitchLabel(target.pitch) : "休止"}${target?.pitch ? ` / ${pitchLabel(target.pitch, true)}` : ""}`}
          {state.phase === "waiting" ? " · 等你触键" : ""}
        </span>
        {state.mode === "wait" &&
          state.phase === "waiting" &&
          !target?.pitch && (
            <button className="rest-step" onClick={() => controller.nextRest()}>
              下一步（休止）
            </button>
          )}
        <button
          onClick={() => {
            controller.pause();
            setKeyboardStart((n) => Math.min(108, n + 12));
          }}
        >
          高八度
        </button>
        <button
          className={state.sound === "ready" ? "sound-ready" : "sound-enable"}
          onClick={() => void controller.enable()}
        >
          {state.sound === "ready" ? "声音已启用" : "启用声音"}
        </button>
      </div>
      <Keyboard
        start={keyboardStart}
        octaves={octaves}
        target={midi}
        enabled={state.sound === "ready" && active}
        resetKey={state.epoch}
        onDown={(id, n) => controller.press(id, n)}
        onUp={(id) => controller.release(id)}
      />
      <div className="piano-foot">
        <span>
          {state.mode === "wait"
            ? "错键不推进；休止点“下一步”；跨小节延音只需按一次。"
            : "按住琴键发声，松开释放 · 多指可同时弹奏"}{" "}
          · 旋转/后台主动暂停
        </span>
        <span>
          {version.sha} · {state.rounds} 轮
        </span>
      </div>
      {feedback && <Feedback context={feedback} onClose={closeFeedback} />}
    </main>
  );
}
