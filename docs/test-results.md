# 实际测试证据

2026-10-13，云端 Linux、Node 24.19.0。

## 已执行

`npm run check`：TypeScript 严格检查通过，ESLint 通过，Vitest **30/30** 通过（3 个文件），Vite production build 通过。

覆盖：LRC 标签 / offset / 乱序 / 重复 / 缺失 / 越界；第2句16.3–21.1 / 0.75× 理论6.4s；多句与反向范围 / 最后行 / 微调 / 超短范围；暂停恢复 / 关闭循环结束 / seek限制 / 快速切换 / 旧播放promise / 旧加载；HTML媒体API循环边界、暂停取消边界计时、系统暂停 / 过期pause事件 / 最后句自然结束；React 单句 / 多句 / 上一句下一句 / 速度 / 微调 / 进度 / 反馈报告及移除诊断 / 反馈输入焦点在位置更新时保持。

`ffprobe`：演示 WAV 可解析，PCM s16le，22050Hz，时长35.500000秒。Python原始生成器生成实际波形，而不是模拟媒体进度。

`npx cap add android` 与 `npx cap sync android`：实际执行成功，Android工程与网页资源已生成。

## 证据边界

Vitest 环境为 jsdom；HTMLAudioElement 用媒体替身隔离验证，React按钮调用真实Controller代码。这些测试**不等同于真实浏览器解码 / 试听验证**。此会话没有可用的浏览器控制技能，未安装或绕过该限制使用浏览器；没有可交付的浏览器截图/录像。

没有物理Android16设备，音高听感、循环停顿、SAF文件选择、来电、蓝牙、后台与缓存刷新均待手机手测。GitHub未建仓库前没有远程CI run，因此本地测试不能叫GitHub CI已通过。

Android Gradle结果与实际交付请看delivery记录，只有实际成功后才标记编译或原生测试通过。

最终新增两个回归场景：自然结束时的pause事件不阻断最后句循环；过期pause事件与更新中的播放器位置不打断新的播放/反馈输入。当前总计30项通过。保留完整Web检查日志于web-check.log.txt。

全新检出恢复验证：另建不共享.git对象的clone，npm ci --offline成功（301个依赖），prepare自动生成版本文件，npm run check再次30/30测试与build通过。恢复过程不依赖旧checkout中的生成文件。

Android首次构建：安装JDK21/SDK36/Gradle8.14.3后，Gradle testDebugUnitTest assembleDebug实际BUILD SUCCESSFUL（105任务）；应用原生坐标/范围测试2/2通过。后续最终包会同步最新前端并重新执行限定的:app任务。

最终Android包构建：限定:app:testDebugUnitTest :app:assembleDebug，离线缓存构建实际BUILD SUCCESSFUL，79任务（10执行、69 up-to-date），原生2项0失败0跳过。签名验证成功；aapt验证包名/versionCode/minSdk/targetSdk；APK内version.json为d2d656fb3308，与构建提交一致；WAV字节与源文件一致；原生插件在DEX中。保留android-build.log.txt、android-test-results.xml、apk-signature.log.txt。

最终前端交付测试再次30/30通过，见web-tests-delivery.log.txt。APK编译及签名成功只意味着生成合法测试包，尚不能称真机安装、发声或原生循环延迟验收通过。

GitHub首次导入后：push Web checks run38375814752与PR Web checks run38375904941实际success，包含npm ci、类型检查、Lint、30测试、production build及测试/网页产物上传。Android run38375905014在setup-android安装tools步骤失败（应用构建尚未开始），已经针对日志修正packages为platform-tools，等待新run。
