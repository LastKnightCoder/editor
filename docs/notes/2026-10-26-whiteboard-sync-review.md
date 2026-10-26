# 白板同步流程与架构审阅

审阅日期：2026-10-26。代码基线：`bfd09d334`。总体结论：**REQUEST_CHANGES，先修复故障路径，再收敛状态管理与历史遗留实现，不建议重写 CRDT 内核。**

白板已经具备较完整的本机耐久保存、远端幂等提交、多窗口隔离和服务端候选校验。主要风险集中在这些机制之间的交接：退出共享的提交边界不完整，文档级冻结被扩大为资料库级限制，远端同步初始化失败后缺少恢复路径。本轮记录 **3 项 P1、3 项 P2**；其中 5 项行为类问题通过 6 个独立故障注入场景复现，长期存储成本问题来自代码路径分析。

此前的保存确认通知修复已独立提交为 `bfd09d334`，包括 Electron 通知参数适配、超时提示、回归测试与架构说明。本报告审阅的是修复后的完整流程；下述问题尚未实施修复。

## 1 审阅范围和判据

重点检查四个层次之间的调用、持久化顺序、失败恢复与资源释放：

| 层次         | 主要入口                                                                              | 责任                                           |
| ------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 画布与渲染端 | `DocumentBoardCanvas`、`WhiteboardCollaborationBar`、`services/whiteboard-documents/` | 编辑、输入冲刷、本机草稿、同步调度与状态展示   |
| 桌面主进程   | `modules/whiteboard-documents/`、`durable-document-lifecycle`                         | 租约、日志、主库投影、发布和退出编排、网络会话 |
| 共享协议     | `packages/collaboration` 的文档模型、`document-sync`、`document-operations`、写队列   | 候选验证、因果完整性、操作身份、确认与隔离     |
| 服务端       | Cloudflare 的路由、Store、资源入口；Node 服务用于本地链路验证                         | 身份和成员权限、SQLite 事务、回执、资源预算    |

同时检查 `packages/whiteboard` 的绑定入口、桌面现行架构文档、协作架构文档及白板任务文档的冲突点。没有进行视觉验收，没有修改用户资料库，没有访问或部署正式协作服务；测试使用临时库、本地 Node 服务和本地 workerd。其他未提交的移动端、网站和版本变更不属于本次修复提交与审阅结论。

严重性口径：P1 为应优先修复的正确性或可用性问题；P2 为有明确触发条件的生命周期缺陷或长期成本问题。没有将所有潜在竞态、未覆盖路径或大文件本身直接计为缺陷。

## 2 当前完整流程

### 2.1 一次编辑如何保存和同步

1. `DocumentBoardCanvas` 从 registry 获取同窗口共享的 `WhiteboardDocumentClient`。多个画布保有各自视图和历史，文档会话按资料库与 documentId 复用；Activity 隐藏不会立即释放它。
2. 画布通过 binding 修改 Y.Doc。客户端为本机增量生成 batchId，先写 IndexedDB outbox，事务完成后才发给主进程。
3. 主进程验证窗口、资料库与租约，按文档串行校验候选。先把增量和完整检查点提交到 FULL/WAL 日志，再更新内存模型及主库投影。
4. 保存回执分别报告 `revision` 和 `projectedRevision`。日志已成功但投影失败时，内容仍有耐久副本，但依赖保存的操作不能成功退出。
5. 已绑定共享的客户端由 `WhiteboardRemoteSync` 调度：输入后 800ms 发起同步，空闲每 10 秒检查，窗口隐藏时为 30 秒；部分网络错误指数退避。
6. 主进程 `remote-sync` 先解决已有网络提案，再刷新远端确认、计算本机差量。`DocumentSyncSession` 先持久化提案身份与字节，随后查询或提交服务端操作。
7. 服务端按成员权限、基线、epoch、版本、摘要和预算校验，更新与 COMMITTED 回执在同一事务内完成。客户端只有读到匹配回执才移除网络待确认项。
8. 主进程把本机缺少的远端增量再次交给本机日志与投影，广播到渲染端。它是远端输入，不重新进入本机 outbox，也不应记入用户本机撤销历史。

