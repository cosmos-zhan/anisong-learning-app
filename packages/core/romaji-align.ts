import { toRomaji } from 'wanakana';

export type RomajiPart = { text: string; romaji?: string };
export type RomajiAlignment = { parts: RomajiPart[]; aligned: boolean };
const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const kana = /[\u3041-\u3096\u30a1-\u30faー]+/gu;
const han = /[\p{Script=Han}々]/u;
const normalize = (value: string) => value.toLowerCase().normalize('NFKC')
  .replace(/[’']/g, '').replace(/[^a-z0-9āīūēō]/g, '').replace(/tchi/g, 'cchi')
  .replace(/ā/g,'a').replace(/ī/g,'i').replace(/ū/g,'u').replace(/ē/g,'e').replace(/ō/g,'o')
  .replace(/aa/g,'a').replace(/ii/g,'i').replace(/uu/g,'u').replace(/ee|ei/g,'e').replace(/oo|ou/g,'o');

/** Validate the parts whose reading is explicit kana; never invent kanji readings. */
function compatible(text: string, reading: string): boolean {
  const compact = text.replace(/[\s\p{P}\p{S}]/gu, '');
  const actual = normalize(reading);
  if (!actual) return false;
  const chunks = [...compact.matchAll(kana)];
  if (!chunks.length) return han.test(compact) || normalize(compact) === actual;
  const alternatives = (part: string) => {
    const basic = normalize(toRomaji(part));
    const forms = new Set([basic]);
    // Japanese grammatical particles are pronounced differently from the kana name.
    if (part.endsWith('は')) forms.add(basic.slice(0, -2) + 'wa');
    if (part.endsWith('へ')) forms.add(basic.slice(0, -2) + 'e');
    if (part.endsWith('を')) forms.add(basic.slice(0, -2) + 'o');
    return [...forms];
  };
  if (!han.test(compact) && chunks.map(m => m[0]).join('') === compact)
    return alternatives(compact).includes(actual);
  let cursor = 0;
  for (const [i, match] of chunks.entries()) {
    const choices = alternatives(match[0]);
    const positions = choices.map(a => ({ pos: actual.indexOf(a, cursor), len: a.length }))
      .filter(a => a.pos >= 0 && (i !== 0 || match.index !== 0 || a.pos === 0));
    if (!positions.length) return false;
    const last = (match.index ?? 0) + match[0].length === compact.length;
    const chosen = last ? positions.find(a => a.pos + a.len === actual.length) : positions[0];
    if (!chosen) return false;
    cursor = chosen.pos + chosen.len;
  }
  return true;
}

/**
 * Pair word-boundary romanization supplied by the source with Japanese word
 * segments. Kana anchors reject many bad matches; Han readings are not verified.
 * When boundaries cannot be reconciled, show one honest whole-line annotation.
 */
export function alignRomaji(text: string, romaji: string): RomajiAlignment {
  const fallback = (): RomajiAlignment => ({ parts: [{ text, romaji }], aligned: false });
  if (!text || !romaji.trim() || !japanese.test(text) || typeof Intl.Segmenter !== 'function') return fallback();
  const words = [...new Intl.Segmenter('ja', {granularity:'word'}).segment(text)]
    .filter(item => item.isWordLike).map(item => ({text:item.segment, start:item.index, end:item.index+item.segment.length}));
  const readings = romaji.trim().split(/\s+/);
  if (readings.some(word => !normalize(word))) return fallback();
  if (!words.length || !readings.length || words.length > 64 || readings.length > 64 || romaji.length > 1500) return fallback();
  // Some sources put a space between every syllable rather than between words.
  // Without a kanji pronunciation dictionary those boundaries are ambiguous.
  if (readings.length > words.length && readings.filter(word => normalize(word).length <= 3).length / readings.length > 0.6) return fallback();
  type Step = { endWord: number; endReading: number; score: number; ways: number; next?: Step };
  const memo = new Map<string, Step | null>();
  function visit(i: number, j: number): Step | null {
    if (i === words.length && j === readings.length) return {endWord:i,endReading:j,score:0,ways:1};
    if (i === words.length || j === readings.length) return null;
    const key = `${i}:${j}`; if (memo.has(key)) return memo.get(key)!;
    let best: Step | null = null;
    for (let endWord=i+1;endWord<=Math.min(words.length,i+8);endWord++) {
      const part = text.slice(words[i].start,words[endWord-1].end);
      for (let endReading=j+1;endReading<=Math.min(readings.length,j+8);endReading++) {
        const sound = readings.slice(j,endReading).join(' ');
        // A sequence of opaque kanji cannot validate multiple unrelated words.
        if (!/[\u3041-\u3096\u30a1-\u30fa]/u.test(part) && endReading-j>1) continue;
        if (!compatible(part,sound)) continue;
        const next=visit(endWord,endReading); if (!next) continue;
        const score=next.score+100-(endWord-i-1)*2-(endReading-j-1);
        if (!best || score>best.score) best={endWord,endReading,score,ways:next.ways,next};
        else if (score === best.score) best.ways=Math.min(2,best.ways+next.ways);
      }
    }
    memo.set(key,best);return best;
  }
  let step=visit(0,0); if (!step || !step.next || step.ways>1) return fallback();
  const groups: RomajiPart[]=[]; let i=0,j=0,previousEnd=0;
  while (step.next) {
    const first=words[i],last=words[step.endWord-1];
    if (first.start>previousEnd) groups.push({text:text.slice(previousEnd,first.start)});
    groups.push({text:text.slice(first.start,last.end),romaji:readings.slice(j,step.endReading).join(' ')});
    previousEnd=last.end;i=step.endWord;j=step.endReading;step=step.next;
  }
  if (previousEnd<text.length) groups.push({text:text.slice(previousEnd)});
  // A pair must fit on a narrow phone without breaking its annotation apart.
  if (groups.some(part => part.romaji && (part.romaji.length > 28 || [...part.text].length > 12))) return fallback();
  return {parts:groups,aligned:groups.filter(p=>p.romaji).length>1};
}
