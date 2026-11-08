import { memo, useMemo } from 'react';
import { alignRomaji } from '../../../../packages/core/romaji-align';

/** The source text and pronunciation are presented without changing stored LRC. */
export const RomajiLyrics = memo(function RomajiLyrics({text, romaji}:{text:string;romaji:string}) {
  const result=useMemo(()=>alignRomaji(text,romaji),[text,romaji]);
  if (!result.aligned) return <span className="lyric-romaji lyric-romaji-fallback"><span className="lyric-roman-line">{romaji} <small>整句注音</small></span><span className="lyric-text">{text}</span></span>;
  return <span className="lyric-romaji"><span className="lyric-text">{result.parts.map((part,index)=>part.romaji
    ? <ruby key={index}>{part.text}<rt>{part.romaji}</rt></ruby>
    : <span key={index}>{part.text}</span>)}</span></span>;
});
