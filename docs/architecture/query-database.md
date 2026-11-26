# 实时查询数据库

查询数据库通过 DSL 或 JavaScript 读取当前资料库，返回列定义和行数据。结果只读；定义与展示配置持久保存，计算结果只保留在内存。独立数据库和正文查询块共用执行、编辑、AI 辅助和视图组件。

## 模块边界

`@tau/shared/query-database` 是无 React、DOM、Electron、SQLite 依赖的纯入口，包含数据目录、定义与结果协议、DSL 解析与求值。`@tau/shared/query-database/client` 提供浏览器 Worker 执行器；刷新状态机在同目录 `session.ts`，由宿主提供读取、发布和错误回调。

桌面适配在 `features/shared/query-database/`：`read.ts` 固定资料库与连接代次，普通内容复用主进程插件业务只读投影，待办和日程复用 task-assistant 的查询语义。日记和普通数据库由 `tables/data-table-query.ts` 投影。正文通过明确的 contentId 与创建时间读取，不通过任意 SQL 或文件路径访问。

数据目录包含 cards、articles、projects、documents、todos、calendar、diary、tables、whiteboards、notebooks、materials、chats、contents。Notebook、材料、对话的开放范围沿用当前只读协议，对话不含消息正文。普通数据库通过 tableId 读取，查询数据库之间不互相读取。

## 执行与刷新

执行器使用原生 Web Worker，创建于不具备同源权限的隐藏 iframe。iframe 的 CSP 允许内置脚本和 blob Worker，拒绝网络与外部脚本。消息通道仅承载只读数据请求和计算结果，不暴露 Node、Electron、通用 IPC 或写入命令。运行期限、读取数量、结果数量与字节预算分别受限；超限明确失败，不返回截断成功。

沙箱加载自包含的经典 Worker 脚本。生产构建由 Vite 的 Worker 打包生成；开发服务注册 scripts/vite-query-database-worker.mjs 的 queryDatabaseWorkerPlugin(build)，将该 Worker 的开发资源请求编译为无外部导入的 IIFE，避免开发 ESM 模块在经典脚本中解析失败。开发构建缓存只包含执行器脚本，依赖变动后失效；各次查询仍独立执行和重读数据。开发环境保持同一套无同源、无网络隔离，不通过开放模块请求绕过沙箱。

每个渲染窗口最多同时执行 4 个查询，另有 64 个等待位，等待也计入 15 秒期限。排队中的取消、超时和启动失败均释放位置；过载明确拒绝。读取上限为 50,000 行，结果上限为 20,000 行，序列化数据按 UTF-8 字节计算 16 MB 预算。数据源返回不可传递对象或无效分页时立即失败，消息转发不产生未处理的 Promise。

窗口内复用一个沙箱 iframe，各执行使用独立 Worker 和消息端口；面板通过 `retainQueryRuntime` 持有宿主，最后一个持有者与执行退出后移除。每次结束先确认 Worker 已终止，再释放端口与宿主持有；无法确认、超时或沙箱失效时退役该宿主，受影响执行受控失败，后续查询重建环境。复用隔离文档避免反复执行累积 Chromium 隔离进程，不共享查询结果或脚本全局。

宿主先订阅变化，再启动查询。Worker 每次调用数据源时记录来源依赖，即使结果为空也记录。相关来源变化经合并后重新读取并完整计算，不做增量维护或共享查询缓存。运行期间的变化标为脏，在途结果不发布，随后再执行一轮。同一查询不并发执行；代码改变、卸载或连接变化时取消旧执行。Activity 隐藏时释放副作用，文档隐藏时暂停，恢复后重新读取。

DSL 的 today/now 和 JavaScript 的 ctx.today/ctx.now 会登记时间依赖，由宿主按分钟触发重算。日期上下文使用宿主时区。只保证变化后的结果收敛，不承诺多来源跨调用事务快照。

