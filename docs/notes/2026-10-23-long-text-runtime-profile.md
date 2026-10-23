# 长文本正文：实际窗口性能采样与优化

日期：2026-10-23。范围为本地开发版桌面应用中已打开的 Markdown 正文窗口。

## 结论

首要瓶颈是目录同步逐个测量离屏标题，触发大量同步样式计算；其次是大绘制分块、重复全文字数统计及文档快照转换。已优化目录定位、目录条目复用、标题索引、分块与字数缓存。优化目录后的人工输入采样中，已记录键盘事件的 P95 从 1664ms 降到 536ms；最终配置的自动副本测试中，16 次固定输入/退格的独立交互 P95 为 152ms。

这些不是同一组重复输入的严格 A/B：人工两段的时长、操作与输入法状态不同，自动测试只输入 ASCII，不能将三组数字解释为统一的提速倍数，也不能据此宣称中文输入、长段粘贴等全部达到同样延迟。

## 文档与采样边界

未读取或输出参考文档正文。只在进程内统计节点规模、函数和耗时：约 2372 个顶层块、3.1 万个文档节点、10 万个 DOM 元素、358 个标题、587 个表格、9778 个单元格。原文字符串约 23.9 万个 UTF-16 代码单元，与去除标记后的正文字符数及产品字数统计不是同一口径。用户复现时增删内容会使规模略有变化。

