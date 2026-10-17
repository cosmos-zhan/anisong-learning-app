# Work 会话恢复与交接

1. 先读 README、requirements、delivery、known-issues 与 test-results。
2. GitHub 连接必须有目标仓库 Contents 写权限；Actions/Workflow 修改还需相应权限。不要修改 cosmos-zhan/Aria。
3. 克隆最新 main，执行 npm ci 与 npm run check。在 feature/ 或 fix/ 分支修改并开 PR。不要覆盖用户新提交；重读远程 HEAD 后再更新分支。
4. 需求确认：真实音频播放、原曲坐标、连续范围、关闭循环到末尾停、变速保留音高、非敏感反馈。不要添加未批准的后续功能。
5. 核心回归覆盖解析、范围、异步状态、AudioEngine、React 关键按钮。jsdom 测试通过只能证明交互和 API 调用，不能证明实际浏览器解码 / 听感。
6. 需要原生时，在有 JDK21 / SDK36 的云环境运行 npm run android:debug；CI 手动 workflow 或 tag。不得提交 keystore、local.properties、node_modules、dist、私有歌曲。
7. Git 中不得包含私人音频，版本 JSON 与目标提交一致。用户授权的春日影 MP3 只随私有站产物分发，依 [private-audio.md](private-audio.md) 恢复被忽略的输入，并以 ANISONG_REQUIRE_BUNDLED_AUDIO=1、ANISONG_REQUIRE_BUNDLED_LYRICS=1 和 ANISONG_REQUIRE_BUNDLED_SCORE=1 构建，避免更新丢失内置歌曲。Cloudflare 分支预览验证后才合并。Sites 复用 hosting project_id 与官方同步工具。
8. 每次修复更新已知问题和实际测试证据，标明未执行的检查，不能继承上一会话未经证实的验收结论。

工程没有服务器状态。版本文件在构建时生成并忽略，避免构建改变源提交。依赖锁文件提交；demo.wav 可由 Python generator 完全重建。Gradle wrapper 已纳入工程，无需本机 Gradle。系统文件 URI 生命周期不跨会话持久化。


钢琴模块：继续开发前先读 [正式任务书](piano-requirements.md)、[架构与恢复](piano-architecture.md)、[手机验收](piano-mobile-testing.md)、[交付/已知问题](piano-delivery.md)。两模块共享歌曲/反馈/CI，时间模型分别使用原曲秒数与谱面 ticks。
