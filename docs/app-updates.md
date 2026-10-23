# 0.6.1：默认春日影、首次滚动与应用更新

## 默认下载列表

公开网页和 APK 默认显示春日影 · CRYCHIC，包括 MP3、42 句 LRC 和七声部 MXL 的文件元数据。默认源无需访问码，直接点击“下载到本地”即可开始，不需要打开源设置。原来的默认 CC0 示例地址自动迁移；用户自行选择的其他源保留。“试用原创示例源”继续可用。

公开源码只包含目录元数据，不包含音频、歌词正文、曲谱文件或访问密钥；文件下载后经大小、SHA-256 与 LRC/MXL 解析验证，再以事务保存到 IndexedDB。Android 练习时将保存的音频转入应用私有文件供 Media3 使用。默认源重新进入下载页也无需输入任何访问码，已经保存的素材可离线读取。

素材入口：`https://anisong-media-source.woolly-mochi-2205.chatgpt.site/catalog.json`。所有者已授权素材直接下载：服务配置 `PUBLIC_DOWNLOADS=true` 后，目录、GET/HEAD 文件和 Range 可匿名读取，公开 CORS 支持网页与 Android。上传和维护仍要求独立管理员凭据，客户端不内置共享密钥。自定义的其他私人源仍可在高级设置中使用临时访问码。

## 首页首次滚动

应用根节点使用固定高度，普通页采用纵向 flex 框架；顶栏与底栏不收缩，中间内容独立滚动。首帧同步读取 `visualViewport.height`，随后跟随 resize，避免必须切换路由后才重新确定滚动框尺寸。浏览器回归从无 hash 的全新首页开始，在任何导航点击前发送真实触摸滑动，并检查刷新后仍可滚动。

## 检查与下载安装更新

设置 → 应用更新 → 检查更新。更新源固定为本项目 GitHub Releases，包含 Alpha / Beta / RC，按语义版本排序，不使用排除预发布的 `/latest`。忽略草稿、缺少完整附件、错误来源、缺少 SHA-256 的安装包；网页提供真实 APK 直链和版本说明。

Android 原生插件通过 HTTPS 读取公开版本信息和 `build-info.json`。下载前要求安装版本码递增、公开素材声明、Release 附件哈希与构建元数据一致，并核对当前安装签名。下载在应用内显示进度、允许取消，文件写入私有缓存目录；受限 HTTPS 重定向仅允许 GitHub 官方附件服务。下载完成后检查实际字节数、SHA-256、APK 包名、安装版本码和证书，再提供安装按钮。

点击安装时再次检查文件与签名，通过 FileProvider 交给 Android 系统确认。若尚未允许本应用安装未知应用，打开系统授权页，返回后再点安装。无静默安装。下载期间请保持 App 进程开启；离开设置页不会中断原生下载，进程被系统结束会中断未完成文件，重新下载从头开始。完整缓存包可以在下次运行重新打开安装。缓存被系统清理则重新下载。

旧临时 CI 签名包与固定签名不同，检查会明确提示无法覆盖，不自动卸载；先保留原 App 与资料，联系维护者处理。版本发布仍沿用完整 App、实际 APK 与固定证书校验，通过后在发行分支发布；本功能不会覆盖既有 Release。

## 验证边界

- 完整 App、签名与本版本测试结果以 PR #6 对应提交的 GitHub Actions 为准；本地 Gradle 依赖下载受网络限制，不能用前端结果替代 APK 验证。
- 使用所有者的实际 10,332,066 字节 MP3、LRC、MXL，通过应用下载校验和保存函数，验证离线恢复 42 句歌词、七声部、140 小节。此项使用本地真实文件响应，不能替代线上网络访问或真机听音。
- 新增 `verify-live-download-browser.mjs` 线上门禁：只拦截本地构建的 App 页面，不拦截素材服务，直接点下载，不携带访问码或平台凭据。检查真实 MP3/LRC/MXL 的 HTTP 200、离线 42 句歌词、140 小节曲谱和 MP3 解码播放进度；覆盖网页 Origin 与 Android 的 `https://localhost` Origin。结果见当前 push Android 作业的 live gate；不会把本地文件替身当作线上下载通过。
- Android 16 物理手机的首次触摸、真实下载、媒体听音、系统安装确认与更新后的资料保留仍需实际设备验证。

实现依据：[GitHub Releases API](https://docs.github.com/en/rest/releases/releases)、[Android PackageManager](https://developer.android.com/reference/android/content/pm/PackageManager)、[安全文件共享](https://developer.android.com/training/secure-file-sharing/share-file)。
