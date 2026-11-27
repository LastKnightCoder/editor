# 代码检查与格式化

## 准备

在仓库根目录运行 `pnpm install --frozen-lockfile`。Oxlint、Oxfmt 与规则插件的版本由根 package.json 和锁文件固定；Node.js 需满足工具要求（20.19+ 的 20.x，或 22.12+）。

编辑器使用 Oxc 扩展并启用 Oxlint 与 Oxfmt，关闭同一工作区的 ESLint、Prettier 保存动作，避免重复检查和格式化。

## 日常检查

```sh
pnpm lint
pnpm format
pnpm format:check
```

默认处理相对 HEAD 的变更文件和未跟踪文件，也可以在命令后显式传入文件路径。`format` 先执行安全 lint 修复，再格式化；lint 错误会阻止后续格式化。只需调整格式时，使用 `pnpm exec oxfmt --write <文件>`。

```sh
pnpm lint:all
pnpm test:quality
pnpm check:database-boundaries
pnpm check:whiteboard-boundaries
pnpm --filter desktop exec vitest run src/app/__tests__/page-labels.parity.test.ts --maxWorkers 1 --no-file-parallelism
pnpm check:desktop-startup
pnpm check:plugin-process-boundaries
pnpm check:docs
```

`lint:all` 检查 apps、packages、examples 中 Git 可见的 TS/TSX/MTS/CTS 文件；不把独立插件子模块纳入宿主检查。长文件列表自动分批，退出码汇总所有批次。`test:quality` 必须通过；架构边界脚本仍须按变更范围执行。

提交钩子直接用 Node.js 运行本地已安装的 lint-staged、Vitest 与 commitlint，对暂存文件执行 `oxlint --fix`、`oxfmt --write`，再检查桌面页面标题的词典归属与解析、数据库、白板和文档边界及提交信息。页面标题检查自动收集所有页面声明，覆盖简体、繁体和英文，并校验扫描非空。钩子不调用包管理器，避免提交时自动安装依赖并触发原生模块重建。依赖缺失时先显式执行安装；桌面打包期间不要同时执行安装或 rebuild。

## 修改规则

在根 `.oxlintrc.json` 修改规则与目录覆盖；规则分组默认关闭，新增规则必须显式启用。导入边界、白板 AST 选择器使用 `oxlint-plugin-eslint` 的 `eslint-js/no-restricted-imports` 与 `eslint-js/no-restricted-syntax`，保留路径匹配、排除目录及自定义消息。

修改边界时同步补充 `scripts/__tests__/fixtures/quality-cases.mjs` 的禁止、允许和豁免用例，再运行 `pnpm test:quality`。已有 ESLint 行内禁用注释仍由 Oxlint 识别；新增注释优先使用 Oxlint 规则名。

格式配置统一放在根 `.oxfmtrc.json`。仓库默认 100 列，宣传片目录使用 200 列；保留 Tailwind 类名排序，关闭导入排序与 package.json 字段排序。修改格式参数后运行 `pnpm test:quality`，再对本次文件执行 `pnpm format:check`。

发布快照、Markdown 往返夹具、构建输出、vendor、data 和锁文件按配置排除。检查忽略规则时必须确认这些文件的原始字节不变。

## 代码行数统计

在仓库根目录运行：

```sh
pnpm code:stats
pnpm code:stats --project apps/desktop --details
pnpm code:stats --project apps,packages --language ts,tsx,rs,css
pnpm code:stats --include-examples
pnpm code:stats --exclude apps/desktop/src/some-vendor --files
node scripts/count-code.mjs --json > code-stats.json
pnpm code:stats --html
pnpm code:stats --html --project apps/desktop
```

默认显示语言、项目和分组汇总；`--details` 显示各项目的语言明细，`--files` 列出计入文件。项目按 `apps/*`、`packages/*`、`plugins/*` 划分，示例工程需显式开启。`--project` 接受项目路径或分组名；`--language` 接受语言名，均可重复或用逗号分隔。MTS/CTS 归入 TS，MJS/CJS 归入 JS；TSX/JSX 独立统计。全部选项与语言见 `pnpm code:stats --help`。

