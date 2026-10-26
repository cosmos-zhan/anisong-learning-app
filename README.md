# Anisong Learning App

用喜欢的动画歌曲，练习一句歌词、一段旋律。

一款面向手机的音乐练习工具：导入本地音频和歌词，反复练习选中的片段；或导入 MusicXML 乐谱，边看五线谱边用虚拟钢琴练习。

[下载 Android 测试版](https://github.com/cosmos-zhan/anisong-learning-app/releases) · [网页试用](https://anisong.sekifufu.xyz/) · [报告问题](https://github.com/cosmos-zhan/anisong-learning-app/issues/new/choose)

> 项目处于 **Alpha 开发阶段**。Releases 中标注 **Pre-release** 的 APK 用于体验和反馈，不代表正式版。上方网页试用为公开站点，无需项目所有者的 ChatGPT 账号。

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
4. 在“曲库 → 下载管理”默认查看春日影，直接点击下载音频、歌词和乐谱，无需访问码；也可试用原创示例或导入本机素材。

安装后的 App 可在“设置 → 应用更新”检查包含 Alpha 在内的新版本，并在应用内下载安装包、校验后打开 Android 安装窗口。网页也提供检查和 APK 下载入口。详见 [应用更新与默认素材源](docs/app-updates.md)。

当前版本目标为 **0.6.7-alpha.1**：网易云登录后优先检查下载接口，文件失败时继续检查其他可用音质；支持 MP3 / FLAC / M4A / AAC 本机导入，并显示具体失败阶段与状态码。保留短信 / 扫码登录修复、Via 首屏滚动兼容、在线歌曲下载和应用内更新。详细行为与验证范围见 [网易云导入](docs/netease-import.md)。

公开测试包只内置 CC0 原创示例。春日影的音频、歌词正文和曲谱文件由独立素材服务提供，按所有者授权公开读取，不进入 GitHub 源码或 APK；默认目录无需访问码。

Alpha 包使用调试签名，当前已配置固定 CI 签名。同签名且版本码递增的包可覆盖更新；历史 0.4.2 / 0.5.0 临时签名包与当前签名不同。请保留有练习记录的旧版。详见 [测试版发布与签名](docs/android-previews.md)。

## 下载管理

首页或曲库 → 下载管理，默认显示春日影，点击“下载到本地”即可下载音频、歌词和乐谱。“下载任务”显示真实进度、排队、取消和失败重试；切换 App 内页面继续下载。“已下载”可离线进入学唱/学谱，或移除下载副本。CC0 原创示例源仍可切换使用。服务需求及验收见 [下载模块](docs/download-manager.md)。

**新增可下载歌曲无需重发 APK**：将音频、可选 LRC / MXL 上传至素材服务，再更新在线目录；用户刷新下载列表即可看到。手机提供文件和歌曲标题后，可由维护者完成上传与验证。专用上传台支持网易云分享链接解析并发布；Android App 的同名入口仅下载并导入本机，不具备管理员上传权限。完整步骤见 [新增歌曲](docs/adding-songs.md)。

Android App 还可在下载管理展开“从网易云分享链接导入”，按需登录网易云，再解析歌曲并点击“下载并导入本机”。登录仅用于网易云实际提供的完整版；只有试听或没有相应权限时会明确提示。音频与可用的原词、罗马音、翻译将保存到“已下载”，可离线学唱；同一歌曲重复导入会更新已有条目并保留本机乐谱。步骤与可获取范围见 [网易云导入](docs/netease-import.md)。

默认源无需配置；自定义源只需配置一次。现有 `.anisong.zip` 可在“本地导入与存储”补充导入。见 [目录格式](docs/media-downloads.md)、[素材服务与可选私人部署](docs/private-media-service.md)和 [素材包](docs/media-packages.md)。

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
# 当前开发与预发行分支：
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

当前 APK 发布分支为 `feature/piano-p0`；`main` 同步源码并运行完整检查与后台素材准备，不自动发布 APK。规则、权限与签名恢复见 [发布指南](docs/android-previews.md)。

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
| `services/media-source` | 独立受保护的私人素材服务 |
| `tests` | 核心逻辑与界面交互测试 |
| `docs` | 架构、测试、部署和维护文档 |

## 当前边界

- Android 学唱与钢琴自动试听支持系统后台媒体服务；网页后台受浏览器限制，交互弹奏仍在前台进行。见 [本次修复与手机验收](docs/background-audio-navigation.md)。
- Android16 真机听感、触控手感和特定 WebView 行为仍需手机测试；CI 通过不等于真机验收。
- 等待弹对暂不支持双手和弦；简谱、MIDI 导入、外接 MIDI 键盘和 AI 识谱尚未实现。
- 歌词与乐谱共用歌曲管理，暂不自动同步。
- 网页循环可能存在解码或调度间隙；当前不提供锁屏后台练习。
- 网页试用主入口为公开站点 `anisong.sekifufu.xyz`；原所有者私有测试站保留作内部测试，不要求公众登录所有者账号。

完整限制见 [已知问题](docs/known-issues.md)。

## 文档与反馈

| 使用与测试 | 开发与维护 |
| --- | --- |
| [手机测试](docs/mobile-testing.md) | [架构说明](docs/architecture.md) |
| [钢琴测试](https://github.com/cosmos-zhan/anisong-learning-app/blob/feature/piano-p0/docs/piano-mobile-testing.md) | [钢琴架构](https://github.com/cosmos-zhan/anisong-learning-app/blob/feature/piano-p0/docs/piano-architecture.md) |
| [问题反馈](docs/feedback.md) | [云端恢复与交接](docs/maintenance.md) |
| [横竖屏验收](https://github.com/cosmos-zhan/anisong-learning-app/blob/feature/piano-p0/docs/ui-r1-piano-responsive.md) | [网页部署](docs/deployment.md) |
| [歌词需求](docs/requirements.md) | [Android 测试版发布](docs/android-previews.md) |
| [钢琴需求](https://github.com/cosmos-zhan/anisong-learning-app/blob/feature/piano-p0/docs/piano-requirements.md) | [新增可下载歌曲](docs/adding-songs.md) |

遇到问题时，优先使用播放器内的“反馈”，附复现步骤和截图；提交前可查看自动收集的非敏感练习信息。本机导入的音频、歌词与乐谱不会通过反馈上传。

## 许可证

源码使用 [MIT License](LICENSE)。内置原创音频与示例谱使用 CC0；第三方许可见 [依赖说明](https://github.com/cosmos-zhan/anisong-learning-app/blob/feature/piano-p0/docs/piano-third-party.md)。请仅导入你有权使用的素材。