日记专用命令向全部窗口发送 `diary:changed`；通用正文写入与分块投影由提交后的正文归属解析补发同一通知，覆盖发起窗口中的独立查询。日记不因此进入插件公开业务事件。

同一上下文失败时保留上次成功结果并标记错误。资料库或连接代次变化时立即停止显示旧结果。分页必须读完，重复游标和超过读取预算均失败。移动端可复用纯核心与浏览器执行器，各自提供只读数据与生命周期适配。

## 界面

两个宿主共用 `QueryDatabasePanel`，`variant` 区分独立页与正文块。结果优先：源码默认收起，状态胶囊合并条数、更新时间与刷新，点击即触发全量重读调度，运行期间禁用。独立页通过 `QueryHeaderSlotContext` 把状态胶囊与「查询」按钮挂到 `DatabaseWorkspace` 标题行；正文块把来源名作为 `@tau/database` 视图栏的 `toolbar.lead` 标题，「显示列」、状态胶囊与「查询」按钮通过 `toolbar.extra` 并入同一视图栏，工具常驻。

源码面板自上而下为语言与参数胶囊、代码、AI 行。参数胶囊列出源码中的 `params.名称` 与已存参数，按文本、数字、布尔或 JSON 解析写回定义；没有参数时不占位，手动添加在语言行右侧的「⋯」菜单。问题各有固定位置：DSL 语法错误由 `summary.ts` 用真实解析器静态检查，在源码下方标出行列；运行失败在源码下方或（收起时）标题下提示条，提供「重试查询」；保存失败由宿主传入 `saveIssue`，状态胶囊显示「查询未保存」，提示条给「重试保存」和「读取已保存的版本」，与数据刷新互不混用。有上次成功结果时保留并降为淡色。

`useQueryAssist` 承担 AI 编写：完成后直接写入定义并保留上一版以便撤销；生成期间源码 revision 变化时不覆盖，结果作为候选待用户采用或丢弃。查询改列导致视图引用失效时，提示条一键移除失效的筛选、排序与分组。

## 定义与结果

定义为 `{ version: 1, language: "dsl" | "javascript", code, params? }`。DSL 使用 TABLE / FROM / WHERE / GROUP BY / SORT / LIMIT。类型从字段目录、函数和表达式推导；计算列使用 AS 指定稳定 key，也允许 TYPE 显式声明。空结果仍有完整列定义。TYPE 校验值，转换使用 toNumber / toDate 等函数。

结果包含 `columns: [{ key, title, type, options? }]` 与 `rows: [{ id, values }]`。列类型为 text、number、boolean、date、select、multiSelect、entity、json。行 ID 和列 key 必须唯一；拒绝非有限数值、错误字段值与不可序列化对象。日期使用时间戳或 ISO 日期，实体引用使用 `{ kind, id, title? }`。视图适配为列 key 加 `q:` 前缀，避免字段名 id 覆盖行身份。

`@tau/database` 的 `dataset.receive` 原子替换列与行并保留有效选择、视图及列宽；刷新不重挂组件。数据只读与展示配置分开：查询实例禁止数据增删改，允许列宽、列序、隐藏列、筛选、排序、分组、汇总与视图配置。hiddenColumnIds 属于视图配置；服务端 normalizeConfig 同样保留它。

## 两个宿主

独立数据库沿用 database_item、data_tables 和 data_table_views，data_table_queries 保存定义和递增 revision。定义更新采用条件更新，过期写入拒绝；定义、数据表更新时间与既有操作记录在同一事务提交。计算结果不写 data_tables 的 columns 或 rows，普通表写入、行补丁和差量接口统一拒绝查询表的数据修改。

正文的 query-database 节点由 host.query-database 声明，code 是协作文本字段。language、paramsJson 和 presentationJson 保存在节点中；配置以 JSON 字符串隔离 Slate 深补丁类型，计算结果不进入正文。Markdown 使用 tau-query 或 tau-queryjs 围栏；qdb 元数据保存参数与展示配置，普通 javascript 围栏维持代码语义。专用 codec 排在通用代码块认领之前。

