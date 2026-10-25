# 交付恢复与后续配置

基线为 `69b9c8a846fd8bb2abe495e457053bf7004dce8b`（0.5.0-alpha.1）。GitHub Android 工作流 39774775327 在 2026-10-22 20:05（北京时间）完成并发布；不再等待此前已取消的任务。

本次修复不改 App 版本，不覆盖既有发行。独立 `fix/reliable-delivery` 分支保留原开发目录的未提交文件。

## 变更

- 使用恢复备份的真实公开证书指纹；恢复时验证私钥库，签名不符不会替换现有文件。
- 发行分支缺少固定签名立即报错；发布前再次检查真实 APK 证书，禁止临时签名发行。普通验证分支保留临时签名构建能力。
- Playwright 系统依赖也采用有限网络重试和 6 分钟步骤时限；此前仅中文字体步骤有独立限制。
- 私人素材源支持 Node 24 / Docker，复用同一访问码与 CORS 授权逻辑，支持流式下载和 Range；镜像不包含素材或 Secret。
- 根 Wrangler 配置补充空 `previews` 块，使 Cloudflare 已配置的 `npx wrangler preview` 能部署非生产分支。

## Cloudflare 预览失败定位（2026-10-23）

所有者提供的构建日志确认：提交 `4f211c1` 的 `npm run build` 成功，随后 `npx wrangler preview`（Wrangler 4.152.0）在部署阶段报错：`Your Wrangler configuration is missing a previews block to run this command`。失败构建为 `2258ff7a-8897-4a1c-a170-9685d340f3f4`；不是前端编译或 Android 签名失败。

Cloudflare Worker Previews 要求根配置包含 `previews`，即使没有预览专用变量或绑定也要声明空对象。现补充 `"previews": {}`，静态资源和兼容日期仍位于顶层。没有复制私人素材、生产 Secret 或修改现有访问限制。配置依据：[Cloudflare Preview 配置](https://developers.cloudflare.com/workers/previews/configuration/#wrangler-configuration-file)。

本修复的最终 Cloudflare 与完整 App 结果以 PR #6 最新提交的检查为准；不能用旧提交的成功状态代替。本地没有 Android SDK，最终 APK 校验在 GitHub Actions 执行。

## 签名配置（2026-10-23）

经所有者授权，已将既有 `Anisong-debug-signing-20261019.zip` 的签名库保存到本仓库 `ANDROID_DEBUG_KEYSTORE_BASE64` 加密 Secret，并从 GitHub 设置页确认创建成功。沿用恢复的测试密钥，没有生成或公开新私钥。

本分支后续 push 构建将读取该 Secret、核对固定证书并校验最终 APK；完整构建和证书结果见 PR #6 对应的 Actions 记录。本次配置不覆盖历史发行，也不代表物理手机覆盖安装已验收。

首次固定签名构建在密钥恢复、完整 App 和浏览器检查均通过后，被最终 APK 证书不匹配检查阻止。构建原先依赖 Android Gradle 插件默认查找调试密钥；现将验证后的绝对文件路径传给后续步骤，并显式配置 `signingConfigs.debug.storeFile`。缺少该文件时直接失败，最终 APK 仍需通过同一指纹校验，不放宽检查。

## 尚需完成

1. 独立私人素材服务已部署，所有者已授权其入口公开，目录和文件仍需独立访问码；真实素材下载与哈希通过。当前云端匿名 HTTP 检查被平台边缘返回 403/1010，手机 APK 直连仍待实测。现有 ChatGPT 私人测试站保持原访问范围，不向公开 APK 分发整站服务凭据。
2. 新版按原流程增加版本码、通过完整 App 与 APK 校验，再自动发行。手机覆盖升级只适用于同一签名；旧临时签名包不要直接卸载。

## 验证

本地已使用真实备份验证固定证书，并通过签名/发布与真实 HTTP 服务测试；完整 App 与浏览器结果以本分支 GitHub Actions 为准。本地环境缺少 Android SDK，不能将前端检查当作原生构建通过。独立 HTTPS 服务已通过持平台服务凭据的真实文件下载及 SHA-256 校验，此结果不能替代 APK 直连。Docker 镜像与物理 Android 验收尚未完成。
