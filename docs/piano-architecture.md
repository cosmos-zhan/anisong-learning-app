# 钢琴 P0：架构与恢复

正式范围以 [上传的原任务书](piano-requirements.md) 为准。钢琴在原仓库迭代，入口 `#piano`；歌词入口 `#lyrics`。第一版不自动同步歌词与乐谱。

## 模块边界

| 文件 / 目录 | 职责 |
| --- | --- |
| `packages/core/song.ts` | 共享歌曲身份、标题与乐谱关联；两种练习分别保存进度 |
| `packages/piano/musicxml.ts` | MusicXML/MXL 导入、大小限制、声部/音符/休止/拍号/调号/tempo map；显式标记不支持元素 |
| `packages/piano/types.ts` | Score、NoteEvent、PracticeRange、PianoSession；四分音符为 480 ticks |
| `packages/piano/timeline.ts` | 闭区间小节范围、静音间隙、跨小节延音、tempo map 积分和反算 |
| `packages/piano/controller.ts` | 唯一练习状态机；试听调度、等待真实触键、暂停/变速/模式切换的取消 |
| `packages/piano/audio.ts` | 真正创建 AudioContext / OscillatorNode / GainNode；叠加泛音及衰减包络，无音频样本 |
| `packages/piano/storage.ts` | IndexedDB 原始谱副本；localStorage 练习会话 |
| `apps/web/src/piano/engraver.ts` | OSMD SVG 排版，按小节/谱表/声部/节拍映射到事件 |
| `apps/web/src/piano/ScoreView.tsx` | 谱面小节点击、范围淡色、当前音符着色与辅助标签 |
| `apps/web/src/piano/Keyboard.tsx` | 每根手指独立声音 ID、黑键层级、按下/松开/取消、键盘无障碍输入 |
| `apps/web/src/components/Feedback.tsx` | 原学唱反馈对话框的共享实现；本地预览、可编辑报告、GitHub 预填 |

## 时间与声音

钢琴不使用歌曲录音的秒数坐标。解析器把 divisions 转为 PPQ=480 ticks，小节范围使用稳定小节 ID；原歌词模块继续使用原曲秒数。

试听把同一份 `Step[]` 交给调度与高亮。音频依据 `AudioContext.currentTime`，每 20 ms 检查、向前排约 120 ms 的声音，使用 `oscillator.start(when)`；高亮也由该音频时钟反算 tick。系统定时器只负责补排，不生成虚假的播放进度。主线程繁忙仍会有延迟，未承诺采样级同步。

相对速度改变 tick 到秒的映射，MIDI 音高和振荡器频率不变。tempo map 内的速度变化按段积分。跨小节延音合并一次发音，同时保留各个写定音符供高亮；范围若从延音的后半部分开始，则重新起音。暂停后恢复会对尚未结束的音重新起音，保持剩余时值。

等待模式完全不启用试听定时器。只有处于 waiting 状态的正确 `press(pointerVoiceId, midi)` 才推进一次；错键仍发声但保持目标，按住不连发。休止及隐含空白统一停下，由明确的“下一步（休止）”按钮推进。延音链只需一次正确触键。此模式练音高，不评判触键节奏或持续时长。

自由弹奏无自动推进。换模式、范围、声部、重练、离开模块、后台、resize 均取消队列并释放声音；异步启用音频以 generation 令牌防止旧操作复活。系统音频挂起会将界面改为声音未启用。琴键处理 pointerup/cancel/lostcapture、窗口 blur、隐藏、卸载与音域变化。

## 导入边界

支持 score-partwise，常规拍号、divisions、backup/forward、升降号、附点与实际 duration、弱起 implicit 小节、速度变化、选定谱表/voice、延音。MusicXML 是唯一结构化来源，MXL 解压后读取 container 声明的根谱文件。限制：原文件 4 MB、单个 XML 2 MB、解压总计 8 MB、最多 256 ZIP 项 / 64 乐器 / 2000 小节 / 30000 音符；拒绝实体定义、非法 ZIP 路径、缺失根谱和损坏 XML。不执行 XML 指定的外部资源，渲染前移除图片、链接与封面信息。

选定乐器的全部谱表/声部仍交给 OSMD 显示。选定轨道若有和弦、重叠、倚音、移调乐器、微分音或非定音高则禁止自动试听/等待练习，可看原谱、换轨道或自由弹奏。反复、跳房子、D.C./D.S. 不展开，必须勾选“按书写顺序练习”后才可播放；装饰、踏板、力度与表情不完整演奏，提示保留。不要声称可播放任意专业全谱。首个含速度标记声部提供统一 tempo map，声部间冲突时显示警告。

## 数据与隐私

歌曲元数据用 localStorage。乐谱副本用 IndexedDB `anisong-scores/scores`；复合键为歌曲 ID + 内容指纹，防止同谱关联不同歌曲时覆盖。内容指纹只用于本地识别，不是安全散列。练习会话键 `anisong:piano:<歌曲ID>:<谱ID>` 保存 part/track、起止小节 ID、tick、模式、速度、循环、辅助标签和时间；每秒保存，pagehide/后台/卸载即时保存。不会自动恢复播放。

导入解析失败保留上一份谱。存储不可用时仍能临时练习，并明确提示刷新可能丢失。浏览器清理站点数据会删除副本，不提供云端谱库或文件备份保证。歌词模块原来的音频仍需刷新后重新导入。

反馈只含构建 SHA、UA、模块、谱格式/指纹、声部序号、范围、速度、模式、循环、tick 与音频状态等白名单快照。不包含曲名、文件名、文件路径、XML、歌词或录音。点击反馈不会自动发送；用户编辑并在 GitHub 确认提交。

## 新会话恢复

1. 克隆原仓库；PR #3 未合并时先 `git switch --track origin/feature/piano-p0`，合并后使用 main；读 `AGENTS.md`、本页、`piano-requirements.md`、`piano-delivery.md`、`known-issues.md`。
2. 从 main 建 feature/fix 分支。Node 24、`npm ci`、`npm run check`。提交前检查无商业曲谱、令牌、dist 或 node_modules。
3. 核心回归在 `tests/piano-*.test.*`。改调度须覆盖取消竞态；改解析须加真实结构夹具；不能用定时动画替代声音或触键判定。
4. 发布沿用 `.openai/hosting.json` ID。GitHub 与 Sites 源码仓库不同，发布构建应明确使用实际 GitHub SHA，并在交付记录保存映射。先同步完整源码，再构建并上传产物，保留 Site 原来的访问范围。
5. CI 通过后，按手机测试表记录真实 Android / Chrome 版本、听感与排版；未做的项目始终保留“待测”。