关键代码：[客户端保存](/apps/desktop/src/services/whiteboard-documents/client.ts)、[本机会话](/apps/desktop/src-electron/main/modules/whiteboard-documents/sessions.ts)、[网络同步状态机](/packages/collaboration/src/document-sync.ts)、[服务端操作账](/packages/collaboration/src/document-operations.ts)。

**桌面白板当前实际使用 HTTP 操作回执和轮询。** 服务端具备 WebSocket/Hocuspocus 能力，不代表桌面这条白板链路已经走 WebSocket。没有本机编辑时，远端可见延迟取决于轮询周期与请求耗时；这是现行传输选择，不应归因于 Yjs 合并缓慢。[传输适配](/apps/desktop/src-electron/main/modules/whiteboard-documents/remote.ts)

### 2.2 为什么没有打开画布也有保存确认

“共享本地内容”会临时 retain 并打开白板文档客户端。主进程发布前向所有相关租约发送 drain，渲染端冲刷输入和 outbox 后回复 `drained(requestId)`。这里的“确认”完全由应用内部完成，不是人机确认，也不是协作者批准。

此前错误是命令订阅把 Electron 的第一个参数事件对象当作第二个参数业务载荷，导致客户端无法识别 leaseId。这已在基线提交中修复。八秒保护仍然保留，真正的保存失败不得通过延长超时或假回复成功绕过。

### 2.3 首次共享和加入共享

首次共享先冻结目标白板，再固定发布任务、页面范围和候选；创建房间使用幂等身份，资源上传后构建带共享 meta 的新基线。服务端发布回执核验成功后，经 `WhiteboardInstallation` 安装主库与本机日志，最后登记共享绑定并使旧租约失效。

成员打开房间时，`remote-install` 先固定本机 documentId，从远端确认状态创建本机文档，再写入绑定。已有绑定和本机副本时复用它，正常编辑随后进入同一保存与同步链路。[发布编排](/apps/desktop/src-electron/main/modules/whiteboard-documents/transitions.ts)、[安装协议](/apps/desktop/src-electron/main/modules/whiteboard-documents/installation.ts)

### 2.4 结束共享与退出协作

| 动作               | 远端处理                         | 本机结果                                                   |
| ------------------ | -------------------------------- | ---------------------------------------------------------- |
| 作者结束共享 close | 获取最新确认，以修订条件关闭房间 | 合并本机与远端确认内容，转存资源，安装不带共享身份的新基线 |
| 成员退出 leave     | 先补交本机差量，再退出房间       | 保留本机副本与可下载资源                                   |
| 转为本机 detach    | 不要求远端仍可访问               | 只使用可用的本机内容和缓存资源，报告缺失引用               |

服务端完成后记录 `remoteDone + candidate`，后续重试应只完成固定候选的本机安装。作者结束共享并不向成员补发作者未同步的编辑：这些编辑保留在作者本机副本，现有测试也明确断言成员看不到它们。产品是否要改为“先同步再关闭”属于语义选择，不能在重构时静默改变。[退出候选](/apps/desktop/src-electron/main/modules/whiteboard-documents/unshare.ts)

### 2.5 各份状态为什么存在

| 状态               | 解决的问题                             | 不能替代它的状态                        |
| ------------------ | -------------------------------------- | --------------------------------------- |
| 画布模型和内存历史 | 当前交互、视图撤销                     | 主库投影无法重建全部交互历史            |
| IndexedDB outbox   | 增量尚未取得主进程耐久回执             | 仅内存队列无法承受渲染进程重建          |
| 本机 journal       | 主库投影失败、整库替换后的保存核对     | 主库 JSON 不能证明原始 CRDT 基线        |
| 主库文档和页面投影 | 页面、列表、关系和业务数据查询         | 网络确认不代表本机投影成功              |
| remote_branches    | 网络结果未知、重试身份与被拒分支       | HTTP 成功或失败本身不能证明最终提交状态 |
| 发布和安装记录     | 服务端、主库、本机日志之间的分阶段提交 | 三个独立存储之间不存在天然单事务        |

