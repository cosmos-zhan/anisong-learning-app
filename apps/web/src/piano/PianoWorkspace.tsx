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
import {
  pitchLabel,
  secondsBetween,
} from "../../../../packages/piano/timeline";
import type {
  Labels,
  PracticeMode,
  Score,
} from "../../../../packages/piano/types";
import { rememberSong, type Song } from "../../../../packages/core/song";
import { isHaruhikage } from "../../../../packages/core/presets";
import { Feedback } from "../components/Feedback";
import { OfficialReference } from "../components/OfficialReference";
import { Keyboard } from "./Keyboard";
import { ScoreView } from "./ScoreView";
import { MeasurePicker } from "./MeasurePicker";
import {
  ModeOptions,
  LabelOptions,
  TrackOptions,
  practiceModes,
  labelOptions,
  trackTitle,
} from "./PracticeOptions";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import {
  preferences,
  rememberPractice,
  saveMaterialSummary,
} from "../../../../packages/core/app-state";
import version from "../version.json";
import bundledMedia from "../bundled-audio.json";
type PianoSheet =
  | "mode"
  | "tracks"
  | "labels"
  | "blocked"
  | "speed"
  | "range"
  | "more"
  | "leave";

export interface BundledScore {
  src: string;
  sha256: string;
  bytes: number;
  preferredPartId?: string;
  preferredTrackId?: string;
}
import "./piano.css";

