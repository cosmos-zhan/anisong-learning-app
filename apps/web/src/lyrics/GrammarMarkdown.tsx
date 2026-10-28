import type { ReactNode } from 'react';

// Model output is untrusted: render only React text nodes and a small Markdown
// subset; never inject HTML or allow javascript:/data: links.
function inline(text: string): ReactNode[] {
  const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\)|\*[^*\n]+\*|_[^_\n]+_)/g;
  const nodes: ReactNode[] = []; let offset = 0; let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > offset) nodes.push(text.slice(offset, match.index));
    const value = match[0], key = match.index;
    if (value.startsWith('**') || value.startsWith('__')) nodes.push(<strong key={key}>{value.slice(2, -2)}</strong>);
    else if (value.startsWith('`')) nodes.push(<code key={key}>{value.slice(1, -1)}</code>);
    else if (value.startsWith('[')) {
      const parsed = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value)!;
      let safe = false; try { safe = new URL(parsed[2]).protocol === 'https:'; } catch { /* Display unknown links as text. */ }
      nodes.push(safe ? <a key={key} href={parsed[2]} target="_blank" rel="noopener noreferrer">{parsed[1]}</a> : <span key={key}>{parsed[1]}</span>);
    } else nodes.push(<em key={key}>{value.slice(1, -1)}</em>);
    offset = match.index + value.length;
  }
  if (offset < text.length) nodes.push(text.slice(offset));
  return nodes;
}
const listMatch = (line: string) => /^\s*(?:(- |\* |\+ )|(\d+[.)] ))(.+)$/.exec(line);
const tableCells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
export function GrammarMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'); const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i]; if (!line.trim()) { i++; continue; }
    const key = i;
    if (/^\s*```/.test(line)) {
      const code: string[] = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre key={key}><code>{code.join('\n')}</code></pre>); continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.+)$/.exec(line);
    if (heading) { blocks.push(<h3 key={key}>{inline(heading[1])}</h3>); i++; continue; }
    if (i + 1 < lines.length && line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const headers = tableCells(line); const rows: string[][] = []; i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(tableCells(lines[i++]));
      blocks.push(<div className="grammar-table-wrap" key={key}><table><thead><tr>{headers.map((cell,j)=><th key={j}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row,j)=><tr key={j}>{headers.map((_,k)=><td key={k}>{inline(row[k]??'')}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    const item = listMatch(line);
    if (item) {
      const ordered = !!item[2]; const items: string[] = [];
      while (i < lines.length) { const next = listMatch(lines[i]); if (!next || !!next[2] !== ordered) break; items.push(next[3]); i++; }
      const children = items.map((value,j)=><li key={j}>{inline(value)}</li>);
      blocks.push(ordered ? <ol key={key}>{children}</ol> : <ul key={key}>{children}</ul>); continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={key}>{inline(quote.join('\n'))}</blockquote>); continue;
    }
    const paragraph: string[] = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^\s{0,3}#{1,6}\s/.test(lines[i]) && !listMatch(lines[i]) && !/^\s*>\s?/.test(lines[i]) && !(i+1<lines.length&&lines[i].includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]))) paragraph.push(lines[i++]);
    blocks.push(<p key={key}>{inline(paragraph.join('\n'))}</p>);
  }
  return <div className="grammar-markdown">{blocks}</div>;
}
