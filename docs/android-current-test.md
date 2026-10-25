# 当前钢琴/学唱版 Android 测试包

本包复用当前网页修复版，保留原有歌词循环、MusicXML/MXL、钢琴原轨和弦试听与单音等待练习。Android 学唱使用 Media3，钢琴仍使用同一前端的 Web Audio 合成器。

## 此次 Android 适配

旧原生桥只允许旧示例 WAV 或文件选择器的 content URI，会拒绝前端传入的内置 MP3。现在只额外允许预定目录下、带 12 位十六进制内容哈希的内置录音 MP3；拒绝网络地址、其他 assets、路径穿越与非音频素材。metadata 读取改为打开真实匹配的 asset，不再固定读取旧演示文件。MP3 在 APK 中不压缩，供原生文件描述符读取。

Android 默认版本名跟随当前前端为 0.2.0；测试构建可用 VERSION_NAME / VERSION_CODE 设置明确版本。包名继续为 io.github.cosmoszhan.anisong，最低 Android 7，目标 Android 16。

## 私人构建与恢复

普通 GitHub 克隆与 CI 不带私人歌曲、歌词和乐谱。要重建本次内置素材测试包，先按 private-audio.md / private-score.md 将原始 MP3、LRC、MXL 恢复到忽略的 private-media 目录；不要将它们或包含它们的 APK 发布到公开 GitHub。

使用 JDK 21、Android SDK 36 / Build Tools 36.0.0，执行：

```bash
ANISONG_REQUIRE_BUNDLED_AUDIO=1 ANISONG_REQUIRE_BUNDLED_LYRICS=1 ANISONG_REQUIRE_BUNDLED_SCORE=1 npm run check
npx cap sync android
VERSION_CODE=2026101801 VERSION_NAME=0.2.0-test.1 apps/android/gradlew -p apps/android :app:testDebugUnitTest :app:assembleDebug
```

构建前确保 GitHub 提交已推送，version.json 应记录真实源码 SHA。最终 APK 额外检查签名、包名、版本、压缩方式、前端资源与三份原始素材完整哈希；原生单元测试报告在 apps/android/app/build/test-results/testDebugUnitTest。

## 手机安装和试用

下载 APK 后点击安装，并按系统提示允许当前下载工具安装应用。如果旧版签名不一致导致无法覆盖，先保留旧版需要的练习记录，再卸载旧版重装；卸载会删除旧应用的本地数据。

打开默认春日影，试整曲、点击一句歌词、单句/多句循环与暂停。再切钢琴，横屏，选择自动试听并点击第1小节；试5–8范围与循环、暂停、0.75倍速。等待弹对仍限单音，含和弦原轨不会假装进行和弦判定。可用此包自带的歌曲/谱离线测试，反馈提交和官方参考链接需要网络。

debug 签名仅供本次测试。自动化检查和签名验证不能替代 Android 16 物理手机的实际发声、触控、WebView 布局、权限和系统中断验收；尚未声称这些项目通过。
