# 代码风格治理专项总报告（2026-11-16 ～ 11-17）

> 背景：用户发现长期 Agent 写码导致代码风格漂移，专项分两阶段：①六维度调研（命名/注释/结构/类型/重复死码/Agent 气味，6 个子代理并行扫描 + git blame 时间线验证）；②分批修复（六批，主代理 + 子代理流水线）。本文件是修复总账；调研问题清单见对话记录与 knip 台账。

## 修复账本（截至第六批中途）

### 类型与正确性

- tables/ 29 文件 `parse(row: any)`/`as any[]` 模板清零 → `SqliteRow` 契约（main/types/table.ts）
- 3 处危险静默吞错补 log.warn（skill ENOENT 区分 / video-note 转录 / 协作资源降级）
- useRemoteVideo 双轨统一时修复存量 bug：App.tsx 适配缺 `convertFileSrc()`，editor 远程视频缓存命中即不可播
- ChatContainer 行为护栏发现既有契约问题：`processMessageSending` 失败仍返回 true（已按现状锁定待重审）

### 一致性

- `WhiteBoard`→`Whiteboard` 550 处 + 14 文件改名；`ContentPreivew`/`VideoNoteIndexDBManager` 硬伤修复
- escapeHtml 7 处实现 → `@tau/shared/escape-html`（含 2 处补齐引号转义）
- shiki 两版别名表对齐包版超集

### 结构（8 个巨型文件/方法拆分，全部机器校验 + 测试护航）

| 目标                                | 前 → 后                                                           |
| ----------------------------------- | ----------------------------------------------------------------- |
| plugins/host.ts context()           | 2110 行巨法 → 222 行组装 + 39 域方法（后续又合并同构模板 -40 行） |
| vibe-learning-index-queue.ts        | 3046 → 门面 637 + 13 域文件                                       |
| whiteboard-documents/index.ts       | 1612 → 806 + ipc.ts 825（字节级审计）                             |
| collaboration/index.ts（desktop）   | 1411 → 423 + 6 域文件                                             |
| content-runtime/index.ts            | 1729 → 639 + 6 新 + 2 增补                                        |
| ChatContainer.tsx                   | 1975 → 862 + 10 域 hooks（11 用例护栏先行）                       |
| review-session.ts                   | 1561 → 19 门面 + 7 域文件                                         |
| mobile collaboration/manager.ts     | 1604 → 384 + 12 域文件                                            |
| whiteboard collaboration/binding.ts | 1680 → 382 + 9 域文件                                             |

> 1500 行生产文件：8 → **0**

### 注释

- 决策元数据（方案X/定稿/D-0xx/M徽章/mockups 路径）约 600 处清零（328 文件）
- 动词播报注释约 400 处清理（model-downloader + database/editor/chat-ui/desktop-src 批）

### 死代码与栅栏

- knip 落地（knip.json + root devDep）：全仓 1242 → 694 →（scripts 收尾批进行中）
- 零消费导出清除约 560 处（utils 63 / whiteboard 46 / mobile 66 / desktop 342 / 杂项包 57）
- 死模块/死导出删除：utils/daily.ts、web-clip 2 导出、search/rag/calendar 等 11 个整文件
- 甄别口径沉淀于 [2026-11-16-knip-unused-exports.md](/docs/notes/2026-11-16-knip-unused-exports.md)（同名不同源 / namespace-spread / 框架路由 / barrel 死直连活）

### 规则沉淀

- docs/decisions.md 新增「代码风格」节 4 条：console 即 logger / SqliteRow / 查询失败禁止静默空集合 / 旧副本当批回收

## 第六批（过夜批，全部完成 2026-11-17 晨）

- whiteboard/collaboration/binding.ts：1680 → 382 门面 + 9 域文件（AST 校验，3211 测试一致）——**>1500 行生产文件清零**
- host.ts 同构模板合并：六 provider 登记与 todos/calendar CRUD → 2 工厂 + 声明式配置（-40 行，42 项属性护栏一致，357 测试过）
- any 治理两批：desktop 132 处（111 修 + 21 边界标注）、packages 145 处（105 修 + 40 结构边界清单）——`no-explicit-any` 生产源码仅剩已标注的结构性/第三方边界
- mobile useMobileEditorToolbarController：1467 → 526 + 11 子 hook（424/424）
- knip 收尾：browser-extension 13 → 0；修正「root/scripts 是大头」误判（该区为 entry 零命中）
- 英文双声部注释批：src-electron 44 处（23 删 + 21 译）+ tables 补扫 6 处
- 顺带修复用户提交引入的契约漂移：aurora 动效词未同步 cn.ts 词表（cn.test 红转绿）

## 终态（2026-11-17 晨验收）

tsc desktop + mobile 双端 0 错误；whiteboard 3211 / editor 861 / plugins 357 / tables 207 等全绿；lint warnings 5874 → 5666；knip 694（拆分新导出的少量回归属结构成本）。第六批改动在工作区待提交（131 文件，净 -2131 行）。

## 剩余项（按价值）

1. `whiteBoardContentId` 持久化 key 迁移——**待用户定策略**（读兼容渐进迁移 vs 保持现状）
2. lint 存量 `no-non-null-assertion` 3516 处——升 error 前置，量大需专项
3. pi 会话三套类型对齐（SessionEntry/PiTranscriptMessage/AgentMessage 的 as unknown as 焊接）——设计级
4. ChatInputArea 双轨（desktop 859 vs shared 858，diff 961 行）——迁移级
5. 双声部英文注释残留（src-electron 老模块 + whiteboard 约 40-60 文件）
6. packages/editor 与 blog 的 strict:false 盲区

## 验证口径

每批：全仓 tsc（desktop + mobile）零错误 + 受影响测试套件全绿 + knip/lint 总量对比；拆分类全部附机器校验（文本归一 / AST / TS compiler API 三档），累计拦下 9 处真实搬运偏差。
