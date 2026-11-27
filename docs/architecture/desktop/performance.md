# 桌面性能诊断

桌面端在本机维持有界时间线，关联窗口、页面、正文操作、阶段与进程资源；异常时固定前后证据。协议定义在 `apps/desktop/shared/perf-diagnostics.ts`，排查步骤见 [桌面性能排查](/docs/guides/ops-desktop-performance.md)。

## 模块与数据流

| 模块                                                      | 职责                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| renderer `utils/perf-trace.ts`                            | 页面与编辑器上下文、操作身份、阶段计时和批量传输                        |
| renderer `utils/perf-observer.ts`                         | 心跳、长任务、长帧、慢交互、堆趋势和查询频率                            |
| main `modules/perf-record.ts`                             | import 期可用的记录入口、窗口角色与上下文、AsyncLocalStorage 操作作用域 |
| main `services/perf-diagnostics.ts`                       | 有界时间线、异常状态机、证据固定与结构化摘要                            |
| main `services/perf-incident-store.ts`                    | 串行 gzip、临时文件原子替换、容量及过期回收                             |
| main `services/perf-cpu-*` / `workers/perf-cpu.worker.ts` | 异常 CPU 采样调度、原生接口、路径清理与热点聚合                         |
| main `modules/perf-monitor.ts`                            | BACKGROUND 采样、窗口/PID 映射、导出与反馈装配                          |

事件经 `perf-monitor:renderer-event` 独立通道传输。主进程验证白名单字段并补充 PID、窗口编号、webContents 编号和可信窗口角色，不接受渲染端自报的进程身份。正文、标题、查询文本、DOM 属性、数据库名和 IPC 参数不进入性能事件；同步写文件只记代码阶段标签。普通日志仍按自身规则记录异常原文及堆栈。

`PerfInput` 包含发生时间 `t`、事件类型、代码标签、耗时、状态、操作/父操作 ID、上下文及数值规模；主进程补充递增事件 ID、`receivedAt` 和来源。保留范围按接收时间计算，长任务起点仍使用发生时间。上下文包含 Page key/实例 ID、正文 ID、编辑器 ID、连接 ID、已连接编辑器数、保活页面数与可见/焦点状态。编辑器数统计宿主 effect 已连接的实例，Activity 隐藏后的保留对象不计入该数。

## 操作与阶段

`beginPerfOperation` 固定操作开始时的上下文；结束记录耗时及 ok/error/cancelled。阶段分别记录开始和完成，只有开始的操作也能被识别。渲染端仅在同步调用入口设置作用域，跨 await 显式传递 trace，避免并发与切页串线。主进程用 AsyncLocalStorage 延续异步数据库处理与持久化阶段。

接入点包括正文会话打开、契约准备/安装、文档绑定、编辑器命令、正文快照的 Markdown/偏移/哈希、改写计划、差异摘要、合并预览、delta 写入与投影。编辑器 ready 只记规模，不能解释为完整首屏耗时。已有启动、知识地图、向量扫描和插件加载阶段也进入同一时间线。

选定正文读写、快照与建议命令在数据库 IPC 尾参数内携带 `perfTrace`，与原数据库连接作用域共用一份元数据；主进程在业务分发前剥离。其他 IPC 保持原参数协议。`db-command` 是整次命令耗时，包含等待、转换及持久化，不能解释成 SQL 执行时间。IPC ≥100ms、数据库命令 ≥50ms、同步 IO ≥50ms 记明细；带 trace 的数据库命令及失败不受此阈值过滤。返回值尺寸只读取字符串/字节数组，不为诊断序列化返回对象。

## 常态开销与边界

- 时间线保留最近 120 秒，序列化事件预算 2 MiB；单事件最多 4096 字节。正在采集的异常片段单独固定最多 2 MiB，内存保留最近 3 个片段。
- 渲染端队列最多 64 条，通常每秒发送一批，关键操作开始可提前发送，每秒最多 8 次。主进程每窗口每秒最多接收 128 条，窗口上下文与速率桶最多各 32 项。
- 主进程每 5 秒采集事件循环直方图、堆和所有 Electron 进程的 CPU/RSS；渲染端堆每 5 秒采集。心跳 250ms、可见且聚焦时偏差 ≥120ms 才记录；长任务/长帧为被动 observer，慢交互阈值 200ms。没有常驻逐帧 rAF。
- 查询每分钟汇总前 5 个代码键家族（最多 256 个家族加 other），IPC 每分钟汇总前 8 个通道（最多 256 个）。不展开完整查询键。
- 追踪中的操作最多 128 个，超过 120 秒释放名额；CPU/堆进程状态各最多 64 项。记录器、传输和写盘丢弃量分别可见，异常回调失败不会抛回业务。

