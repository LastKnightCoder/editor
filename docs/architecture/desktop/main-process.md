# 主进程与构建

> 模块就绪与启动分层、卡顿诊断、索引与嵌入、通知分流、构建打包。

## 主进程模块就绪（跨进程能力）

主进程能力定义在 `src-electron/main/module-init/module-config.ts`，只有两个启动阶段：
IMMEDIATE（窗口显示前）/ BACKGROUND（窗口显示后并行）。所有模块随应用启动，ON_DEMAND
层级、窗口分组和无消费者的批量／状态／Layer1 接口与完成广播已删除。

**铁律：新增模块一律 ****`BACKGROUND`****。** `module-init/__tests__/module-layering.test.ts`
守护启动分层，禁止恢复窗口入口隐式拉起模块的行为。

`ensureModule` / `withModule`（`src/commands/module-init.ts`）保障后台启动尚未完成时的等待与
失败重试；主进程统一防重入，渲染端并发共用任务。当前 IPC 只保留 `module-init:init-module`；
未使用的全状态查询、状态类型、时间戳及 WebSocket 状态名单已删除，内部只记录已就绪模块。

注：`@/electron` 的 `invoke` 已内置启动竞态重试（遇 "No handler registered" 每 500ms 重试、
上限 5s，收到过成功响应即停止），它只覆盖「注册晚于调用」的窗口期，**不覆盖「从未注册」**。
调用失败在入口处以 `[ipc]` 留痕（通道名、耗时、错误原文；作用域已取消不记），重试后成功与
重试放弃各记一条，三者均按通道 30 秒节流。渲染进程 `utils/WebSocketClient.ts` 的传输层失败
（未连接、等待超时、连接断开）以 `[backend-ws]` 请求失败留痕，服务端返回的业务错误由服务端落日志。

**数据库调用不逐条记**：数据库事件是主要 IPC 流量（一次启动上万次），`modules/database.ts` 不再为每次调用写开始与完成行。耗时达到 1 秒的调用在完成时记「慢调用完成」，超过 5 秒仍未完成时先记「调用仍在执行」（界面卡死时不必等调用结束就能定位），失败照常记 error；同步阻塞期间定时器走不动，由完成行补上耗时。普通调用日志在硬崩溃时可能缺少完成行；下一次启动的「上次会话未正常结束」与本机性能片段用于补充判断。更细的慢调用（IPC 100ms、数据库命令 50ms）进入性能时间线；命令耗时包含其内部等待与转换。

**表注册表按需汇总**：`modules/database.ts` 的表清单与事件注册表在首次使用时构建，不在模块求值期构建。表模块经视频笔记索引队列回到 database，存在静态循环；求值期若从表一侧进入，尚未求值完的表是 undefined。新增模块时不要让表模块直接或间接引用 database 及依赖它的模块。

「启动与后台运行」的三项偏好由主进程 `setting` 模块提供读写接口，`background-preferences` 服务负责系统登录项和本机偏好。在非 macOS 平台，最后一个可见窗口关闭时，若已开启「关闭窗口时不退出」且托盘可用，主进程继续运行。该判断只读取应用偏好与托盘状态。托盘菜单中的「退出」走受控退出流程。

**索引候选读者与维护**：知识洞察候选任务的串行调度器持有独立只读索引连接；关闭索引、同步下载对账和退出通过候选读屏障取消在途/排队任务，等待实际读线程退出后再继续维护。异步索引关闭只移除原连接的登记，不删除等待期间重开的连接。算法与编排边界见 [今日页功能](./home-features.md)。

**性能诊断**：BACKGROUND 模块 `perf-monitor` 汇聚有界时间线、操作与阶段、统一 CPU/内存采样，异常时自动固定前后片段并在本机留档。「导出性能快照」和反馈共用 schemaVersion 2 协议；数据结构、采集预算、触发条件与限制以 [性能诊断](./performance.md) 为准。

启动诊断参数 `--tau-profile-startup` 按需开启主进程 CPU profile：入口依赖加载阶段启动进程内 inspector，约 10 秒后保存 `~/.editor/logs/startup-main-*.cpuprofile`，不开调试端口；普通启动不采集。需完整退出后带参数重启，第二实例转发参数不会为已运行进程补录启动。性能快照 `main.startupCpuProfile` 包含采集状态与文件路径；持续阻塞可能延后停止计时器，实际时长以 profile 为准。

