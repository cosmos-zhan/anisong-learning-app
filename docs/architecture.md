# 架构与播放器规则

## 数据与时间坐标

所有业务时间均为原曲秒数，变速只影响实际耗时。歌词结构 `{start, text}`；片段为 `[start, end)`。结束取下一行起点，最后一行取音频结束。0.15 秒为最短有效片段；±0.1 秒微调保留两位小数，越过 0 / 音频长度时钳制，导致过短时拒绝并保留旧范围。

LRC 支持 `[mm:ss]`、1–3 位小数、多标签重复、offset、UTF8 BOM、空行和元数据。乱序排序并提示，重复时间合并文本，空文本变成间奏标签；超出音频范围的歌词移除并提示。没有有效行时返回明确错误。P0 不解析增强 LRC 的逐字时间，不会猜测无时间歌词。

## 选择与状态机

`LoopController` 独立于 React；状态为 empty / loading / ready / playing / paused / ended / error。单句立即设范围、定位、播放。多句第一点暂停并显示起点；第二点标准化首尾后连续播放中间完整音频，取消不会启动播放。上一 / 下一句转成单句片段。

暂停保留当前原曲位置；恢复从该位置播放。已结束片段再播放，从起点重播。关闭循环只播放当前片段，不进入整首连续播放。拖动限制在片段内。微调重新从新起点开始，并保持此前是否在播放。

Controller 为 load 和操作使用递增版本；每次 await 后检查版本，防止旧加载 / 旧选句 / 旧 play promise 覆盖新状态。引擎负责清理边界计时与失效加载监听器。不存在模拟播放进度；UI 位置来自引擎。

## WebAudioEngine

采用真实 HTMLAudioElement，`playbackRate` + `preservesPitch=true`。10ms 独立计时检查 currentTime（UI位置事件约60ms一次），在终点跳回起点或暂停；React 渲染与低频 timeupdate 都不决定边界。解码、seek 和浏览器调度可能导致停顿或少量越界，10ms 计时不是 10ms 精度保证。页面进入后台主动暂停，不依赖后台计时循环；来电和系统媒体中断通过媒体 pause 事件同步。

本地音频用 object URL，切歌与卸载释放。网页刷新后文件要重选。没有 Service Worker，HTML/version 元数据 no-cache，带内容哈希的构建资源 immutable。不能断言缓存行为已在物理 Android 上验证。

## Android AudioEngine

共享 Controller 通过 Capacitor `AnisongAudio` 插件调用 Kotlin。系统 ACTION_OPEN_DOCUMENT 选取音频 content URI，仅当前会话使用读取授权，不申请全盘权限。演示音频打包在 assets。MediaMetadataRetriever 在单线程后台读取时长，异步返回有加载版本保护。

Media3 ExoPlayer 使用 MediaItem.ClippingConfiguration 裁剪，以及 REPEAT_MODE_ONE / OFF。在桥接内部将原曲秒数转换为片段毫秒数；返回位置时加上裁剪起点。PlaybackParameters(speed, 1f) 保留音高。60ms 原生位置事件只更新 UI，循环由 Media3 执行。启用音频焦点与耳机断开处理；Activity 离开前台暂停。没有后台 Service / MediaSession / 通知栏控制。

不得将编译通过当成真机循环无缝或延迟验证。原生 JNI/编解码、文件提供方、设备休眠与来电行为需要手机验收。

## 反馈与隐私

反馈在打开时捕获快照，避免报告随播放进度不停变化。自动字段只含构建信息、UA、播放状态、速度、循环、行号、时间范围、轮次和最多 12 条固定错误码。歌词文本、音频名、source / path / URI 不进诊断。用户文字由用户主动输入，可预览编辑；也可移除全部诊断。GitHub Issue 链接是预填草稿，不代表提交成功。