统计口径为物理行：**非空行包含注释**，总行数等于非空行加空行；文件末尾换行符不额外算一行。测试按文件排除，不拆分生产文件中的内联测试或示例文本。统计读取当前工作区内容，包含 Git 已跟踪文件及未被忽略的新文件，跳过已删除文件和符号链接；已检出的插件子模块使用各自的 Git 文件清单。

自有共享包计入；依赖、第三方源码目录、测试及夹具、校验和构建脚本、配置文件、构建产物、生成代码、文档、演示与原型稿排除。数据库 SQL 只统计源分片与独立源码，排除生成的 main.sql/index.sql，避免重复；Tauri 生成目录内项目维护的两个 Kotlin 文件保留。带生成标记的文件按头部注释排除，未标记的外部源码可用 `--exclude` 追加仓库相对文件或目录路径，不支持通配符。排除规则的唯一实现位于 [统计脚本](/scripts/count-code.mjs)。

`--html` 生成单文件可视化报告 `output/code-stats.html` 并用默认浏览器打开，包含总览、目录树图（点击下钻）与项目 × 语言矩阵三个视图，页面内可再按分组和语言筛选；筛选参数同样适用，报告只包含筛选后的文件。报告模板位于 `scripts/code-stats-report/`，生成时内联成单文件。

导出纯 JSON 时直接使用 `node scripts/count-code.mjs --json`，避免包管理器日志混入标准输出；加上 `--files` 可同时导出逐文件明细。用相同筛选条件比较结果，并检查分组、语言和项目的计数均能加总到 `total`。

## 类型检查

工作区的 `typescript` 固定为原生 TypeScript 7.0.2，继续使用 `tsc`、`pnpm check` 和各包已有的检查命令。浏览器扩展首次检出后先运行 `pnpm --filter browser-extension exec wxt prepare`，再运行 `pnpm --filter browser-extension exec tsc --noEmit`。

需要 `createSourceFile`、`createProgram`、`transpileModule` 或声明文件生成 API 的脚本，显式从 `@typescript/typescript6` 导入，并在所属包声明开发依赖；不要从 `typescript` 根入口调用旧编译器 API。独立作者验证工程使用其自身锁文件中的工具版本。

修改编译器或对应脚本后，执行三项边界检查、`node --test scripts/__tests__/database-boundaries.test.mjs`、SDK 的 API 支持矩阵与声明打包验证。需要生成 JS 的包应显式配置 `rootDir`；环境全局类型在 tsconfig 的 `types` 中列出。CSS 副作用导入使用对应环境声明，不关闭 `noUncheckedSideEffectImports` 来绕过诊断。

## 构建工具验证

工作区直接依赖 Vite 8.3.5；构建插件使用兼容 Vite 8 的版本。Vitest 3 保持自己的内部 Vite 依赖，不通过全局 overrides 强制替换。配置使用 `build.rolldownOptions`、`output.codeSplitting` 和 Oxc 压缩；已有浏览器目标在各应用配置中显式保留。

```sh
pnpm --filter desktop exec vite build --configLoader runner
node apps/desktop/scripts/verify-renderer-startup.mjs
node apps/desktop/scripts/verify-plugin-content.mjs --production
pnpm --filter mobile build
pnpm --filter browser-extension build
pnpm --filter @example/database build
pnpm --filter @example/whiteboard build
```

内容进程验证应在桌面 bundle 构建后运行，检查真实构建入口、动态分包及插件编解码。原生安装包继续按 [客户端构建与安装](/docs/guides/ops-client-build-install.md) 验证；单独的 Vite build 不能代替安装包及原生运行时验收。

## 性能验证

### 思维导图概要与外框

```sh
pnpm --filter @tau/whiteboard bench:mind
```

与构建、类型检查及其他压力任务串行执行。门控套件覆盖四种布局的 100–2000 普通节点、概要与带标题外框，以及最多 64 个节点逐层嵌套的几何查询，并校验大图中的概要正文不重叠；计时只用于比较，不作为默认单测门槛。联系线批量查询覆盖 100–2000 普通节点及一半数量的连线，plain 组记录普通对象耗时，tracked 组只用于身份访问次数，首轮包含建索引、后两轮复用同一快照。协作长会话逐操作验证撤销重做、远端增量同步与二进制重开；三端外框压力反复并发新增、改标题、删除与修改，验证独立操作保留和局部撤销。真实箭头组件压力另覆盖 100–1000 节点下的单节点编辑和整批端点移动；计时包含实际 `Board.apply` 与 React 提交，组件挂载和断言在窗口外，不以直接调用几何工具函数代替。三端联系线压力反复组合建线、两端删节点、逆序同步、逐端撤销、导出和二进制重开，验证失效线不可见及恢复后的身份。默认回归另外约束身份、区间引用、联系线清理、元素事件一致性和几何访问次数，不能用模型、jsdom 或纯布局读数替代真实客户端帧率或视觉验收。

