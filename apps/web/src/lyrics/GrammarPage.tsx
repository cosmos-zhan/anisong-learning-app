import { useEffect, useRef, useState } from 'react';
import type { LyricLine } from '../../../../packages/core/types';
import { grammarRequest, grammarSettings, parseGrammar, saveGrammarSettings, type ChatMessage, type GrammarConfig, type GrammarResult } from '../../../../packages/core/grammar';
import { Sheet } from '../components/Sheet';
import './grammar.css';

type Entry = { question: string; answer: string };
const hints = ['这句的动词是怎么变化的？', '这句话的语气是什么？', '能给我一个日常例句吗？'];
export function GrammarPage({ line, index, onClose }: { line: LyricLine; index: number; onClose: () => void }) {
  const [config, setConfig] = useState<GrammarConfig>(grammarSettings);
  const [editing, setEditing] = useState(!config.key);
  const [tab, setTab] = useState<'reading' | 'chat'>('reading');
  const [result, setResult] = useState<GrammarResult | null>(null);
  const [word, setWord] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
  return <Sheet title="语法解读" onClose={onClose} className="grammar-panel">
    <div className="grammar-tabs" role="tablist" aria-label="本句学习">
      <button role="tab" aria-selected={tab === 'reading'} onClick={() => setTab('reading')}>解读</button>
      <button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>本句追问{entries.length ? ` ${entries.length}` : ''}</button>
    </div>
    <main className="grammar-content">
      <p className="grammar-eyebrow">第 {index + 1} 句 · 本句解读</p>
      <h1 className="grammar-sentence">{line.text}</h1>
      {line.romaji && <p className="grammar-roman">{line.romaji}</p>}
      {line.translation && <p className="grammar-local-translation">已有翻译：{line.translation}</p>}
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
        {result.meaning ? <div className="grammar-meaning"><small>这句在说什么</small><p>{result.meaning}</p></div> : <div className="grammar-answer">{result.raw}</div>}
        {!!result.pieces.length && <section><h2>把句子拆开 <small>点词组查看</small></h2><div className="grammar-pieces">{result.pieces.map((piece, i) => <button key={`${i}-${piece.text}`} aria-pressed={word === i} onClick={() => setWord(i)}>{piece.text}</button>)}</div><div className="grammar-piece-detail"><strong>{result.pieces[word]?.text}</strong><p>{result.pieces[word]?.explanation}</p></div></section>}
        {!!result.points.length && <section><h2>语法要点</h2>{result.points.map((point, i) => <article className="grammar-point" key={`${i}-${point.title}`}><span>{String(i + 1).padStart(2, '0')}</span><div><h3>{point.title}</h3><p>{point.explanation}</p></div></article>)}</section>}
        <p className="grammar-disclaimer">AI 解读可能有误；语境不明确时请结合上下文理解。</p>
      </>}
      {tab === 'chat' && result && <section className="grammar-thread" aria-live="polite">
        {!entries.length && <p className="grammar-empty">从一个没懂的地方，接着问下去。</p>}
        {entries.map((entry, i) => <div key={i}><p className="grammar-user">{entry.question}</p><div className="grammar-answer"><strong>语法解读</strong><p>{entry.answer}</p></div></div>)}
      </section>}
      {result && <section className="grammar-ask"><h2>继续问这一句</h2><div className="grammar-hints">{hints.map(hint => <button key={hint} disabled={busy || editing} onClick={() => void run(config, hint)}>{hint}</button>)}</div><form onSubmit={event => { event.preventDefault(); void run(config, question); }}><textarea aria-label="对当前句子的追问" maxLength={1000} rows={2} placeholder="这句还有哪里没读懂？" value={question} onChange={e => setQuestion(e.target.value)} disabled={busy || editing} /><button className="grammar-primary" disabled={busy || editing || !question.trim()}>发送</button></form></section>}
    </main>
  </Sheet>;
}