这些状态各有失败边界，不能仅因“有多份数据”合并成一份。需要治理的是终态归档、共享的状态判定和生命周期，而不是删除可靠性层。

## 3 主要发现

### F1 P1 结束共享安装准备失败后，新编辑会被旧候选覆盖

**位置：** [主进程 index.ts](/apps/desktop/src-electron/main/modules/whiteboard-documents/index.ts) L554–557、L1197–1223；[transitions.ts](/apps/desktop/src-electron/main/modules/whiteboard-documents/transitions.ts) L75–80。

服务端关闭成功后，代码先保存 `whiteboard-unshare` 的 `remoteDone` 和 candidate，再执行 `installation.prepare`。如果 prepare 在生成安装记录前失败，`transitions.blocked()` 看不到这份退出任务，因为它只检查安装记录和首次发布任务。异常处理因此 rollback 并解冻旧会话。

此时用户的新编辑仍可经 append 取得保存回执。重试退出时直接复用原 candidate，而 `installation.prepare` 又把此刻的新主库状态作为安装前提，最终合法地把新编辑替换成失败前的旧候选。

**已复现：** 正常共享 → 让 `installation.prepare` 首次抛出 `disk full before prepare` → 确认服务端房间 closed、退出任务 remoteDone → 追加“失败后新编辑”并确认本机可读 → 重试退出 → 重新打开后该文字消失。旧代次日志可能仍留有字节，但当前白板被覆盖，正常产品流程不会自动恢复这段编辑。

**建议：** 将退出任务纳入统一的文档写入屏障；候选和源修订应在远端不可逆操作前固定，失败恢复不能重新选择安装前提。服务端已完成或结果未知时保持该文档冻结，只允许完成原提交或进入明确的冲突处理。补测 `prepare` 前、任务写入失败、远端回包丢失及重启四个位置，而不只测试 `install` 失败。

### F2 P1 单文档发布失败会阻塞同资料库其他白板

**位置：** [主进程 index.ts](/apps/desktop/src-electron/main/modules/whiteboard-documents/index.ts) L270–278、L363–367、L416–419、L797–800。

发布建立带 documentId 的 drain，但 `assertOpenAllowed` 只比较窗口和资料库，没有比较目标文档。发布任务固定后遇到网络失败，保留 drain 是为了保护该白板；这份 drain 却会使同资料库其他白板的打开、创建和部分资源操作也被拒绝。

**已复现：** 同库创建 A、B → 打开 A → 断网发起共享 A → 收到 OFFLINE 且任务保留 → 打开 B，得到“白板正在关闭或切库”。B 没有参与 A 的发布。

**建议：** 区分资料库／窗口级维护屏障与文档级转换屏障。目标文档已知的操作按 documentId 匹配；创建新文档不应被无关文档的发布挡住。不能通过失败时无条件清空所有 drain 修复，否则会破坏结果未知的发布保障。回归需覆盖同库异文档、跨窗口与不同资料库。

### F3 P1 同步挂接首次失败后，存活客户端不会再尝试

**位置：** [registry.ts](/apps/desktop/src/services/whiteboard-documents/registry.ts) L54、L70、L90–103；[状态行](/apps/desktop/src/features/whiteboards/components/WhiteboardCollaborationBar.tsx) L43–50、L90–94。

`attachRemote` 读取共享绑定失败时吞掉异常，客户端仍作为成功结果返回。后续 `entry.open()` 只要发现客户端还存活便直接返回，不再执行 attachRemote。界面重新读到共享绑定，也不会补建远端同步器；没有同步器时，状态函数只显示本机保存，重试同步按钮也不出现。

