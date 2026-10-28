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
export function GrammarPage({ line, index, onClose, audioAvailable, onPlayLine, onStopLine }: {
  line: LyricLine; index: number; onClose: () => void; audioAvailable: boolean;
  onPlayLine: (notify: (phase: LinePreviewPhase, message?: string) => void) => Promise<void>;
  onStopLine: () => Promise<void>;
}) {
  const [config, setConfig] = useState<GrammarConfig>(grammarSettings);
  const [editing, setEditing] = useState(!config.key);
  const [tab, setTab] = useState<'reading' | 'chat'>('reading');
  const [result, setResult] = useState<GrammarResult | null>(null);
  const [word, setWord] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [audioPhase, setAudioPhase] = useState<LinePreviewPhase>('idle');
  const [audioError, setAudioError] = useState('');
  const [showReading, setShowReading] = useState(() => { try { return localStorage.getItem('anisong:grammarFurigana') !== 'off'; } catch { return true; } });
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const started = useRef(false);
  const run = async (settings: GrammarConfig, query?: string) => {
    if (active.current) return;
    const prompt = query?.trim();
    if (query !== undefined && !prompt) return;
    const abort = new AbortController(); active.current = abort; setBusy(true); setError('');
    if (prompt) { setTab('chat'); setQuestion(''); }
    const history: ChatMessage[] = result ? [{ role: 'assistant', content: result.raw }, ...entries.flatMap(e => [{ role: 'user' as const, content: e.question }, { role: 'assistant' as const, content: e.answer }])] : [];
    if (prompt) history.push({ role: 'user', content: prompt });
    try {
      const response = await grammarRequest(settings, line.text, history, abort.signal);
      if (!mounted.current || abort.signal.aborted) return;
      if (prompt) setEntries(previous => [...previous, { question: prompt, answer: response }]);
      else { setResult(parseGrammar(response)); setWord(0); setEntries([]); }
    } catch (failure) {
      if (mounted.current && !abort.signal.aborted) { setError(failure instanceof Error ? failure.message : '解读失败，请重试。'); if (prompt) setQuestion(prompt); }
    } finally {
      if (active.current === abort) { active.current = null; if (mounted.current) setBusy(false); }
    }
  };
  // The selected lyric stays fixed for the lifetime of this dialog.
  useEffect(() => {
    mounted.current = true;
    if (!started.current && config.key) { started.current = true; void run(config); }
    return () => { mounted.current = false; started.current = false; active.current?.abort(); active.current = null; };
    // Only start automatically on opening, not on every edit or response.
  }, []);
  const stop = () => { active.current?.abort(); active.current = null; setBusy(false); setError('已停止本次请求。'); };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    try { saveGrammarSettings(config); setEditing(false); setError(''); if (!result) void run(config); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '配置无效。'); }
  };
  const toggleReading = () => { const next = !showReading; setShowReading(next); try { localStorage.setItem('anisong:grammarFurigana', next ? 'on' : 'off'); } catch { /* Keep this choice for the current page. */ } };
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
    <main className="grammar-content">
      <p className="grammar-eyebrow">第 {index + 1} 句 · 本句解读</p>
      <h1 className="grammar-sentence">{line.text}</h1>
      {line.romaji && <p className="grammar-roman">{line.romaji}</p>}
      {line.translation && <p className="grammar-local-translation">已有翻译：{line.translation}</p>}
      <div className="grammar-line-actions"><button className="grammar-play" aria-label={audioPhase === 'playing' ? '停止本句' : '播放本句'} disabled={!audioAvailable || audioPhase === 'starting'} onClick={playLine}><Icon name={audioPhase === 'playing' ? 'pause' : 'play'} />{audioPhase === 'starting' ? '准备音频…' : audioPhase === 'playing' ? '停止本句' : '播放本句'}</button><span>只播放这一句</span></div>
      {audioError && <p className="grammar-error" role="alert">{audioError}</p>}
      <button className="grammar-settings-toggle" onClick={() => setEditing(!editing)} aria-expanded={editing}>模型设置 {editing ? '收起' : '修改'}</button>
      {editing && <form className="grammar-settings" onSubmit={save}>
        <label>接口地址<input type="url" required value={config.endpoint} onChange={e => setConfig({ ...config, endpoint: e.target.value })} autoComplete="url" /></label>
        <label>模型名称<input required value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })} /></label>
        <label>API 密钥<input type="password" required autoComplete="off" value={config.key} onChange={e => setConfig({ ...config, key: e.target.value })} /></label>
        <p>兼容 OpenAI 格式的聊天接口。密钥仅保存在本次会话内，关闭应用后需重新输入；接口和模型名称会保存在本机。</p>
        <p>开始解读或追问时，所选歌词及本句对话会发送至上面的服务商，可能产生费用。</p>
        <button className="grammar-primary" type="submit" disabled={busy}>保存并{result ? '返回' : '开始解读'}</button>
      </form>}
      {!editing && !result && !busy && <div className="grammar-empty"><p>解读会围绕这句的词义、变形和语法展开。</p><button className="grammar-primary" onClick={() => void run(config)}>开始解读</button></div>}
      {busy && <div className="grammar-status" role="status">正在请求模型… <button onClick={stop}>停止生成</button></div>}
      {error && <p className="grammar-error" role="alert">{error}</p>}
      {result && tab === 'reading' && <>
        {result.meaning ? <div className="grammar-meaning"><small>这句在说什么</small><GrammarMarkdown text={result.meaning} /></div> : <div className="grammar-answer"><GrammarMarkdown text={result.raw} /></div>}
        {!!result.pieces.length && <section><div className="grammar-section-heading"><h2>把句子拆开 <small>点词组查看</small></h2><button aria-pressed={showReading} onClick={toggleReading}>假名{showReading ? '开' : '关'}</button></div><div className="grammar-pieces">{result.pieces.map((piece, i) => <button key={`${i}-${piece.text}`} aria-pressed={word === i} onClick={() => setWord(i)}><Reading text={piece.text} segments={piece.segments} visible={showReading} /></button>)}</div><div className="grammar-piece-detail"><strong><Reading text={result.pieces[word]?.text ?? ''} segments={result.pieces[word]?.segments} visible={showReading} /></strong><GrammarMarkdown text={result.pieces[word]?.explanation ?? ''} /></div>{showReading && !result.pieces.some(piece => piece.segments?.some(segment => segment.reading)) && <p className="grammar-reading-hint">模型没有提供可显示的假名，读音请结合词典确认。</p>}</section>}
        {!!result.points.length && <section><h2>语法要点</h2>{result.points.map((point, i) => <article className="grammar-point" key={`${i}-${point.title}`}><span>{String(i + 1).padStart(2, '0')}</span><div><h3>{point.title}</h3><GrammarMarkdown text={point.explanation} /></div></article>)}</section>}
        <p className="grammar-disclaimer">AI 解读可能有误；语境不明确时请结合上下文理解。</p>
      </>}
      {tab === 'chat' && result && <section className="grammar-thread" aria-live="polite">
        {!entries.length && <p className="grammar-empty">从一个没懂的地方，接着问下去。</p>}
        {entries.map((entry, i) => <div key={i}><p className="grammar-user">{entry.question}</p><div className="grammar-answer"><strong>语法解读</strong><GrammarMarkdown text={entry.answer} /></div></div>)}
      </section>}
      {result && <section className="grammar-ask"><h2>继续问这一句</h2><div className="grammar-hints">{hints.map(hint => <button key={hint} disabled={busy || editing} onClick={() => void run(config, hint)}>{hint}</button>)}</div><form onSubmit={event => { event.preventDefault(); void run(config, question); }}><textarea aria-label="对当前句子的追问" maxLength={1000} rows={2} placeholder="这句还有哪里没读懂？" value={question} onChange={e => setQuestion(e.target.value)} disabled={busy || editing} /><button className="grammar-primary" disabled={busy || editing || !question.trim()}>发送</button></form></section>}
    </main>
  </Sheet>;
}
