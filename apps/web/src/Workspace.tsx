import { useCallback, useEffect, useState } from "react";
import { App } from "./App";
import { PianoWorkspace } from "./piano/PianoWorkspace";
import { Feedback } from "./components/Feedback";
import {
  DEMO_SONG,
  initialSong,
  rememberSong,
  songs,
  type Song,
} from "../../../packages/core/song";
import { HARUHIKAGE, isHaruhikage } from "../../../packages/core/presets";
import {
  materialSummary,
  preferences,
  practiceRecords,
  savePreferences,
  type PracticeRecord,
  type MaterialSummary,
} from "../../../packages/core/app-state";
import version from "./version.json";
import media from "./bundled-audio.json";
import "./redesign.css";
import "./piano/practice-layout.css";
const pages = [
  "home",
  "library",
  "settings",
  "song",
  "materials",
  "lyrics",
  "piano-prep",
  "piano",
  "recents",
  "about",
] as const;
type Page = (typeof pages)[number];
const currentPage = (): Page =>
  pages.includes(location.hash.slice(1) as Page)
    ? (location.hash.slice(1) as Page)
    : "home";
const modeName = (r: PracticeRecord) =>
  r.module === "lyrics"
    ? "歌词学唱"
    : r.mode === "wait"
      ? "等待弹对"
      : r.mode === "free"
        ? "自由弹奏"
        : "自动试听";