**窗口与进程异常**：`createWindow` 为每个窗口记录渲染进程退出（原因与退出码）、preload 加载失败、无响应及恢复，日志中的窗口身份为「文档类型或角色:路由」；主进程主动回收的渲染进程（内容执行超时或取消后的强制结束）不按崩溃记录。应用级记录 GPU 等子进程的异常退出，`clean-exit` 不记。内容执行窗口的启动超时、执行超时与执行失败以 `[content-runtime]` 记录，用户取消不记。番茄钟背景音的隐藏视图不经过 `createWindow`，由 `windows/pomodoro-audio.ts` 自行记录；该视图的 preload 只暴露播放控制与 `sendLog`，console 劫持把日志写入同一 session 文件。

**渲染异常堆栈**：`src/utils/console-logger.ts` 将全局未捕获异常的来源位置与异常对象堆栈写入 session 日志，未处理 Promise 拒绝同样保留异常堆栈。主渲染入口、辅助窗口与正文内白板选择弹窗的 React 根节点接入统一 `onCaughtError` / `onUncaughtError` / `onRecoverableError`；异常堆栈和 `componentStack` 分条记录，避免共享单条日志额度。辅助窗口记录堆栈后仍执行原有失败回调；插件隔离窗口沿用自己的失败回报通道。日志仍遵循每条长度上限与每窗口速率限制。

**节流不丢信息**：会反复触发的日志按来源节流（渲染端 `src/utils/throttled-log.ts`，主进程 `utils/throttled-log.ts` 与 `utils/stored-json.ts`）。窗口内的第一条立即写出，其后的重复只计数，窗口结束时补一条带 `suppressed` 的汇总行；不允许静默丢弃。存库字段解析失败是持续状态，同一字段的同一行每次运行只报一次。

**会话头与数据变更留痕**：启动时记录应用版本与打包版或开发版。取得单例锁后写入 `session.incomplete`，受控退出的最终动作前删除；下次启动发现它仍在，即记录「上次会话未正常结束」（崩溃、被强制退出或断电），第二实例不碰这个标记。渲染进程日志的来源是「窗口角色#窗口编号」，角色由 preload 随日志上报，不取窗口标题（标题是笔记标题）。`domain-events` 在每次合并广播前把变更写入 `[data-change]`：新增与删除必记，修改只在插件写入或一次合并里同类达到 5 条时记；每行一个「实体.动作」，只有实体类型、ID、数量与来源插件，正常编辑正文不产生日志。

知识地图读取 `knowledge-map:get` 显式接入 IPC 计时；加载、建图及超过 50ms 的绘制、主进程向量候选扫描均以阶段事件进入性能时间线，只记录阶段、耗时与规模。

主内容全文队列（`main-content-fts-index-queue`）在连库对账之外订阅正文写入总线。总线使用实际连接登记的库名，派生队列据此解析当前连接。队列按库合并 1 秒（持续写入最长 5 秒），经 `EntitySearchTable.locateAll` 找到引用这些正文的卡片 / 文章 / 项目文档 / 日记逐个重建，正文清空则移除。索引未就绪（构建中或待重建）时交给对账，实体删除和标题等元数据变化也由连库对账处理。

主内容向量队列先读取实体 ID、正文 ID、实体/正文较新修订号，按已索引修订筛选后才读全文。候选收集与覆盖率合并扫描；未变的已索引正文不转换，空正文修订按数据库连接缓存。持久正文由 `ContentTable.readText` 一次联表读取正文及契约，数据库正文的原始 JSON 交转换进程解析，不在主进程解析后重编码；有效会话仍优先提供正文及契约，会话身份校验只查询身份字段。既有正文转换服务按保存版本产生文本与分节；全文队列、向量候选和全文检索回退只消费文本结果，不传递契约字典。材料的节点转换仍经 `IndexContentClient`；每轮扫描的取消信号传入正文转换服务，finally 回收作用域，共用内容进程不随每轮销毁。元数据扫描每批让出事件循环。统计入口不分节、不准备嵌入任务；未索引或变化项仍需转换确认正文非空，以保留纯媒体等可索引内容的口径。切库或代次失效后不清理候选外向量。

桌面下载覆盖主库前，在同步锁内用 SQLite 分批核对本机正式库与下载临时库。只检查已有向量对应的原始正文、标题、转换契约或材料字段，比较结果只返回需失效或更新修订的条目。对话向量复用要求会话仍有效且对应会话文件未变，文件一致性沿用下载时的本地分块复用结果。匹配的向量和定位信息留在本机；失效向量在替换前移除，新增、变化及未完成项由重连后的后台队列补齐。其他派生表按各自协议重建。索引核对不读取同步备份。上传重连保留索引，设置原子替换，读取不到有效嵌入维度时沿用已有向量表维度。

