import { describe, expect, it } from 'vitest';
import { alignRomaji } from '../packages/core/romaji-align';

describe('lyric romanization alignment', () => {
  it('aligns Japanese words with their supplied romanization while preserving spacing and punctuation', () => {
    const input='赤い花 が 咲く！';
    const aligned=alignRomaji(input,'akai hana ga saku!');
    expect(aligned.aligned).toBe(true);
    expect(aligned.parts.map(part=>part.text).join('')).toBe(input);
    expect(aligned.parts.filter(part=>part.romaji)).toEqual([
      {text:'赤い',romaji:'akai'},{text:'花',romaji:'hana'},{text:'が',romaji:'ga'},{text:'咲く',romaji:'saku!'},
    ]);
  });
  it('handles kana particles, syllable-separated input and macron long vowels', () => {
    const parts=alignRomaji('猫は遠い','ne ko wa tōi');
    expect(parts.parts.map(p=>p.text).join('')).toBe('猫は遠い');
    expect(parts.parts.filter(p=>p.romaji)).toEqual([{text:'猫は',romaji:'ne ko wa'},{text:'遠い',romaji:'tōi'}]);
  });
  it('falls back to a single line when kana and reading conflict', () => {
    expect(alignRomaji('猫が走る','cat dog')).toEqual({parts:[{text:'猫が走る',romaji:'cat dog'}],aligned:false});
  });
  it('falls back safely without Japanese segmentation or on oversized input', () => {
    expect(alignRomaji('hello world','hello world').aligned).toBe(false);
    const text='日'.repeat(70);expect(alignRomaji(text,'x '.repeat(70)).aligned).toBe(false);
  });
});
