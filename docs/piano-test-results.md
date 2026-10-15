# 钢琴 P0 测试证据

首个功能提交：`89420b02278b29174ec9e8fc3b8618543695fe53`。

- 本地 `npm run check` 实际通过：严格 TypeScript、ESLint、65 项 Vitest、Vite 生产构建。
- 对应 [GitHub push run 38676322672](https://github.com/cosmos-zhan/anisong-learning-app/actions/runs/38676322672) 和 [PR run 38676347258](https://github.com/cosmos-zhan/anisong-learning-app/actions/runs/38676347258) 均为 success。
- 后续硬化增加同谱多歌曲隔离、共享关联和刷新恢复测试；最终数量与对应 CI 见 [交付记录](piano-delivery.md) / PR #3 的最新检查。CI 每次 push / PR 都执行，JUnit 与 dist 是运行附件。
- 本地最终硬化版 `npm run check` 实际通过：9 个测试文件、**69 项测试**（原学唱 30 项 + 钢琴 39 项）、TypeScript、ESLint 和生产构建全部成功。最终 GitHub run 和发布 SHA 映射更新在 PR #3 正文，便于新会话恢复。

## 覆盖内容与证据边界

| 测试 | 实际验证 | 不代表 |
| --- | --- | --- |
| 原学唱 30 项 | LRC、片段、状态、反馈、网页音频接口与关键 DOM 交互回归 | 手机实听已通过 |
| `piano-parser.test.ts` | 示例八小节、音高拼写、divisions/附点/三连时值、3/4、弱起、tempo、backup/forward、声部、休止、反向闭区间、跨小节延音、MXL container/路径/损坏/大小、错误 XML | 任意专业全谱均兼容 |
| `piano-controller.test.ts` | bar 5 / 5–8、音频时钟驱动、定时器单独走不推进、暂停/恢复/结束/循环/变速、旧异步播放取消、等待错键不推进/正确键推进/休止手动、自由弹、切声部裁剪、阻止误播 | 真机输出延迟或听感测量 |
| `piano-audio.test.ts` | 真正 SynthPiano 代码创建振荡器、频率、节点启动时刻、每指释放、全部停止、中断/启用失败 | 测试环境发出可听声音；AudioContext 为接口替身 |
| `piano-render.test.ts` | **真实 OSMD/VexFlow** 载入 XML 并生成 SVG、8 个小节框、25 个事件坐标与选中音符着色 | 真实浏览器排版；jsdom 无 canvas，文本宽度用确定性替身 |
| `piano-ui.test.tsx` | 多指独立 ID/黑键/释放取消、范围、模式、错误导入保留原谱、反馈隐私快照/焦点、后台暂停、刷新恢复设置与原谱 | OS 指针派发、多点硬件、Chrome 视觉；此套 UI 测试隔离谱面组件 |
| `piano-storage.test.ts` | fake-indexeddb 执行真实仓储逻辑、原谱/会话保存、恢复不自播、损坏设置、同谱多歌曲隔离、共享歌曲关联保留 | 手机上的配额、隐私模式或清理策略 |

生产构建的谱面引擎单独动态加载，压缩约 363 KB；Vite 对其大于 500 KB 原始 chunk 给出体积警告。构建仍成功，首次载谱速度需手机检查。

本次未运行实体 Android、浏览器听音、方向/触控延迟/来电/锁屏/缓存验收。没有把截图、模拟进度或替身测试标为真实音频验收成功。没有修改 Kotlin/Gradle，也没有生成或冒称新钢琴 APK。
