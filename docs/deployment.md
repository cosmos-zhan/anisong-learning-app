# 部署：Cloudflare Pages 优先，Sites 暂作可用备选

## Cloudflare Pages GitHub 集成

无需把 Cloudflare API Token 写进源码，也无需给客户端 GitHub Token。最少手机步骤：

1. 在 GitHub 新建 `anisong-learning-app`，建议 Public，勾选 README 初始化默认 main。
2. 在 ChatGPT GitHub 连接的仓库权限中包含这个新仓库。之后让 Work 上传已完成源码，并通过 feature 分支 / PR 交付。
3. 登录 Cloudflare Dashboard→Workers & Pages→Create application→Pages→Connect to Git，授权 GitHub，仅选择这个仓库。
4. Production branch=`main`，Framework preset=React(Vite)，Root directory=仓库根，Build command=`npm run build`，Build output directory=`dist`；构建环境 Node.js 24（`NODE_VERSION=24`）。
5. Preview branch control 包含 feature/* 和 fix/*。等待首次成功，复制平台实际给出的 Production URL。非 main 分支 / PR 使用平台返回的预览 URL，不根据分支名猜测。

官方文档：
- https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/
- https://developers.cloudflare.com/pages/configuration/preview-deployments/
- https://developers.cloudflare.com/pages/configuration/build-configuration/

Pages 的构建自动读取 CF_PAGES_COMMIT_SHA、CF_PAGES_BRANCH 写入页面版本。PR CI 验证 Types/Lint/Test/Build；Cloudflare 的部署检查与预览 URL 由原生 GitHub 集成生成。本仓库不伪装自己能在未授权时部署 Cloudflare。

## 部署内容与缓存

静态 SPA，输出 dist/，Vite base='./'；_redirects 回退 index.html。_headers 给入口和 version.json no-cache，哈希资产 immutable。无 Service Worker，不缓存用户歌曲。网页只需要 HTTPS + 静态资源，无后端数据库。

首次部署后用手机刷新，并核对页面底部 SHA 与 PR head/main 提交。再切换两个预览 URL，核对版本不同。当前环境无法替你证明物理 Android 上的缓存行为。

## Sites 备选

交付记录含实际发布结果。Sites 源码的 .openai/hosting.json 保留项目 ID，以后必须复用该 ID，不要再建新的 Site。当前网页私有，需使用同一 ChatGPT 账号登录。它是一次可恢复的发布，不等同于已配置 GitHub main / PR 自动部署。完成 GitHub 与 Cloudflare 集成后，将手机测试主入口切换到 Pages。

## Android Actions

Android debug APK workflow 在手动 workflow_dispatch、android-test-* tag、或PR修改Android/原生桥/构建配置时执行；日常歌词和UI push 不强制构建 APK。JDK21、Node24、SDK36、Gradle wrapper 一起固定；npm ci 后 check、cap sync、testDebugUnitTest 与 assembleDebug。产物 retention 30天，登录 GitHub 在成功 run 下载。不要填写并未存在的 run/artifact链接。

运行没有涉及 Cloudflare付费服务、Firebase邀请、商用录音或正式发布签名。

SDK动作使用setup-android@v3，显式packages: platform-tools；不要使用旧默认tools包。初次Actions已经证明该包不再可安装。后续将platforms;android-36和build-tools;36.0.0单独安装。