### 画框事务准备

在仓库根目录运行生产夹具。计时与构建、类型检查及其他压力任务串行执行，正式样本显式排除预热，保留全部失败。

```sh
node apps/desktop/scripts/bench-whiteboard-frame.mjs --worker-prototype --worker-prototype-stress --cycles=5 --output=/tmp/frame-worker-stress.json
node apps/desktop/scripts/bench-whiteboard-frame.mjs --worker-prototype --proof-handoff --worker-prototype-stress --cycles=5 --output=/tmp/frame-handoff-stress.json
node apps/desktop/scripts/bench-whiteboard-frame.mjs --worker-prototype --incremental-worker --worker-prototype-stress --cycles=5 --output=/tmp/frame-incremental-stress.json
node apps/desktop/scripts/bench-whiteboard-frame.mjs --worker-prototype --incremental-worker --proof-chain --cycles=8 --output=/tmp/frame-proof-chain.json
node apps/desktop/scripts/bench-whiteboard-frame.mjs --worker-prototype --quiet-host --modes=sync,worker,handoff,incremental --dense --rounds=3 --warmup=1 --rates=1,2,4 --output=/tmp/frame-worker-performance.json
pnpm --filter desktop exec vitest run src/services/whiteboard-documents/__tests__/drag-realtime.test.tsx
```

原型仅由夹具入口加载。对比同步与 Worker 相同的千元素命令，分别查看后台准备、主线程合入与历史、快照读取、投影、空闲预算准备及最长 rAF 间隔。计时覆盖首个结果显示和其后的准备工作；压力验证检查取消、权限失效、远端竞争、空文字根、保存重开、逐步撤销重做及独立副本。真实 SQLite 与 WebSocket 由定向回归另行检查。模型夹具不能代替真实输入延迟和完整交互验收；后台计算变快不足以判定可以接入生产。

四个模式依次为同步、原始二进制 Worker、仅主线程证明交接、双端基线复用。交接模式除功能与屏幕坐标对账外，还必须满足 `proofResult.snapshot/capacity` 均为真，采样窗口的 `fullReads/fullValidations` 均为零；不以扩大预算、删掉失配读取或移出采样窗口换取通过。连续压力还检查未变化正文引用、镜像基线复用及整条撤销重做链。

`--quiet-host` 在用例前等待主机 CPU 连续两秒低于 40%；用例期间按秒记录，任一采样达到 65% 则保留该尝试并重试，同一用例四次受影响后停止验收。资格由资源占用决定，不能根据用例耗时或帧率挑样本；所有功能错误仍须处理，帧预算不放宽。环境长期满载时先保存中间结果，取得空闲窗口后补齐，不能把不合格环境的计时当收益。

