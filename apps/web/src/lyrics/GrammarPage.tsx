import { useEffect, useRef, useState } from 'react';
import type { LyricLine } from '../../../../packages/core/types';
import type { LinePreviewPhase } from '../../../../packages/core/controller';
import { grammarRequest, grammarSettings, parseGrammar, saveGrammarSettings, type ChatMessage, type GrammarConfig, type GrammarResult, type ReadingSegment } from '../../../../packages/core/grammar';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { GrammarMarkdown } from './GrammarMarkdown';
import './grammar.css';

type Entry = { question: string; answer: string };
const hints = ['这句的动词是怎么变化的？', '这句话的语气是什么？', '能给我一个日常例句吗？'];
function Reading({ text, segments, visible }: { text: string; segments?: ReadingSegment[]; visible: boolean }) {
  if (!visible || !segments) return <>{text}</>;
  return <>{segments.map((segment, i) => segment.reading ? <ruby key={i}>{segment.text}<rt>{segment.reading}</rt></ruby> : <span key={i}>{segment.text}</span>)}</>;
}
export function GrammarPage({ line, lines = [line], songId = "demo-original", songTitle, index, onClose, audioAvailable, onPlayLine, onStopLine }: {
  line: LyricLine; lines?: LyricLine[]; songId?: string; songTitle?: string; index: number; onClose: () => void; audioAvailable: boolean;
  onPlayLine: (notify: (phase: LinePreviewPhase, message?: string) => void) => Promise<void>;
  onStopLine: () => Promise<void>;
}) {
  const [config, setConfig] = useState<GrammarConfig>(grammarSettings);
  const [editing, setEditing] = useState(!config.key);
  const [tab, setTab] = useState<'reading' | 'chat'>('reading');
  const legacyKey = `anisong:grammar-history:${encodeURIComponent(songId)}:${line.start}:${encodeURIComponent(line.text)}`;
  const storageKey = `${legacyKey}:${index}`;
  const [saved] = useState(() => { try {
    // Legacy keys lacked a line index; reuse them only when unambiguous.
    const legacyIsUnique = lines.filter(item => item.start === line.start && item.text === line.text).length === 1;
    const stored = localStorage.getItem(storageKey) ?? (legacyIsUnique ? localStorage.getItem(legacyKey) : null);
    const value = JSON.parse(stored ?? 'null');
    if (typeof value?.raw !== 'string' || !value.raw.trim() || value.raw.length > 50000 || !Array.isArray(value.entries)) return null;
    return { raw: value.raw as string, entries: value.entries.filter((entry: Entry) => typeof entry?.question === 'string' && !!entry.question.trim() && entry.question.length <= 1000 && typeof entry?.answer === 'string' && !!entry.answer.trim() && entry.answer.length <= 50000).slice(-30) as Entry[] };
  } catch { return null; } });
  const [result, setResult] = useState<GrammarResult | null>(() => saved ? parseGrammar(saved.raw) : null);
  const [word, setWord] = useState(0);
  const [entries, setEntries] = useState<Entry[]>(() => saved?.entries ?? []);
  const [showHistory, setShowHistory] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [scope, setScope] = useState<'nearby' | 'full'>('nearby');
  const [showRomaji, setShowRomaji] = useState(() => { try { return localStorage.getItem('anisong:grammarRomaji') !== 'off'; } catch { return true; } });
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [audioPhase, setAudioPhase] = useState<LinePreviewPhase>('idle');
  const [audioError, setAudioError] = useState('');
  const [showReading, setShowReading] = useState(() => { try { return localStorage.getItem('anisong:grammarFurigana') !== 'off'; } catch { return true; } });
  const contentRef = useRef<HTMLElement>(null);
  const active = useRef<AbortController | null>(null);
  const pendingQuestion = useRef('');
  const mounted = useRef(true);
  const started = useRef(false);
  const run = async (settings: GrammarConfig, query?: string) => {
    if (active.current) return;
    const prompt = query?.trim();
    if (query !== undefined && !prompt) return;
    const abort = new AbortController(); active.current = abort; setBusy(true); setError('');
    if (prompt) { pendingQuestion.current = prompt; setTab('chat'); setShowHistory(true); setQuestion(''); }
    const history: ChatMessage[] = result ? [{ role: 'assistant', content: result.raw }, ...entries.flatMap(e => [{ role: 'user' as const, content: e.question }, { role: 'assistant' as const, content: e.answer }])] : [];
    if (prompt) history.push({ role: 'user', content: prompt });
    try {
      const response = await grammarRequest(settings, line.text, history, abort.signal, { title: songTitle, lines, index, scope });
      if (!mounted.current || abort.signal.aborted) return;
      if (prompt) setEntries(previous => [...previous, { question: prompt, answer: response }].slice(-30));
      else { setResult(parseGrammar(response)); setWord(0); setEntries([]); }
    } catch (failure) {
      if (mounted.current && !abort.signal.aborted) { setError(failure instanceof Error ? failure.message : '解读失败，请重试。'); if (prompt) setQuestion(prompt); }
    } finally {
      if (active.current === abort) { active.current = null; pendingQuestion.current = ''; if (mounted.current) setBusy(false); }
    }
  };
  // The selected lyric stays fixed for the lifetime of this dialog.
  useEffect(() => {
    mounted.current = true;
    if (!started.current && config.key && !saved) { started.current = true; void run(config); }
    return () => { mounted.current = false; started.current = false; active.current?.abort(); active.current = null; };
    // Only start automatically on opening, not on every edit or response.
  }, []);
  useEffect(() => { if (tab === 'chat' && showHistory && contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight; }, [tab, entries, showHistory]);
  useEffect(() => {
    if (!result) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ raw: result.raw, entries: entries.slice(-30) })); setStorageError(false); }
    catch { setStorageError(true); }
  }, [storageKey, result, entries]);
  const stop = () => { active.current?.abort(); active.current = null; if (pendingQuestion.current) setQuestion(pendingQuestion.current); pendingQuestion.current = ''; setBusy(false); setError('已停止本次请求。'); };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    try { saveGrammarSettings(config); setEditing(false); setError(''); if (!result) void run(config); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '配置无效。'); }
  };
  const toggleReading = () => { const next = !showReading; setShowReading(next); try { localStorage.setItem('anisong:grammarFurigana', next ? 'on' : 'off'); } catch { /* Keep this choice for the current page. */ } };
  const toggleRomaji = () => { const next = !showRomaji; setShowRomaji(next); try { localStorage.setItem('anisong:grammarRomaji', next ? 'on' : 'off'); } catch { /* Keep this choice for the current page. */ } };
  const playLine = () => {
    if (audioPhase === 'playing') { void onStopLine(); return; }
    setAudioError('');
    void onPlayLine((phase, message) => { if (!mounted.current) return; setAudioPhase(phase); if (phase === 'error') setAudioError(message ?? '本句播放失败，请重试。'); });
  };
  return <Sheet title="语法解读" subtitle="一句，慢慢读懂" backButton onClose={onClose} className="grammar-panel">
    <div className="grammar-tabs" role="tablist" aria-label="本句学习">
      <button role="tab" aria-selected={tab === 'reading'} onClick={() => setTab('reading')}>解读</button>
      <button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>本句追问{entries.length ? ` ${entries.length}` : ''}</button>
    </div>
    <main ref={contentRef} className="grammar-content">
      <p className="grammar-eyebrow">第 {index + 1} 句 · 本句解读</p>
      <h1 className="grammar-sentence">{line.text}</h1>
      <button className="grammar-roman-toggle" aria-pressed={showRomaji} onClick={toggleRomaji}>罗马音{showRomaji ? '开' : '关'}</button>
      {showRomaji && line.romaji && <p className="grammar-roman">{line.romaji}</p>}
      {line.translation && <p className="grammar-local-translation">已有翻译：{line.translation}</p>}
      <div className="grammar-line-actions"><button className="grammar-play" aria-label={audioPhase === 'playing' ? '停止本句' : '播放本句'} disabled={!audioAvailable || audioPhase === 'starting'} onClick={playLine}><Icon name={audioPhase === 'playing' ? 'pause' : 'play'} />{audioPhase === 'starting' ? '准备音频…' : audioPhase === 'playing' ? '停止本句' : '播放本句'}</button><span>只播放这一句</span></div>
      {audioError && <p className="grammar-error" role="alert">{audioError}</p>}
      <div className="grammar-context-controls"><label>发送歌词上下文 <select value={scope} onChange={e => setScope(e.target.value as 'nearby' | 'full')} disabled={busy}><option value="nearby">前后各三句</option><option value="full">全文（最多 16000 字）</option></select></label><p>解读和追问会将所选范围、歌名及本句对话发送给模型服务商。</p></div>
      <button className="grammar-settings-toggle" onClick={() => setEditing(!editing)} aria-expanded={editing}>模型设置 {editing ? '收起' : '修改'}</button>
      {editing && <form className="grammar-settings" onSubmit={save}>
        <label>接口地址<input type="url" required value={config.endpoint} onChange={e => setConfig({ ...config, endpoint: e.target.value })} autoComplete="url" /></label>
        <label>模型名称<input required value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })} /></label>
        <label>API 密钥<input type="password" required autoComplete="off" value={config.key} onChange={e => setConfig({ ...config, key: e.target.value })} /></label>
        <p>兼容 OpenAI 格式的聊天接口。密钥仅保存在本次会话内，关闭应用后需重新输入；接口和模型名称会保存在本机。</p>
        <p>开始解读或追问时，所选范围的歌词、歌名及本句对话会发送至上面的服务商，可能产生费用。</p>
        <button className="grammar-primary" type="submit" disabled={busy}>保存并{result ? '返回' : '开始解读'}</button>
      </form>}
      {!editing && !result && !busy && <div className="grammar-empty"><p>解读会围绕这句的词义、变形和语法展开。</p><button className="grammar-primary" onClick={() => void run(config)}>开始解读</button></div>}
      {busy && <div className="grammar-status" role="status">正在请求模型… <button onClick={stop}>停止生成</button></div>}
      {error && <p className="grammar-error" role="alert">{error}</p>}
      {result && tab === 'reading' && <>
        {result.meaning ? <div className="grammar-meaning"><small>这句在说什么</small><GrammarMarkdown text={result.meaning} /></div> : <div className="grammar-answer"><GrammarMarkdown text={result.raw} /></div>}
        {!!result.pieces.length && <section><div className="grammar-section-heading"><h2>把句子拆开 <small>点词组查看</small></h2><button aria-pressed={showReading} onClick={toggleReading}>假名{showReading ? '开' : '关'}</button></div><div className="grammar-pieces">{result.pieces.map((piece, i) => <button key={`${i}-${piece.text}`} aria-pressed={word === i} onClick={() => setWord(i)}><Reading text={piece.text} segments={piece.segments} visible={showReading} />{showRomaji && piece.romaji && <small className="grammar-piece-roman">{piece.romaji}</small>}</button>)}</div><div className="grammar-piece-detail"><strong><Reading text={result.pieces[word]?.text ?? ''} segments={result.pieces[word]?.segments} visible={showReading} /></strong>{showRomaji && result.pieces[word]?.romaji && <small className="grammar-piece-roman">{result.pieces[word]?.romaji}</small>}<GrammarMarkdown text={result.pieces[word]?.explanation ?? ''} /></div>{showReading && !result.pieces.some(piece => piece.segments?.some(segment => segment.reading)) && <p className="grammar-reading-hint">模型没有提供可显示的假名，读音请结合词典确认。</p>}</section>}
        {!!result.points.length && <section><h2>语法要点</h2>{result.points.map((point, i) => <article className="grammar-point" key={`${i}-${point.title}`}><span>{String(i + 1).padStart(2, '0')}</span><div><h3>{point.title}</h3><GrammarMarkdown text={point.explanation} /></div></article>)}</section>}
        <p className="grammar-disclaimer">AI 解读可能有误；语境不明确时请结合上下文理解。</p>
      </>}
      {tab === 'chat' && result && <section className="grammar-thread" aria-live="polite">
        <div className="grammar-history-heading"><span>对话记录{entries.length ? ` · ${entries.length} 条` : ''}</span>{!!entries.length && <button onClick={() => setShowHistory(!showHistory)} aria-pressed={showHistory}>{showHistory ? '隐藏历史' : '显示历史'}</button>}</div>{!!entries.length && <p className="grammar-history-note">记录保存在本机；隐藏后仍会作为对话上下文发送（最多最近 6 轮）。</p>}
        {storageError && <p className="grammar-error" role="alert">本机存储不可用或空间不足，历史可能无法保存。</p>}
        {!entries.length && <p className="grammar-empty">从一个没懂的地方，接着问下去。</p>}
        {showHistory && entries.map((entry, i) => <div key={i}><p className="grammar-user">{entry.question}</p><div className="grammar-answer"><strong>语法解读</strong><GrammarMarkdown text={entry.answer} /></div></div>)}
      </section>}
    </main>
      {result && <section className="grammar-ask" aria-label="继续问这一句"><div className="grammar-hints">{hints.map(hint => <button key={hint} disabled={busy || editing} onClick={() => void run(config, hint)}>{hint}</button>)}</div><form onSubmit={event => { event.preventDefault(); void run(config, question); }}><textarea aria-label="对当前句子的追问" maxLength={1000} rows={2} placeholder="这句还有哪里没读懂？" value={question} onChange={e => setQuestion(e.target.value)} disabled={busy || editing} /><button className="grammar-primary" disabled={busy || editing || !question.trim()}>发送</button></form></section>}
  </Sheet>;
}