export function Cover({
  small = false,
  title = "春日影",
}: {
  small?: boolean;
  title?: string;
}) {
  return (
    <div className={`art-cover ${small ? "small" : ""}`} aria-hidden="true">
      <i />
      <span>
        {title.slice(0, 1)}
        <br />
        {title.slice(1, 3)}
      </span>
      <b>♪</b>
    </div>
  );
}
export function Workspace() {
  const [page, setPage] = useState<Page>(currentPage),
    [song, setSong] = useState<Song>(() => initialSong(location.search));
  const [visited, setVisited] = useState({ lyrics: false, piano: false });
  const [revision, refresh] = useState(0),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [prefs, setPrefs] = useState(preferences),
    [notice, setNotice] = useState(""),
    [newTitle, setNewTitle] = useState("");
  const [feedback, setFeedback] = useState(false);
  const navigate = useCallback((next: Page) => {
    if (currentPage() === next) {
      setPage(next);
      return;
    }
    location.hash = next;
    setPage(next);
  }, []);
  useEffect(() => {
    const update = () => setPage(currentPage());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    setVisited((v) => ({
      ...v,
      lyrics: v.lyrics || ["lyrics", "materials", "song"].includes(page),
      piano:
        v.piano || ["piano", "piano-prep", "materials", "song"].includes(page),
    }));
  }, [page, song.id]);
  const changed = useCallback(() => refresh((n) => n + 1), []);
  const choose = (next: Song, destination: Page = "song") => {
    if (next.id !== song.id) {
      setVisited({ lyrics: false, piano: false });
      setSong(next);
    }
    try {
      rememberSong(next);
    } catch {
      setNotice("歌曲可打开，但无法保存本地记录。");
    }
    const url = new URL(location.href);
    url.searchParams.set("song", next.id);
    url.hash = destination;
    history.pushState(null, "", url);
    setPage(destination);
    changed();
  };
  // Popstate may restore both song and page. No page navigation starts audio.
  useEffect(() => {
    const back = () => {
      const requested = new URLSearchParams(location.search).get("song");
      const found = [HARUHIKAGE, DEMO_SONG, ...songs()].find(
        (s) => s.id === requested,
      );
      if (found && found.id !== song.id) {
        setVisited({ lyrics: false, piano: false });
        setSong(found);
      }
      setPage(currentPage());
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [song.id]);
  const catalog = Array.from(
    new Map(
      [HARUHIKAGE, DEMO_SONG, ...songs(), song].map((s) => [s.id, s]),
    ).values(),
  );
  const summary = (s: Song): MaterialSummary => {
    const local = materialSummary(s.id);
    return {
      ...(s.id === DEMO_SONG.id
        ? { audio: "原创器乐演示", lyrics: 5, score: "原创八小节" }
        : isHaruhikage(s)
          ? {
              ...(media.available ? { audio: "内置 MP3" } : {}),
              ...(media.lyrics ? { lyrics: 42 } : {}),
              ...(media.score ? { score: "内置曲谱" } : {}),
            }
          : {}),
      ...local,
    };
  };
  const visibleSongs = catalog
    .filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    .filter((s) => {
      const m = summary(s);
      return (
        filter === "all" ||
        (filter === "lyrics" ? !!m.audio && !!m.lyrics : !!m.score)
      );
    });
  const records = practiceRecords(),
    last = records[0],
    lastSong = catalog.find((s) => s.id === last?.songId) ?? song;
  const focus = page === "lyrics" || page === "piano";
  const goPractice = (module: "lyrics" | "piano", target = song) =>
    choose(target, module === "lyrics" ? "lyrics" : "piano-prep");
  const description = (r: PracticeRecord) =>
    `${modeName(r)} · ${r.range ? `第 ${r.range[0] + 1}${r.range[1] === r.range[0] ? "" : `–${r.range[1] + 1}`} ${r.module === "lyrics" ? "句" : "小节"}` : "整曲"} · ${r.speed}× · 循环${r.loop ? "开" : "关"}`;
  const recentRows = (limit = 30) =>
    records.slice(0, limit).map((r) => {
      const s = catalog.find((s) => s.id === r.songId);
      return s ? (
        <button
          className="recent-row"
          key={`${r.songId}:${r.module}`}
          onClick={() => goPractice(r.module, s)}
        >
          <span className="round-icon">
            {r.module === "lyrics" ? "♫" : "♩"}
          </span>
          <span>
            <strong>{s.title}</strong>
            <small>{description(r)}</small>
            <small>{new Date(r.savedAt).toLocaleString("zh-CN")}</small>
          </span>
          <b>›</b>
        </button>
      ) : null;
    });
  return (
    <div
      className={`app-shell ${focus ? "is-focus" : ""} page-${page}`}
      data-revision={revision}
    >
      {!focus && (
        <header className="shell-header">
          <span className="wordmark">♫ ANISONG</span>
          <span>一小段，也能慢慢学会</span>
        </header>
      )}
      {!focus && (
        <main className="browse">
          {notice && (
            <p role="status" className="shell-notice">
              {notice}
            </p>
          )}
          {page === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">YOUR PRACTICE SPACE</p>
                  <h1>今天，练一小段。</h1>
                </div>
                <span className="seed-mark">✳</span>
              </div>
              <section className="continue-card">
                <div className="card-heading">
                  <span>{last ? "接着上次练习" : "从喜欢的歌开始"}</span>
                  <span>↗</span>
                </div>
                <div className="featured-song">
                  <Cover title={lastSong.title} />
                  <div>
                    <p className="eyebrow">
                      {isHaruhikage(lastSong) ? "CRYCHIC" : "本地曲库"}
                    </p>
                    <h2>{lastSong.title}</h2>
                    <p>{last ? description(last) : "歌词学唱 · 钢琴学谱"}</p>
                  </div>
                </div>
                <button
                  className="primary full"
                  onClick={() => goPractice(last?.module ?? "lyrics", lastSong)}
                >
                  {last
                    ? `继续${last.module === "lyrics" ? "学唱" : "学谱"}`
                    : "开始学唱"}{" "}
                  <span>→</span>
                </button>
                <button className="quiet full" onClick={() => choose(lastSong)}>
                  查看歌曲与资料
                </button>
              </section>
              <button
                className="piano-entry"
                onClick={() => goPractice("piano")}
              >
                <span className="round-icon">♩</span>
                <span>
                  <strong>钢琴学谱</strong>
                  <small>上方看谱，下方动手弹</small>
                </span>
                <b>→</b>
              </button>
              <div className="section-heading">
                <h2>最近练习</h2>
                <button onClick={() => navigate("recents")}>查看全部 →</button>
              </div>
              {records.length ? (
                recentRows(3)
              ) : (
                <div className="empty-card">
                  <span>♪</span>
                  <p>第一段练习，从这里开始。</p>
                  <small>练习后会保存歌曲、范围和速度。</small>
                </div>
              )}
            </>
          )}
          {page === "library" && (
            <>
              <div className="page-heading">
                <h1>我的曲库</h1>
                <button
                  className="primary"
                  onClick={() => navigate("materials")}
                >
                  ＋ 导入
                </button>
              </div>
              <input
                className="search-field"
                aria-label="搜索歌曲"
                placeholder="搜索歌曲名称"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="chips" aria-label="曲库筛选">
                {[
                  ["all", "全部"],
                  ["lyrics", "可学唱"],
                  ["score", "可学谱"],
                ].map(([key, name]) => (
                  <button
                    key={key}
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="library-list">
                {visibleSongs.map((s) => {
                  const m = summary(s);
                  return (
                    <button
                      className="song-row"
                      key={s.id}
                      onClick={() => choose(s)}
                    >
                      <Cover small title={s.title} />
                      <span>
                        <strong>{s.title}</strong>
                        <small>
                          {isHaruhikage(s)
                            ? "CRYCHIC"
                            : s.id === DEMO_SONG.id
                              ? "原创合法示例"
                              : "本地歌曲"}
                        </small>
                        <span className="material-tags">
                          {m.audio ? "音频 ✓" : "待加音频"} ·{" "}
                          {m.lyrics ? "歌词 ✓" : "待加歌词"} ·{" "}
                          {m.score ? "乐谱 ✓" : "待加乐谱"}
                        </span>
                      </span>
                      <b>›</b>
                    </button>
                  );
                })}
              </div>
              {visibleSongs.length === 0 && (
                <div className="empty-card">
                  没有找到这首歌，换个关键词试试。
                </div>
              )}
              <p className="helper">
                音频、歌词与乐谱关联到同一首歌曲，学唱和学谱的时间轴各自独立。
              </p>
            </>
          )}
          {page === "song" && (
            <>
              <button className="back-link" onClick={() => navigate("library")}>
                ← 返回曲库
              </button>
              <div className="detail-hero">
                <Cover title={song.title} />
                <p className="eyebrow">
                  {isHaruhikage(song) ? "CRYCHIC VERSION" : "LOCAL PRACTICE"}
                </p>
                <h1>{song.title}</h1>
                <p>把喜欢的一段，变成会唱、会弹的一段。</p>
              </div>
              <div className="practice-entries">
                <button className="primary" onClick={() => navigate("lyrics")}>
                  ♫ 歌词学唱 <small>逐句听 · 连续循环</small>
                </button>
                <button onClick={() => navigate("piano-prep")}>
                  ♩ 钢琴学谱 <small>选小节 · 看谱弹奏</small>
                </button>
              </div>
              <div className="section-heading">
                <h2>歌曲资料</h2>
                <button onClick={() => navigate("materials")}>
                  关联 / 替换 →
                </button>
              </div>
              {[
                ["音频", summary(song).audio ?? "尚未导入"],
                [
                  "歌词",
                  summary(song).lyrics
                    ? `${summary(song).lyrics} 句 · LRC`
                    : "尚未导入",
                ],
                [
                  "乐谱",
                  summary(song).score
                    ? `${summary(song).score}${summary(song).bars ? ` · ${summary(song).bars} 小节 / ${summary(song).parts} 声部` : ""}`
                    : "尚未导入",
                ],
              ].map(([label, value]) => (
                <button
                  className="info-row"
                  key={label}
                  onClick={() => navigate("materials")}
                >
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <span>›</span>
                </button>
              ))}
              <p className="helper">
                整曲试听可在下方操作；开始学唱时点任一句，从该句真实跳转。
              </p>
            </>
          )}
          {page === "materials" && (
            <>
              <button className="back-link" onClick={() => navigate("song")}>
                ← 返回歌曲
              </button>
              <h1>添加歌曲资料</h1>
              <p className="helper">
                选择关联歌曲，分别导入音频、LRC 或 MusicXML。无需一次凑齐。
              </p>
              <label className="field-label">
                关联到
                <select
                  aria-label="关联歌曲"
                  value={song.id}
                  onChange={(e) => {
                    const s = catalog.find((s) => s.id === e.target.value);
                    if (s) choose(s, "materials");
                  }}
                >
                  {catalog.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <form
                className="create-song"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTitle.trim()) return;
                  const next = {
                    id: `local-${crypto.randomUUID()}`,
                    title: newTitle.trim().slice(0, 120),
                    scoreIds: [],
                    updatedAt: "",
                  };
                  choose(next, "materials");
                  setNewTitle("");
                }}
              >
                <input
                  aria-label="新歌曲名称"
                  placeholder="或输入新歌曲名称"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={120}
                />
                <button type="submit" disabled={!newTitle.trim()}>
                  新建歌曲
                </button>
              </form>
              <div className="section-heading">
                <h2>{song.title}</h2>
                <span>仅在本机处理</span>
              </div>
            </>
          )}
          {page === "recents" && (
            <>
              <button className="back-link" onClick={() => navigate("home")}>
                ← 返回练习
              </button>
              <h1>最近练习</h1>
              <p className="helper">恢复上次设置，点播放后才会发声。</p>
              {records.length ? (
                recentRows()
              ) : (
                <div className="empty-card">还没有练习记录。</div>
              )}
            </>
          )}
          {page === "settings" && (
            <>
              <p className="eyebrow">MAKE IT YOURS</p>
              <h1>设置</h1>
              <section className="settings-card">
                <h2>练习偏好</h2>
                <label className="field-label">
                  新练习默认速度
                  <select
                    aria-label="默认练习速度"
                    value={prefs.speed}
                    onChange={(e) => {
                      const p = { ...prefs, speed: Number(e.target.value) };
                      setPrefs(p);
                      try {
                        savePreferences(p);
                        setNotice("偏好已保存，下次新练习生效。");
                      } catch {
                        setNotice("偏好无法保存；请检查本地存储权限。");
                      }
                    }}
                  >
                    {[0.5, 0.75, 1].map((v) => (
                      <option value={v} key={v}>
                        {v}×
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  新乐谱辅助标记
                  <select
                    aria-label="默认音符标记"
                    value={prefs.labels}
                    onChange={(e) => {
                      const p = {
                        ...prefs,
                        labels: e.target.value as typeof prefs.labels,
                      };
                      setPrefs(p);
                      try {
                        savePreferences(p);
                        setNotice("标记偏好已保存，下次新乐谱生效。");
                      } catch {
                        setNotice("偏好无法保存。");
                      }
                    }}
                  >
                    <option value="name">音名 C4 / F♯4</option>
                    <option value="solfege">固定唱名 Do / Re / Mi</option>
                    <option value="none">关闭</option>
                  </select>
                </label>
                <p className="helper">
                  已保存的练习继续使用上次设置；练习页可临时调整。
                </p>
              </section>
              <section className="settings-card">
                <h2>本地资料</h2>
                <p className="helper">
                  内置资料随此测试版提供。导入的音频、歌词和乐谱保存在本机浏览器；保存失败会提示。清理站点数据或卸载
                  App 可能删除记录，请保留源文件。Android
                  外部音频权限失效时需重选。
                </p>
              </section>
              <button className="info-row" onClick={() => setFeedback(true)}>
                反馈与建议 <span>↗</span>
              </button>
              <button className="info-row" onClick={() => navigate("about")}>
                关于 Anisong <span>›</span>
              </button>
              <p className="build-label">
                v{version.appVersion} · {version.sha}
              </p>
            </>
          )}
          {page === "about" && (
            <>
              <button
                className="back-link"
                onClick={() => navigate("settings")}
              >
                ← 返回设置
              </button>
              <h1>关于 Anisong</h1>
              <p>一小段，也能慢慢学会。</p>
              <section className="settings-card">
                <p>版本 {version.appVersion}</p>
                <p>提交 {version.sha}</p>
                <p>分支 {version.branch}</p>
                <p>构建 {version.builtAt}</p>
              </section>
              <h2>当前测试版边界</h2>
              <p className="helper">
                学唱与乐谱不自动同步；钢琴采用合成音色，等待弹对只支持单音轨。切后台、旋转或打开设置会暂停。网页循环可能有短暂停顿。请在
                Android 手机上完成实际听音验收。
              </p>
              <a
                className="back-link"
                href="https://github.com/cosmos-zhan/anisong-learning-app"
                target="_blank"
                rel="noreferrer"
              >
                查看源码与维护文档 ↗
              </a>
            </>
          )}
        </main>
      )}
      {visited.lyrics && (
        <div
          key={`lyrics:${song.id}`}
          className={`module-host lyrics-host ${page === "song" || page === "materials" ? "inline-host" : ""}`}
          hidden={!["song", "materials", "lyrics"].includes(page)}
        >
          <App
            initialSong={song}
            active={["song", "materials", "lyrics"].includes(page)}
            view={
              page === "song"
                ? "preview"
                : page === "materials"
                  ? "materials"
                  : "practice"
            }
            onExit={() => navigate("song")}
            onMaterials={() => navigate("materials")}
            onChanged={changed}
            onPiano={() => navigate("piano-prep")}
          />
        </div>
      )}
      {visited.piano && (
        <div
          key={`piano:${song.id}`}
          className={`module-host piano-host ${page === "materials" ? "inline-host" : ""}`}
          hidden={!["piano", "piano-prep", "materials"].includes(page)}
        >
          <PianoWorkspace
            song={song}
            active={["piano", "piano-prep", "materials"].includes(page)}
            view={
              page === "materials"
                ? "materials"
                : page === "piano-prep"
                  ? "prepare"
                  : "practice"
            }
            onExit={() => navigate(page === "piano" ? "piano-prep" : "song")}
            onEnter={() => navigate("piano")}
            onMaterials={() => navigate("materials")}
            onLyrics={() => navigate("lyrics")}
            onChanged={changed}
          />
        </div>
      )}
      {!focus && (
        <nav className="bottom-nav" aria-label="主导航">
          {[
            ["home", "⌂", "练习"],
            ["library", "♫", "曲库"],
            ["settings", "⚙", "设置"],
          ].map(([target, icon, label]) => (
            <button
              key={target}
              aria-label={label}
              aria-current={
                page === target ||
                (target === "library" &&
                  ["song", "materials"].includes(page)) ||
                (target === "home" && ["recents", "piano-prep"].includes(page))
                  ? "page"
                  : undefined
              }
              onClick={() => navigate(target as Page)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      )}
      {feedback && (
        <Feedback
          context={{ module: "settings" }}
          onClose={() => setFeedback(false)}
        />
      )}
    </div>
  );
}
