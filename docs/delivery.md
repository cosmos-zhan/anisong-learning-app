# P0 实际交付记录（2026-10-13）

## 当前状态

完整工程已进入 GitHub main，109 个文件，包含真实媒体播放源码、React/TypeScript、Kotlin/Media3、锁文件、Gradle wrapper、原创音频、测试、CI 和使用文档。Aria未修改。

- 仓库：https://github.com/cosmos-zhan/anisong-learning-app
- 实现PR #1（已合并）：https://github.com/cosmos-zhan/anisong-learning-app/pull/1
- 完整导入提交：355bca52ba660a0e96f053e1b961a8380e636893
- SDK构建修复提交：68614f69d96c2bf8da4b1a736448502b67cc3035
- 首次main基线合并：e2564e1d9282b32f0181a42bdddd8624c264d7e0

## CI与真实APK产物

- 网页PR CI成功：https://github.com/cosmos-zhan/anisong-learning-app/actions/runs/38376318734
- 网页push CI成功：https://github.com/cosmos-zhan/anisong-learning-app/actions/runs/38376312396
- Android CI成功：https://github.com/cosmos-zhan/anisong-learning-app/actions/runs/38376318729
- APK下载（需登录GitHub）：https://github.com/cosmos-zhan/anisong-learning-app/actions/runs/38376318729/artifacts/11800669480
- 原生测试报告：https://github.com/cosmos-zhan/anisong-learning-app/actions/runs/38376318729/artifacts/11801721549

远程网页检查包含npm ci、类型、Lint、30/30测试、production build及产物上传。Android完成同样前端检查、Capacitor同步、Gradle :app:testDebugUnitTest与:app:assembleDebug，BUILD SUCCESSFUL。已下载并检查原生报告：2测试、0失败、0跳过。

APK artifact名anisong-debug-4c8b659dd3354be228edb7cc348f7284a024ae11，ZIP约7.98MB，内含app-debug.apk；保留到2026-11-12。4c8b659是GitHub PR测试合并提交的SHA，PR源码头是68614f6。不要将PR合并测试SHA误当成正式main合并SHA。包名io.github.cosmoszhan.anisong，versionName0.1.0，SDK36。手机下载ZIP、解压、点APK安装；签名为测试debug签名。

首次Android CI在setup-android@v3请求废弃tools包时失败，已明确设置packages: platform-tools并实际重跑成功。配置只对原生相关PR、手动workflow_dispatch或android-test-* tag构建APK，一般歌词/UI变更不强制构建。

## 网页预览

已部署可用的私有测试页：https://anisong-learning-lab.woolly-mochi-2205.chatgpt.site

同一ChatGPT账号登录。当前发布源码版本c6abd5b456f8（本地/Sites首次交付历史），播放器代码对应此次GitHub导入；GitHub同步后仅改CI和交接文档，没有播放器行为改动。此网址不是Cloudflare Pages，也没有GitHub PR自动预览。

Cloudflare仍未授权、未部署。现在只需在手机登录Cloudflare，按deployment.md把已就绪的GitHub仓库连接Pages，production main，build npm run build，output dist，NODE_VERSION24，开启feature/*和fix/*预览。真实部署成功后记录平台返回URL。

## 阶段与验收边界

A：真实网页媒体播放实现、自动测试、production构建、持久测试网址、GitHub源码已完成。
B：版本与非敏感反馈报告/Issue预填、Issue模板、PR、远程CI已完成；Cloudflare main/PR预览待账号接入。提交Issue仍由用户确认，App不持有GitHub Token。
C：Capacitor/Media3源码与GitHub自动debug APK、原生单元测试和真实下载链接已完成。

未做实际浏览器试听、Android16物理手机安装、音高听感、循环停顿、SAF文件选择、来电/蓝牙/后台、手机缓存切换验收。不能把jsdom、编译和原生坐标测试称为真机播放验收。演示为35.5秒原创器乐，第2行日文为界面示例，没有对应人声；真实歌曲请本地导入匹配LRC。

## 手机下一步

1. 打开测试页或下载GitHub APK，按mobile-testing.md手测，反馈中包含版本和复现步骤。
2. 登录Cloudflare并按deployment.md连接该仓库，建立main稳定网址和PR预览。
3. 后续Work默认克隆main，修复走feature/fix分支及PR，查看CI后继续迭代。

首次本地APK仍可用：源码d2d656fb3308、8,584,234字节、v2签名验证通过；SHA256为32af2eb83846af7c2ccc638e9a6adc247d356381f6055411c187698b86a6c416。它与本节GitHub构建产物为两次不同的debug构建，签名可能不同。


## 钢琴增量

后续钢琴开发统一记录在 [piano-delivery.md](piano-delivery.md)，以 [PR #3](https://github.com/cosmos-zhan/anisong-learning-app/pull/3) 为变更入口。原 APK 与原验收结果不可冒充新增钢琴模块验收。
