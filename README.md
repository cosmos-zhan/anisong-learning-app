# Anisong Learning App · P0

一个面向 Android 手机的歌词片段练习播放器。React + TypeScript + Vite，共享前端，浏览器 AudioEngine 与 Android Kotlin / Media3 AudioEngine。

**需求与验收依据：** [docs/requirements.md](docs/requirements.md)。不包含钢琴、AI 识别、语法分析或商业曲库。

## 开始练习

打开部署后的网页，点「播放」试听原创演示旋律；点歌词立即播放并循环该句。「多句连续」依次点起始与结束句，可反向选择。导入自己的音频后，继续导入对应的 `.lrc` 文件。音频、原始歌词和本地路径不会上传。

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
| `packages/audio-web` | HTMLAudioElement 真实播放与独立边界计时 |
| `packages/audio-native` | Capacitor JS 桥接 |
| `apps/android` | Capacitor Android、Media3 插件、Gradle wrapper |
| `public/demo` | CC0 原创音频、LRC、版权说明 |
| `tests` | Vitest 业务与交互回归测试 |
| `.github/workflows` | push / PR 网页检查、手动 / tag APK 构建 |
| `docs` | 架构、部署、手机测试、反馈、交接、已知问题 |

阅读：[架构](docs/architecture.md) · [手机测试](docs/mobile-testing.md) · [反馈](docs/feedback.md) · [部署](docs/deployment.md) · [维护与交接](docs/maintenance.md) · [已知问题](docs/known-issues.md) · [测试证据](docs/test-results.md)。

源码 MIT；自制演示音频 CC0。无需客户端密钥，不包含音频上传、录音或云账号。
