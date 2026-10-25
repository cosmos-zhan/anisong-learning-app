// Anisong's explicit LRC extensions keep the three texts on one original timeline.
const stamp=/\[(\d+):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g;
function rows(input){
  if(typeof input!=='string')return [];
  const offset=Number(input.match(/\[offset:([+-]?\d+)\]/i)?.[1]??0);
  const result=[];
  for(const raw of input.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const times=[...raw.matchAll(stamp)];if(!times.length)continue;
    const text=raw.replace(stamp,'').trim();if(!text)continue;
    for(const time of times){const ms=Number(time[1])*60000+Number(time[2])*1000+Number((time[3]??'').padEnd(3,'0'))+offset;
      if(Number.isSafeInteger(ms)&&ms>=0&&ms<24*3600000)result.push({ms,text});}
  }
  return result;
}
const timeTag=ms=>`[${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}]`;
export function mergeNeteaseLyrics(payload){
  const byTime=new Map();
  for(const row of rows(payload?.lrc?.lyric)){
    const old=byTime.get(row.ms);
    if(old){if(old.text!==row.text)old.text+=' / '+row.text;}else byTime.set(row.ms,{...row});
  }
  const lines=[...byTime.values()].sort((a,b)=>a.ms-b.ms),warnings=[];
  const counts={original:lines.length,romaji:0,translation:0,unmatchedRomaji:0,unmatchedTranslation:0};
  for(const [field,key,unmatched]of [['romalrc','romaji','unmatchedRomaji'],['tlyric','translation','unmatchedTranslation']]){
    for(const row of rows(payload?.[field]?.lyric)){
      // Prefer exact stamps. Only tolerate a small unique rounding difference;
      // never align by row index, which breaks repeats and missing verses.
      const exact=byTime.get(row.ms),near=exact?[exact]:lines.filter(line=>Math.abs(line.ms-row.ms)<=100);
      if(near.length!==1||near[0][key]&&near[0][key]!==row.text){counts[unmatched]++;continue;}
      near[0][key]=row.text;
    }
    counts[key]=lines.filter(line=>line[key]).length;
    if(counts[unmatched])warnings.push(`${key==='romaji'?'罗马音':'译文'}有 ${counts[unmatched]} 行无法与原词时间戳对应，未强行合并。`);
  }
  if(!counts.original)warnings.push(payload?.nolyric?'网易云标记此曲为纯音乐。':'没有取得带时间戳的原词。');
  if(!counts.romaji)warnings.push('网易云未提供可对齐的罗马音。');
  if(!counts.translation)warnings.push('网易云未提供可对齐的翻译歌词。');
  const lrc=lines.flatMap(line=>[timeTag(line.ms)+line.text,...(line.romaji?[timeTag(line.ms)+'[romaji]'+line.romaji]:[]),...(line.translation?[timeTag(line.ms)+'[translation]'+line.translation]:[])]).join('\n')+'\n';
  if(new TextEncoder().encode(lrc).length>128*1024)throw new Error('合并后的歌词超过 128 KiB，请改用本地歌词文件。');
  return {lrc:lines.length?lrc:'',lines:lines.map(({ms,...line})=>({start:ms/1000,...line})),counts,warnings};
}
