# GitHub 首次导入（新仓库就绪后）

本文件供下一次 Work 会话使用，避免新仓库授权阻塞导致源码丢失。

## 从现有 checkout 推送（云环境已具备 git 凭据）

先查看目标仓库的默认分支和现有README，不覆盖用户文件。将当前源码放到独立 feature/p0 分支，保留已初始化的远程 main 历史。可以先克隆目标仓库，再将源码归档解压入 checkout（排除旧.git），然后：

```bash
git switch -c feature/p0
npm ci
npm run check
git add .
git commit -m 'feat: implement lyric-loop P0'
git push -u origin feature/p0
```

使用GitHub工具开PR。真实CI通过后合并main；开启Pages GitHub集成，记录真实稳定与PR预览URL。首次main只有README时也不要将实现未经测试直接force push。

## 只有GitHub连接工具可用

使用目标仓库 get_repo / fetch 的真实main SHA和tree，创建feature/p0，保留README变更可审查。批量create_blob（文本UTF8；WAV、PNG、Gradle JAR以base64），create_tree包含完整文件，create_commit指向远程父提交，update_ref带expected_sha避免覆盖并发更新。之后create_pull_request。不要单文件逐次提交几百次，也不要上传node_modules或密钥。

注意：.github/workflows修改可能受到当前连接的Workflow权限限制。如果被拒绝，保留完整文件并说明准确权限；其余源码继续提交。不要绕过拒绝或将APK构建配置假称已经运行。

## GitHub Actions与分发

合并main后手动启动Android debug APK workflow。通过run返回的真实ID读取结果和Artifact。下载ZIP后手机安装APK。不编造未来URL。如果仓库不支持Actions手动触发工具，由用户在手机Actions→Run workflow操作；其余修复继续。