**已复现：** 共享状态首次查询失败 → `entry.open()` 仍成功 → 让之后查询可成功 → 再次 open 返回同一个客户端，查询仍只调用一次，`whiteboardRemoteSync(client)` 始终为 undefined。测试直接注入查询失败，确认的是恢复路径缺失，不代表正常本地状态查询经常失败。

**建议：** 保留本机可编辑降级，但把“没有绑定”和“绑定读取失败／同步尚未挂接”分成不同状态；对后者提供可重试、幂等的挂接任务。已有客户端复用和共享状态刷新都应能驱动重试，成功后发布可订阅的同步器状态；禁止建立两个轮询器。

### F4 P2 迟到的保存请求可以在超时恢复后重新冻结客户端

**位置：** [client.ts](/apps/desktop/src/services/whiteboard-documents/client.ts) L102–103、L309–316；[主进程 index.ts](/apps/desktop/src-electron/main/modules/whiteboard-documents/index.ts) L1286–1296、L1374–1378。

drain 在 `await this.ready` 后才设置 frozen。若主进程已经得到 open 的租约，而渲染端仍在等待 IndexedDB 读取或初始化，主进程可以先超时并发送 resume。resume 仅按 leaseId 清除 frozen，没有取消正在等待的 drain。初始化完成后，旧 drain 继续执行、重新冻结并回复已过期的 requestId；主进程忽略这条迟到回执，不会再次发送恢复通知。

**已复现：** 暂停 outbox.list → 发送 drain → 发送代表超时回滚的 resume → 完成初始化 → 客户端回复旧请求，但 frozen 最终为 true。这里直接控制消息顺序，没有让测试实际等待八秒。

**建议：** 冻结请求和取消都携带请求身份或单调代次；resume 使旧 drain 失效，跨 await 后重验当前请求。若有重叠 drain，取消旧请求不能解除新请求的冻结。测试必须覆盖“先取消、后初始化完成”和“新请求已经开始、旧请求才完成”。

### F5 P2 会话的无持有者清理没有闭环

**位置：** [registry.ts](/apps/desktop/src/services/whiteboard-documents/registry.ts) L42–43、L105–121；[主进程 index.ts](/apps/desktop/src-electron/main/modules/whiteboard-documents/index.ts) L232–245、L822–826、L1090–1095。

两处独立生命周期缺口已复现：

- 主进程释放最后一个本机租约后，只删除 remoteViews，remote Map 仍保存完整 `DocumentSyncSession`。它没有普通释放时的引用计数或容量驱逐；完整确认快照和历史回执会随应用进程继续存活。
- 在列表发起共享的临时客户端收到 detached 后，主进程租约已失效。最后一个 retain 释放时仍先调用 client.flush，它因旧租约被拒而中止；异常被外层吞掉，client 没有 dispose，通知监听仍保留。没有画布重新 open 来替它清理时，这条路径尤其直接。

**已复现：** 本机 holders 和 remoteViews 均为零，remote.size 仍为 1；另一场景中 detached 后释放临时客户端，flush 抛“白板视图不属于此窗口”，client.isDisposed 仍为 false、drain 监听数仍为 1。

**建议：** 对已失效且完成提交的客户端走专门清理分支，先保留必要草稿，再释放模型和监听，不对失效租约反复保存。主进程网络会话按活跃视图、在途提交和转换任务计数，空闲后从内存驱逐；未确认或被拒的磁盘材料继续保留。不能用 finally 无条件 dispose 掩盖真正的保存失败。

### F6 P2 终态历史与热状态混存，长会话成本持续增长

