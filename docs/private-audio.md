# 私有内置音频与恢复

2026-10-17 用户提供 `CRYCHIC - 春日影.mp3`，并要求内置试听。原文件 10,332,066 字节，时长 257.880816 秒，44.1 kHz、立体声 MP3。整首经 FFmpeg 解码无错误。SHA-256：`e3d5d476e8216067fb67a4384591e90c15354ef4592fb45aa3ad6da53851619d`。

这份录音仅随现有私有 Sites 部署提供，不提交到 GitHub，也不改变录音版权或公开授权范围。源码许可证和 CC0 示例许可不涵盖该录音。原始上传保留；私有 Sites 源码的 `.openai/private-media-sources.json` 记录上传文件的恢复引用与校验值，不存储录音二进制。既不把录音写进公开 GitHub，也不写进私有源码 Git。

## 构建

在私有站点工作目录，将原始上传恢复为 `private-media/haruhikage-crychic.mp3`。此目录和生成的 `public/private-media/`、`apps/web/src/bundled-audio.json` 都由 `.gitignore` 排除。不要强制加入 Git。

现有 `scripts/version.mjs` 调用 `scripts/bundled-audio.mjs`：有输入时生成包含 SHA-256 的配置和带内容哈希的 MP3 路径，Vite 复制到 dist；无输入时删除旧输出并生成 `available: false`。GitHub CI、普通克隆与公开 Pages 构建无需该商业录音，页面明确提示本地导入，不能冒充已内置。

发布私有音频版本时必须设置 `ANISONG_REQUIRE_BUNDLED_AUDIO=1`，缺少源文件就阻止构建，避免后续更新悄悄移除歌曲。按 Sites 官方 source helper 构建和打包，保持当前 owner-only 访问范围；保留原 `.openai/hosting.json` project_id。版本 JSON 使用实际 GitHub commit 的 `GITHUB_SHA` 和分支，不以 Sites 镜像 SHA 充当 GitHub 版本。

新 Work 会话从 GitHub PR #3 恢复代码后，打开同一 Sites 源码，读取上述私有来源记录，从原上传恢复文件并核对 SHA-256；不要将临时下载地址、登录凭据或 MP3 写入公开源码。若暂时无法取得原上传，代码和本地导入仍能运行，但不能发布成“已内置录音”的版本。

## 播放行为

有内置音频的版本以实际媒体 `loadedmetadata` 获取时长，不写死进度或歌曲时轴。默认原速 1×，不自动发声。用户点“播放整曲”开始；可暂停、继续、拖动原曲进度、0.5/0.75/1× 保持音高、关闭/开启整曲循环。没有 LRC 时 `selection = null`，范围为整首真实音频，上一句/下一句禁用。导入真实 LRC 后使用实际歌词时间戳；“返回整曲试听”可离开选句范围。切模块或后台暂停。加载失败可点“内置春日影”重试或本地导入，不回退到别的曲子。

音频文件不是乐谱，不生成虚假 MusicXML、小节或自动同步。后续按谱学习仍需提供结构化曲谱。

## Android 手机验收

1. 同一 ChatGPT 账号打开 [直接试听](https://anisong-learning-lab.woolly-mochi-2205.chatgpt.site/?song=haruhikage-crychic#lyrics)，刷新到最新版本。
2. 等待显示约 `04:17.88`，点顶部“播放整曲”。确认是你上传的 CRYCHIC 录音，且不用重新选文件。
3. 点暂停、再继续，拖到 2 分钟附近；尝试 0.75× / 0.5×。确认有真实声音，位置跟随音频，音高保持情况以手机听感为准。
4. 切钢琴或手机后台应停止旧音频。回到歌词页点播放恢复。刷新后仍可加载内置曲；本地导入的 LRC 仍需重新选择。
5. 如有问题点反馈，附版本 SHA、复现步骤、手机浏览器版本；不用上传录音。自动报告含速度、整曲范围和 `selection: null`。

服务器端解码、自动化状态与交互测试、发布和 HTTP 文件一致性核对不能替代实际 Android 浏览器发声/拖动/听感验收。
