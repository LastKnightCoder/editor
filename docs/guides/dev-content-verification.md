# 正文回归与容量验证

## 1. 按改动范围选择入口

| 改动                          | 判据                                                                                     | 入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 身份、节点、契约与关系        | 原文、节点 ID、契约字典、关系与计数一致。复制取得新身份，清理仅作用于目标持有            | [正文模型基准](/packages/collaboration/src/content-baseline.test.ts)、[业务入口基准](/apps/desktop/src-electron/main/modules/tables/__tests__/content-business-baseline.test.ts)、[正文归属基准](/apps/desktop/src-electron/main/modules/tables/__tests__/content-ownership-baseline.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 日志、投影、打开与关闭        | 日志接纳和主库确认分别检查。迟到输入不丢，回滚不留半成品，关窗或切库只影响目标租约       | [耐久基准](/apps/desktop/src-electron/main/modules/collaboration/__tests__/content-durability-baseline.test.ts)、[编辑投影与资产](/apps/desktop/src-electron/main/modules/collaboration/__tests__/manager-node-document.projection.test.ts)、[冷缓存与资料库切换](/apps/desktop/src-electron/main/modules/collaboration/__tests__/manager-node-document.recovery.test.ts)、[共享发布与解绑](/apps/desktop/src-electron/main/modules/collaboration/__tests__/manager-node-document.share-lifecycle.test.ts)、[Agent 编辑与替换](/apps/desktop/src-electron/main/modules/collaboration/__tests__/manager-node-document.agent-operations.test.ts)、[桌面组合](/apps/desktop/src-electron/main/modules/content-runtime/composition.test.ts) |
| 业务、插件、Agent、待办与索引 | 权限、修订、原操作回执、冷写与活跃写均按对应入口核对。旧或缺失的索引可由主库重建         | [生产正文 IPC](/apps/desktop/e2e/content-production.spec.ts)、[插件实际写入权限](/apps/desktop/src/app/plugins/__tests__/sqlite-write-permissions.test.ts)、[协作与 Agent IPC](/apps/desktop/e2e/collaboration.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 跨端正文存储、移动投影与白板  | 桌面块布局写入，经移动完整读取和写回，再由桌面读写。共享身份、行正文、双向嵌入与持有一致 | [桌面与 Rust 同库往返](/apps/desktop/src-electron/main/modules/tables/__tests__/content-storage-roundtrip.test.ts)、[生产白板 IPC](/apps/desktop/e2e/whiteboard-production.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 导入与导出                    | 真实 ZIP、图片字节、未知契约与源码、独立副本身份和包外链接降级                           | [正文导入导出往返](/apps/desktop/src/services/__tests__/content-transfer-roundtrip.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

使用仓库的正常构建产物。记录源码版本、锁文件、夹具、真实或替身边界、退出码和失败样本。断言直接核对独立预期及存储结果。现有命令覆盖目标行为时优先运行对应定向用例。

## 2. 重放真实桌面与跨端入口

在 `apps/desktop` 执行，使用隔离数据目录、本机测试服务和随机端口。确保本地依赖已安装。测试启动器直接运行构建出的 Vite、Electron 主进程与预加载产物。

```sh
./node_modules/.bin/vite build --configLoader runner
node scripts/verify-renderer-startup.mjs
./node_modules/.bin/playwright test e2e/content-production.spec.ts e2e/whiteboard-production.spec.ts
```

正文生产套件中的共享服务场景覆盖发布、撤权、丢回执、主库提交后硬杀与重开。核对旧视图被拒绝、原请求只产生一次效果、服务端与主库达到预期终态。白板生产套件核对富文本、跨页、引用与协议 3。专用协作套件适合检查视图、Agent 共编与故障恢复，其中独立主库夹具的覆盖范围以源码为准。

```sh
./node_modules/.bin/playwright test e2e/collaboration.spec.ts
TAU_COEDIT_E2E=1 ./node_modules/.bin/playwright test e2e/collaboration.spec.ts
```

桌面与移动往返使用本机 Rust 工具链和 Tauri 项目依赖，从 `apps/desktop` 执行。任选独立的绝对报告路径。验证器让桌面和 Rust 依次操作同一 SQLite 文件，核对普通与共享路径的布局 `3 → 2 → 3`。保存移动执行日志，确认 Rust 的精确用例实际执行。

```sh
TAU_CONTENT_STORAGE_ROUNDTRIP=1 \
TAU_CONTENT_ROUNDTRIP_REPORT=/tmp/tau-content-roundtrip.json \
./node_modules/.bin/vitest run src-electron/main/modules/tables/__tests__/content-storage-roundtrip.test.ts --maxWorkers 1 --no-file-parallelism
```

往返夹具为 [普通正文](/packages/db-schema/fixtures/content-storage-roundtrip-v1.json) 和 [共享正文与表持有](/packages/db-schema/fixtures/content-storage-roundtrip-g4.json)。协作协议变动还要比对真实 Node 和本机 Worker 的请求与回执。服务配置及放行入口见 [协作服务部署](/docs/guides/ops-collaboration-deploy.md) 和 [白板协作发布验证](/docs/guides/ops-whiteboard-release.md)。

## 3. 容量、硬杀与长稳

构建桌面产物后从 `apps/desktop` 顺序执行。每次切换候选产物或环境时重新记录摘要。完整模式使用以下默认参数。

```sh
TAU_CONTENT_G4=capacity ./node_modules/.bin/playwright test e2e/content-load-g4.spec.ts -g 容量
TAU_CONTENT_G4=recovery ./node_modules/.bin/playwright test e2e/content-recovery-g4.spec.ts
TAU_CONTENT_G4=soak ./node_modules/.bin/playwright test e2e/content-load-g4.spec.ts -g 长稳
```

- **容量。** 覆盖 1、5、20 份正文与每份 1、2、5、10 个 IPC 租约的 12 个组合。单篇运行 20 个固定种子、10,000 次接纳，超出单次增量限制时原正文保持。核对关系、计数和外键，记录请求耗时。租约可来自同一窗口，多窗口行为另由生产 IPC 覆盖。
- **硬杀。** 在日志增量事务内、日志事务提交后、主库投影事务内及主库事务提交后分别实际 `SIGKILL`，每点 20 次。进程外读 SQLite 确认切点。查看正文、修订、关系和计数，重复重送原增量后只保留一次投影与业务流水。
- **长稳。** 预热五分钟后连续采样六十分钟。包括本机及共享编辑、投影、空闲、实际 WebSocket 断线、重连、切库与重开。每五分钟采集进程内存，每十分钟核对主库、服务端和关系，最后排空退出。按样本窗口核对增长趋势及持有、积压、连接恢复情况。

需要快速检查时，给容量和硬杀命令加 `TAU_CONTENT_G4_QUICK=1`，分别保留 12 组租约组合及单篇 1,000 次接纳、四点各两次硬杀。`TAU_CONTENT_G4_SMOKE=1` 用于检查测试入口和观测是否工作。为完整、快速和烟测结果分别记录覆盖量；并行快跑的耗时只作观测。

## 4. 比较投影性能与诊断失败

1. 使用 `pnpm --filter desktop test:content-projection:stress` 对冻结输入独立运行三轮，通过 `TAU_CONTENT_STRESS_REPORT` 写入不同 JSON 文件。已有依赖可从 `apps/desktop` 运行 `TAU_CONTENT_STRESS=1 ./node_modules/.bin/vitest run src-electron/main/modules/collaboration/__tests__/manager-node-document.agent-operations.test.ts -t 正文投影压力 --testTimeout 120000 --maxWorkers 1 --no-file-parallelism`。如发现 SQLite ABI 不匹配，执行仓库的 `scripts/ensure-node-sqlite.mjs` 并复核 Electron 与 Node 各自的 SQLite 实例。
2. 固定同一机器、依赖、输入与运行配置，性能轮次之间保持串行，并与构建和其他压测错开。14 个正确性场景全部通过后，比对同场景 P95 中位值，初始冻结门槛是 `基线中位 P95 × 1.20 + 5ms`。初始冻结基线（源码 `dee0f8bb`，同机顺序三轮、每轮 14 场景通过，P95 中位 / ms）：32 段 × 256 字符——空保存 0.099、编辑保存 3.287；256 段 × 512 字符——0.093、2.414；1,024 段 × 1,024 字符——0.090、7.476；基准进程采样最高 RSS 584 MiB、heap 236 MiB。测试进程 RSS 或 heap 采样峰值高于基线 20% 时进入调查。P99 至少使用 1,000 个样本，Node 样本与真实 Electron 内存单独记录。
3. 检查独立结果 JSON 和进程退出码，区分超时、切点未命中、用户中断和断言失败。正文保存故障按 `journalSaved`、`committed` 和 `stage` 查实际提交阶段。真实设备、输入法、焦点、附件、界面及向量模型由实际操作覆盖。 [正文保存故障排查](/docs/guides/development-quality.md#正文保存故障排查)

## 5. 实际设备验收

自动回归之外，正文模型与迁移类改动用独立测试库在真实设备走查一轮；保留系统与应用版本及每项结果（通过 / 失败 / 未覆盖），失败时附设备、库、前置状态、操作顺序与实际结果以便重放。

| 项目                   | 操作                                                                                                                                    | 通过条件                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| iOS / Android 整库往返 | 用平时配置的同步提供方下载桌面测试库，打开一对共用正文的卡片和文章，编辑共用正文与数据表行正文并同步回桌面                              | 两个业务入口仍指同一正文，行正文可打开；中文、粗斜体、源码、未知插件占位、正文链接和嵌入保留 |
| 手机输入与生命周期     | 中文输入法编辑正文，组合输入期间切前后台，完成后离开再开；保存后系统结束应用重开；编辑未确认时切到有同编号正文的另一测试库              | 重开结果与最后确认输入一致，输入法焦点符合预期；另一库同编号正文未被旧保存改写               |
| 含图片正文协作         | 桌面发起，iOS / Android 加入；断网编辑后恢复连接核对另一端；撤销一个成员权限后作者退出共享                                              | 合法改动收敛，附件可预览，撤权设备停止共享编辑；退出共享后回本机正文可继续编辑且图片可读     |
| 白板与正文互嵌         | 桌面编辑板内富文本并跨页移动（中文输入 + 撤销）；板内正文复制成待引用正文，移除反向白板嵌入后重开原板；移动端查看相邻正文与占位后同步回 | 跨页移动保持内容、样式、光标与撤销；被持有的页面仍可打开；移动端占位不破坏嵌入               |
| 待办与脉络回跳         | 勾选、改名正文待办并从待办页回跳；打开脉络中的导航回链与白板嵌入                                                                        | 待办状态、标题与正文一致，回跳聚焦正确块，原格式与无关节点保持                               |
| 实际语义索引           | 测试库配置嵌入模型或插件，编辑正文触发索引重建后做精确与同义词查询                                                                      | 新词全文命中，同义词按配置召回更新后正文，旧内容不在重建后顶替结果                           |