离线知识地图只构建显式边、邻接与标签，不重复运行社区发现和种子布局。主题/子主题世界几何按场景身份缓存，替换地图即失效；静态地图命中树只在场景变化时重建，平移与缩放不失效。动态链接图仍按帧更新命中树与几何，不能共用静态缓存。

本地嵌入由 `local-inference/client.ts` 懒建独立 Electron `utilityProcess`，模型加载、分词、480 token 分窗推理和向量合并只在 `local-inference-worker` 执行；主进程不加载 node-llama-cpp。CPU 推理线程数为可用核心的一半，最少 1、最多 4；context 固定 512 token，与现有分窗上限一致，避免为短窗口分配模型的完整上下文。后台重建每条文本之间让出 10ms，查询在文本边界优先调度，不中断正在计算的文本；主内容、PDF、Notebook、视频检索均显式标记交互优先级。子进程启动握手、请求超时或退出时拒绝在途及排队任务，下次请求可重新启动；应用 `quit` 时终止进程（受控退出用 `app.exit`，不能依赖 `will-quit`）。向量输入与合并算法不变，不提升嵌入指纹版本。同步数据库写入仍由主进程持有。

嵌入提供方只有两类：宿主内置的本地模型与嵌入插件（见「领域提供方插件 · 嵌入」）。setting.json 的 `embedding` 为 `{ active, local, plugins }`：`active` 为 `null` 或 `{ provider: "local" | "plugin", pluginId?, model, dimensions }`，默认 `null`；`local` 是下载源、设备、批大小等本地运行参数；`plugins[pluginId].config` 是插件连接配置，由插件详情 › 设置保存（`plugin-local:embeddings-config`），保存不改变 `active`。主进程 `utils/embedding-config.ts` 的 `resolveEmbeddingConfig` 是唯一解析入口；本地指纹 payload 固定为历史字面量（测试守护，存量本地索引不重建），插件指纹为 `{provider, pluginId, model, dimensions}`、不含连接配置，指纹变化即清空重建向量库。设置 › 嵌入模型（`EmbeddingSection` + `EmbeddingActiveGroup`）浏览、下载、配置都不写 `active`，只有「设为当前」并在确认框确认后才写入：已有生效模型时为危险确认并显示将清除的索引数；插件模型确认时先经渲染端注册表探测一次 embed（30 秒超时），失败留在确认框且不写设置，成功以实测维度写入。本地模型启用后自动建立索引，插件模型只手动发起。

### 产品版本与下载统计

`telemetry` 是 BACKGROUND 模块，只在正式构建启动时通过 `@tau/analytics/client` 的 `VersionClient` 上报当前应用版本，使用随机安装标识、版本号和 UTC 观测时间；同版本按上海自然日去重，版本变化时重新上报。没有渲染端埋点命令，不监听启动耗时、页面切换、窗口聚焦、退出、崩溃或持续心跳。默认只在正式构建启用，`TAU_TELEMETRY_DEBUG=1` 开启 development；`TAU_TELEMETRY_DISABLED=1` 停用。

本机状态在 `~/.editor/analytics.json`（开发为 `analytics.development.json`），串行请求先原子落盘再发送至 `analytics.taunote.app/v1/versions`；失败最多补报三次，仍失败保留当前观测至下次启动，不建立周期任务。状态格式 2 保存安装 ID、已确认和待确认版本；本版本将已有格式 1 状态转换为格式 2，仅沿用安装 ID 并丢弃旧行为队列，不再读取更早的 `telemetry.json`。

服务端按安装实例、上海日期保存最新版本，乱序旧观测不能覆盖新观测；管理后台只保留版本分布和下载统计。旧 `/v1/events/batch` 返回 410 且不读正文、不写 D1；旧客户端仍需升级才能停止本机生成和发送行为请求。R2 安装包仍经原下载域名分发，官网入口统计按日/安装包/出口摘要近似去重的下载发起；自动更新和直链不计入。协议、数据迁移与部署顺序见 [统计设计](/apps/analytics/docs/DESIGN.md)。

## 通知分流