**位置：** [document-sync.ts](/packages/collaboration/src/document-sync.ts) L90–91、L115–117、L127–129、L328–331；[远端日志](/apps/desktop/src-electron/main/modules/whiteboard-documents/remote.ts) L44–56；[transitions.ts](/apps/desktop/src-electron/main/modules/whiteboard-documents/transitions.ts) L97–102、L234–235。

每次成功提交都向 receipts 追加记录；snapshot 克隆整个同步状态，persist 再克隆，并将整份状态 JSON 序列化、计算摘要、覆盖 SQLite 单行。回执不再携带完整旧快照，已经减少了负担，但条目数量仍没有界限。操作累计 n 次时，仅完整回执序列的反复序列化就有累计 O(n²) 的工作量；这里是代码复杂度判断，不是实测延迟结论。

首次发布完成后，`whiteboard-publications` 仍保留 bundle、完整 state 与资源映射；每次 save 又读写整份任务数组。安装候选和本机旧代次日志另有保留机制。普通本机增量表也没有在线压缩路径，主要在文档最终 retire 时整体删除。

**建议：** 热状态只保留当前确认、待确认和必要摘要；终态回执以操作身份单独索引，不能为裁剪数组而破坏重复 ID 的幂等判定。发布任务终态化后保留最小身份和回执，候选正文按安装读回成功、旧代次持有及引用条件退役。为历史保留与压缩分别定预算和验收数据，禁止直接删除未决分支或按日期猜测可删性。

## 4 架构判断

### 4.1 已有设计应保留

- **候选验证和持久化分层合理。** 本机日志提交成功后才广播；远端操作更新与回执同事务；同一 batchId／operationId 不得换字节。接口返回成功的含义基本明确。
- **身份隔离具体。** 本机会话检查数据库连接对象、sourceId、baselineId、epoch 和窗口租约；远端提案绑定房间、基线、epoch、版本和增量摘要。不能把它们缩成一个 documentId 比较。
- **服务端存在二次授权。** Worker 的操作入口检查成员，进入逐文档队列后和最终安装时再次检查权限、冻结和基线，降低等待期间权限变化的风险。[Worker Store](/apps/collaboration-cloudflare/src/store.ts) L272–409。
- **结果未知的网络请求有恢复依据。** 先记提案再发送，先查回执再重投；明确终态才移出队列，过期续投也有基线约束。
- **资产处理沿契约扫描。** 未知插件字段不按名字猜资源；detach 不伪造完整下载成功，缺失引用被保留和计数。

### 4.2 复杂度集中在编排层

`WhiteboardDocumentsModule` 长 1386 行，同时拥有 IPC 身份校验、视图生命周期、冻结、发布、退出、资源接口、回收与远端调度。问题不只是文件长度：F1 的 blocked 判定和退出任务分别归不同对象，F2 的同一 drain 被不同范围的入口解释，F5 的租约与网络会话又由不同 Map 管理。

建议按责任渐进拆成四个单元，先用测试固定行为，再移动代码：

| 单元                 | 应拥有的状态                                   | 明确边界                                    |
| -------------------- | ---------------------------------------------- | ------------------------------------------- |
| 视图与生命周期协调器 | 租约、在途打开、请求身份、文档／窗口／库级屏障 | 统一回答可否打开、可否写入、如何取消冻结    |
| 共享转换协调器       | 发布、退出、固定候选、提交进度                 | 统一回答是否处于不可恢复编辑的提交阶段      |
| 远端会话管理器       | 房间会话、同步串行队列、视图引用与驱逐         | 不直接操作 UI；不按页面是否可见推断会话可删 |
| IPC 接线层           | 参数检查、发起窗口、错误转换                   | 负责进程适配，不持有第二套领域状态机        |

`WhiteboardDocumentSessions`、`WhiteboardJournal`、`WhiteboardDocumentRepository` 和 `DocumentSyncSession` 已有相对明确的责任，暂不需要继续机械拆碎。也不建议为了减少文件数，把本机保存和远端确认合成一个“同步成功”状态。

### 4.3 产品反馈需要有明确来源