接入方式为 Electron 支持的 SIGUSR1 本机 inspector，再用目标 webContents 的 debugger 采集 V8 CPU profile、Performance metrics、Event Timing、长动画帧和 devtools.timeline。未采集截图、DOM 快照或输入文本；输入记录只包含事件类型、长度、时间和目标标签。调试接口用法参见 [Electron 官方说明](https://www.electronjs.org/docs/latest/api/command-line-switches)。

第一段没有输入，仅为空闲基线，未用于输入结论。它还揭示：热更新保留了旧 useState 文档会话，第一轮 getText 快照缓存尚未在该实例生效。通过原有 flush 保存后，在进程内用 SHA-256 核对当前文本与磁盘一致，再刷新该窗口，确认后续采样已使用缓存实现。

## 有效人工采样

Event Timing 设置 durationThreshold=16ms；表中延迟取记录到的 keydown 条目，低于阈值的事件不在该分布内。它是此次键盘事件样本分布，不是完整页面的标准 INP 指标。

| 指标                         | 第一轮优化已生效、目录未优化 | 目录优化后 |
| ---------------------------- | ---------------------------- | ---------- |
| 录制时长                     | 约 50 秒                     | 约 30 秒   |
| 捕捉 keydown                 | 33 次                        | 53 次      |
| beforeinput                  | 28 次                        | 48 次      |
| 含中文组合输入               | 是                           | 是         |
| 进入 Event Timing 的 keydown | 32 次                        | 49 次      |
| keydown 中位数               | 344ms                        | 160ms      |
| keydown P95                  | 1664ms                       | 536ms      |
| keydown 最大值               | 2384ms                       | 696ms      |
| 样式重算累计                 | 9173ms                       | 3909ms     |
| 目录同步的 CPU 包含时间估计  | 4949ms                       | 1248ms     |

累计时间受录制时长和操作次数影响，不能直接据此计算提速比例。目录测量的根因另有浏览器长动画帧佐证：其中一帧的目录 sync 持续约 1718ms，强制样式/布局约 1711ms；另一帧约 1281ms，其中约 1275ms 为强制样式/布局。原始时序里 UpdateLayoutTree 明显比 Paint 更昂贵，因此没有优先更换语法高亮或编辑器框架。

V8 profile 出现部分负 timeDeltas，分析时按累计时间的单调上界归并；函数包含时间仅用于热点定位，以浏览器 metrics 和长动画帧交叉验证，不用单个 CPU 样本估计精确提速倍数。

## 实际实现

### 目录避免顺序测量离屏标题

原目录每次同步从第一个标题开始顺序读取 getBoundingClientRect；输入后宿主产生新目录数组，还会重新建立 effect 并立即同步。文档尾部操作可能连续触达数百个标题，唤醒 content-visibility 跳过的复杂 DOM。

现在优先检查上次位置的相邻标题；跨多节跳转时二分查找。单次同步内缓存已读矩形，未变化章节通常只读两个邻近标题，大幅跳转为对数级测量。标题索引按 editor.children 引用缓存，避免每解析一个锚点就重新 filter 全文；缓存随正文替换或重排失效。折叠隐藏的标题被排除，以保持可测量标题的位置顺序。

目录条目按 id、层级和文字复用；普通正文输入不使全部 Tooltip/目录条目重新渲染，也不重建滚动订阅。仍会按帧合并正文更新后的定位刷新，点击定位、触底末节及向上滚动判定保留。

相关代码：[目录组件](/apps/desktop/src/components/ContentOutline/index.tsx)、[位置算法](/apps/desktop/src/components/ContentOutline/position.ts)、[标题锚点](/packages/editor/src/extensions/header/src/operations.ts)。

### 缩小复杂文档绘制分块

顶层 chunk 从 1000 节点改为 100 节点，实际窗口从 3 个 chunk 变为 24 个。仍对最低层 chunk 使用 content-visibility:auto，限制离屏内容被测量时的样式计算范围；不卸载 Slate 节点，不引入完整虚拟化。

运行中只改 editor.getChunkSize 不会重建已缓存的分块结构，因此不能用这种动态覆盖当作分块大小的 A/B。此次只确认最终窗口为 24 块，并记录该配置下的自动结果；未对 1000/100 的独立因果收益作数值结论。

相关代码：[CoreEditor](/packages/editor/src/core/CoreEditor.tsx)。

### 字数统计复用未修改块

Markdown 正文统计改为消费当前 Slate 不可变顶层块，以 WeakMap 缓存每个块的共享字数计算结果。输入一个字只重新统计变化块；重排、删除和撤销复用缓存。避免为了字数再次读取 Y.Doc 并重建整篇正文。源码模式继续按原有解析和统计协议运行。

相关代码：[字数缓存](/apps/desktop/src/features/markdown-window/markdown/contentLength.ts)、[文件视图](/apps/desktop/src/features/markdown-window/markdown/MarkdownFileView.tsx)。

## 最终配置的自动副本测试

最后一段人工录制启动后窗口发生重载，Performance timeOrigin 变化、观察器上下文丢失；该段标记失效，没有用于结论。随后复制原文件到临时路径，在同一 Electron 进程和 Vite 应用中创建专用窗口，使用原 preload 与窗口角色运行真实文件会话、Y.Doc、Slate 和浏览器布局。

在正文中部固定位置，通过 CDP 原生键盘事件执行 8 次“输入 x → 退格”，共 16 次编辑，未替换编辑器或布局实现。最终 100 节点配置实测：

| 指标                  | 结果          |
| --------------------- | ------------- |
| 实际 chunk 数         | 24            |
| 固定编辑次数          | 16            |
| 独立交互中位数        | 136ms         |
| 独立交互 P95 / 最大值 | 152ms / 152ms |
| 脚本累计              | 1531ms        |
| 样式重算累计          | 7.7ms         |
| 布局累计              | 41.9ms        |

独立交互按 interactionId 合并取最大事件时长。另录制了脚本调度至两次 rAF 的延迟用于诊断，但它不等同于输入到绘制，不作为上表的交互延迟。

自动输入仅作用于临时副本，结束后副本字数恢复，且文件 SHA-256 与原文件一致。副本窗口和文件已删除，原文窗口保留；临时全局引用、webContents debugger 及本机 inspector 已清理。

## 证据产物

有效数据保存在本机 `apps/desktop/output/perf/2026-10-23-long-text/`，该目录被 Git 忽略，未包含正文副本：

- `actual-first-pass.cpuprofile`、`actual-first-pass-trace.json`、`actual-first-pass-metrics.json`：第一轮已生效时的人工输入基线。
- `actual-outline.cpuprofile`、`actual-outline-trace.json`、`actual-outline-metrics.json`：目录优化后的人工输入。
- `controlled-100.cpuprofile`、`controlled-100.json`：最终 24 块配置的固定输入副本测试。
- 两份 `*-summary.json`：热点摘要，人工指标口径以上表的 keydown 子集为准。

## 剩余瓶颈与边界

最终自动样本的首要业务热点转为 readSnapshot → local.getContent → yTextToSlateElement，以及 Markdown 序列化；表格全局选区订阅仍有可优化空间。下一阶段应优先验证按 Yjs 变更路径生成结构共享快照与增量 Markdown，而非继续扩大延迟 DOM 测量的优化范围。该改动涉及快照隔离、外部修改、撤销与多编辑器一致性，不能直接把编辑器内部可变引用作为公开快照返回。

当前仍是 React 开发构建，自动 ASCII 测试不能代替中文输入法、大段粘贴、表格选区与发布构建的专项验证。视觉验收未执行，留给用户后续完成。

## 验证结果

- 编辑器全量：133 个文件、788 项测试通过。
- 目录与 Markdown 文件相关：8 个文件、25 项测试通过，含随机跳转判定、测量次数上界、等价目录快照、源码虚拟锚点、标题重排、字数缓存与撤销、文件冲突及真实代码块回归。
- 编辑器与桌面 TypeScript 检查通过；修改文件 ESLint 无错误。
- 桌面 Vite 生产构建（渲染端、主进程、preload）通过，未执行安装包签名或发布。
- 文档检查、格式与 git diff 空白检查通过。
