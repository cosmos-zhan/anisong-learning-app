import type { LyricLine,Range } from './types';
export const MIN_RANGE=0.15;
export function assertRange(range:Range,duration:number):Range {
 if(!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.start<0||range.end>duration+0.00001||range.end-range.start<MIN_RANGE)throw new Error('片段至少需要 0.15 秒，且必须位于音频范围内。');
 return range;
}
export function rangeFor(lines:LyricLine[],first:number,last:number,duration:number):Range {
 const [lo,hi]=[Math.min(first,last),Math.max(first,last)];
 if(!lines[lo]||!lines[hi])throw new Error('请先选择有效歌词行。');
 return assertRange({start:lines[lo].start,end:lines[hi+1]?.start??duration},duration);
}
export function adjustRange(range:Range,edge:'start'|'end',delta:number,duration:number):Range {
 return assertRange({...range,[edge]:Math.round(Math.min(duration,Math.max(0,range[edge]+delta))*100)/100},duration);
}