“已保存在本机”“等待远端确认”“发布结果未知”“服务端已完成但本机未安装”是不同状态，现有界面只完整暴露了部分状态。F3 会把“同步器没有成功创建”表现成本机空闲；F1 会把“只能继续本机安装”表现成普通失败并恢复编辑。

错误文案应由这些状态决定，而不是从通用错误字符串推断用户是否打开了某个窗口。错误码前缀目前能跨 Electron 保留原因，但后续宜在白板命令边界定义小型结果类型，至少区分可重试、需继续原提交和禁止编辑；无需先改全仓 IPC。

## 5 历史包袱和清理边界

| 项目                                                          | 证据和判断                                                                                                                            | 清理方式                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 过时的 adopt／rebuild 注释                                    | remote.ts、WhiteboardCollaborationBar、collaboration.ts、whiteboard-document 类型仍描述“采用新版本”，实际界面只提供 detach            | 可直接更新注释和对应说明，不改产品语义                                                                                  |
| `whiteboard-remote-clean` 读取                                | index.ts L227–230 读取旧 clean 计数，全仓检索未找到当前写入方                                                                         | 旧重建路径遗留；先明确旧本地标记的退役语义，再删键读取和 taintedBy 的历史偏移。不能未经核对就把旧已清理分支重新判为污染 |
| 桌面 `remote-stage`／`remote-cancel` IPC                      | 生产源码检索只找到 handler，调用只存在于测试；当前命令层没有对应生产封装，普通同步直接使用 session.stage/flush                        | 可列为桌面待删入口；删除前复核动态调用，改测试去覆盖实际链路。保留共享协议包中仍被使用的 stage/cancel 与操作账          |
| “条件提案已接入”与实际桌面链路                                | 绑定层有条件提交机制，桌面 `DocumentBoardCanvas` 没有接到上述条件 IPC；架构文档描述容易被读作已有端到端能力                           | 文档分别写清模型能力、宿主接口与已接产品入口；没有明确需求时不为消除死代码而补一个新功能                                |
| WhiteboardInstallation 使用 migrations 表和 ContentLocalState | 名称带迁移，但当前首次共享和退出仍依赖其分阶段提交与回执                                                                              | 属于现行能力复用，不是可直接删的旧格式转换。可在后续提炼中重命名，不能整表清除                                          |
| Node 与 Worker 两套服务实现                                   | Node 仍用于本地测试、自托管参考和旧库导出；Worker 是正式服务源码                                                                      | 保留消费者边界，以共享协议测试和 Worker 测试减少漂移；不能只因官方部署迁到 Worker 就删除 Node                           |
| 服务端格式迁移与备份协议                                      | 当前桌面不再调用格式升级，但服务端仍有公开接口、旧回执和备份／导入消费者                                                              | 必须单独制定协议退役与数据判据，不能在桌面清理中一并移除                                                                |
| 白板任务文档中的旧方案                                        | `docs/tasks/whiteboard-collaboration/README.md` 仍保留 migrations 声明、旧阶段状态与历史设计；现行 decisions 已拒绝客户端历史格式转换 | 整体任务结束时按沉淀→退役→索引收尾；仍未完成的发布验证应单独保留，不继续把旧方案当权威规范                              |

此外，白板模型里的 `recovery` 不全是旧格式恢复包：当前并发结构可能产生待确认归属的元素，退出候选仍明确检查它。清理旧恢复功能时应按真实消费者区分，不能按 recovery 关键词批量删除。

## 6 验证结果和覆盖缺口

