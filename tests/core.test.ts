import { describe,it,expect,vi } from 'vitest';
import { parseLrc,validateLyrics } from '../packages/core/lrc';
import { rangeFor,adjustRange,assertRange } from '../packages/core/range';
import { LoopController } from '../packages/core/controller';
import { feedbackReport,issueUrl } from '../packages/core/feedback';
import { TestEngine,lyrics } from './helpers';
describe('LRC 输入',()=>{
 it('解析毫秒、多个时间戳、UTF8 BOM 与元数据',()=>{const r=parseLrc('\uFEFF[ti:test]\n[00:16.30][01:02.003]hello');expect(r.lines).toEqual([{start:16.3,text:'hello'},{start:62.003,text:'hello'}]);});
 it('乱序排序并合并重复时间，空行保留间奏',()=>{const r=parseLrc('[00:21.1]b\n[00:16.3]a\n[00:16.3]c\n[00:30.0]');expect(r.lines[0].text).toBe('a / c');expect(r.lines[2].text).toContain('间奏');expect(r.warnings).toHaveLength(2);});
 it('无效秒数与缺失时间不能当作正常歌词',()=>{expect(()=>parseLrc('hello\n[00:99.00]bad')).toThrow('有效');const r=parseLrc('hello\n[00:01]ok');expect(r.warnings[0]).toContain('第 1 行');});
 it('应用 offset 并拒绝负时间',()=>{const r=parseLrc('[offset:-500]\n[00:00.20]bad\n[00:02.0]ok');expect(r.lines[0].start).toBe(1.5);expect(r.warnings).toHaveLength(1);});
 it('超出音频长度明确提示',()=>{expect(validateLyrics(lyrics,25).lines).toHaveLength(3);expect(validateLyrics(lyrics,25).warnings).toHaveLength(1);expect(()=>validateLyrics([{start:100,text:'bad'}],25)).toThrow('超出');});
});
describe('原曲范围',()=>{
 it('第2句在 0.75 倍下仍是16.3–21.1，耗时6.4',()=>{const r=rangeFor(lyrics,1,1,35.5);expect(r).toEqual({start:16.3,end:21.1});expect((r.end-r.start)/.75).toBeCloseTo(6.4);});
 it('2–4 句连续选择，反向选择相同',()=>{expect(rangeFor(lyrics,1,3,35.5)).toEqual({start:16.3,end:30.7});expect(rangeFor(lyrics,3,1,35.5)).toEqual(rangeFor(lyrics,1,3,35.5));});
 it('最后一句使用音频终点',()=>expect(rangeFor(lyrics,4,4,35.5).end).toBe(35.5));
 it('微调准确到0.1，限制音频边界及最短片段',()=>{expect(adjustRange({start:16.3,end:21.1},'start',.1,35.5).start).toBe(16.4);expect(adjustRange({start:0,end:1},'start',-.1,35.5).start).toBe(0);expect(()=>assertRange({start:1,end:1.1},35.5)).toThrow();expect(()=>assertRange({start:1,end:40},35.5)).toThrow();});
});
async function player(){const engine=new TestEngine();const controller=new LoopController(engine);await controller.load('demo');controller.setLyrics(lyrics);return {engine,controller};}
describe('播放器异步状态',()=>{
 it('选句即播放，暂停与恢复保持原曲位置',async()=>{const {engine,controller}=await player();await controller.select(1);expect(controller.getSnapshot().phase).toBe('playing');engine.position=18;controller.pause();expect(controller.getSnapshot().position).toBe(18);await controller.play();expect(engine.position).toBe(18);controller.dispose();});
 it('变速不修改范围；开关循环不丢位置',async()=>{const {engine,controller}=await player();await controller.select(1,3);await controller.setSpeed(.5);expect(engine.speed).toBe(.5);expect(engine.range).toEqual({start:16.3,end:30.7});await controller.setLoop(false);expect(engine.loop).toBe(false);engine.emit({type:'end'});expect(controller.getSnapshot().phase).toBe('ended');await controller.play();expect(engine.position).toBe(16.3);controller.dispose();});
 it('片段滑动被限制在范围内',async()=>{const {engine,controller}=await player();await controller.select(1);await controller.seek(100);expect(engine.position).toBeLessThan(21.1);await controller.seek(-10);expect(engine.position).toBe(16.3);controller.dispose();});
 it('微调后重新开始，非法边界保留旧范围',async()=>{const {controller}=await player();await controller.select(1);await controller.adjust('start',.1);expect(controller.getSnapshot().range?.start).toBe(16.4);expect(controller.getSnapshot().phase).toBe('playing');await controller.adjust('start',10);expect(controller.getSnapshot().range?.start).toBe(16.4);expect(controller.getSnapshot().error).toContain('0.15');controller.dispose();});
 it('在旧 play 尚未完成时暂停，不被旧 promise 改回播放',async()=>{const {engine,controller}=await player();await controller.select(1,1,false);let finish!:()=>void;engine.play=()=>new Promise<void>(resolve=>{finish=resolve;});const pending=controller.play();controller.pause();finish();await pending;expect(controller.getSnapshot().phase).toBe('paused');controller.dispose();});
 it('快切歌词：旧 setRange 完成不覆盖新选句',async()=>{const {engine,controller}=await player();let finish!:()=>void;const old=engine.setRange.bind(engine);let n=0;engine.setRange=vi.fn((range,loop)=>{old(range,loop);if(n++===0)return new Promise<void>(resolve=>{finish=resolve;});});const first=controller.select(1);await controller.select(3);finish();await first;expect(controller.getSnapshot().range?.start).toBe(25.9);expect(engine.position).toBe(25.9);expect(controller.getSnapshot().phase).toBe('playing');controller.dispose();});
 it('旧歌曲加载不能覆盖新歌曲',async()=>{const {engine,controller}=await player();let finish!:(n:number)=>void;engine.load=vi.fn().mockImplementationOnce(()=>new Promise<number>(r=>{finish=r;})).mockResolvedValueOnce(50);const old=controller.load('old');await controller.load('new');finish(25);await old;expect(controller.getSnapshot().duration).toBe(50);controller.dispose();});
 it('被系统暂停反映到状态，错误日志不包含文件路径',async()=>{const {engine,controller}=await player();await controller.select(1);engine.emit({type:'playing',playing:false});expect(controller.getSnapshot().phase).toBe('paused');engine.emit({type:'error',code:'DECODE'});expect(controller.getSnapshot().phase).toBe('error');expect(controller.getSnapshot().logs[0]).toContain('DECODE');controller.dispose();});
});
describe('反馈隐私',()=>{
 it('包含准确快照但没有歌词、音频名或源地址',async()=>{const {controller}=await player();await controller.select(1);const report=feedbackReport({kind:'Bug',description:'test',steps:'tap',expected:'loop'},controller.getSnapshot(),{sha:'abcdef',branch:'feature/test',builtAt:'now'},'Android',true);expect(report).toContain('abcdef');expect(report).toContain('16.3');expect(report).not.toContain('いつまでも');expect(issueUrl(report,'Bug')).toContain('issues/new');controller.dispose();});
 it('用户可以完全移除诊断',async()=>{const {controller}=await player();const report=feedbackReport({kind:'Bug',description:'test',steps:'tap',expected:'loop'},controller.getSnapshot(),{sha:'SECRET_SHA',branch:'x',builtAt:'now'},'UA',false);expect(report).not.toContain('SECRET_SHA');controller.dispose();});
});