CPU 全部来自 `app.getAppMetrics()`，同时记录按整机归一的 `cpuMachinePercent`、乘以逻辑核心数后的 `cpuCorePercent` 与逻辑核心数。单核口径可超过 100%；主进程、renderer、GPU 采用相同口径。RSS 与 JS heap 分开，不能相加解释成总占用。

长帧保留最长脚本的函数/产物文件名标签，缺少脚本归因时省略 scriptMs。renderMs 为 renderStart 到帧末，styleLayoutMs 为 styleAndLayoutStart 到帧末，两者重叠且包含后续渲染；缺少指标时省略，不能当成零。

## 异常片段

| 信号         | 条件                                                                             |
| ------------ | -------------------------------------------------------------------------------- |
| UI 阻塞      | 心跳、长任务或交互 ≥500ms                                                        |
| 慢操作       | IPC、数据库命令、阶段、操作总耗时或同步 IO ≥1s                                   |
| 持续 CPU     | 同一进程单核口径 ≥80%，连续覆盖 15s，样本间隔超过 10s 则重置                     |
| 堆增长       | 同一进程 30s 内观测到 JS heap 增长 ≥128 MiB                                      |
| 操作未完成   | 开始后 8s 仍无结束，按主进程 tick 检查                                           |
| 错误与无响应 | React 根异常、更新循环、节点身份错误、未捕获异常/Promise 拒绝、窗口 unresponsive |

触发后固定前 60 秒可用数据并立即保存 recording 文件，收集后 30 秒后以 complete 原子替换。`beforeAvailableMs` 表示实际可用前文；字节预算截断记录 dropped。采集中重复信号合并 reason/PID/count，不延长采集窗口；完成后同一 PID/信号冷却 5 分钟，抑制次数进入 collector。受控关闭时标为 interrupted；上次会话留下的 recording 文件在读取时标为 interrupted。

目录为应用目录下 `logs/performance/incident-<session>-<id>.json.gz`（默认 `~/.editor/logs/performance/`）。写队列最多 4 项；文件最多 10 份、合计 32 MiB、保留 7 天，启动及写入后回收，只删除匹配诊断命名的文件。写入失败计数并保留普通日志告警。

主进程完全阻塞期间不能运行异常判定或写盘；立即保存只能保全触发时已有证据，硬退出也可能缺少后段。heap 增长或持续 CPU 是调查线索，不能直接判定泄漏或循环。

## 异常 CPU 调用栈

异常片段首次触发时，根据原因 PID 选一个进程；持续 CPU 原因优先，其他情况使用首个原因。主进程通过临时 worker 的 inspector `connectToMainThread()` 采样；renderer 使用 `webContents.debugger` 的 CDP Profiler。GPU、utility 与其他进程标为 unsupported-process，不将它们的高占用解释成 renderer 的 JS 热点。采样目标是该进程的 JavaScript 主线程，不涵盖 Web Worker、原生线程或 GPU 栈。

常态不开 profiler，不开调试端口。每次默认 5 秒，采样间隔 10,000µs；全局单任务、冷却 5 分钟、每会话最多尝试 6 次。已有启动 CPU profile、外部 inspector 或 renderer 调试会话时跳过；从不释放其他会话。异常片段的 cpu 字段记录 buildId、目标、状态、时间与失败/跳过原因，CPU 结果更新会沿用原片段写盘，不递归触发新采样。关闭或目标失效时结束本次任务；重启后未完成 CPU 状态读取为 interrupted。

主进程 worker 独立计时并停止采样，停止及失败路径断开 inspector；worker 10 秒保护、宿主 12 秒保护。renderer 命令及录制合计 10 秒保护，完成、取消、目标 detach 或失败后回收本次会话。**这些是停止请求期限，不保证原生 profiler 在任意阻塞下严格按墙钟停止**：renderer 长时间不让出执行、主进程阻塞或原生调用均可延迟命令处理。日志保留 actualDurationMs；保留的样本只覆盖前 5 秒，超出计入 omittedSamples。异常已结束才开始的采样可能主要是 idle，不能用它反推异常之前的调用栈。

profile 清理和聚合在临时 worker 完成。输入节点超过 100,000 拒绝处理；输出最多 4096 个节点、1000 个样本、128 层栈；没有有效样本或原始 profile 超过 1 MiB 时省略，保留热点摘要与 profileOmitted。worker 老生代/新生代预算为 64/16 MiB。客户端不读取 source map，不为每次资源采样启动 worker；短时原生 profiler 自身的瞬时缓冲区由 V8 管理，输出裁剪不等同于其内存硬上限。

调用帧只保留安装目录下 renderer/main/preload 产物的相对身份与 node:/electron: 系统代码身份。安装路径、用户名和 URL 参数被删除，外部脚本函数名替换为 external。热点按 timeDeltas 聚合 selfMs 与含子调用的 totalMs，保留前 12 项；sampledMs 是有效保留样本的权重，不是进程总 CPU 时间。

