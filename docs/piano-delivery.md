# 钢琴 P0 交付与未完成事项

仓库沿用 [cosmos-zhan/anisong-learning-app](https://github.com/cosmos-zhan/anisong-learning-app)，变更集中于 [PR #3](https://github.com/cosmos-zhan/anisong-learning-app/pull/3)。正式依据为 [Piano P0 v1.0](piano-requirements.md)。

首个功能提交：[`89420b02278b`](https://github.com/cosmos-zhan/anisong-learning-app/commit/89420b02278b29174ec9e8fc3b8618543695fe53)。后续硬化和文档提交见 PR 的 commits 页。

固定手机入口：[钢琴学谱](https://anisong-learning-lab.woolly-mochi-2205.chatgpt.site/#piano)。复用原 Site 的私有访问范围；需同一 ChatGPT 账号。页面下方显示构建使用的真实 GitHub SHA，反馈使用同一版本。发布状态、Site 源码 SHA 与 GitHub SHA 的实际映射在 PR #3 正文及交付回复中记录；后续发布必须重新核对，不能只凭固定 URL 推断版本。代码通过 CI 后保留 PR 供手机验收，再合并到 main。

## 已实现

同 App 双入口与歌曲关联；横屏谱面/控件/琴键；可导入 `.musicxml/.xml/.mxl`；OSMD 真实五线谱、当前音符与小节范围高亮、固定唱名/音名；Web Audio 合成钢琴、黑白键、多指、按下/释放；单小节/多小节闭区间循环、暂停恢复、重练、前后小节、相对四档速度、tempo map、休止与延音；试听、真实触键等待、自由弹；本地原谱副本及设置恢复；白名单反馈快照、可编辑复制报告与 GitHub 预填；CI 与恢复文档。

## 仍需完成的验收 / 授权

- **手机验收未执行**：按 [完整手机清单](piano-mobile-testing.md) 验证 Android 16 排版、真实声音、音高、双指、旋转/后台、刷新恢复。自动化覆盖见 [测试证据](piano-test-results.md)。本轮是可供验收的实现，不能据此宣称正式真机全项通过。
- **Cloudflare Pages 未授权**：现有 GitHub CI 已用，固定 Site 可持续手动发布；main/PR 自动 Pages 预览仍未建立。手机登录 Cloudflare，Workers & Pages → Pages → Connect to Git，仅授权本仓库；生产 main、构建 `npm run build`、产物 `dist`、Node 24，预览包括 feature/* 与 fix/*。合并前钢琴位于 feature/piano-p0 分支，对该分支使用真实预览 URL。复制平台实际返回 URL。不要在聊天或源码粘贴 token。详见原 [部署指南](deployment.md)。
- **Android APK**：本轮优先浏览器闭环，没有更新 APK，也没有将旧学唱 APK 说成钢琴版。共享前端未来可通过既有 Android workflow 手动构建；钢琴音频仍是 WebView Web Audio，须独立实测后决定是否原生适配。

## 已知限制

仅严格练习一个选定轨道的单音旋律。和弦/重叠/倚音/微分音/移调乐器/非定音高轨道有明确阻止；原谱尽可能保留。反复/跳转需确认按书写顺序，不展开反复。复杂装饰、力度、踏板与表情不完整试听。score-timewise、无 duration 或异常拍号应导出常规 score-partwise 后重试。不同声部 tempo 冲突统一采用首个含速度标记的声部并警告。

合成音色以低延迟、无采样授权依赖为目的，并非录音钢琴；设备音频栈/蓝牙/主线程负载会影响延迟。改尺寸主动暂停；极矮视口谱面可能需内部纵向滚动。跨小节延音在等待模式按一次，休止需手动下一步，未做节奏评分。刷新不自动播放，浏览器数据清理会删除保存，学唱音频仍需重选。

P1 未做：完整简谱切换、独立唱名谱、MIDI 导入、和弦/左右手、外接 MIDI、节拍器、采样音色、AI/PDF/图片识谱、歌词和乐谱自动同步。没有以这些扩展阻塞 P0。


## 2026-10-17 默认歌曲更新

用户指定默认《春日影（CRYCHIC ver.）》，入口与缺少素材的明确状态见 [试用说明](haruhikage-trial.md)。原八小节 CC0 功能示例单独保留。新增 8 项回归，本地共 78 项通过；实际手机播放及外部视频可用性仍待实测。

## 2026-10-17 用户曲谱接入

已接入用户提供的 63 小节 MusicXML，原始谱面与可主动选择的最高音单音练习分开标注。真实 OSMD 渲染与文件检查、速度/长度限制、手机操作和恢复方法见 [private-score.md](private-score.md)。完整和弦判定、左右手演奏、录音同步仍未实施。

## 手机反馈修复与新总谱

用户已报告旧版实际跳转与谱面错误。最新处理记录、验证边界和新的140小节总谱见 [mobile-bugfixes.md](mobile-bugfixes.md)，此前63小节与缺速度结论仅适用于旧文件。
