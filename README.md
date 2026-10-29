# Anisong · 歌词学唱与钢琴练习

Anisong 是一款帮助你跟着喜欢的歌曲练唱、读懂日语歌词和练习钢琴的小工具，支持 Android 和网页。

**[在线体验](https://anisong.sekifufu.xyz)** · **[下载 Android 测试版](https://github.com/cosmos-zhan/anisong-learning-app/releases)** · **[使用文档](docs/)** · **[反馈问题](https://github.com/cosmos-zhan/anisong-learning-app/issues)**

## 可以做什么

- **歌词学唱**：按句选择、循环试听和调整速度，按需显示罗马音与译文。
- **语法解读**：长按歌词查看词组与语法，试听当前句，并围绕它继续提问。此功能需要自行配置模型服务和 API 密钥。
- **钢琴学谱**：导入乐谱，选择声部与小节练习，支持试听和键盘交互。
- **歌曲与素材**：在下载管理获取可用歌曲，也可导入本机音频、歌词和乐谱；Android 支持通过网易云分享链接导入可获取的素材。

## Android 安装

打开 [Releases](https://github.com/cosmos-zhan/anisong-learning-app/releases)，选择最新的 **Pre-release**，在 **Assets** 中下载 `.apk` 并安装。已安装的应用也可在“设置 → 应用更新”检查更新。

同签名的新版本通常可以覆盖安装并保留本机数据。部分早期测试版使用不同签名，请先阅读[安装与签名说明](docs/android-previews.md)，不要为更新而直接卸载有重要记录的旧版。

## 开始使用

在曲库选择歌曲并进入“歌词学唱”或“钢琴学谱”；也可以在下载管理获取歌曲，或导入自己的素材。语法解读配置与隐私说明见[歌词语法解读](docs/lyric-grammar.md)，更多操作和限制见[使用文档](docs/)。

## 开发

项目使用 React、TypeScript、Vite、Capacitor 和 Kotlin。安装 Node.js 后运行：

```bash
npm ci
npm run dev
```

其他开发与构建信息见[架构说明](docs/architecture.md)和[Android 构建说明](docs/android-previews.md)。

## 许可证

代码采用 [MIT License](LICENSE)。内置原创示例使用 CC0；请仅导入和使用你有权使用的素材。