## 精确构建与离线源码映射

普通生产 Vite 构建为 renderer、main、preload 注入同一随机 buildId，并生成 hidden source maps。`scripts/perf-symbols-build.mjs` 将 map（包括嵌套 worker）转移到 `apps/desktop/output/diagnostics-symbols/<buildId>/`，按目标写 manifest，保存版本、Git 修订、产物 SHA-256 与 map SHA-256。源码位置规范化为仓库相对路径，map 保留源码供离线分析。只有生成代码、没有源码映射的 facade 明确登记 generated-code。

buildId 由 `crypto.randomUUID()` 在每次 Vite 构建创建，独立 Mac/Windows 构建、同平台重新构建均产生不同 ID，不按版本号或 Git 修订复用。一次 JS 构建用于多个安装包时共享该 ID，例如同次打包的 Mac x64/arm64；原生架构不同不要求相同 JS 字节拥有两个映射身份。

客户端目录中不保留 map，electron-builder 另行排除 map；归档不在公开发布收集目录。`verify-perf-symbols.mjs` 在打包前核对三个目标的产物、映射哈希和 map 隔离。`latest.json` 仅指向当前本机构建，诊断必须按日志携带的 buildId 查找归档，不按版本号猜测。每份已分发安装包的对应归档需要由构建方保留。

`scripts/desktop-symbols-r2.mjs` 将三个目标的清单与引用 map 作为 ZIP 上传到独立私有桶 `R2_SYMBOLS_BUCKET` 的 `desktop-symbols/<buildId>/`。上传使用内容哈希命名 ZIP，归档描述最后通过 `If-None-Match: *` 提交；同一 buildId 的不同内容不能替换已有描述。`scripts/r2-client.mjs` 复用已有 R2 凭据，发布脚本默认桶保持不变，诊断脚本拒绝公开下载桶。取回时核对 ZIP 哈希和清单指纹，在临时目录完成路径/逐文件校验后原子恢复本地归档；压缩和解压内容各不超过 512 MiB。命令及桶权限配置见 [桌面性能排查](/docs/guides/ops-desktop-performance.md#r2-归档上传与取回)。

`run-electron-builder.mjs` 先核对三个 JS 目标的哈希、映射与客户端 buildId，再将该 ID 和版本固定给打包子进程。`artifactBuildCompleted` 钩子为生成的安装包及 blockmap 在产物目录的 `.build-receipts/<文件名>.json` 保存版本、buildId、平台/架构、字节数与 SHA-512；写入采用临时文件和原子替换，记录不进入公开发布文件集合。

`publish:desktop` 自动完成构建与私有映射上传。发布从每份实际安装产物的绑定记录获取 buildId，核对实际文件哈希并按 ID 去重；随后先完成全部私有 map 归档，再上传公开安装包，最后更新 latest 清单。任何绑定或映射失败均中断后续公开上传。`--skip-build` 不生成新 ID，也不按本机 `latest.json` 猜测旧安装包；旧产物缺少绑定时要求重新构建。其他机器的安装产物需要同时保留绑定记录，缺失本地 map 可从同一私有 R2 桶自动取回。dry-run 只验证本地绑定、map 并打包，不读取或写入 R2。

`scripts/perf-symbolicate.mjs` 离线读取性能快照或异常 gzip、可选普通日志以及对应归档，映射 CPU 热点、完整调用图及 JS/React 栈位置。CPU 行列按零基，普通日志行列按一基转换；完整 profile 导出仍保持节点/样本图结构。映射缺失、构建不同、哈希不符或位置不可得均报告 unmapped 原因，不降级使用邻近版本。工具不执行日志内容、不根据日志 URL 下载 map；一次最多缓存 4 份解码映射。

## 导出、反馈与摘要

快照 `schemaVersion: 2` 包含 meta、windows、timeline、summary、incidents、collector，保留已有 `main.startupCpuProfile`。摘要包含时间范围、错误数、按进程聚合的最慢阶段（次数/总耗时/最大耗时及最大值上下文）、资源峰值与未完成操作。阶段只反映观测到的部分，不自动归因。

命令面板「导出性能快照」或托盘/Dock 菜单保存 `logs/perf-snapshot-*.json` 并高亮文件。反馈勾选「性能日志」时附带当前快照及最近异常片段；本地留档不自动上传。磁盘读取最多 3 份、解压后合计预算 4 MiB；反馈压缩后仍超过 3 MiB 时先省略 CPU profile 明细、再省略异常事件明细、最后裁剪较旧时间线，保留摘要并记录省略数量。

启动诊断参数与原主进程 CPU profile 见 [主进程与构建](./main-process.md)。
