# 素材服务与可选私人部署

## 当前默认服务（0.6.1）

独立素材服务已部署到 <https://anisong-media-source.woolly-mochi-2205.chatgpt.site>，目录为 `/catalog.json`。现有服务使用私有 R2 存储和服务端读写接口；按所有者授权启用 `PUBLIC_DOWNLOADS=true`，目录与媒体 GET / HEAD / Range 可匿名读取，公开 CORS 允许网页和 Android `https://localhost`，App 默认不显示访问码输入，也不内置密钥。

管理员上传使用独立 `ADMIN_TOKEN`，接口为 `PUT /api/admin/files/<文件名>`；素材不进入公开 GitHub 或 APK。增加歌曲采用“文件先上传、完整目录最后更新”，具体格式、限制和验收见 [新增歌曲](adding-songs.md)。该服务页面目前只提供地址复制与连接检查，没有管理员上传界面。

下文保留的是仓库内 **可选的受限静态 Worker / Node 模板（0.4.1）**，用于另建私人源，与当前默认服务的实现和公开读取策略不同。它不是当前服务的上传工具；不要用旧部署包覆盖当前服务。默认春日影无需执行以下访问码步骤。固定 CI 签名也已配置，最新状态见 [签名指南](android-previews.md)。

## 历史模板与使用范围

**0.5.0主流程：** [App内下载管理](download-manager.md)提供在线列表、队列和已下载管理；下述Worker是可接入的私人下载源，仍需所有者提供托管授权和实际地址。工作不再依赖云浏览器登录。[素材包](media-packages.md)仅为补充入口，未宣称独立服务已经上线。

App → 曲库 → 在线素材，分别填写 `catalog.json` 的真实 HTTPS 地址和素材源访问码。访问码只留在该页面内存中，不保存到 localStorage、IndexedDB 或反馈报告；离开后重新访问服务器需再次填写。下载后的文件仍可离线使用，不再需要访问码。

不要填写 Cloudflare API Token、GitHub Token 或账号密码。素材源访问码是服务独立生成的 43 位随机字符串，只能读取该私人素材服务。

## 不依赖 R2 的服务

`services/media-source/worker.ts` 是同一项目内的独立 Cloudflare Worker。素材经 ASSETS 绑定提供；每个目录和文件请求都先经过访问码校验，未授权返回401，未配置 Secret 返回503。`assets.run_worker_first: true` 是必要安全条件，不能删除或改为false。预览URL默认关闭。现有前端的根 `wrangler.jsonc` 不改动。

这个服务不需要 R2、数据库或上传接口。Workers Static Assets 单文件上限25 MiB，所以部署生成器将该服务音频上限设为25 MiB；App的一般素材源仍可到30 MiB。受保护请求会运行 Worker，受当前 Workers 请求与运行额度限制；本实现没有开通付费计划。

参考：[绑定与优先执行](https://developers.cloudflare.com/workers/static-assets/binding/)、[静态素材额度](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)、[Secret配置](https://developers.cloudflare.com/workers/configuration/secrets/)。

## 准备私人部署包

沿用 [素材目录生成配置](media-downloads.md#从文件生成素材源)，将配置及原文件放在私人目录；不能提交GitHub。执行：

```bash
node scripts/prepare-private-media-service.mjs PRIVATE_SOURCE.json private-media/service-upload https://实际网页域名
```

默认允许Android的 `https://localhost`。其他网页必须以完整 HTTPS Origin显式加入；不支持 `*`。目录地址和文件均只支持GET/HEAD，OPTIONS只允许Authorization与Range；CORS不替代访问码。

输出包括 `worker.ts`、`wrangler.jsonc`、`assets/`、`ACCESS-CODE.txt`、本地 `.dev.vars` 和部署说明。访问码在 `assets/` **外**。脚本要求仓库内输出目录被Git忽略，拒绝非空输出目录，不上传、不修改Git、不在日志显示访问码。

## 授权后部署

以下命令在私人部署目录内执行；Work可继续完成，所有者只需完成账号授权。不要连接这个私人文件目录到公开GitHub构建，也不要把整个部署包拖入公开静态托管。

```bash
npx wrangler@4 login
npx wrangler@4 secret put MEDIA_TOKEN < ACCESS-CODE.txt
npx wrangler@4 deploy
```

先将访问码设为Worker加密Secret，再上传服务和私有资产。若先部署，未配置Secret时仍拒绝返回文件。`.dev.vars`只供本地使用，不会代替远程Secret。实际创建Worker和写入Secret须在相应账户授权后进行；不得把生成配置当作线上部署成功。

部署后必须验证：

1. 对真实 `catalog.json` 及目录中某一MP3直链，不带码和带错误码均返回401。
2. 指定允许的网页Origin和正确码，可以读取目录、三类文件；正确响应含该Origin与 `Cache-Control: private, no-store`。
3. 未列出的网页Origin返回403。目录与媒体不出现公开缓存响应；素材绑定不接收Authorization。
4. App中真实下载，关闭服务后重新载入本地音频、歌词、谱面；升级程序后本地资料仍在。
5. 轮换 `MEDIA_TOKEN` 后旧码无效，新码可读。轮换不删除已下载资料。

App仅向用户填入的目录Origin附加访问码，带码请求拒绝HTTP重定向。目录引用其他域名时不传码；若其他域名也需私有授权，应改为同源地址。本版本不提供多人账号、访问码分享、签名URL生成或后台下载。

## 当前交付边界

### 普通 Node / Docker 主机

`services/media-source/server.mjs` 提供 Node 24+ HTTP 服务，复用 Worker 的访问码、CORS、只读路由和禁止公开缓存规则。生成部署包时同时包含 Node 服务、Dockerfile 与 `NODE-DEPLOY.txt`，无需 Cloudflare 登录、R2 或额外 npm 依赖。App 仍填写同样的 HTTPS 目录地址和访问码。

在私人部署目录执行 `node --env-file=.dev.vars server.mjs`，默认只监听 `127.0.0.1:8787`。线上由已授权主机的 HTTPS 反向代理接入；代理必须保留 Authorization，不缓存响应，不将 assets 另行挂成公开静态目录。允许的网页 Origin 通过 `.dev.vars` 中的 `ALLOWED_ORIGINS` 配置，保留 Android 的 `https://localhost`。

Docker 镜像只包含服务代码，素材及访问码以只读卷注入；`.dockerignore` 排除素材和凭据。`MEDIA_TOKEN_FILE` 可接入主机的 secret 文件。设置容器用户的最小读取权限，不要公开整个部署目录。具体命令见包内 `NODE-DEPLOY.txt`。

真实 HTTP 测试覆盖目录/音频未授权拒绝、CORS 预检、下载、HEAD、字节范围、无效范围与符号链接拒绝。客户端会校验文件哈希后事务保存。普通主机需要所有者提供或授权实际 HTTPS 托管；生成包和本地测试不等于线上服务已部署。

服务端权限和App接入有自动化测试；真实浏览器回归使用相同Worker处理函数与真实CC0文件，测试跨域认证、错误码拒绝、离线恢复和实际播放。这不是Cloudflare线上服务验收。

截至本批开发，Cloudflare仍需所有者登录授权；尚未提供或宣称独立私人服务URL。现有所有者私有测试站的“下载本站私人练习素材”继续可用，其访问权限未扩大。公开APK仍只含原创示例。GitHub固定签名Secret需独立确认后配置，详见 [签名指南](android-previews.md)。
