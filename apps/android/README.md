# Android 工程

本目录使用 Capacitor 包装共享网页界面，并通过 Kotlin / Media3 适配本机音频。日常入口、当前开发分支和下载地址见 [项目首页](../../README.md)。

## 安装测试版

手机用户直接到 [GitHub Releases](https://github.com/cosmos-zhan/anisong-learning-app/releases) 的 Pre-release 下载 APK。不要安装源码 ZIP。公开包只有原创示例，私人歌曲可本地导入；签名与覆盖更新限制见 [发布指南](../../docs/android-previews.md)。

## 构建与验证

环境需要 Node.js 24、JDK 21、Android SDK 36。先切换到项目首页注明的当前开发分支；新版完整门槛为 `npm run android:check`，包括前端检查、Capacitor 同步、原生单测和 debug APK。

主分支原有基线也可独立检查：

```bash
npm ci
npm run check
npx cap sync android
bash apps/android/gradlew -p apps/android :app:testDebugUnitTest :app:assembleDebug
```

APK 位于 `apps/android/app/build/outputs/apk/debug/app-debug.apk`。文档 PR 同样运行网页检查和完整 Android 构建。具体代码模块的验收记录以对应构建的源提交为准。

签名 key、本机 SDK 路径和用户素材不提交到 Git，不作为 Actions 或 Releases 附件。当前钢琴与新版界面的功能验收仍在 PR #3，本次项目首页整理不合并该功能 PR。
