import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { LoopController } from "../../../packages/core/controller";
import { WebAudioEngine } from "../../../packages/audio-web";
import {
  NativeAudioEngine,
  isNative,
  bridge,
} from "../../../packages/audio-native";
import { parseLrc } from "../../../packages/core/lrc";
import { Feedback } from "./components/Feedback";
import type { PlayerState } from "../../../packages/core/types";
import version from "./version.json";
import type { Song } from "../../../packages/core/song";
import { HARUHIKAGE, isHaruhikage } from "../../../packages/core/presets";
import { OfficialReference } from "./components/OfficialReference";
import { Sheet } from "./components/Sheet";
import { LyricsPractice } from "./lyrics/LyricsPractice";
import { LyricsDisplayPanel } from "./lyrics/LyricsDisplayPanel";
import { lyricsDisplay, saveLyricsDisplay, type LyricsDisplay } from "../../../packages/core/lyrics-display";
import { TrimRange } from "./lyrics/TrimRange";
import {
  materialStore,
  saveMaterialSummary,
  rememberPractice,
  preferences,
} from "../../../packages/core/app-state";
import bundledAudioConfig from "./bundled-audio.json";
export interface BundledAudio {
  available: boolean;
  src: string;
  sha256: string;
  bytes: number;
  lyrics?: { src: string; sha256: string; bytes: number } | null;
}
const format = (v: number) =>
  `${Math.floor(v / 60)
    .toString()
    .padStart(2, "0")}:${(v % 60).toFixed(2).padStart(5, "0")}`;
