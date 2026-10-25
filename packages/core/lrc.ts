import type { LyricLine } from './types';
export function parseLrc(input:string):{lines:LyricLine[];warnings:string[]} {
 const warnings:string[]=[]; const entries:LyricLine[]=[];
 const annotations: {start:number;key:'romaji'|'translation';text:string}[]=[];
 const offset=Number(input.match(/\[offset:([+-]?\d+)\]/i)?.[1]??0)/1000;
 for(const [index,raw] of input.replace(/^\uFEFF/,'').split(/\r?\n/).entries()) {
  const row=raw.trim();if(!row)continue;
  if(/^\[(ar|ti|al|by|offset|re|ve|length):/i.test(row))continue;
  const stamps=[...row.matchAll(/\[(\d+):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g)];
  if(!stamps.length){warnings.push(`文件第 ${index+1} 行缺少有效时间戳，已忽略。`);continue;}
  const content=row.replace(/\[\d+:[0-5]?\d(?:[.:]\d{1,3})?\]/g,'').trim()||'（无歌词 / 间奏）';
  // Explicit extension: never guess the language of duplicate ordinary LRC rows.
  const annotation=content.match(/^\[(romaji|translation)\]\s*(.*)$/i);
  for(const m of stamps){const start=Number(m[1])*60+Number(m[2])+Number('0.'+(m[3]??'0'))+offset;
   if(start<0){warnings.push(`文件第 ${index+1} 行时间早于 0，已忽略。`);continue;}
   if(annotation)annotations.push({start,key:annotation[1].toLowerCase() as 'romaji'|'translation',text:annotation[2].trim()});
   else entries.push({start,text:content});}
 }
 if(entries.some((v,i)=>i>0&&v.start<entries[i-1].start))warnings.push('时间戳存在乱序，已按原曲时间排序。');
 entries.sort((a,b)=>a.start-b.start);
 const lines:LyricLine[]=[];
 for(const entry of entries){const previous=lines.at(-1);if(previous?.start===entry.start){if(previous.text!==entry.text)previous.text+=' / '+entry.text;warnings.push('重复时间戳已合并到同一歌词行。');}else lines.push({...entry});}
 const byTime=new Map(lines.map(line=>[line.start,line]));
 for(const annotation of annotations){const line=byTime.get(annotation.start);if(!line){warnings.push('部分译文或罗马音没有同时间戳的原文，已忽略。');continue;}if(!annotation.text)continue;if(line[annotation.key]&&line[annotation.key]!==annotation.text){warnings.push('同一句存在重复的学习文本，保留第一条。');continue;}line[annotation.key]=annotation.text;}
 if(!lines.length)throw new Error('没有找到有效的 LRC 时间戳。格式示例：[00:16.30]歌词');
 return {lines,warnings:[...new Set(warnings)]};
}
export function validateLyrics(lines:LyricLine[],duration:number){
 const valid=lines.filter(l=>l.start<duration);const warnings:string[]=[];
 if(valid.length!==lines.length)warnings.push('部分歌词时间超出音频长度，已忽略；请确认歌曲与歌词匹配。');
 if(!valid.length)throw new Error('歌词时间均超出音频长度，请导入匹配的 LRC。');
 return {lines:valid,warnings};
}
