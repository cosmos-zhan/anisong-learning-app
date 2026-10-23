# Android 预发布测试包

当前自动发布实现位于 `feature/piano-p0`（PR #3）；功能验收合并前，主分支保留原有构建基线。首个已发布测试版：[v0.3.6-alpha.1](https://github.com/cosmos-zhan/anisong-learning-app/releases/tag/v0.3.6-alpha.1)。

## 手机下载

打开 [GitHub Releases](https://github.com/cosmos-zhan/anisong-learning-app/releases)，选择标有 **Pre-release** 的版本。在 Assets 中直接下载 `anisong-…-debug.apk`，打开安装。无需下载 Source code ZIP，也无需到 Actions 中找临时构建产物。当前仍为 Alpha，不标记正式版或 latest 正式发行。

发布附件包括 APK、`SHA256SUMS.txt`、`build-info.json`。后者记录真实源 SHA、Android 安装版本码、签名证书指纹、原生测试数量和素材边界；不含签名私钥或令牌。

## 自动发布规则

1. 修改 `package.json` 的版本，并同步 lockfile 的根版本；提高 `.github/android-preview.json` 的 `versionCode`。
2. 推送至 `feature/piano-p0`（当前开发试用）或 `main`（合并后的主线）。其他分支和 PR 只构建，不发布。
3. Android 工作流执行完整 `npm run android:check`，包括前端检查、11项发布/签名/服务测试、production交互检查、Capacitor sync、clean、原生单测和 debug APK。
4. 校验 APK 的签名、包名、安装版本、内嵌前端 SHA、dist 字节、原创示例和原生测试结果。任何私人素材或签名密钥出现在公开产物中都使检查失败。
5. 独立发布作业用 `contents: write` 权限创建草稿，上传并验证三个附件，然后将其设为公开 Pre-release。附件失败保留草稿；已经公开的同版本包不覆盖。

普通版本 `0.3.6` 对应 `v0.3.6-alpha.1`；显式版本如 `0.3.7-beta.2` 保持后缀。网页内反馈、APK versionName 和下载名称使用相同测试版版本号。每个新公开版本都要提高 versionCode；同版本重新跑 CI 不重新发包。

不用个人访问令牌；工作流使用 GitHub 自动提供的短期 GITHUB_TOKEN。**首次启用和修改工作流时，GitHub 可能要求相应工作流先进入默认分支，才能以该令牌创建发行版。** 源分支相对默认分支包含工作流修改时的权限错误不能当成发布成功。先检查 publisher 作业的真实结果；只提供服务端已返回且带 APK 附件的发布链接。

本仓库要求功能 PR 经用户验收后再合并；不要为启用发布而绕过此要求。合并工作流后，后续改版本、推送、构建、发布即可自动完成。历史临时 Actions APK 仍保留30天，Releases 附件不使用这个30天到期机制。

## 固定签名与覆盖更新

后续发行已准备固定证书校验：`.github/android-preview.json` 保存恢复备份的公开证书指纹；发布分支缺少签名 Secret 时立即停止，APK 实际证书不匹配时也拒绝发布。普通 PR / 修复分支仍可用临时签名完成测试，但其 APK 不作为新版发行。

固定证书 SHA-256：`fb5aea5b476670889a4749b1229a3fb24c0d1b77662d78c579deea3b52052447`。它来自所有者的既有私人备份，没有重新生成。设置 Secret 是独立的账号配置步骤。GitHub 的 0.4.2 与 0.5.0 公开包使用了不同临时证书，不能通过固定这个旧备份来补回那些已丢失的临时私钥。不要卸载仍有练习数据的旧 App。

Android 覆盖安装要求包名相同、签名相同、安装版本码递增。不同云端 runner 自动生成的 debug key 不保证相同。工作流支持仓库 Actions Secret **ANDROID_DEBUG_KEYSTORE_BASE64**：在可信 push 构建时还原到 runner 的 `.android/debug.keystore`，构建后仅公开证书指纹。PR 构建不读取该签名 Secret。

2026-10-23 经项目所有者授权，已有测试签名已保存为仓库 Secret，GitHub 设置页确认创建成功。后续版本复用同一签名。已有私人签名备份为 `Anisong-debug-signing-20261019.zip`，其中包含恢复说明。如将来需要恢复仓库配置，可从所有者的私人文件中恢复备份，将 keystore 编码为一行 base64，保存到 GitHub：

**仓库 → Settings → Secrets and variables → Actions → New repository secret**。

不在聊天正文、Git 源码、PR 或 Issues 中粘贴私钥；不把 keystore 上传为 Actions 或 Releases 附件。不要以公开 Actions cache 保存签名密钥。默认 Android debug keystore 的 alias / password 约定保持不变，正式分发签名另行配置。

未设置 Secret 时，普通验证分支仍可生成临时 debug 测试包，发行分支立即停止，禁止临时签名发行。配置固定签名后也不能覆盖此前签名不同的临时包。保留有练习数据的旧版，不要直接卸载。当前尚未提供独立练习数据导出／迁移功能。

## 公开包与私有试用

本仓库公开。公开 APK 只带 CC0 原创音频、歌词和乐谱，可以本地导入其他已获授权素材。春日影的私人 MP3 / LRC / MXL 继续只在所有者私有测试站和私人构建中使用。

发布校验同时检查生成的素材配置和真实 APK ZIP 条目。私有 APK 不得直接拿来做公开 Releases 附件；不要将 `private-media` 或签名备份加入 Git。私有测试站不因这次 README / 发布流程修改而重新部署或替换。

## 维护检查

- 纯文档或工作流修改仍运行完整 App 构建，不能仅验证 YAML 语法。
- `npm run test:release` 检查版本格式、公开素材、已有版本不可变、上传与发布顺序、失败保留草稿和权限错误。
- `scripts/verify-public-apk.py` 检查真实 APK；`scripts/publish-android-preview.mjs` 执行发布。网络和权限错误必须明确失败。
- 发布后读回 Releases 的 prerelease / draft 状态、标签、附件大小与 SHA-256 digest，再给出真实下载链接。
- 若发布失败且已有草稿，只重跑失败的发布作业、复用同一构建产物，可补完附件；重新构建导致字节变化时不会自动替换已有草稿附件；不移动既有版本标签、不覆盖不同源提交的附件。