export function App({
  controller: provided,
  autoLoad = true,
  active = true,
  onSong,
  onPiano,
  initialSong,
  bundledAudio = bundledAudioConfig,
  view = "legacy",
  onExit,
  onMaterials,
  onChanged,
}: {
  view?: "legacy" | "practice" | "materials" | "preview";
  onExit?: () => void;
  onMaterials?: () => void;
  onChanged?: () => void;
  controller?: LoopController;
  autoLoad?: boolean;
  active?: boolean;
  onSong?: (title: string, demo: boolean) => void;
  onPiano?: () => void;
  initialSong?: Song;
  bundledAudio?: BundledAudio;
}) {
  const [controller] = useState(
    () =>
      provided ??
      new LoopController(
        isNative() ? new NativeAudioEngine() : new WebAudioEngine(),
      ),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [preset, setPreset] = useState(() => isHaruhikage(initialSong));
  const [title, setTitle] = useState(initialSong?.title ?? "小小的练习曲");
  const [demo, setDemo] = useState(
    !initialSong || initialSong.id === "demo-original",
  );
  const [notice, setNotice] = useState(
    isHaruhikage(initialSong)
      ? bundledAudio.available
        ? "正在载入你提供的春日影 MP3…"
        : "此部署未包含内置音频。可导入本地 MP3 试听，再导入匹配 LRC 进行逐句循环。"
      : "",
  );
  const [sheet, setSheet] = useState<"speed" | "trim" | "more" | "display" | null>(null);
  const [display, setDisplay] = useState(lyricsDisplay);
  const changeDisplay = (value: LyricsDisplay) => {
    setDisplay(value);
    if (!saveLyricsDisplay(value)) setNotice("显示偏好无法保存；本次仍然生效，重启后会恢复默认。");
  };
  const songId = initialSong?.id ?? "demo-original";
  const [multi, setMulti] = useState(false);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<PlayerState | null>(null);
  const closeFeedback = useCallback(() => setFeedback(null), []);
  const alive = useRef(true);
  const fileUrl = useRef<string | null>(null);
  const loadToken = useRef(0);
  const lyricsToken = useRef(0);
  const loadPreset = async () => {
    if (!bundledAudio.available) return;
    const token = ++loadToken.current;
    const lyricToken = ++lyricsToken.current;
    setAnchor(null);
    setNotice("正在完整缓冲春日影 MP3（约 10 MB）与歌词，完成后可按句跳转…");
    const lyricsPromise = bundledAudio.lyrics
      ? (async () => {
          const abort = new AbortController();
          const timeout = setTimeout(() => abort.abort(), 10000);
          try {
            const response = await fetch(
              `${import.meta.env.BASE_URL}${bundledAudio.lyrics!.src}`,
              { signal: abort.signal },
            );
            if (!response.ok) throw new Error("LRC");
            return { parsed: parseLrc(await response.text()) };
          } catch {
            return { failed: true };
          } finally {
            clearTimeout(timeout);
          }
        })()
      : Promise.resolve(null);
    const source = isNative()
      ? `file:///android_asset/public/${bundledAudio.src}`
      : `${import.meta.env.BASE_URL}${bundledAudio.src}`;
    const loaded = await controller.load(source);
    if (token !== loadToken.current) return;
    if (!loaded) {
      setNotice(
        "内置 MP3 载入失败。可重新载入，或导入本地音频；不会替换成其他歌曲。",
      );
      return;
    }
    await controller.setSpeed(1);
    if (token !== loadToken.current) return;
    if (fileUrl.current) {
      URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = null;
    }
    setPreset(true);
    setTitle(HARUHIKAGE.title);
    setDemo(false);
    let result = await lyricsPromise;
    if (view !== "legacy") {
      try {
        const saved = await materialStore.get(`${songId}:lyrics`);
        if (saved?.text) result = { parsed: parseLrc(saved.text) };
      } catch {
        /* Bundled lyrics remain available. */
      }
    }
    if (token !== loadToken.current || lyricToken !== lyricsToken.current)
      return;
    const hasLyrics =
      !!result?.parsed &&
      controller.setLyrics(result.parsed.lines, result.parsed.warnings);
    await controller.selectTrack();
    if (token !== loadToken.current || lyricToken !== lyricsToken.current)
      return;
    await restoreSession();
    setNotice(
      hasLyrics
        ? `已内置 MP3 与 ${controller.getSnapshot().lines.length} 句歌词。点任一句循环，或点播放整曲，无需重新导入。`
        : bundledAudio.lyrics
          ? "MP3 已就绪，但内置歌词载入失败。可整曲试听，点“内置春日影”重试或导入本地 LRC。"
          : "已内置你提供的 MP3，点播放即可整曲试听，无需重新导入。匹配 LRC 导入后可逐句循环。",
    );
  };
  const loadDemo = async () => {
    const token = ++loadToken.current;
    ++lyricsToken.current;
    controller.pause();
    setAnchor(null);
    setNotice("正在载入原创演示旋律…");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}demo/demo.lrc`);
      if (!response.ok) throw new Error("无法读取演示歌词。");
      const parsed = parseLrc(await response.text());
      if (token !== loadToken.current) return;
      const source = isNative()
        ? "file:///android_asset/public/demo/demo.wav"
        : `${import.meta.env.BASE_URL}demo/demo.wav`;
      const loaded = await controller.load(source);
      if (!loaded || token !== loadToken.current) return;
      controller.setLyrics(parsed.lines, parsed.warnings);
      await controller.select(1, 1, false);
      if (token !== loadToken.current) return;
      if (fileUrl.current) {
        URL.revokeObjectURL(fileUrl.current);
        fileUrl.current = null;
      }
      await restoreSession();
      setPreset(false);
      setTitle("小小的练习曲");
      setDemo(true);
      setNotice("演示已就绪，点播放试听。");
    } catch {
      if (token === loadToken.current)
        setNotice("演示载入失败，请重试，或导入本地音频与 LRC。");
    }
  };
  const restoreSession = async () => {
    if (view === "legacy") return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(`anisong:lyricsSession:${songId}`) ?? "null",
      );
      await controller.setSpeed(saved?.speed ?? preferences().speed);
      if (typeof saved?.multi === "boolean") setMulti(saved.multi);
      if (saved && typeof saved.loop === "boolean")
        await controller.setLoop(saved.loop);
      if (
        saved?.selection &&
        saved.selection.every(
          (n: number) =>
            Number.isInteger(n) &&
            n >= 0 &&
            n < controller.getSnapshot().lines.length,
        )
      ) {
        await controller.select(saved.selection[0], saved.selection[1], false);
        const range = controller.getSnapshot().range;
        if (range && saved.range) {
          await controller.adjust("start", saved.range.start - range.start);
          await controller.adjust("end", saved.range.end - range.end);
        }
      }
    } catch {
      setNotice("上次设置无法恢复，已使用当前资料。");
    }
  };
  const loadSaved = async () => {
    try {
      const audio = await materialStore.get(`${songId}:audio`);
      if (!alive.current) return true;
      if (!audio) return false;
      const token = ++loadToken.current;
      const url = audio.blob ? URL.createObjectURL(audio.blob) : undefined;
      const loaded = await controller.load(url ?? audio.source ?? "");
      if (token !== loadToken.current) {
        if (url) URL.revokeObjectURL(url);
        return true;
      }
      if (!loaded) {
        if (url) URL.revokeObjectURL(url);
        setNotice("保存的音频无法读取，请重新选择音频。");
        return true;
      }
      fileUrl.current = url ?? null;
      setDemo(false);
      const lrc = await materialStore.get(`${songId}:lyrics`);
      if (token !== loadToken.current) return true;
      if (lrc?.text) {
        const parsed = parseLrc(lrc.text);
        controller.setLyrics(parsed.lines, parsed.warnings);
      }
      await controller.selectTrack();
      if (token !== loadToken.current) return true;
      await restoreSession();
      setNotice("已恢复本机资料和练习设置，点播放继续。");
      return true;
    } catch {
      return false;
    }
  };
  const flushRef = useRef(() => {});
  flushRef.current = () => {
    const state = controller.getSnapshot();
    if (
      view !== "practice" ||
      !active ||
      !state.range ||
      state.phase === "loading"
    )
      return;
    try {
      localStorage.setItem(
        `anisong:lyricsSession:${songId}`,
        JSON.stringify({
          multi,
          selection: state.selection,
          range: state.range,
          speed: state.speed,
          loop: state.loop,
        }),
      );
      rememberPractice({
        songId,
        module: "lyrics",
        range: state.selection,
        speed: state.speed,
        loop: state.loop,
        mode: "lyrics",
        savedAt: new Date().toISOString(),
      });
    } catch {
      setNotice("练习可继续，但本机无法保存此次进度。");
    }
  };
  useEffect(() => {
    if (view === "legacy") return;
    const id = setInterval(() => flushRef.current(), 1000);
    const save = () => flushRef.current();
    window.addEventListener("pagehide", save);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", save);
    };
  }, [view]);
  useEffect(() => {
    if (view !== "legacy") controller.pause();
    return () => {
      flushRef.current();
    };
  }, [view, active, controller]);
  useEffect(() => {
    if (state.duration > 0 && view !== "legacy") {
      try {
        saveMaterialSummary(songId, {
          audio: demo
            ? "原创器乐演示"
            : preset
              ? "内置 / 本地音频"
              : "本地音频",
          duration: state.duration,
          lyrics: state.lines.length,
        });
        onChanged?.();
      } catch {
        /* Playback remains available. */
      }
    }
  }, [
    state.duration,
    state.lines.length,
    demo,
    preset,
    songId,
    view,
    onChanged,
  ]);
  useEffect(() => {
    if (autoLoad) {
      if (view === "legacy") {
        if (isHaruhikage(initialSong)) void loadPreset();
        else void loadDemo();
      } else
        void (async () => {
          if (await loadSaved()) return;
          if (isHaruhikage(initialSong)) await loadPreset();
          else if (!initialSong || initialSong.id === "demo-original")
            await loadDemo();
          else {
            setDemo(false);
            setNotice("尚未关联音频，请导入本机音频。");
          }
        })();
    }
    return () => {
      alive.current = false;
      ++loadToken.current;
      ++lyricsToken.current;
      if (!provided) controller.dispose();
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    };
    // Controller and initial song are created once; loading never autoplays.
  }, []);
  useEffect(() => {
    if (!active) controller.pause();
  }, [active, controller]);
  useEffect(() => {
    setSheet(null);
  }, [view, active, songId]);
  useEffect(() => {
    onSong?.(title, demo);
  }, [title, demo]);
  const importAudio = async (file?: File) => {
    const token = ++loadToken.current;
    ++lyricsToken.current;
    setAnchor(null);
    setNotice("正在读取本地音频…");
    let url: string | undefined;
    try {
      let source: string;
      let name: string;
      if (isNative()) {
        const picked = await bridge.pickAudio();
        source = picked.source;
        name = picked.name;
      } else {
        if (!file) return;
        url = URL.createObjectURL(file);
        source = url;
        name = file.name;
      }
      if (token !== loadToken.current) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      const loaded = await controller.load(source);
      if (!loaded || token !== loadToken.current) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (view !== "legacy") {
        try {
          const saved = await materialStore.get(`${songId}:lyrics`);
          if (token !== loadToken.current) return;
          if (saved?.text) {
            const parsed = parseLrc(saved.text);
            controller.setLyrics(parsed.lines, parsed.warnings);
          }
        } catch {
          /* The user can reselect LRC. */
        }
      }
      await controller.selectTrack();
      if (token !== loadToken.current) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = url ?? null;
      setTitle(
        view === "legacy"
          ? preset
            ? HARUHIKAGE.title
            : name
          : (initialSong?.title ?? name),
      );
      setDemo(false);
      setNotice("音频已载入，点播放可整曲试听。导入对应 LRC 后可逐句循环。");
      if (view !== "legacy") {
        try {
          await materialStore.put({
            id: `${songId}:audio`,
            name,
            ...(file ? { blob: file } : { source }),
          });
          setNotice("音频已关联并保存在此设备，点播放试听。");
        } catch {
          setNotice("音频已载入，但本地保存失败；刷新后需重新选择。");
        }
        onChanged?.();
      }
    } catch {
      if (url) URL.revokeObjectURL(url);
      if (token === loadToken.current)
        setNotice("音频选择已取消或读取失败，请重试。");
    }
  };
  const importLyrics = async (file: File) => {
    const token = loadToken.current;
    const lyricToken = ++lyricsToken.current;
    try {
      const text = await file.text();
      const parsed = parseLrc(text);
      if (!state.duration && view !== "legacy") {
        if (!parsed.lines.length) throw new Error("没有可用的歌词时间戳。");
        try {
          await materialStore.put({
            id: `${songId}:lyrics`,
            name: file.name,
            text,
          });
          saveMaterialSummary(songId, { lyrics: parsed.lines.length });
          setNotice("歌词已关联。导入音频后会按音频时长校验，再开始练习。");
          onChanged?.();
        } catch {
          setNotice("尚无音频且歌词无法保存，请先导入音频后重试。");
        }
        return;
      }
      if (token !== loadToken.current || lyricToken !== lyricsToken.current)
        return;
      setAnchor(null);
      if (controller.setLyrics(parsed.lines, parsed.warnings)) {
        await controller.select(0, 0, false);
        if (token === loadToken.current && lyricToken === lyricsToken.current)
          setNotice("歌词已载入。点击一句立即播放。");
        if (view !== "legacy") {
          try {
            await materialStore.put({
              id: `${songId}:lyrics`,
              name: file.name,
              text,
            });
          } catch {
            setNotice("歌词可练习，但本地保存失败；刷新后请重新导入。");
          }
          onChanged?.();
        }
      }
    } catch (e) {
      if (token === loadToken.current && lyricToken === lyricsToken.current)
        setNotice((e as Error).message);
    }
  };
  const select = (i: number) => {
    if (!multi) {
      void controller.select(i);
      return;
    }
    if (anchor === null) {
      controller.pause();
      setAnchor(i);
    } else {
      void controller.select(anchor, i);
      setAnchor(null);
    }
  };
  const chooseMode = (value: boolean) => {
    if (value !== multi) controller.pause();
    setMulti(value);
    setAnchor(null);
  };
  const range = state.range;
  const playing = state.phase === "playing";
  const selection = state.selection;
  const disabled = !range || state.phase === "loading";
  const move = (delta: number) => {
    if (!selection) return;
    setAnchor(null);
    const i = Math.max(
      0,
      Math.min(
        state.lines.length - 1,
        (delta < 0 ? selection[0] : selection[1]) + delta,
      ),
    );
    void controller.select(i);
  };
  const openSheet = (next: "speed" | "trim" | "more" | "display") => {
    if (next !== "display") { setAnchor(null); controller.pause(); }
    flushRef.current();
    setSheet(next);
  };
  const edges = (
    <>
      {(["start", "end"] as const).map((edge) => (
        <div className="edge" key={edge}>
          <label>
            {edge === "start" ? "起点" : "终点"}
            <strong>{range ? format(range[edge]) : "—"}</strong>
          </label>
          <button
            disabled={disabled}
            aria-label={`${edge === "start" ? "起点" : "终点"}提前 0.1 秒`}
            onClick={() => void controller.adjust(edge, -0.1)}
          >
            −0.1
          </button>
          <button
            disabled={disabled}
            aria-label={`${edge === "start" ? "起点" : "终点"}延后 0.1 秒`}
            onClick={() => void controller.adjust(edge, 0.1)}
          >
            ＋0.1
          </button>
        </div>
      ))}
      <p className="helper">
        使用原曲时间，每次调整 0.1 秒。点播放后按新边界练习。
      </p>
    </>
  );
  return (
    <main className={`app lyrics-app view-${view}`}>
      {view === "practice" && (
        <LyricsPractice
          state={state}
          title={preset ? "春日影" : title}
          subtitle={preset ? "CRYCHIC ver. · 歌词学唱" : "歌词学唱"}
          multi={multi}
          anchor={anchor}
          notice={notice}
          display={display}
          sheetOpen={!!sheet}
          onDisplay={changeDisplay}
          onSelect={select}
          onMode={chooseMode}
          onCancel={() => setAnchor(null)}
          onSeek={(position) => {
            void controller.seek(position);
          }}
          onMove={move}
          onPlay={() => {
            if (playing) controller.pause();
            else void controller.play();
          }}
          onLoop={() => {
            void controller.setLoop(!state.loop);
          }}
          onSheet={openSheet}
          onExit={() => {
            controller.pause();
            flushRef.current();
            onExit?.();
          }}
        />
      )}
      {view === "legacy" && (
        <>
          <header>
            <div className="brand" aria-label="Anisong">
              <span className="brand-icon">♫</span>
              <span>
                ANISONG<small>一小段，也能慢慢学会</small>
              </span>
            </div>
            <button
              className="text-button"
              onClick={() => {
                controller.pause();
                setFeedback({ ...state });
              }}
            >
              反馈问题 ↗
            </button>
          </header>
        </>
      )}
      {view !== "practice" && (
        <section className="song-card" aria-label="音频导入">
          <div className="song-top">
            <div className="cover" aria-hidden="true">
              <span>♪</span>
              <i />
              <i />
              <i />
            </div>
            <div className="song-info">
              <span className="eyebrow">
                {preset
                  ? "CRYCHIC · 默认练习歌曲"
                  : demo
                    ? "原创旋律 · 可直接试听"
                    : "本地音频 · 留在设备上"}
              </span>
              <h1>{title}</h1>
              <p>
                {state.duration > 0
                  ? `${format(state.duration)} · ${isNative() ? "Media3 原生音频" : "浏览器真实音频"}`
                  : "准备你的第一段练习"}
              </p>
            </div>
          </div>
          {(view === "preview" || preset) && (
            <button
              className="whole-track-play"
              disabled={disabled}
              onClick={() =>
                playing && !selection
                  ? controller.pause()
                  : selection
                    ? void controller.selectTrack(true)
                    : void controller.play()
              }
            >
              {playing && !selection ? "Ⅱ 暂停整曲" : "▶ 播放整曲"}
            </button>
          )}
          {view !== "preview" && (
            <div className="imports">
              {isNative() ? (
                <button onClick={() => void importAudio()}>＋ 导入音频</button>
              ) : (
                <label className="file-button">
                  ＋ 导入音频
                  <input
                    aria-label="导入音频"
                    type="file"
                    accept="audio/*,.mp3,.m4a,.wav"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void importAudio(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              <label
                className={`file-button ${view === "legacy" && !state.duration ? "disabled" : ""}`}
              >
                ＋ 导入 LRC
                <input
                  aria-label="导入 LRC"
                  type="file"
                  accept=".lrc,.txt,text/plain"
                  disabled={
                    (view === "legacy" && !state.duration) ||
                    state.phase === "loading"
                  }
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importLyrics(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {bundledAudio.available && (view === "legacy" || preset) && (
                <button onClick={() => void loadPreset()}>内置春日影</button>
              )}
              {view === "legacy" && (
                <button onClick={() => void loadDemo()}>原创演示</button>
              )}
              {preset && (
                <OfficialReference
                  active={active}
                  onOpen={() => controller.pause()}
                />
              )}
            </div>
          )}
          {view === "legacy" && onPiano && (
            <button className="song-piano-entry" onClick={onPiano}>
              ♩ 钢琴学谱 · 关联当前歌曲
            </button>
          )}
          <p className="notice" role="status">
            {notice || "音频与歌词只在此设备处理，不上传。"}
          </p>
          {view === "materials" && state.error && (
            <p className="error" role="alert">
              {state.error}
            </p>
          )}
        </section>
      )}
      {view === "legacy" && demo && (
        <p className="demo-note">
          演示是原创器乐旋律；日文句仅用于界面示例，音频没有人声。
        </p>
      )}
      {view === "legacy" && (
        <section className="practice-card" aria-labelledby="practice-title">
          <div className="section-title">
            <h2 id="practice-title">选择练习片段</h2>
            <span>
              {selection
                ? `第 ${selection[0] + 1}${selection[1] !== selection[0] ? `–${selection[1] + 1}` : ""} 句`
                : range
                  ? "整曲试听"
                  : "待选择"}
            </span>
          </div>
          {state.lines.length > 0 && (
            <button
              className="text-button"
              onClick={() => {
                setAnchor(null);
                void controller.selectTrack();
              }}
            >
              返回整曲试听
            </button>
          )}
          <div className="mode" role="group" aria-label="选择模式">
            <button
              aria-pressed={!multi}
              className={!multi ? "active" : ""}
              onClick={() => chooseMode(false)}
            >
              单句循环
            </button>
            <button
              aria-pressed={multi}
              className={multi ? "active" : ""}
              onClick={() => chooseMode(true)}
            >
              多句连续
            </button>
          </div>
          <div className="selection-help">
            {multi
              ? anchor === null
                ? "① 点起始句，再点结束句（可反向选择）"
                : `② 已选第 ${anchor + 1} 句，请点结束句`
              : "点一句，立即从该句开始播放"}
            {anchor !== null && (
              <button onClick={() => setAnchor(null)}>取消</button>
            )}
          </div>
          <div className="lyrics" aria-label="歌词列表">
            {state.lines.length === 0 ? (
              <div className="empty">
                {state.phase === "loading"
                  ? "正在读取音频…"
                  : preset
                    ? "春日影 · 等待导入匹配的 LRC"
                    : "导入 LRC，或载入演示曲开始练习"}
              </div>
            ) : (
              state.lines.map((line, i) => {
                const selected =
                  !!selection && i >= selection[0] && i <= selection[1];
                return (
                  <button
                    key={`${line.start}-${i}`}
                    aria-label={`第 ${i + 1} 句 ${line.text}`}
                    aria-pressed={selected || anchor === i}
                    aria-current={
                      playing &&
                      state.position >= line.start &&
                      state.position <
                        (state.lines[i + 1]?.start ?? state.duration)
                        ? "true"
                        : undefined
                    }
                    className={`lyric ${selected ? "selected" : ""} ${anchor === i ? "anchor" : ""}`}
                    onClick={() => select(i)}
                  >
                    <span className="line-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="lyric-text">
                      {line.text}
                      <small>{format(line.start)}</small>
                    </span>
                    {selected && (
                      <span className="line-mark" aria-hidden="true">
                        {playing ? "♫" : "↻"}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>
      )}
      {view !== "materials" && view !== "practice" && (
        <section className="controls" aria-label="播放器">
          <div className="range-summary">
            <span className="tag">
              {playing
                ? "● 播放中"
                : state.phase === "ended"
                  ? "片段已结束"
                  : state.phase === "loading"
                    ? "载入中"
                    : "准备练习"}
            </span>
            <span>
              {range
                ? `${(range.end - range.start).toFixed(2)}s / ${((range.end - range.start) / state.speed).toFixed(2)}s 每轮`
                : "原曲时间 / 变速耗时"}
            </span>
          </div>
          <input
            aria-label="片段进度"
            className="progress"
            type="range"
            min={range?.start ?? 0}
            max={range?.end ?? 1}
            step="0.01"
            value={
              range
                ? Math.max(range.start, Math.min(range.end, state.position))
                : 0
            }
            disabled={disabled}
            onChange={(e) => void controller.seek(Number(e.target.value))}
          />
          <div className="time-labels">
            <span>
              {format(
                range
                  ? Math.max(range.start, Math.min(range.end, state.position))
                  : 0,
              )}
            </span>
            <span>{range ? format(range.end) : "00:00.00"} · 原曲坐标</span>
          </div>
          <div className="transport">
            <button
              aria-label="上一句"
              disabled={disabled || !selection || selection[0] === 0}
              onClick={() => move(-1)}
            >
              ｜◀
            </button>
            <button
              className="play-button"
              aria-label={playing ? "暂停" : "播放"}
              disabled={disabled || anchor !== null}
              onClick={() =>
                playing ? controller.pause() : void controller.play()
              }
            >
              {playing ? "Ⅱ" : "▶"}
              <span>{playing ? "暂停" : "播放"}</span>
            </button>
            <button
              aria-label="下一句"
              disabled={
                disabled ||
                !selection ||
                selection[1] === state.lines.length - 1
              }
              onClick={() => move(1)}
            >
              ▶｜
            </button>
          </div>
          <div className="play-options">
            {view === "legacy" ? (
              <div className="speeds" role="group" aria-label="播放速度">
                {[0.5, 0.75, 1].map((speed) => (
                  <button
                    key={speed}
                    aria-pressed={state.speed === speed}
                    className={state.speed === speed ? "active" : ""}
                    onClick={() => void controller.setSpeed(speed)}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            ) : (
              <button onClick={() => openSheet("speed")}>
                {state.speed}× 速度
              </button>
            )}
            <button
              className={`loop-button ${state.loop ? "active" : ""}`}
              aria-pressed={state.loop}
              onClick={() => void controller.setLoop(!state.loop)}
            >
              ↻ 循环{state.loop ? "开" : "关"}
            </button>
          </div>
          {view === "legacy" ? (
            <details className="fine-tune">
              <summary>
                片段边界微调 <span>± 0.1s</span>
              </summary>
              {edges}
            </details>
          ) : (
            <button
              className="trim-entry"
              disabled={disabled}
              onClick={() => openSheet("trim")}
            >
              片段边界微调 · ±0.1 秒 →
            </button>
          )}
          {state.error && (
            <p className="error" role="alert">
              {state.error}
            </p>
          )}
          {state.warnings.map((w) => (
            <p className="warning" key={w}>
              {w}
            </p>
          ))}
        </section>
      )}
      {view === "legacy" && (
        <footer>
          <p>
            {isNative()
              ? "原生裁剪与单项重复；后台主动暂停。"
              : "保持音高 · 网页循环可能有短暂停顿，后台主动暂停。"}
          </p>
          <p>
            v{version.appVersion} · {version.sha} · {version.branch}
          </p>
          <small>构建于 {version.builtAt} · 本地文件刷新后需重新导入</small>
        </footer>
      )}
      {sheet && (
        <Sheet
          className={
            view === "practice"
              ? `lyrics-sheet ${sheet === "trim" ? "lyrics-trim-sheet" : ""}`
              : ""
          }
          title={
            sheet === "speed"
              ? view === "practice"
                ? "练习速度"
                : "播放速度"
              : sheet === "trim"
                ? view === "practice"
                  ? "微调片段"
                  : "片段边界"
                : sheet === "display" ? "歌词显示" : "更多学唱操作"
          }
          onClose={() => setSheet(null)}
        >
          {(dismiss) => (
            <>
              {sheet === "display" ? (
                <LyricsDisplayPanel lines={state.lines} value={display} onChange={changeDisplay} onClose={() => dismiss()} />
              ) : sheet === "speed" ? (
                <div
                  className="sheet-options speed-options"
                  role="group"
                  aria-label="播放速度"
                >
                  {[0.5, 0.75, 1].map((n) => (
                    <button
                      key={n}
                      aria-pressed={state.speed === n}
                      onClick={() => void controller.setSpeed(n)}
                    >
                      <span>{n}×</span>
                      <span aria-hidden="true">
                        {n === state.speed ? "✓" : ""}
                      </span>
                    </button>
                  ))}
                  <p className="helper">只改变节奏，不改变音高。</p>
                </div>
              ) : sheet === "trim" ? (
                view === "practice" && range ? (
                  <TrimRange
                    range={range}
                    duration={state.duration}
                    selection={
                      selection
                        ? `歌词第 ${selection[0] + 1}${selection[1] === selection[0] ? "" : `–${selection[1] + 1}`} 句`
                        : "整曲试听"
                    }
                    onApply={async (draft) => {
                      const ok = await controller.applyRange(draft);
                      if (ok) {
                        flushRef.current();
                        return null;
                      }
                      return (
                        controller.getSnapshot().error ?? "应用未完成，请重试。"
                      );
                    }}
                    onClose={() => dismiss()}
                  />
                ) : (
                  edges
                )
              ) : (
                <div className="sheet-options">
                  <button
                    onClick={() => {
                      const context = { ...state };
                      dismiss(() => setFeedback(context));
                    }}
                  >
                    反馈问题 ↗
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
                      dismiss(() => {
                        void controller.selectTrack();
                      });
                    }}
                  >
                    整曲试听
                  </button>
                  <button
                    onClick={() => {
                      dismiss(() => onPiano?.());
                    }}
                  >
                    钢琴学谱
                  </button>
                </div>
              )}
            </>
          )}
        </Sheet>
      )}
      {feedback && <Feedback state={feedback} context={{ lyricsDisplay: display }} onClose={closeFeedback} />}
    </main>
  );
}