export function PianoWorkspace({
  song,
  active,
  controller: provided,
  bundledScore = bundledMedia.score,
  view = "legacy",
  onExit,
  onEnter,
  onMaterials,
  onLyrics,
  onChanged,
}: {
  view?: "legacy" | "practice" | "prepare" | "materials";
  onExit?: () => void;
  onEnter?: () => void;
  onMaterials?: () => void;
  onLyrics?: () => void;
  onChanged?: () => void;
  song: Song;
  active: boolean;
  controller?: PianoController;
  bundledScore?: BundledScore | null;
}) {
  const [sheet, setSheet] = useState<PianoSheet | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;
  const [controller] = useState(
    () => provided ?? new PianoController(new SynthPiano()),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [score, setScore] = useState<Score>(),
    [labels, setLabels] = useState<Labels>("name");
  const [renderStatus, setRenderStatus] = useState({
    backend: "loading",
    code: "",
  });
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
      if (viewRef.current === "practice" && activeRef.current) {
        rememberPractice({
          songId: loadedSongId.current,
          module: "piano",
          range: s.range,
          speed: s.speed,
          loop: s.loop,
          mode: s.mode,
          savedAt: new Date().toISOString(),
        });
        changedRef.current?.();
      }
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
  const install = (
    next: Score,
    loadToken: number,
    restore: boolean,
    presetSource = false,
  ) => {
    if (loadToken !== token.current) return;
    loadedSongId.current = currentSong.current.id;
    const saved = restore
      ? readSession(scoreKey(loadedSongId.current, next.id))
      : undefined;
    controller.load(
      next,
      saved
        ? undefined
        : presetSource
          ? bundledScore?.preferredPartId
          : undefined,
      saved
        ? undefined
        : presetSource
          ? bundledScore?.preferredTrackId
          : undefined,
      saved,
    );
    if (!saved && viewRef.current !== "legacy")
      controller.setSpeed(preferences().speed);
    setLabels(
      saved?.labels ??
        (viewRef.current === "legacy" ? "name" : preferences().labels),
    );
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
  const readBuiltIn = async (loadToken: number) => {
    if (!bundledScore) return;
    setNotice("正在载入你提供的春日影曲谱…");
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}${bundledScore.src}`,
      );
      if (!response.ok)
        throw new Error(
          "内置曲谱读取失败，可点“内置曲谱”重试或导入 MusicXML。",
        );
      const next = bundledScore.src.endsWith(".mxl")
        ? await (async () => {
            const buffer = await response.arrayBuffer();
            return readScore({
              name: "preset.mxl",
              size: buffer.byteLength,
              arrayBuffer: async () => buffer,
            });
          })()
        : parseMusicXml(await response.text());
      if (loadToken !== token.current) return;
      install(next, loadToken, true, true);
      try {
        localStorage.setItem(
          `anisong:bundledScore:${currentSong.current.id}`,
          bundledScore.sha256,
        );
      } catch {
        /* Playback still works without local storage. */
      }
    } catch (error) {
      if (loadToken === token.current) {
        setBusy(false);
        setNotice((error as Error).message);
      }
    }
  };
  const reloadBuiltIn = () => {
    const loadToken = ++token.current;
    flush();
    controller.pause();
    setBusy(true);
    void readBuiltIn(loadToken);
  };
  useEffect(() => {
    const loadToken = ++token.current;
    flush();
    controller.pause();
    controller.clear();
    setScore(undefined);
    setRecent([]);
    setAnchor(null);
    setRangeMode(false);
    setAck(false);
    setBusy(true);
    void (async () => {
      try {
        const updatedPreset =
          isHaruhikage(song) &&
          bundledScore &&
          localStorage.getItem(`anisong:bundledScore:${song.id}`) !==
            bundledScore.sha256;
        const id = updatedPreset
          ? null
          : localStorage.getItem(`anisong:lastScore:${song.id}`);
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
      if (loadToken !== token.current) return;
      if (isHaruhikage(song)) {
        if (bundledScore) {
          await readBuiltIn(loadToken);
          return;
        }
        setBusy(false);
        setNotice(
          "已选 CRYCHIC 版。导入这版的 MusicXML/MXL 后开始小节练习；琴键可先自由试音。",
        );
        return;
      }
      if (viewRef.current !== "legacy" && song.id !== "demo-original") {
        setBusy(false);
        setNotice("尚未关联乐谱，请到歌曲资料导入 MusicXML；琴键可自由试音。");
        return;
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
  const highestTrack = part?.tracks.find(
    (t) =>
      t.projection === "highest" &&
      t.staff === track?.staff &&
      t.voice === track?.voice,
  );
  const midi = state.mode === "free" ? undefined : target?.pitch?.midi;
  const octaves = view === "legacy" && wide ? 2 : 1;
  useEffect(() => {
    if (
      midi !== undefined &&
      (midi < keyboardStart || midi > keyboardStart + octaves * 12)
    ) {
      setKeyboardStart(Math.max(0, Math.min(108, Math.floor(midi / 12) * 12)));
    }
  }, [midi, octaves]);
  useEffect(() => {
    if (view !== "legacy") controller.pause();
    return () => flush();
  }, [view, controller, flush]);
  useEffect(() => {
    if (!score) return;
    try {
      saveMaterialSummary(song.id, {
        score: score.title,
        bars: score.parts[0]?.measures.length,
        parts: score.parts.length,
      });
      onChanged?.();
    } catch {
      /* Score remains usable. */
    }
  }, [score, song.id, onChanged]);
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
    setNotice(
      controller.getSnapshot().mode === "free"
        ? "自由弹奏只选范围；点击“自动试听”再点小节可听谱。"
        : controller.getSnapshot().mode === "wait"
          ? "等待弹对：请按高亮琴键；此模式不会自动演奏。"
          : "",
    );
    if (!rangeMode) {
      controller.select(i, i, view === "practice" || view === "legacy");
      return;
    }
    if (anchor === null) {
      controller.pause();
      setAnchor(i);
    } else {
      controller.select(anchor, i, view === "practice" || view === "legacy");
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
    staff: track?.staff,
    voice: track?.voice,
    practiceTrack: track?.projection ?? "original",
    renderer: renderStatus,
    bars: state.range.map((n) => n + 1),
    mode: state.mode,
    speed: state.speed,
    loop: state.loop,
    tick: Math.round(state.tick),
    phase: state.phase,
    sound: state.sound,
    writtenOrder: ack,
    labels: labelRef.current,
    hasError: !!state.error,
    playbackBlocked: !!controller.blocked,
  });
  const currentSegment =
    target?.segments.find((s) => state.tick >= s.tick && state.tick < s.end) ??
    target?.segments[0];
  const currentMeasure = part?.measures.find(
    (m) => state.tick >= m.tick && state.tick < m.tick + m.duration,
  );
  const running = state.phase === "playing" || state.phase === "waiting";
  const openSheet = (next: PianoSheet) => {
    controller.pause();
    flush();
    setSheet(next);
  };
  useEffect(() => {
    setSheet(null);
  }, [view, active, song.id]);
  const modeTitle =
    state.mode === "listen"
      ? "自动试听"
      : state.mode === "wait"
        ? "等待弹对"
        : "自由弹奏";
  const shortTitle = isHaruhikage(song) ? "春日影" : song.title;
  const rangeTitle = `第 ${state.range[0] + 1}${state.range[1] === state.range[0] ? "" : `–${state.range[1] + 1}`} 小节`;
  const restWaiting =
    state.mode === "wait" && state.phase === "waiting" && !target?.pitch;
  const shiftOctave = (delta: number) => {
    controller.pause();
    setKeyboardStart((n) => Math.max(0, Math.min(108, n + delta)));
  };
  const chooseMode = (mode: PracticeMode) => {
    if (mode === "wait" && controller.track?.blocked.length) {
      setSheet("blocked");
      return;
    }
    if (controller.getSnapshot().mode !== mode) controller.mode(mode);
    setAnchor(null);
    setRangeMode(false);
    flush();
  };
  const chooseTrack = (partId: string, trackId?: string) => {
    controller.selectPart(partId, trackId);
    setAnchor(null);
    setRangeMode(false);
    flush();
    if (controller.getSnapshot().mode === "wait" && controller.trackBlocked)
      setSheet("blocked");
  };
  const writtenOrder = score?.needsWrittenOrder && !ack && (
    <label className="written-order-inline">
      <input
        type="checkbox"
        checked={ack}
        onChange={(e) => {
          controller.writtenOrderAccepted = e.target.checked;
          setAck(e.target.checked);
        }}
      />
      我确认按书写顺序练习，不展开反复
    </label>
  );
  const issues = (
    <>
      {writtenOrder}
      {controller.trackBlocked && (
        <div className="track-alert" role="alert">
          <p>{controller.trackBlocked}</p>
          {highestTrack && (
            <button onClick={() => chooseTrack(part!.id, highestTrack.id)}>
              练习此轨最高音（单音）
            </button>
          )}
          {state.mode === "wait" &&
            !(track?.listenBlocked ?? track?.blocked)?.length && (
              <button onClick={() => chooseMode("listen")}>自动试听原轨</button>
            )}
        </div>
      )}
      {track?.projection === "highest" && (
        <div className="track-alert">
          单音简化：仅弹每组和弦的最高音。
          <button
            onClick={() => {
              const original = part!.tracks.find(
                (t) =>
                  !t.projection &&
                  t.staff === track.staff &&
                  t.voice === track.voice,
              );
              if (original) chooseTrack(part!.id, original.id);
            }}
          >
            返回原轨
          </button>
        </div>
      )}
    </>
  );
  if (view !== "legacy")
    return (
      <main
        className={`piano-workspace piano-redesign piano-${view} ${restWaiting || controller.blocked ? "has-rest" : ""}`}
        aria-label="钢琴学谱"
      >
        {view === "materials" ? (
          <section className="material-panel">
            <h2>乐谱 · MusicXML</h2>
            <p className="helper">
              {score
                ? `${score.title} · ${part?.measures.length} 小节 / ${score.parts.length} 声部`
                : "尚未关联乐谱。支持 .musicxml / .xml / .mxl，不支持图片与 PDF。"}
            </p>
            <label className="file-button">
              ＋ 关联 / 替换乐谱
              <input
                aria-label="导入 MusicXML 或 MXL"
                type="file"
                accept=".musicxml,.xml,.mxl"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            {isHaruhikage(song) && bundledScore && (
              <button disabled={busy} onClick={reloadBuiltIn}>
                恢复内置曲谱
              </button>
            )}
            <label className="field-label">
              此歌曲已保存乐谱
              <select
                aria-label="已保存乐谱"
                value={score ? scoreKey(song.id, score.id) : ""}
                onChange={(e) => void selectRecent(e.target.value)}
              >
                <option value="">选择乐谱</option>
                {recent.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <a
              className="back-link"
              href={`${import.meta.env.BASE_URL}demo/piano-demo.musicxml`}
              download="anisong-original-8-bars.musicxml"
            >
              下载原创合法示例谱 ↗
            </a>
            <p role="status" className="helper">
              {notice}
            </p>
          </section>
        ) : view === "prepare" ? (
          <div className="piano-preparation">
            <button className="back-link" onClick={onExit}>
              ← 返回歌曲
            </button>
            <h1>钢琴学谱</h1>
            <p className="helper">选好一小段，开始练琴。</p>
            <div className="preparation-song">
              <h2>{shortTitle}</h2>
              <p>
                {score
                  ? `${part?.measures.length} 小节 · ${score.parts.length} 声部 · 初始 ♩${score.tempos[0].bpm}`
                  : "尚未关联乐谱"}
              </p>
            </div>
            <p className="helper" role="status">
              {busy ? "正在恢复乐谱…" : state.error || notice}
            </p>
            <section
              className="settings-card preparation-parameters"
              aria-label="钢琴练习参数"
            >
              <button
                className="info-row"
                aria-label={`练习方式：${modeTitle}`}
                onClick={() => openSheet("mode")}
              >
                <span>
                  <strong>练习方式</strong>
                  <small>
                    {
                      practiceModes.find(
                        (option) => option.value === state.mode,
                      )?.detail
                    }
                  </small>
                </span>
                <span>{modeTitle} ›</span>
              </button>
              <button
                className="info-row"
                aria-label="选择声部与轨道"
                disabled={!score}
                onClick={() => openSheet("tracks")}
              >
                <span>
                  <strong>声部与轨道</strong>
                  <small>
                    {part && track
                      ? `${part.name} · ${trackTitle(track)}`
                      : "请先关联 MusicXML"}
                  </small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
              <button
                className="info-row"
                aria-label={`练习范围：${rangeTitle}`}
                disabled={!score}
                onClick={() => openSheet("range")}
              >
                <span>
                  <strong>小节范围</strong>
                  <small>{rangeTitle}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
              <button
                className="info-row"
                aria-label={`钢琴速度 ${state.speed} 倍`}
                onClick={() => openSheet("speed")}
              >
                <span>
                  <strong>播放速度</strong>
                  <small>改变节奏，保留音高</small>
                </span>
                <span>{state.speed}× ›</span>
              </button>
            </section>
            <div className="preparation-secondary">
              <button onClick={() => openSheet("labels")}>
                音符辅助：
                {labelOptions.find((option) => option.value === labels)?.title}
              </button>
              <button
                aria-pressed={state.loop}
                onClick={() => {
                  controller.setLoop(!state.loop);
                  flush();
                }}
              >
                循环{state.loop ? "开" : "关"}
              </button>
            </div>
            {issues}
            <p className="rotate-card">↔ 横过手机，看谱和琴键会同时展开。</p>
            <button className="primary full" onClick={onEnter}>
              进入钢琴练习 →
            </button>
            <button className="quiet full" onClick={onMaterials}>
              关联 / 替换乐谱
            </button>
          </div>
        ) : (
          <>
            <div className="focus-header piano-focus-header">
              <button
                aria-label="退出钢琴练习"
                onClick={() => openSheet("leave")}
              >
                <Icon name="back" />
              </button>
              <div className="piano-song-heading">
                <h1>{shortTitle}</h1>
                <small aria-label="当前练习声部">
                  {part
                    ? `${part.name} · ${track?.projection === "highest" ? "最高音单音" : "原轨"} · ${track?.staff}/${track?.voice}`
                    : "自由试琴"}
                </small>
              </div>
              <button
                className="mode-pill"
                aria-label={`练习方式：${modeTitle}`}
                onClick={() => openSheet("mode")}
              >
                {modeTitle}
              </button>
              {state.sound !== "ready" && (
                <button
                  className="sound-enable"
                  onClick={() => void controller.enable()}
                >
                  {state.sound === "off" ? "启用声音" : "重新启用声音"}
                </button>
              )}
              <button
                aria-label="更多钢琴操作"
                onClick={() => openSheet("more")}
              >
                <Icon name="more" />
              </button>
              <button
                aria-label="钢琴声部与轨道"
                onClick={() => openSheet("tracks")}
              >
                <Icon name="settings" />
              </button>
            </div>
            <section className="staff-region" aria-label="乐谱">
              {score && part && track ? (
                <ScoreView
                  score={score}
                  part={part}
                  track={track}
                  range={state.range}
                  activeId={
                    state.mode === "free" ? undefined : currentSegment?.id
                  }
                  labels={labels}
                  onSelect={choose}
                  active={active}
                  onRenderStatus={setRenderStatus}
                />
              ) : (
                <div className="piano-empty">
                  {busy ? "正在载入乐谱…" : "尚未关联 MusicXML 乐谱。"}
                  <button onClick={onMaterials}>添加乐谱</button>
                </div>
              )}
            </section>
            <div className="focus-piano-transport" aria-label="钢琴播放控制">
              <button
                className="range-button"
                disabled={!score}
                onClick={() => openSheet("range")}
              >
                {rangeTitle} ▾
              </button>
              <button
                className="restart-button"
                aria-label="重练"
                disabled={
                  !score || state.mode === "free" || !!controller.blocked
                }
                onClick={() => controller.restart()}
              >
                <Icon name="restart" />
                <span>重练</span>
              </button>
              <button
                className="piano-play"
                aria-label={
                  running ? "暂停" : state.mode === "wait" ? "开始等待" : "播放"
                }
                disabled={
                  !score ||
                  busy ||
                  state.mode === "free" ||
                  !!controller.blocked
                }
                onClick={() =>
                  running ? controller.pause() : void controller.play()
                }
              >
                <Icon name={running ? "pause" : "play"} />
              </button>
              <button
                className="speed-button"
                aria-label={`钢琴速度 ${state.speed} 倍`}
                onClick={() => openSheet("speed")}
              >
                {state.speed}×
              </button>
              <button
                aria-pressed={state.loop}
                onClick={() => controller.setLoop(!state.loop)}
              >
                循环{state.loop ? "开" : "关"}
              </button>
              <button onClick={() => openSheet("labels")}>
                {labels === "name"
                  ? "音名辅助"
                  : labels === "solfege"
                    ? "唱名辅助"
                    : "标记关闭"}
              </button>
              <button aria-label="低八度" onClick={() => shiftOctave(-12)}>
                低八度
              </button>
              <button aria-label="高八度" onClick={() => shiftOctave(12)}>
                高八度
              </button>
            </div>
            <div
              className={`piano-status ${restWaiting ? "rest-waiting" : ""}`}
              role="status"
            >
              <span>
                {busy
                  ? "正在读取乐谱…"
                  : state.error ||
                    state.message ||
                    (controller.trackBlocked
                      ? "此轨暂不支持当前模式，请选择其他轨道。"
                      : !score
                        ? notice
                        : state.mode === "free"
                          ? "自由弹奏 · 按住发声，松开释放"
                          : running
                            ? `${modeTitle} · ${currentMeasure ? `第 ${currentMeasure.index + 1} 小节` : "练习中"}`
                            : "准备试听 · 点小节，或点播放")}
              </span>
              {!state.error && state.mode !== "free" && target?.pitch && (
                <span className="target-hint">
                  {pitchLabel(target.pitch)} / {pitchLabel(target.pitch, true)}
                  {state.phase === "waiting" ? " · 等你触键" : ""}
                </span>
              )}
              {controller.blocked && (
                <button
                  className="rest-step"
                  onClick={() =>
                    openSheet(
                      state.mode === "wait" && controller.trackBlocked
                        ? "blocked"
                        : "tracks",
                    )
                  }
                >
                  查看原因
                </button>
              )}
              {restWaiting && (
                <button
                  className="rest-step"
                  onClick={() => controller.nextRest()}
                >
                  下一步（休止）
                </button>
              )}
            </div>
            <Keyboard
              start={keyboardStart}
              octaves={1}
              labels={labels}
              target={midi}
              enabled={state.sound === "ready" && active}
              resetKey={state.epoch}
              onDown={(id, n) => controller.press(id, n)}
              onUp={(id) => controller.release(id)}
            />
          </>
        )}
        {sheet && (
          <Sheet
            className={sheet === "range" ? "measure-sheet" : ""}
            title={
              sheet === "range"
                ? "练习小节范围"
                : sheet === "speed"
                  ? "练习速度"
                  : sheet === "mode"
                    ? "练习方式"
                    : sheet === "tracks"
                      ? "声部与轨道"
                      : sheet === "labels"
                        ? "音符辅助"
                        : sheet === "blocked"
                          ? "等待弹对需要单音轨"
                          : sheet === "leave"
                            ? "离开练习"
                            : "更多钢琴操作"
            }
            onClose={() => setSheet(null)}
          >
            {(dismiss) => (
              <>
                {sheet === "mode" ? (
                  <>
                    <ModeOptions
                      mode={state.mode}
                      hasScore={!!score}
                      onChoose={chooseMode}
                    />
                    {writtenOrder}
                    <p className="helper">
                      切换方式保留范围和速度，不自动播放。等待弹对限单音；原轨和弦可自动试听。
                    </p>
                  </>
                ) : sheet === "labels" ? (
                  <LabelOptions labels={labels} onChoose={setLabels} />
                ) : sheet === "tracks" ? (
                  <>
                    {score && part && track ? (
                      <TrackOptions
                        score={score}
                        part={part}
                        track={track}
                        onChoose={chooseTrack}
                      />
                    ) : (
                      <p className="helper">请先关联 MusicXML 乐谱。</p>
                    )}
                    {writtenOrder}
                    {score?.warnings.map((warning) => (
                      <p className="warning" key={warning}>
                        {warning}
                      </p>
                    ))}
                  </>
                ) : sheet === "blocked" ? (
                  <div className="blocked-options">
                    <p>
                      {part?.name} ·{" "}
                      {track ? trackTitle(track) : "尚未关联轨道"}
                    </p>
                    <p role="alert">
                      {track?.blocked.join(" ") || "当前轨道暂不支持等待弹对。"}
                    </p>
                    <p className="helper">
                      不会自动删掉和弦。选择单音简化后，只练每组和弦的最高音；原轨仍保留。
                    </p>
                    {highestTrack && (
                      <button
                        className="primary full"
                        onClick={() => {
                          controller.selectPart(part!.id, highestTrack.id);
                          controller.mode("wait");
                          flush();
                          dismiss();
                        }}
                      >
                        改练最高音（单音）
                      </button>
                    )}
                    <button
                      className="quiet full"
                      disabled={
                        !!(track?.listenBlocked ?? track?.blocked)?.length
                      }
                      onClick={() => {
                        controller.mode("listen");
                        flush();
                        dismiss();
                      }}
                    >
                      继续自动试听原轨
                    </button>
                    <button
                      className="quiet full"
                      onClick={() => setSheet("tracks")}
                    >
                      选择其他声部与轨道
                    </button>
                  </div>
                ) : sheet === "speed" ? (
                  <>
                    <div
                      className="sheet-options speed-options"
                      role="group"
                      aria-label="钢琴练习速度"
                    >
                      {[0.5, 0.75, 1, 1.25].map((speed) => (
                        <button
                          key={speed}
                          aria-pressed={state.speed === speed}
                          onClick={() => {
                            controller.setSpeed(speed);
                            flush();
                          }}
                        >
                          {speed}×
                          <span>{state.speed === speed ? "✓" : ""}</span>
                        </button>
                      ))}
                    </div>
                    <p className="helper">
                      改变练习节奏，保留原曲音高；范围保持不变。
                    </p>
                  </>
                ) : sheet === "range" ? (
                  <MeasurePicker
                    count={part?.measures.length ?? 0}
                    range={state.range}
                    dismiss={dismiss}
                    onApply={(a, b) => {
                      controller.select(a, b, false);
                      flush();
                    }}
                  />
                ) : sheet === "leave" ? (
                  <>
                    <p className="helper">
                      播放已暂停，当前设置已尝试保存在本机。退出后可从最近练习恢复；保存失败会显示提示。
                    </p>
                    <button
                      className="primary full"
                      onClick={() => {
                        flush();
                        dismiss(() => onExit?.());
                      }}
                    >
                      暂停并返回
                    </button>
                    <button className="quiet full" onClick={() => dismiss()}>
                      继续练习
                    </button>
                  </>
                ) : (
                  <div className="sheet-options">
                    <button
                      onClick={() => {
                        const context = snapshot();
                        dismiss(() => setFeedback(context));
                      }}
                    >
                      反馈 ↗
                    </button>
                    <button
                      onClick={() => {
                        dismiss(() => onMaterials?.());
                      }}
                    >
                      歌曲资料
                    </button>
                    <button
                      onClick={() => {
                        dismiss(() => onLyrics?.());
                      }}
                    >
                      歌词学唱
                    </button>
                    <button
                      onClick={() => {
                        dismiss(() => onExit?.());
                      }}
                    >
                      返回练习准备
                    </button>
                  </div>
                )}
              </>
            )}
          </Sheet>
        )}
        {feedback && <Feedback context={feedback} onClose={closeFeedback} />}
      </main>
    );
  return (
    <main className="piano-workspace" aria-label="钢琴学谱">
      <div className="piano-heading">
        <div>
          <span
            className="piano-eyebrow"
            aria-label="当前练习声部"
            title={`${song.title} · ${part?.name ?? ""} · 谱表 ${track?.staff ?? "—"} / 声部 ${track?.voice ?? "—"}`}
          >
            {part
              ? `${part.name} · 谱表 ${track?.staff} / 声部 ${track?.voice}`
              : isHaruhikage(song)
                ? "CRYCHIC · 待导入曲谱"
                : "PIANO LAB"}
          </span>
          <h1>
            {score?.title ?? (isHaruhikage(song) ? song.title : "导入你的旋律")}
          </h1>
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
          {isHaruhikage(song) && bundledScore && (
            <button disabled={busy} onClick={reloadBuiltIn}>
              内置曲谱
            </button>
          )}
          <button
            onClick={() => {
              if (isHaruhikage(song)) {
                location.assign("?song=demo-original#piano");
                return;
              }
              void demo();
            }}
          >
            原创示例
          </button>
          {isHaruhikage(song) && (
            <OfficialReference
              active={active}
              onOpen={() => controller.pause()}
            />
          )}
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
        {score?.warnings.some((w) => w.startsWith("未写明速度")) && (
          <span>未标速度 · 暂用 ♩100</span>
        )}
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
                {" · 书写时长约 "}
                {secondsBetween(
                  score.tempos,
                  0,
                  part.measures.at(-1)!.tick + part.measures.at(-1)!.duration,
                ).toFixed(1)}{" "}
                秒（学谱与 MP3 独立）
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
                      {t.projection === "highest" ? "（最高音单音简化）" : ""}
                      {(t.listenBlocked ?? t.blocked).length
                        ? "（仅看谱）"
                        : t.blocked.length
                          ? "（可试听；等待需单音）"
                          : ""}
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
          <a
            className="piano-download"
            href={`${import.meta.env.BASE_URL}demo/piano-demo.musicxml`}
            download="anisong-original-8-bars.musicxml"
          >
            下载合法示例 MusicXML，供手机重新导入测试 ↗
          </a>
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
      {controller.trackBlocked ? (
        <div className="piano-blocked" role="alert">
          {controller.trackBlocked}{" "}
          {highestTrack && (
            <button
              onClick={() => {
                controller.selectPart(part!.id, highestTrack.id);
                setAnchor(null);
              }}
            >
              练习此轨最高音（单音）
            </button>
          )}
          <button onClick={() => setDetails(true)}>更换轨道</button>{" "}
          原谱仍可查看，自由弹琴可用。
          {state.mode === "wait" &&
            !(track?.listenBlocked ?? track?.blocked)?.length && (
              <button onClick={() => controller.mode("listen")}>
                切换自动试听原轨
              </button>
            )}
        </div>
      ) : null}
      {track?.projection === "highest" && (
        <div className="piano-adaptation">
          单音简化：只演奏每组和弦的最高音，谱面保留原谱。
          <button
            onClick={() => {
              const original = part!.tracks.find(
                (t) =>
                  !t.projection &&
                  t.staff === track.staff &&
                  t.voice === track.voice,
              );
              if (original) controller.selectPart(part!.id, original.id);
            }}
          >
            返回原轨
          </button>
        </div>
      )}
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
            active={active}
            onRenderStatus={setRenderStatus}
          />
        ) : (
          <div className="piano-empty">
            {busy ? (
              "正在载入乐谱…"
            ) : isHaruhikage(song) ? (
              <>
                <strong>春日影 · CRYCHIC</strong>
                <span>待导入这版的 MusicXML / MXL 乐谱</span>
                <a
                  className="piano-download"
                  href="?song=haruhikage-crychic#lyrics"
                >
                  去学唱页试听完整歌曲 ↗
                </a>
                <small>
                  先点“官方试听（片段）”听歌，或启用声音自由试琴。PDF/图片尚不支持。
                </small>
              </>
            ) : (
              "导入 MusicXML 或点击“原创示例”开始。"
            )}
          </div>
        )}
      </section>
      <div className="bar-controls">
        <strong>
          {!score ? (
            "尚未导入乐谱"
          ) : (
            <>
              练习 {state.range[0] + 1}
              {state.range[1] !== state.range[0]
                ? `–${state.range[1] + 1}`
                : ""}{" "}
              小节
            </>
          )}
        </strong>
        <button
          disabled={!score}
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
              disabled={!score && mode !== "free"}
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
          {!score
            ? "自由试音 · 待导入曲谱"
            : state.mode === "free"
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