数据库列表的「新建数据库」下拉提供空白数据库与实时查询；实时查询弹窗只选起点（一句话、来源或空白代码），`starterQuery` 按来源目录生成起步 DSL，创建后经 `queueQueryOpenIntent` 让数据库页展开源码并在需要时立即让 AI 编写。旧关联表由两端开库事务自动升级为 DSL，表 ID、数据库条目、正文中的表引用及可映射视图保持原身份。旧自建列和值不进入新结果；其自建正文持有仅作延迟释放，源实体与正文不修改。查询表只保留定义和视图，结果不持久化，不提供旧关联写回接口。

升级政策在 db-schema 的 query-database-migration.json，纯定义及视图转换在 src/query-database-migration.ts，桌面由 main-query-databases.ts 执行，Rust 由 query_database_migration.rs 执行。二者使用相同的手写契约夹具对账。源列从 src:旧字段 映射到 q:查询字段，保留标题、宽度、隐藏和有效筛选、排序、分组、汇总及视图选项；忽略自建字段的引用，日历或看板的必要字段无法映射时回到表格视图。即使版本和指纹已更新，重新带入旧来源表仍会执行升级；失败回滚整个开库事务，重复执行不再次释放正文。旧来源表只作升级输入，成功后删除，当前 Schema 不再创建它。

标签范围生成 hasTag 的 OR 条件，保留子标签匹配；项目范围生成 projectId/deep 参数与 kind=document 条件，按目录遍历并去重；日记本月、今年通过 year/month 与 today 动态筛选，跨月重算。作者、上级、天气、心情属于统一查询目录。

AI 辅助沿用对话模型配置。@tau/ai/query-database 组合完整语言与脚本参考、实际字段目录和预算；查询面板通过 useQueryDatabaseAssist 每次直接将完整参考放入 system 消息，将当前语言、最新源码、参数、需求和最近一次错误放入 user 消息，不依赖模型自行读取 Skill 或网络文档，不附加结果行和源正文。模型只返回代码，面板按既有绑定回填定义；生成期间代码已变化时保留候选结果，避免覆盖用户输入。

内置 query-database 技能组合正文编辑指导与同一份完整参考，桌面和手机沿用共享内置技能注册表按需加载。Agent 用上下文与正文读取工具取得 contentId、快照和查询围栏，按当前正文工具的完整块范围编辑并保留 qdb 参数/展示配置；不承诺保留被整体替换块的协作身份，也不绕过正文审批。主对话不会自动取得查询面板的运行错误或结果。独立查询定义缺少 Agent 专用写工具、查询运行缺少反馈工具时，技能要求明确尚未写入或验证。

## 验证

解析、分页、空结果类型、聚合、重复身份与刷新竞态测试在 shared 查询目录。桌面 SQLite 测试验证条件更新、只读拒绝和普通表投影；Markdown 测试验证源码、参数与视图往返。

使用参考在官网 query-database 篇，database 与 editor 篇链接到同一参考。shared 的 documentation.parity.test.ts 对账来源及字段目录，并用真实 DSL 解析器、脚本和结果协议校验执行文档中的完整示例，覆盖有数据和空结果。

运行 `pnpm --filter desktop test:query-runtime`，使用桌面实际 Vite 配置、临时页面与隐藏 Electron 窗口，分别验证开发 HTTP 服务和生产文件协议的真实 Worker、消息桥、迁移 DSL、网络拒绝、死循环终止、失败恢复与资源清理。该脚本不访问用户资料库，也不执行截图验证。

真实资料库副本、批量写入与全量刷新、并发定义保护、同名文件替换、分页预算和受限堆内存耗尽恢复的命令与通过判据见[查询数据库验证指南](/docs/guides/dev-query-database-verification.md)。
