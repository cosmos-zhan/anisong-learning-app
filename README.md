# Anisong Learning App

用喜欢的动画歌曲，练习一句歌词、一段旋律。

一款面向手机的音乐练习工具：导入本地音频和歌词，反复练习选中的片段；或导入 MusicXML 乐谱，边看五线谱边用虚拟钢琴练习。

[下载 Android 测试版](https://github.com/cosmos-zhan/anisong-learning-app/releases) · [网页试用](https://anisong-learning-lab.woolly-mochi-2205.chatgpt.site) · [报告问题](https://github.com/cosmos-zhan/anisong-learning-app/issues/new/choose)

> 项目处于 **Alpha 开发阶段**。Releases 中标注 **Pre-release** 的 APK 用于体验和反馈，不代表正式版。网页试用目前需要项目所有者的 ChatGPT 账号；公开 APK 可独立使用。

## 功能

| 歌词学唱 | 钢琴学谱 |
| --- | --- |
| 导入本地音频与 `.lrc` 歌词 | 导入 `.musicxml`、`.xml`、`.mxl` 乐谱 |
| 点击单句试听并循环 | 查看五线谱、选择声部与小节 |
| 选择连续多句反复练习 | 单小节或连续小节循环试听 |
| 调节速度并保持音高 | 自动试听、等待弹对、自由弹奏 |
| 微调片段的起止时间 | 支持黑白键与多点触控的发声键盘 |
| 保存本机素材和练习设置 | 当前音符高亮、音名与固定唱名辅助 |

两种练习共用曲库、歌曲资料和反馈入口。练习中可以生成包含版本、选中片段、速度等信息的报告，再提交到 GitHub Issues。

## 下载与安装

1. 在手机打开 [Releases](https://github.com/cosmos-zhan/anisong-learning-app/releases)，选择最新的 **Pre-release**。
2. 展开 **Assets**，下载名称以 `anisong-` 开头的 `.apk`。无需下载源码压缩包或解压 Actions 产物。
3. 打开 APK，并按 Android 提示允许当前浏览器安装应用。
4. 选择内置原创示例，或在曲库中导入自己的素材。

公开测试包只包含 CC0 原创示例。春日影等用户私人音频、歌词和曲谱不进入源码或公开 APK，可在本机导入；私有网页试用中的素材与公开包不同。

Alpha 包使用调试签名。配置固定 CI 签名后，同签名且版本码递增的包可覆盖更新；从私人测试包切换、或未配置固定签名时，可能无法覆盖安装。请保留有练习记录的旧版。详见 [测试版发布与签名](docs/android-previews.md)。

## 开始练习

**学唱：** 曲库 → 选择歌曲 → 歌词学唱 → 点击一句歌词。需要练习多句时，选择起始句和结束句，再调节速度或片段边界。

**学谱：** 曲库 → 选择歌曲 → 钢琴学谱 → 选择声部与小节范围 → 开始练习。自动试听演奏选中轨道；等待弹对根据真实触键推进，目前限单音轨。和弦轨可试听，或明确选择最高音单音练习。

手机横屏适合演奏；竖屏会将谱面分行，密集乐段可在谱面内滑动。第一次弹琴需点击“启用声音”，也可直接点小节试听。

## 开发

技术栈：React、TypeScript、Vite、Capacitor、Kotlin / Media3、OpenSheetMusicDisplay、Web Audio。

需要 Node.js 24。Android 构建另外需要 JDK 21、Android SDK 36。

```bash
git clone https://github.com/cosmos-zhan/anisong-learning-app.git
cd anisong-learning-app
# 钢琴与新版界面当前位于 PR #3，合并前使用此分支：
git switch --track origin/feature/piano-p0
npm ci
npm run dev
```

| 命令 | 用途 |
| --- | --- |
| `npm run check` | 类型、Lint、核心测试、发布流程测试与网页构建 |
| `npm run test:browser` | 真实 Chromium 中的手机比例、旋转、谱面和触键交互 |
| `npm run android:check` | 完整 App 检查、Capacitor 同步、原生测试与 debug APK |
| `npm run build` | 输出网页静态文件到 `dist/` |

浏览器测试首次需运行 `npx playwright-core install --with-deps chromium`。APK 输出到 `apps/android/app/build/outputs/apk/debug/app-debug.apk`。

### 版本与测试包

版本号位于 `package.json`，Android 安装版本码位于 `.github/android-preview.json`。更新两者并推送到发布分支后，Actions 会在完整 App 构建通过后，将新版本的 APK、SHA-256 校验文件和构建信息发布为 **Pre-release**。已发布版本不覆盖；普通 PR 只检查与构建。

当前开发发布分支为 `feature/piano-p0`；合并后 `main` 同样自动发布。规则、权限与签名恢复见 [发布指南](docs/android-previews.md)。

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `apps/web` | 手机网页与共享界面 |
| `apps/android` | Capacitor Android、Media3 音频适配 |
| `packages/core` | 歌曲、歌词、片段范围、反馈与播放器状态 |
| `packages/piano` | 乐谱解析、音乐时间线、练习状态与声音合成 |
| `packages/audio-*` | 浏览器与原生音频接口 |
| `public/demo` | CC0 原创音频、歌词与示例乐谱 |
| `scripts` | 构建、产物验证与测试版发布 |
| `tests` | 核心逻辑与界面交互测试 |
| `docs` | 架构、测试、部署和维护文档 |

## 当前边界

- Android 学唱与钢琴自动试听支持系统后台媒体服务；网页后台受浏览器限制，交互弹奏仍在前台进行。见 [本次修复与手机验收](docs/background-audio-navigation.md)。
- Android16 真机听感、触控手感和特定 WebView 行为仍需手机测试；CI 通过不等于真机验收。
- 等待弹对暂不支持双手和弦；简谱、MIDI 导入、外接 MIDI 键盘和 AI 识谱尚未实现。
- 歌词与乐谱共用歌曲管理，暂不自动同步。
- 网页循环可能存在解码或调度间隙；当前不提供锁屏后台练习。
- Cloudflare Pages 账号接入尚未完成；现有网页使用独立私有测试站。

完整限制见 [已知问题](docs/known-issues.md)。

## 文档与反馈

| 使用与测试 | 开发与维护 |
| --- | --- |
| [手机测试](docs/mobile-testing.md) | [架构说明](docs/architecture.md) |
| [钢琴测试](https://github.com/cosmos-zhan/anisong-learning-app/blob/feature/piano-p0/docs/piano-mobile-testing.md) | [钢琴架构](https://github.com/cosmos-zhan/anisong-learning-app/blob/feature/piano-p0/docs/piano-architecture.md) |
| [问题反馈](docs/feedback.md) | [云端恢复与交接](docs/maintenance.md) |
| [横竖屏验收](https://github.com/cosmos-zhan/anisong-learning-app/blob/feature/piano-p0/docs/ui-r1-piano-responsive.md) | [网页部署](docs/deployment.md) |
| [歌词需求](docs/requirements.md) | [Android 测试版发布](docs/android-previews.md) |
| [钢琴需求](https://github.com/cosmos-zhan/anisong-learning-app/blob/feature/piano-p0/docs/piano-requirements.md) | [开发中的 PR #3](https://github.com/cosmos-zhan/anisong-learning-app/pull/3) |

遇到问题时，优先使用播放器内的“反馈”，附复现步骤和截图；提交前可查看自动收集的非敏感练习信息。本机导入的音频、歌词与乐谱不会通过反馈上传。

## 许可证

源码使用 [MIT License](LICENSE)。内置原创音频与示例谱使用 CC0；第三方许可见 [依赖说明](https://github.com/cosmos-zhan/anisong-learning-app/blob/feature/piano-p0/docs/piano-third-party.md)。请仅导入你有权使用的素材。