| 验证                             | 本轮结果                                    | 解释                                                                        |
| -------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| 桌面保存、同步、主进程与画布专项 | 125 项通过                                  | 包含 3 个主进程故障注入探针；其余为已有／已提交测试                         |
| registry 与迟到 drain 专项探针   | 3 项通过                                    | 断言当前缺陷确实存在，不是断言已经修复                                      |
| `@tau/collaboration`             | 161 项通过                                  | 模型、并发、预算、协议及操作相关测试                                        |
| `@tau/whiteboard` 绑定与产品专项 | 83 项通过                                   | collaboration、collaboration-products、author-collaboration 三个文件        |
| Cloudflare 包                    | 两套 dry-run 构建成功；8 项通过、1 项跳过   | 使用本地 workerd 和真实 Worker SQLite；跳过的是需显式开启的远端重新部署测试 |
| 修复提交验证                     | 桌面 tsc、Vite 构建、格式检查、文档检查通过 | 提交钩子另通过数据库和白板边界检查；没有生成或安装新发行包                  |

六个故障探针使用现有测试夹具，在审阅时临时添加并执行，结果保存后从生产测试目录移除，没有混入修复提交。它们分别验证 F1、F2、F3、F4 和 F5 的两个分支。后续修复时应把对应探针改为“正确行为断言”并正式保留，不能把当前缺陷行为作为契约固化。

可重复执行的已有检查：

```sh
pnpm --filter desktop exec vitest run src/services/whiteboard-documents/__tests__ src/commands/__tests__/whiteboard-document.test.ts src-electron/main/modules/whiteboard-documents/__tests__ src/features/whiteboards/__tests__
pnpm --filter @tau/collaboration test
pnpm --filter @tau/whiteboard exec vitest run src/__tests__/collaboration.test.tsx src/__tests__/collaboration-products.test.tsx src/__tests__/author-collaboration.test.tsx
pnpm --filter @tau/collaboration-cloudflare test
pnpm check:docs
```

移除临时探针后，第一条命令应比审阅执行时少 3 项。全绿不能替代故障路径覆盖：原有退出测试注入的是 installation.install 失败，未覆盖 prepare 之前；主进程测试直接调用 drained，绕过了真实 Electron 通知参数；registry 复用和初始化乱序也缺少组合测试。

后续最低补测矩阵：

| 边界          | 必须覆盖的情形                                                                |
| ------------- | ----------------------------------------------------------------------------- |
| Electron 通知 | 两个参数、反订阅、真实客户端自动回复、错误回复、迟到取消                      |
| 同库多白板    | A 发布失败，B 仍能打开、创建资源和正常保存                                    |
| 退出共享      | 远端成功后 prepare 前失败、安装失败、写任务失败、重启续做、故障后不放行新编辑 |
| 同步挂接      | 首次查询失败、状态查询恢复、同客户端复用、无重复轮询器                        |
| 生命周期      | 临时客户端、Activity 隐藏、真实卸载、租约已失效、全部视图释放                 |
| 长期存储      | 大量已提交回执、重复发布／退出、历史归档后幂等重试与引用保留                  |

## 7 建议实施顺序

1. **先封住 F1 的错误提交边界。** 把退出任务的远端完成状态、固定候选与写入屏障统一起来；以故障后新输入不会被确认或覆盖为放行判据。
2. **修复 F2 和 F4 的冻结协议。** 明确文档、窗口、资料库作用域，并让取消具备请求身份。此阶段保留八秒保护。
3. **修复 F3 和 F5 的会话生命周期。** 同步挂接可恢复、失效临时会话可清理、无引用网络会话可驱逐；仅驱逐内存，不删除未决磁盘材料。
4. **治理 F6，再拆主进程编排。** 先定义终态归档和引用退役判据，补长会话测试，再按责任搬移代码。存储格式变化必须有明确转换与失败处理，不能靠静默丢旧记录缩小体积。
5. **清理已证实的遗留入口和文档。** 删除已核清消费者的桌面 IPC，更新过时注释，分离任务中的历史方案与待发布验证；服务端旧协议另设退役计划。

每一步可独立提交和验证。现有 CRDT、操作账、主库投影和资源契约继续作为基础，避免在修复流程边界时同时重写模型和传输协议。
