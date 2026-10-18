# Anisong Learning App · P0

面向 Android 手机的歌词片段练习与钢琴学谱 App。React + TypeScript + Vite，共享歌曲、版本、反馈与 CI；学唱使用音频片段，学谱使用结构化乐谱生成真实声音。

**正式验收依据：** [歌词任务书](docs/requirements.md) · [钢琴模块任务书 Piano P0 v1.0](docs/piano-requirements.md)。AI 识别、简谱、外接 MIDI 与商业曲库不在本轮范围。

**默认试用歌曲：** [春日影（CRYCHIC ver.）整曲试听](https://anisong-learning-lab.woolly-mochi-2205.chatgpt.site/?song=haruhikage-crychic#lyrics)。私有测试站已接入用户提供的 MP3 和 42 句 LRC，打开即可点句循环，或点“播放整曲”，无需重新导入。钢琴页已接入用户提供的 7 声部、140 小节 MXL 总谱，可直接点小节试听原轨（含和弦），等待弹对仍使用单音练习，见 [试用边界](docs/private-score.md)。[素材状态与操作](docs/haruhikage-trial.md) · [私有音频构建与恢复](docs/private-audio.md)。录音、歌词和该曲谱不进入 GitHub；普通克隆/CI 不带这些私人素材，仍可本地导入。

**手机反馈修复：** [歌词跳转与谱面兼容修复记录](docs/mobile-bugfixes.md)（完整缓冲后按句跳转；每屏8小节，精细排版失败自动显示兼容谱）。

**钢琴手机入口：** [现有测试站](https://anisong-learning-lab.woolly-mochi-2205.chatgpt.site/#piano)（同一 ChatGPT 账号）。默认载入《春日影》用户曲谱；“自动试听”下点小节即可听当前轨道，包括和弦；“等待弹对”限单音，可明确选择最高音单音练习。从曲库选择「小小的练习曲」可练习八小节 CC0 谱，也可导入 `.musicxml` / `.xml` / `.mxl`。详见 [钢琴手机验收](docs/piano-mobile-testing.md)、[架构与恢复](docs/piano-architecture.md)、[交付记录](docs/piano-delivery.md)。

**界面 R1（0.3.0）已接入：** 练习 / 曲库 / 设置主导航、统一歌曲详情与资料关联、独立学唱 / 钢琴练习页、横屏抽屉和本机练习恢复。见 [新版页面、架构与手机验收](docs/ui-r1.md)。

## 开始练习

私有测试站打开练习首页；在「曲库 → 春日影」点整曲试听，或进入学唱 / 钢琴练习。在曲库选择「小小的练习曲」可切换 CC0 功能示例。导入音频后，即使没有 LRC 也可试听整曲；导入对应 `.lrc` 后，点歌词立即播放并循环该句。「多句连续」依次点起始与结束句，可反向选择。页面内本地导入的音频、歌词与路径不会上传；内置 MP3 是用户在 Work 上传后明确要求加入私有预览的文件。

演示为 35.5 秒原创器乐，LRC 标记与音乐乐句边界匹配。第 2 行日文只是任务书中的界面示例，音频没有演唱这句文字；不可把演示当成已完成日文歌词对齐验证。第 2 乐句 16.3–21.1 秒，0.75× 理论耗时 6.4 秒。真实歌曲的歌词对齐由用户本地导入匹配的 LRC 验证。

## 云端恢复与开发

需要 Node.js 24（最低 22.13）。完整源码已进入 main；在新的云端环境执行：

```bash
git clone https://github.com/cosmos-zhan/anisong-learning-app.git
cd anisong-learning-app
npm ci
npm run check
npm run dev
```

钢琴 PR #3 尚待手机验收时，克隆后先执行 `git switch --track origin/feature/piano-p0`；合并后直接使用 main。

目标仓库已创建并授权，PR #1 已在网页与 Android CI 通过后合并 main。实际交付状态见 [docs/delivery.md](docs/delivery.md)。`npm run dev` 是云端开发用，不是长期手机预览。默认端口 4173，正式网页使用静态 `dist/`，无需后台服务。

- `npm run typecheck`：TypeScript 严格类型检查。
- `npm run lint`：ESLint。
- `npm test`：Vitest，包含业务、音频适配器与 React DOM 交互测试。
- `npm run build`：生成构建 SHA / 分支 / 时间，再构建 `dist/`。
- `npm run android:sync`：构建共享前端并同步原生项目。
- `npm run android:debug`：构建 debug APK，需要 JDK 21、Android SDK 36。

`main` 用于稳定版本；后续变更在 `feature/*` / `fix/*`，开 PR，CI 通过、手机预览复测后合并。不要把未经手机验证的体验标记为真机验收通过。

## 工程结构

| 目录 | 内容 |
| --- | --- |
| `apps/web/src` | React 手机界面、导入、反馈 |
| `packages/core` | LRC 解析、范围校验、Controller、诊断报告 |
| `packages/piano` | MusicXML/MXL、PPQ 时间线、练习控制、Web Audio 合成钢琴、本地乐谱保存 |
| `packages/audio-web` | HTMLAudioElement 真实播放与独立边界计时 |
| `packages/audio-native` | Capacitor JS 桥接 |
| `apps/android` | Capacitor Android、Media3 插件、Gradle wrapper |
| `public/demo` | CC0 原创音频、LRC、版权说明 |
| `tests` | Vitest 业务与交互回归测试 |
| `.github/workflows` | push / PR 网页检查、手动 / tag APK 构建 |
| `docs` | 架构、部署、手机测试、反馈、交接、已知问题 |

阅读：[架构](docs/architecture.md) · [手机测试](docs/mobile-testing.md) · [反馈](docs/feedback.md) · [部署](docs/deployment.md) · [维护与交接](docs/maintenance.md) · [已知问题](docs/known-issues.md) · [测试证据](docs/test-results.md)。

源码 MIT；自制演示音频与八小节钢琴谱 CC0；OSMD 为 BSD-3-Clause，fflate 为 MIT，见 [第三方许可](docs/piano-third-party.md)。无需客户端密钥，不包含音频上传、录音或云账号。
