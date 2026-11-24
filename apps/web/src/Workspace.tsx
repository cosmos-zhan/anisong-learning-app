import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { DownloadsPage } from "./downloads/DownloadsPage";
import { downloadManager } from "../../../packages/core/download-manager";
import { App } from "./App";
import { PianoWorkspace } from "./piano/PianoWorkspace";
import { Icon } from "./components/Icon";
import { Cover } from "./components/Cover";
import { Sheet } from "./components/Sheet";
import { Feedback } from "./components/Feedback";
import { AppUpdates } from "./components/AppUpdates";
import {
  DEMO_SONG,
  initialSong,
  rememberSong,
  songs,
  type Song,
} from "../../../packages/core/song";
import { HARUHIKAGE, isHaruhikage } from "../../../packages/core/presets";
import {
  materialStore,
  saveMaterialSummary,
  type LocalMaterial,
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
  "downloads",
  "settings",
  "updates",
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
const navigation = [
  ["home", "home", "首页"],
  ["library", "library", "曲库"],
  ["settings", "settings", "设置"],
] as const;
function practiceDate(savedAt: string) {
  const day = new Date(savedAt), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return "今天";
  if (day.toDateString() === yesterday.toDateString()) return "昨天";
  return Number.isNaN(day.getTime()) ? "更早" : day.toLocaleDateString("zh-CN");
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
    [newTitle, setNewTitle] = useState(""),
    [creating, setCreating] = useState(false);
  const [downloads, setDownloads] = useState<LocalMaterial[]>([]);
  const downloadTasks=useSyncExternalStore(downloadManager.subscribe,downloadManager.snapshot);
  const pendingDownloads=downloadTasks.filter(t=>['queued','downloading','cancelling'].includes(t.status)).length;
  useEffect(()=>{let alive=true;void materialStore.all().then(rows=>{if(alive)setDownloads(rows.filter(r=>r.download));}).catch(()=>{});return()=>{alive=false;};},[revision]);
  const scrollArea = useRef<HTMLDivElement>(null);
  const materialsFromDownloads = useRef(false);
  const downloadsReturn = useRef<"home" | "library">("library");
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
  const downloaded=useCallback((row:LocalMaterial)=>{
    try{rememberSong({id:row.download!.songId,title:row.download!.title,scoreIds:[],updatedAt:row.download!.downloadedAt});saveMaterialSummary(row.download!.songId,row.download!.summary);}catch{/* Canonical metadata remains in IndexedDB. */}
    if(row.download?.songId===song.id)setVisited({lyrics:false,piano:false});changed();
  },[changed,song.id]);
  useEffect(()=>downloadManager.onSaved(downloaded),[downloaded]);
  const choose = (next: Song, destination: Page = "song") => {
    if (destination === "materials" && page !== "materials") materialsFromDownloads.current = false;
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
    if (page === "materials" && destination === "materials") history.replaceState(null, "", url);
    else history.pushState(null, "", url);
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
      [HARUHIKAGE, DEMO_SONG, ...songs(), ...downloads.map(row=>({id:row.download!.songId,title:row.download!.title,scoreIds:[],updatedAt:row.download!.downloadedAt})), song].map((s) => [s.id, s]),
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
      ...downloads.find(row=>row.download?.songId===s.id)?.download?.summary,
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
  const browserLayout = !Capacitor.isNativePlatform();
  useLayoutEffect(() => {
    // Browser shells such as Via need the document itself to advertise that it
    // can scroll. Native APK pages keep their bounded content scroll frame.
    document.documentElement.classList.toggle('document-scroll', browserLayout && !focus);
    const scroller = browserLayout && !focus ? document.scrollingElement : scrollArea.current;
    if (scroller) scroller.scrollTop = 0;
    return () => document.documentElement.classList.remove('document-scroll');
  }, [browserLayout, focus, page, song.id]);
  const headerTitle: Partial<Record<Page, string>> = {
    home: "首页", library: "曲库", settings: "设置", song: "歌曲详情",
    updates: "应用更新", materials: "歌曲资料", "piano-prep": "钢琴学谱", recents: "最近练习", about: "关于 Anisong",
  };
  const backTarget: Partial<Record<Page, Page>> = {
    updates: "settings", song: "library", materials: "song", "piano-prep": "song", recents: "home", about: "settings",
  };
  const goPractice = (module: "lyrics" | "piano", target = song) =>
    choose(target, module === "lyrics" ? "lyrics" : "piano-prep");
  const openDownloads = (from: "home" | "library") => {
    downloadsReturn.current = from;
    navigate("downloads");
  };
  const closeCreate = () => {
    setCreating(false);
    setNewTitle("");
  };
  const description = (r: PracticeRecord) =>
    `${modeName(r)} · ${r.range ? `第 ${r.range[0] + 1}${r.range[1] === r.range[0] ? "" : `–${r.range[1] + 1}`} ${r.module === "lyrics" ? "句" : "小节"}` : "整曲"} · ${r.speed}× · 循环${r.loop ? "开" : "关"}`;
  const recentRows = (list: PracticeRecord[], showTime = false) =>
    list.map((r) => {
      const s = catalog.find((s) => s.id === r.songId);
      return s ? (
        <button
          className="recent-row"
          key={`${r.songId}:${r.module}`}
          onClick={() => goPractice(r.module, s)}
        >
          <Cover small id={s.id} piano={r.module === "piano"} />
          <span>
            <strong>{s.title}</strong>
            <small>{description(r)}</small>
          </span>
          {showTime && <small className="recent-time">{new Date(r.savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small>}
          <Icon name="right" />
        </button>
      ) : null;
    });
  const recentDays = new Map<string, PracticeRecord[]>();
  if (page === "recents") {
    for (const record of records.slice(0, 30)) {
      const date = practiceDate(record.savedAt);
      const list = recentDays.get(date) ?? [];
      list.push(record);
      recentDays.set(date, list);
    }
  }
  return (
    <div
      className={`app-shell ${browserLayout ? "browser-layout" : ""} ${focus ? "is-focus" : ""} page-${page}`}
      data-revision={revision}
    >
      {!focus && page !== "downloads" && (
        <header className={`shell-header ${backTarget[page] ? "shell-subpage" : "shell-root"}`} aria-label="页面导航">
          {backTarget[page] && (
            <button className="shell-back" aria-label={page === "materials" && materialsFromDownloads.current ? "返回本地文件导入" : `返回${backTarget[page] === "song" ? "歌曲" : backTarget[page] === "library" ? "曲库" : backTarget[page] === "settings" ? "设置" : "练习"}`}
              onClick={() => { if (page === "materials" && materialsFromDownloads.current) { materialsFromDownloads.current = false; history.back(); } else navigate(backTarget[page]!); }}><Icon name="back" /></button>
          )}
          <div className="shell-heading">
            <h1 className="shell-title">{headerTitle[page]}</h1>
            {page === "home" && <span className="shell-caption">Anisong</span>}
          </div>
          {page === "library" && <button className="shell-action" type="button" aria-label="新建歌曲" onClick={() => setCreating(true)}><Icon name="plus" /></button>}
        </header>
      )}
      <div className="shell-content" ref={scrollArea}>
      {!focus && (
        <main className="browse">
          {notice && (
            <p role="status" className="shell-notice">
              {notice}
            </p>
          )}
          {page === "downloads" && <DownloadsPage returnHome={downloadsReturn.current === "home"} onExit={()=>navigate(downloadsReturn.current)} onMaterials={()=>{materialsFromDownloads.current=true;navigate("materials");}} onSaved={downloaded} onRemoved={id=>{
            try{localStorage.removeItem(`anisong:materials:${id}`);}catch{/* Optional summary mirror. */}
            if(id===song.id)setVisited({lyrics:false,piano:false});changed();
          }} onOpen={(id,title,destination)=>choose({id,title,scoreIds:[],updatedAt:""},destination??'song')} />}
          {page === "home" && (
            <>
              <section className="continue-card">
                <div className="featured-song">
                  <button className="featured-details" onClick={() => choose(lastSong)} aria-label={`查看${lastSong.title}的歌曲资料`}>
                    <span className="eyebrow">{last ? "继续练习" : "开始练习"}</span>
                    <strong>{lastSong.title}</strong>
                    <small>{last ? description(last) : "歌词学唱 · 钢琴学谱"}</small>
                  </button>
                  <Cover id={lastSong.id} piano={last?.module === "piano"} />
                </div>
                <button className="primary full action-with-icon" onClick={() => goPractice(last?.module ?? "lyrics", lastSong)}>
                  <Icon name="play" />
                  {last ? `继续${last.module === "lyrics" ? "学唱" : "学谱"}` : "开始学唱"}
                </button>
              </section>
              <div className="home-shortcuts">
                <button className="shortcut" onClick={() => goPractice("piano")}>
                  <Icon name="piano" />
                  <strong>钢琴学谱</strong>
                  <small>打开乐谱</small>
                </button>
                <button className="shortcut" onClick={() => openDownloads("home")}>
                  <Icon name="download" />
                  <strong>下载与导入</strong>
                  <small>{pendingDownloads ? `${pendingDownloads} 项进行中` : `${downloads.length} 首已下载`}</small>
                </button>
              </div>
              <div className="section-heading">
                <h2>最近练习</h2>
                {records.length > 0 && <button onClick={() => navigate("recents")}>查看全部</button>}
              </div>
              {records.length ? (
                <div className="list-panel">{recentRows(records.slice(0, 3))}</div>
              ) : (
                <div className="empty-card">
                  <Icon name="note" />
                  <p>还没有练习记录</p>
                  <small>练习后可从这里继续。</small>
                </div>
              )}
            </>
          )}
          {page === "library" && (
            <>
              <label className="library-search">
                <Icon name="search" />
                <input className="search-field" type="search" aria-label="搜索歌曲" placeholder="搜索歌曲" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <div className="chips" aria-label="曲库筛选">
                {[
                  ["all", "全部"],
                  ["lyrics", "可学唱"],
                  ["score", "可学谱"],
                ].map(([key, name]) => (
                  <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{name}</button>
                ))}
              </div>
              <button className="download-library-entry" onClick={() => openDownloads("library")}>
                <Icon name="download" /><span>下载与导入</span>
                <small>{downloads.length} 首已下载{pendingDownloads ? ` · ${pendingDownloads} 项进行中` : ""}</small>
                <Icon name="right" />
              </button>
              {visibleSongs.length ? (
                <div className="library-list list-panel">
                  {visibleSongs.map((s) => {
                    const m = summary(s);
                    const kinds = [m.audio && "音频", m.lyrics && "歌词", m.score && "乐谱"].filter(Boolean).join("、");
                    const artist = isHaruhikage(s) ? "CRYCHIC" : s.id === DEMO_SONG.id ? "原创示例" : "";
                    return (
                      <button className="song-row" key={s.id} onClick={() => choose(s)}>
                        <Cover small id={s.id} piano={!!m.score && !m.audio} />
                        <span>
                          <strong>{s.title}</strong>
                          <small>{[artist, kinds || "尚未关联资料"].filter(Boolean).join(" · ")}</small>
                        </span>
                        <Icon name="right" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-card">没有找到匹配的歌曲。</div>
              )}
            </>
          )}
          {page === "song" && (
            <>
              <div className="detail-hero">
                <Cover id={song.id} />
                <h2>{song.title}</h2>
                {isHaruhikage(song) && <p>CRYCHIC ver.</p>}
                {song.id === DEMO_SONG.id && <p>原创示例</p>}
              </div>
              <div className="practice-entries">
                <button className="primary action-with-icon" onClick={() => navigate("lyrics")}><Icon name="note" />歌词学唱</button>
                <button className="action-with-icon" onClick={() => navigate("piano-prep")}><Icon name="piano" />钢琴学谱</button>
              </div>
              <div className="section-heading">
                <h2>歌曲资料</h2>
                <button onClick={() => { materialsFromDownloads.current = false; navigate("materials"); }}>管理</button>
              </div>
              <div className="list-panel">
                {([
                  ["note", "音频", summary(song).audio],
                  ["file", "歌词", summary(song).lyrics ? `${summary(song).lyrics} 句 · LRC` : undefined],
                  ["piano", "乐谱", summary(song).score],
                ] as const).map(([icon, label, value]) => (
                  <button className="info-row detail-material" key={label} onClick={() => { materialsFromDownloads.current = false; navigate("materials"); }}>
                    <Icon name={icon} /><span><strong>{label}</strong><small>{value ?? "尚未关联"}</small></span><Icon name="right" />
                  </button>
                ))}
              </div>
            </>
          )}
          {page === "materials" && (
            <>
              <div className="section-heading">
                <h2>关联歌曲</h2>
                <button onClick={() => setCreating(true)}>新建歌曲</button>
              </div>
              <label className="field-label">
                <select
                  aria-label="关联歌曲"
                  value={song.id}
                  onChange={(e) => {
                    const s = catalog.find((s) => s.id === e.target.value);
                    if (s) choose(s, "materials");
                  }}
                >
                  {catalog.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </label>
            </>
          )}
          {page === "recents" && (
            recentDays.size ? [...recentDays].map(([day, list]) => (
              <section className="recent-day" key={day}>
                <h2>{day}</h2>
                <div className="list-panel">{recentRows(list, true)}</div>
              </section>
            )) : <div className="empty-card">还没有练习记录。</div>
          )}
          {page === "settings" && (
            <>
              <h2 className="group-title">练习偏好</h2>
              <section className="list-panel settings-preferences" aria-label="练习偏好">
                <label className="preference-row">
                  <span><strong>新练习默认速度</strong><small>已保存的练习沿用上次设置</small></span>
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
                <label className="preference-row">
                  <span><strong>新乐谱辅助标记</strong><small>打开新乐谱时生效</small></span>
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
              </section>
              <h2 className="group-title">应用</h2>
              <div className="list-panel">
                <button className="info-row detail-material" onClick={() => navigate("updates")}><Icon name="download" /><span><strong>应用更新</strong><small>当前版本 {version.appVersion}</small></span><Icon name="right" /></button>
                <button className="info-row detail-material" onClick={() => setFeedback(true)}><Icon name="file" /><span><strong>反馈与建议</strong><small>预览报告后提交</small></span><Icon name="right" /></button>
                <button className="info-row detail-material" onClick={() => navigate("about")}><Icon name="note" /><span><strong>关于 Anisong</strong><small>版本和项目源码</small></span><Icon name="right" /></button>
              </div>
              <h2 className="group-title">本地资料</h2>
              <div className="settings-card">
                <p className="helper">导入的音频、歌词和乐谱保存在此设备。请保留原文件，以便清除数据或外部音频权限失效后重新导入。</p>
              </div>
            </>
          )}
          {page === "updates" && <AppUpdates />}
          {page === "about" && (
            <>
              <div className="detail-hero">
                <Cover id={HARUHIKAGE.id} />
                <h2>Anisong</h2>
                <p>{version.appVersion}</p>
              </div>
              <div className="list-panel">
                <a className="info-row detail-material" href="https://github.com/cosmos-zhan/anisong-learning-app" target="_blank" rel="noreferrer">
                  <Icon name="file" /><span><strong>源码与发行版</strong><small>cosmos-zhan/anisong-learning-app</small></span><Icon name="right" />
                </a>
                <button className="info-row detail-material" onClick={() => setFeedback(true)}><Icon name="note" /><span><strong>反馈与建议</strong><small>提交可复现的问题</small></span><Icon name="right" /></button>
              </div>
              <h2 className="group-title">当前测试版</h2>
              <div className="settings-card">
                <p className="helper">歌词时间来自 LRC。钢琴学谱读取 MusicXML 或 MXL，可以按小节练习。等待弹对支持单音轨。</p>
                <details className="build-details">
                  <summary>构建信息</summary>
                  <small>{version.sha} · {version.branch} · {version.builtAt}</small>
                </details>
              </div>
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
      </div>
      {["home", "library", "settings"].includes(page) && (
        <nav className="bottom-nav" aria-label="主导航">
          {navigation.map(([target, icon, label]) => (
            <button
              key={target}
              aria-label={label}
              aria-current={page === target ? "page" : undefined}
              onClick={() => navigate(target)}
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>
      )}
      {creating && (page === "library" || page === "materials") && (
        <Sheet title="新建歌曲" className="create-song-sheet" onClose={closeCreate}>
          {(dismiss) => (
            <form className="create-song" onSubmit={(event) => {
              event.preventDefault();
              const title = newTitle.trim();
              if (!title) return;
              const next = { id: `local-${crypto.randomUUID()}`, title, scoreIds: [], updatedAt: "" };
              dismiss(() => choose(next, "materials"));
            }}>
              <label className="field-label">
                歌名
                <input aria-label="新歌曲名称" placeholder="输入歌名" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={120} />
              </label>
              <button className="primary full" type="submit" disabled={!newTitle.trim()}>创建歌曲</button>
            </form>
          )}
        </Sheet>
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