插件通过 `context.notifications.send` 发送纯文本通知：`mode` 为 `auto`（默认，按插件所在窗口焦点分流）、`in-app`（固定应用内）或 `system`（固定独立通知窗口）。桌面适配经 `appNotify`，来源由宿主填写插件名，通知 ID 由宿主生成；返回的 `Disposable` 只能撤销本条通知，停用、激活失败和切库自动清理。最多两个操作按钮，其中至多一个标记 `reveal: true`。回调留在插件所在渲染窗口，执行前校验激活与句柄有效性。auto 模式可传 `isOnSurface`，宿主只在窗口聚焦、设置未覆盖且目标可见时抑制；reveal 动作先校验发起库身份并关闭设置。作者示例见 [插件通知](/plugins/tau-plugin-template/docs/notifications-and-voice.md#通知)。

渲染端通知按来源窗口焦点分流。主进程通知只直投聚焦的主窗口，其余交给独立通知窗口。两处卡栈分别维护。

- **渲染端业务一律 `appNotify`**（`services/notifications/notify.ts`），禁止直接调用
  `@tau/ui` 的 `notify`（showcase 样板间与系统通知窗口页除外，Oxlint 守护）。`icon` 传
  注册表键（`services/notifications/icons.ts` 的 `NOTIFICATION_ICONS`），不传组件；
  主进程侧 icon 字符串键与注册表的对账由
  `services/notifications/__tests__/main-process-icons.test.ts` 守护。
- **主进程用 `routeNotification(payload, origin)`**（`src-electron/main/windows/`），
  禁止 `new Notification(...)` 原生通知（Oxlint 守护）；按钮回调放 `origin.handlers`，
  收尾放 `origin.onClose`，关闭走 `dismissNotification(id)`。
- **查看详情**：需要打开内容的通知按钮标 `reveal: true`，点击正文和该按钮共用执行路径。独立通知窗口先激活来源窗口（main origin 激活主窗口）再执行回调，应用内直接执行。失败在通知内显示错误。没有查看动作的通知在独立窗口点击正文时只唤回来源窗口，「同意」「重试」等按钮默认在原地执行。`revealWindow` / `showOrCreateMainWindow` 在 macOS 上用 `app.focus({ steal: true })` 抢占激活。
- **待办与日程提醒**：查看动作携带提醒所属资料库及目标，待办和日程打开相应页面，正文待办按正文 ID 反查原文并按任务 ID 定位。切库后拒绝打开旧库目标。
- **AI 任务通知与可见面抑制**：渲染端长耗时 AI 任务与阻塞等待交互统一经 `services/notifications/aiNotify.ts`（`notifyAiTask`）与壳层常驻的 `AiTaskNotificationHost` 发牌，按「应用聚焦且正在看目标可见面 → 抑制；聚焦但已离面 → 应用内卡栈；应用失焦 → 系统独立通知窗」三态分流。弹窗内中耗时任务（生图、闪卡、电子书重写、语音合成、音色复刻、AI 创建 Skill）采用 `unfocused-only` 仅在应用失焦时提醒；对话回复完成带最短耗时门槛，工具审批、AI 提问、正文改写待审阅与失败通知不受耗时门槛限制且 `sticky: true`，阻塞项处理完成、任务取消或切库后自动撤销；静默后台任务（笔记元信息、个人助手记忆、自动调度的洞见与本地增量索引）不发通知。查看动作同样校验发起时的资料库身份，切库后拒绝跳转。任务 Promise 的收尾独立于 React Query 的视图订阅，视频断句优化也在任务链内保存与通知；Activity 隐藏只撤销可见面登记，不承担任务收尾。PDF、Notebook 与项目视频对话栏的 CSS 隐藏由实际开闭状态撤销登记。剪藏任务的事件和保存命令均携带发起库身份，旧库迟到结果不再创建通知；正文反查等异步定位在返回后再次核验库身份。Notebook 队列事件携带 taskId、projectId、mainDbName，宿主先订阅并缓存事件，再合入活动队列快照，按任务终态去重、按 Notebook 聚合；取消只解除批次等待。

## 构建与打包

- 桌面使用 TypeScript 7 原生编译器与 Vite 8（Rolldown 打包、Oxc 压缩）。入口、外置运行依赖与资源复制在 `vite.config.mts` 声明。开发依赖预构建从生产构建声明的三个 HTML 入口扫描，避免把引用主进程模块的测试交给浏览器优化器。分包使用 `rolldownOptions.output.codeSplitting`，保留 React、React DOM、路由、Mermaid 与 KaTeX 分组。渲染产物启用 `output.strictExecutionOrder`，由打包器保留跨分包的源码模块初始化顺序，避免常量或基类在初始化前被访问；不再为 loadable 维护初始化顺序特例。此设置不消除源码循环依赖，依赖边界由 `check:desktop-startup` 独立检查并接入 `prebuild`。
- 启动阶段经现有性能事件上报：`startup:bootstrap-ready` 表示模块与扩展装配完毕并已请求挂载应用树，`startup:renderer-ready` 由应用树的布局 effect 确认 React 提交；`startup:settings-ready`、`startup:database-ready` 分别确认设置初始化和当前库连接成功；`startup:shell-ready` 由业务壳层的 effect 确认提交。数据库失败上报 `startup:database-failed`；用户选择降级进入不会补发数据库成功信号。主窗口正常就绪必须同时满足上述成功阶段，启动提示或单一渲染信号都不代表业务就绪。
- `node apps/desktop/scripts/verify-renderer-startup.mjs` 在隐藏的隔离 Electron 窗口验证三个生产入口：主窗口等待全部成功阶段并核对业务 DOM；内容转换实际执行文档契约准备并确认没有 Node/业务桥；插件窗口核对参数版本、React 提交与 ready 握手及专属桥。检查使用临时配置、空数据响应和受控后端通道，阻断真实网络，不读取用户工作区；启动异常、数据库失败、进程退出或超时均非零退出。`--app-root` 可指定包含 `dist` 与 `dist-electron` 的目录或 ASAR；该检查覆盖渲染入口与 preload，不代替真实主进程、数据库维护、原生运行时或视觉验收。操作见[客户端构建与安装](/docs/guides/ops-client-build-install.md)。
- Vite 开发、样板间与构建命令统一 `--configLoader runner`（默认 bundle 加载器会把工作区 TS 配置依赖外部化导致 `ERR_UNKNOWN_FILE_EXTENSION`）；配置用 `fileURLToPath(import.meta.url)` 取目录。
- `node apps/desktop/scripts/verify-plugin-content.mjs --production` 使用已经构建的 dist 内容页面，在隔离的临时 Electron 工作区验证真实内容插件；不带该参数时独立编译源码进行验证。
- 桌面消费的编辑器扩展包、@tau/ui、@tau/themes 由 Vite 编入产物，统一声明在桌面 devDependencies——放 dependencies 会让 electron-builder 再收集整条生产依赖链；运行时从磁盘加载的外置模块与原生依赖保留生产声明，调整后检查实际安装包与原生运行时。
- 安装包排除依赖 `.js.map`/`.mjs.map`/`.cjs.map`（afterPack 补复制同样规则），不泛删 `.map` 数据文件；原生平台子包的 afterPack 裁剪与产物检查共用平台 token 规则，`linuxmusl` 作为独立 token 识别，禁止混入 macOS、Windows 与 glibc Linux 包；`verify:native-runtime` 用包内 Electron 逐项执行包内依赖的原生模块加载断言。
- pi 只带 SDK（不打包独立 CLI bundle 与 esbuild），`pi-packaging-boundary.mjs` 检查已审核版本与消费者，边界变化必须重新审核；主进程 Vite 的 `resolve.dedupe` 统一桌面入口的 `@earendil-works/pi-ai`（避免 peer 解析重复进 bundle 触发 Anthropic SDK 代码生成错误）。分词词典由外置 `@node-rs/jieba/dict` 从包内加载，不复制不劫持。
- macOS 双架构：`pnpm build` 同时产出 x64 与 arm64 的 DMG/ZIP（共用一份 latest-mac.yml；DMG 供官网、ZIP 供自动更新），`supportedArchitectures.cpu` 含两架构；afterPack 按目标裁剪原生依赖，构建结束恢复本机 better-sqlite3。双架构发行经 `run-mac-builder.mjs`：顺序构建签名（原生依赖原地重编，禁止并发）→ 并行公证附票 → 全部成功才出 target；blockmap 与合并 latest-mac.yml 由同一 PublishManager 生成，不改包不手工合并；任一签名/公证失败不产发行物。凭据推荐 `APPLE_KEYCHAIN_PROFILE`（保留 electron-builder.env）。回归：`node --test scripts/parallel-mac-packager.test.mjs scripts/release-artifacts.test.mjs`。发布前校验清单引用文件、大小、摘要与双架构四件套，禁止半套产物覆盖更新源；官网 Pages 读发布清单缓存 60 秒。
- macOS 本机打包复用桌面构建，以同一 arm64 目标编译语音助手、裁剪原生依赖、生成安装包和执行原生运行时检查。独立输出目录隔离双架构发行产物。操作见 [Apple 芯片本机打包](/docs/guides/ops-macos-code-signing.md#apple-芯片本机打包)。
