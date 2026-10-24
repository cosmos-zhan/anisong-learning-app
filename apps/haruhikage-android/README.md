# 春日影 · 七声部分轨播放器（Android）

原生 Android WebView 壳 + 完整离线 HTML/Web Audio 合成播放器。基于用户上传的《春日影 总谱 (MyGO!!!!! ver. - CRYCHIC)》MusicXML 140 小节、7 声部。独立 App 包名 `io.github.cosmoszhan.haruhikage`，不修改 Anisong Learning App 的现有功能。

## 功能

- 7 条声部：独奏 S、静音 M、独立音量、全部重置
- 播放 / 暂停 / 停止 / 跳转、0.5～1.5 倍播放
- 设置起止小节并循环、按声部查看钢琴卷帘
- 合成音色，非官方录音；后台暂停；数据完全离线，不需要互联网权限

## 构建

前提：Android SDK 35、JDK 17、Gradle 8.11.1+，Android Gradle Plugin 8.9.2。

```bash
gradle :app:assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

本源代码目录也可放在 GitHub Actions 执行 `gradle -p apps/haruhikage-android :app:assembleDebug`，对应仓库的 `.github/workflows/haruhikage-apk.yml` 负责自动构建。

## 图标

`tools/make_icon.py` 支持将用户提供的合法可用专辑封面 PNG/JPG 转为 Android 密度资源。在未能获取原始图的环境，项目提供**花朵风格临时图标**，这与官方封面不同。CI 会优先从 `tools/cover-url.txt` 指定的 CRYCHIC《春日影》封面下载并替换图标；网络失败不会假装已使用官方封面。图像著作权归原权利人所有，仅供个人演示，不建议作为公开商店图标分发。

## 已验证与尚未验证

- 之前演示网页曾在桌面 Chromium 模拟手机视口通过控制逻辑操作测试。
- 本次工作对打包源码、HTML 包含音轨、小节、权限及 icon 资源做静态检查。
- **本环境没有 Android SDK，因此源码打包并不等于 APK 已构建，也不是 Android 16 真机验收。**