CPU 档位由页面的 `Emulation.setCPUThrottlingRate` 设置，不能视为整机所有线程一起降速。Worker 的耗时须单独核对；全线程的 2×、4× 放行需要额外校准，不能沿用主线程数据直接宣称达标。Chromium 的[页面设置入口](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/inspector/inspector_emulation_agent.cc)调用[主线程降速器](https://chromium.googlesource.com/chromium/src/+/99baeeafe29b54168bc18411791025d4a9419eea/third_party/blink/renderer/platform/scheduler/public/thread_cpu_throttler.h)。

### 画框绘制平面

```sh
node apps/desktop/scripts/bench-whiteboard-frame.mjs --worker-prototype --renderer-compare --modes=sync --actions=create,dissolve --dense --quiet-host --rounds=3 --warmup=1 --rates=1,2,4 --output=/tmp/frame-renderers.json
node apps/desktop/scripts/bench-whiteboard-frame.mjs --renderer-compare --only=create:create:1000,dissolve:frame:1000 --dense --labels --verify --quiet-host --rounds=3 --warmup=1 --rates=1,2,4 --settle-ms=500 --output=/tmp/frame-renderers-native.json
node apps/desktop/scripts/bench-whiteboard-frame.mjs --flat-renderer --stress-fragmented --stress-rate=4 --output=/tmp/frame-fragmented.json
node apps/desktop/scripts/bench-whiteboard-frame.mjs --flat-renderer --stress --stress-rate=4 --output=/tmp/frame-mixed.json
```

默认入口使用逐元素稳定容器，连续绘制平面仅保存在隔离夹具。`--renderer-compare` 在同一构建中交替测生产方案与原型；`--flat-renderer` 单独启用原型，供压力验证及剖析使用。同步模型/投影用例不启动 Worker，统计首次结果可见时间、最长帧、实际宿主移动次数及编辑器实例保留；原生用例另含预览、菜单与真实指针输入。两种口径不能混写。原生用例的 `--quiet-host` 逐样本记录资格但不自动重试，未合格计时保留并另行补测；功能失败与帧预算失败均不因负载而忽略。

拆分压力覆盖整批收纳/解散、跨两个画框和根层的交错移动、再次完整收纳与解散，每步及撤销重做后检查独立模型、真实绘制顺序、未提交输入、焦点及 iframe 文档身份；同时运行混合场景与真实保存/协作回归。性能计时与这些压力和构建串行执行。剖析用例可追加 `--profile --trace --readable-profile`，轨迹只汇总操作开始与结束之间的主线程工作。

### 画框长拖动

```sh
node apps/desktop/scripts/bench-whiteboard-frame.mjs --only=drag:frame:1000 --drag-variants=baseline,surface-scope --stable-frame-hosts --preselect --labels --dense --verify --steps=480 --assert-60fps --raf-input --rounds=3 --warmup=1 --rates=1,2,4 --quiet-host --settle-ms=500 --output=/tmp/frame-raf.json
node apps/desktop/scripts/bench-whiteboard-frame.mjs --only=drag:frame:1000 --drag-variants=baseline,surface-scope --stable-frame-hosts --preselect --labels --dense --verify --steps=480 --assert-60fps --cadence --rounds=3 --warmup=1 --rates=1,2,4 --quiet-host --settle-ms=500 --output=/tmp/frame-wall.json
VITE_FRAME_BENCH_DRAG_VARIANT=surface-scope node apps/desktop/scripts/bench-whiteboard-frame.mjs --stable-frame-hosts --drag-variants=surface-scope --stress-fragmented --stress-rate=4 --output=/tmp/frame-drag-state.json
TAU_FRAME_DRAG_STRESS=1 pnpm --filter desktop exec vitest run src/services/whiteboard-documents/__tests__/drag-realtime.test.tsx
```

将 `--drag-variants` 设为 `baseline,scope` 可单独比较默认选区订阅及宿主顺序改造，`surface-scope` 还会开启隔离的命中面。不传实验参数时使用当前默认实现。

三档分别记录每个样本的 rAF 间隔、实际位置变化间隔、起拖阈值之后单独显示的位置数、发送到屏幕坐标可观测的延迟、松手与归位阶段。每轮交换基线与原型顺序。rAF 输入随页面掉帧而拉长，`--cadence` 从浏览器外的时钟发送，检查实际发送完毕耗时及确认等待。独立发送会产生浏览器输入合并，要同时核对未独立显示的位置，以及每个输入到画面抵达该位置的延迟。保留全部拒绝、未合格负载与超预算样本；正式计时与正确性压力串行运行。

持续拖动原型用下列命令复测。

```sh
node apps/desktop/scripts/bench-whiteboard-frame.mjs --only=drag:frame:1000 --stable-frame-hosts --drag-variants=scope,history-scope,adaptive-history-scope,budget-scope --rates=1,2,4 --labels --dense --preselect --steps=480 --cadence --align-cadence --rounds=3 --warmup=1 --settle-ms=500 --quiet-host --verify --assert-60fps --output=/tmp/frame-drag-cadence.json
VITE_FRAME_BENCH_DRAG_VARIANT=budget-scope node apps/desktop/scripts/bench-whiteboard-frame.mjs --drag-variants=budget-scope --stable-frame-hosts --stress-drag-conflicts --stress-rate=4 --output=/tmp/frame-drag-conflicts.json
TAU_FRAME_DRAG_STRESS=1 pnpm --filter desktop exec vitest run src/services/whiteboard-documents/__tests__/drag-realtime.test.tsx
```

本组对照中，`scope` 使用已提交的稳定选区和画框宿主，关闭慢提交降载。`history-scope` 在整框同步时复用已裁剪的历史区间；`adaptive-history-scope` 另外按实际帧间隔启用临时命中面；`budget-scope` 测默认慢提交策略并附加诊断计数。省略原型参数可复测实际默认入口。独立发送的 `--align-cadence` 在各轮交替使用 4ms 和 12ms 的起始相位，使同轮方案面对相同输入位置与刷新相位；rAF 对照将 `--cadence --align-cadence` 换成 `--raf-input`。真实观察者和人造慢帧只在中断及耐久压力中使用。

`--reuse-board` 可在同一已加载画布上配对 `scope,budget-scope`，每次真实撤销到初始状态并核对独立模型；连续复位也会累积 V1 历史。容量边界使用 `--seed-geometry-bytes=8010000` 或 `8160000` 单独复现，读取拒绝前后的二进制及两栈。真实近满容量回执、取消及持久化的回归运行 `TAU_FRAME_QUOTA_STRESS=1 pnpm --filter desktop exec vitest run src/services/whiteboard-documents/__tests__/drag-realtime.test.tsx -t 容量拒绝取消`。

### 正文保存压力验证

投影性能对照、真实 IPC、跨端往返、容量及硬杀验证的命令和通过条件见 [正文回归与容量验证](/docs/guides/dev-content-verification.md)。

### 通用排查入口

在本次 `session-*.log` 按标签检索，先看错误行之前的最后一条阶段或状态日志。

- 版本：看日志开头的「应用版本」行；「上次会话未正常结束」表示上一次是崩溃、被强制退出或断电。
- 来源：渲染进程的行以 `[窗口角色#编号]` 开头（如 `[main#1]`、`[editor#3]`），同一编号是同一窗口。
- 节流：带 `suppressed` 的行是汇总，表示此前省略了那么多条同一来源的重复日志。

| 标签                                                      | 回答的问题                                                                                           | 关键字段                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `[ipc]`                                                   | 界面点了没反应：哪个调用失败、是否等过未注册的通道                                                   | `channel`、`elapsedMs`、`attempts`、`waitedMs`、`error`        |
| `[window]`、`[process]`                                   | 窗口白屏、卡死、花屏：渲染进程是否退出、窗口是否无响应、子进程是否异常退出                           | `window`、`reason`、`exitCode`                                 |
| `[startup]`                                               | 启动慢或卡在启动界面：渲染入口停在哪一阶段                                                           | `label`、`ms`                                                  |
| `[backend-ws]`                                            | 番茄钟、发布等后端功能不工作：连接是否断开、重连了几次、哪个请求没等到结果                           | `code`、`reason`、`attempts`、`method`                         |
| `[route]`                                                 | 整窗崩溃页：出错时的路由                                                                             | `path`                                                         |
| `[llm]`                                                   | AI 功能失败：哪家服务商、哪个模型、什么错误                                                          | `providerId`、`modelId`、`error`                               |
| `[ai-run]`                                                | AI 一轮对话怎么结束的：模型、结束原因、调了几次工具、耗时                                            | `finishReason`、`turns`、`toolCalls`、`elapsedMs`、`stopped`   |
| `[tool-call]`                                             | AI 每次调用了哪个工具、返回多大、用了多久                                                            | `tool`、`source`、`elapsedMs`、`bytes`                         |
| `[data-change]`                                           | 数据怎么变的：卡片、文章、项目文档、白板、待办、日程、插件数据的新增与删除                           | `type`、`ids`、`count`、`plugin`                               |
| `[transfer]`                                              | 导入导出的结果：计划数、成功、失败、跳过                                                             | `planned`、`docs`、`imported`、`failed`、`warnings`、`stopped` |
| `[stored-json]`                                           | 没报错但字段是空的：存库的 JSON 解析失败后被当成空值                                                 | `field`、`id`                                                  |
| `[content-plugin]`、`[plugin-local]`                      | 插件不见了：装配、检查或来源校验失败                                                                 | `pluginId`                                                     |
| `[plugin-backend]`                                        | 插件后台没起来：启动失败、异常退出、调用超时                                                         | `plugin`、`state`、`failures`                                  |
| `[plugin-window]`、`[plugin-bridge]`                      | 插件窗口异常关闭、插件请求的回执没送到                                                               | `pluginId`、`windowId`、`kind`、`requestId`                    |
| `[content-runtime]`                                       | 内容转换失败或超时                                                                                   | `operation`                                                    |
| `[whiteboard-sync]`                                       | 白板没保存、文档被占用：待发队列写入、打开、释放                                                     | `documentId`、`batchId`、`leaseId`                             |
| `[collab-cache]`                                          | 共享正文重新同步：协作缓存被重建或丢弃                                                               | `version`、`reason`、`document`                                |
| `[collab-doc]`、`[collab-image]`                          | 共享正文冻结超时、作者侧图片存储失败                                                                 | `documentId`、`requestId`                                      |
| `[database]`                                              | 资料库打不开、升级后异常：开库失败在哪一步、结构升级的原因；界面卡死或很慢：卡在哪个调用上、耗时多久 | `db`、`step`、`fromVersion`、`reasons`、`event`、`elapsedMs`   |
| `[doc-tasks]`、`[task-assistant]`、`[pomodoro]`           | 待办项目为空、提醒没发、番茄钟开始或结束失败                                                         | `database`、`taskRef`、`method`                                |
| `[assistant-memory]`                                      | 个人记忆的摘要、召回、依据失败                                                                       | `kind`、`id`                                                   |
| `[pdf]`、`[knowledge-map]`、`[content]`、`[tool]`         | PDF 页渲染失败、地图布局丢失、编辑器打不开、工具按空结果作答                                         | `pdfId`、`page`、`persistKey`、`lineage`、`tableId`            |
| `[sync-diagnostic]`、`[database-sync]`、`[sync-transfer]` | 同步配置与传输失败                                                                                   | 见[存储同步](/docs/architecture/storage-sync.md)               |
| `[content-save]`                                          | 正文保存失败                                                                                         | 见下节                                                         |

移动端沿用同一套标签，写在带 `[ui]` 的行里：`[collab]`（协作启动、持久化、资源处理）、`[plugins]`（批量更新入队）、`[ai-chat]`（内容对话查找）。

判据：`attempts`、`failures` 持续增长说明在重试；`suppressed` 很大说明短时间内重复触发。`[data-change]` 只记新增、删除、插件写入和批量修改，正常编辑正文不会出现，看不到它不代表保存出了问题。

### 正文保存故障排查

1. 在本次 `session-*.log` 搜索 `[content-save]`，日志目录以应用启动日志为准。
2. 按 `sessionId` 串联增量接纳、主库投影、缓存恢复和检查点；通过 `documentId` 或 `contentId` 定位正文，勿要求用户提供正文内容。
3. 先看 `stage`：`delta.validate` 为增量校验，`delta.journal` 为耐久写入，`delta.apply`/`delta.confirm` 为应用与确认；主库的 `identity`/`localize`/`commit`/`acknowledge`/`notify` 分别对应身份、资源转换、提交、回执与通知。
4. `committed=false` 时检查错误代码、分类、修订摘要与待保存代次；`committed=true` 时先核查后续缓存或通知阶段，不能直接认定主库正文丢失。`journalSaved=true` 只证明输入增量已耐久，不代替主库提交回执。
5. 保存后 `pending=true` 且 `version` 大于 `confirmed` 时，继续查下一轮提交；缓存恢复结合 `replayedUpdates`，检查点结合 `snapshotBytes` 与 `removedUpdates` 判断。故障限频期间查看下一条日志的省略次数，恢复须看到对应接纳或投影恢复事件。

### 代码检查工具对比

1. 固定同一提交、文件清单、Node.js 版本及运行机器。
2. 旧、新工具使用相同文件批次，不启用缓存、不执行写入。
3. 分别预热一次，再顺序执行三次，记录全部耗时与中位数。
4. 分开记录纯 lint、格式化和完整检查链；不能把包含格式化的 ESLint 耗时全部归因于 lint 引擎。
5. 核对实际扫描文件数、退出码、诊断与架构回归用例；失败或提前退出的命令不能当作成功提速。
