# 桌面端总览

> 结构现状与目录职责、已退役边界、公共 UI 归属；写页面前先读 page-protocol 与 ui-interaction。

## 结构现状

- 主窗口 = AppShell + PageProvider + Activity 保活；33 个 Page 由 `features/**/pages/*.page.tsx` 自动注册（Vite glob），侧栏与命令面板走新入口；设置是壳层浮层；独立编辑、Markdown、快捷卡片、番茄是独立 feature 窗口。
- 今日页接真实数据（统计并入今日页）；项目只承载文档树，数据库与 Notebook 是独立模块。
- 主题唯一归属 `@tau/themes`，UI 原语唯一归属 `@tau/ui`；样式载体 Tailwind，手写 CSS 仅限 [ui-interaction](./ui-interaction.md) 篇的四类白名单；Less 与 antd 全仓为零且有门禁。
- 壳层启动时序：必须等设置 store 的 `inited` 再连接活动数据库——缓存已有库名不代表设置初始化完成；初始化期间保持等待，就绪后自动连接；真实开库失败继续显示错误并支持重试，不得以绕过失败代替连接成功。
- 渲染端设置读取统一经 `mergeSettingWithDefaults`：模型缺失或非数组的 `input` 补为 `["text"]`，缺失或非布尔的 `reasoning` 补为 `false`，记录修复数量；保留显式能力，不猜测费用、上下文窗口与最大输出。缓存、后端初始化及设置广播使用同一归一化入口，设置页与聊天只消费归一化后的模型。
- 渲染入口在同步安装日志、性能观测、命令桥与全局样式后，立即挂载轻量启动界面，再异步加载应用模块、编辑器扩展与内容插件；启动界面按当前阶段更新提示，阶段耗时写入性能快照。每次启动扫描插件目录和清单，从文件字节重新验证清单 SHA-256。摘要验证结果只在主进程内复用，真实路径、文件身份、大小、时间指纹和清单摘要均匹配才命中。已启用的内容插件定义由隔离窗口批量检查，检查结果随本次启动快照保存在内存中。两类缓存都随进程退出释放。扩展及插件初始化仍先于业务壳层，失败时显示启动错误，避免模块求值和异步初始化期间白屏。
- 编辑器装配层直接消费 `editor-extensions/base.ts` 与附件叶子入口，不经扩展桶加载内容链接、聊天引用或项目列表扩展；宿主扩展由 `useDynamicExtensionsStore` 按叶子入口并行加载。引用插入操作直接读取 `content-editing/active-editor-session`，不加载审阅与方案模块。内容链接的正文预览、聊天引用的 Markdown 预览均按需加载。`pnpm check:desktop-startup` 检查这些传递静态依赖，并拒绝 EditorKit、基础扩展、内容链接及聊天引用入口的静态回环；检查不禁止正常的按需动态加载。
- 窗口角色由 preload 的 `window.electron.windowRole` 提供，不在隔离渲染上下文读取 `process.argv`；设置完整初始化与微信读书启动校验只在主窗口执行。辅助窗口经 `setting-replica` 的 BroadcastChannel 请求主窗口运行时快照后置 `inited`（保留已校验状态、不回灌保存），各窗口仍订阅后端设置变更并可提交本地修改；无主窗口响应的独立窗口 1.5 秒后只读后端快照兜底，迟到响应不覆盖已收快照。主进程设置文件的首次并发读取共享在途任务，失败后允许重试。服务设置在读取与提交时经 `assertProviderSettingsShape` 检查对象与数组结构；不因旧服务字段、选用值或账号标识拒绝设置，不因未使用的服务配置阻断启动或保存，也不据此安装或启用插件。
- 切库按活动库名重建壳层与页面栈；`ensureDatabaseReady` 在连接成功且确认仍为当前库后、发布 ready 前清空全局查询缓存，并取消旧查询的结果接收——未带库名的查询不得跨库复用新鲜缓存或在途请求，迟到的旧连接结果不得清除当前库缓存（只作用于查询，不清 mutation 状态）。
- 交互聊天与一次性带工具运行共用消息准备入口：图片传路径或 data URL、文件传本地定位提示；系统提示中的退役代理片段只从系统提示移除，用户正文保持原样。

## 目录结构与文件职责

```text
apps/desktop/src/
├── app/                 # 壳层、导航清单、布局与全局浮层装配
├── page/                # definePage、双注册表、栈机、Provider、Activity 保活
├── features/
│   ├── home/            # 今日与统计；pages / views / queries / types
│   ├── projects/        # 文档树列表、详情与条目工作台
│   ├── databases/       # 数据库列表与详情
│   ├── vibe-learning/   # Notebook 列表、详情、生成与测验
│   ├── cards/           # 卡片墙、详情及快捷卡片窗口（图谱已移到 knowledge-map）
│   ├── flashcards/      # 复习页、编辑与复习会话
│   ├── walk/            # 随机漫步：随机抽旧内容重温，顺岔路（双链/语义/同标签）走到相邻内容
│   ├── pdfs/            # PDF 列表、阅读器及页面作用域对话
│   ├── search/          # 命令面板与检索
│   ├── settings/        # 设置浮层、分区单源与各子页
│   ├── editor-window/   # 卡片、文章与项目文档的独立编辑窗口
│   └── markdown-window/ # 文件窗口、文件树与源码模式
├── components/          # 应用级业务共享层；消费者决定归属
├── services/            # Page 导航、正文入口、pi 运行时与内容编辑协议
└── pages.ts             # Vite glob 自动注册 Page

packages/ui/src/         # 公共原语、浮层底盘、hooks、cn
packages/themes/src/     # token 契约、主题定义、运行时与 CSS
packages/database/src/   # 多视图 Database、投影、store 与通用字段插件
```

目录示意只列高频域。新增页面在 features 内声明；原 pages 目录已清空，背景音播放归 features/pomodoro，测验题面归 vibe-learning/components/quiz，卡组表单归 flashcards/components/DeckSelectorDialog。

高频入口：`app/navigation.ts`、`app/navSlots.tsx`、`features/settings/sections.tsx` 与各域 queries。

## 已退役功能与保留边界

以下功能已整体移除；开库保留已有数据，不因历史版本标记拒绝进入：

- **知识库** → 并入普通文档树项目（project / project_item，条目带 tags，正文复用 contents 原 ID）；侧栏、首页、统计、发布与插件只消费项目。
- **RSS / 稍后读 / 博客 RSS 输出**：不再有相关 Page、表与 RPC；扩展保留剪藏；博客不再生成 rss.xml，publicUrl 保留用于打开站点。
- **编辑器引用块**（对话引用、问题引用/创建扩展）：编辑器不再识别退役节点名单，旧导出文件中的退役块按未知节点规则呈现；问题、答案与关联记录归问题插件。
- **Codex 代理**：各聊天入口只运行本地 pi 代理，主进程不注册 Codex 模块；历史 Codex 工具经通用折叠行只读展示。
- **资源管理页与主库资源登记**：聊天附件直接消费上传返回路径；协作缓存资源表、通用文件与媒体服务、上传设置和资源同步保留。
- **音频笔记**（项目条目 `audio-note`）：编辑器 `:::audio`、播客、TTS、背景音与共享转写保留。

## 公共 UI

日记页搜索走 react-query（`["diary", "search", 关键字]`，300ms 防抖），日记变更失效同域查询；结果按片段 id 筛选，旧关键字的迟到响应不能覆盖当前查询。

DatabaseWorkspace 与编辑器数据库块只按表身份建立实例，不再按活动视图重挂载。包内使用独立 `DatabaseView/CreateDatabaseView`，不读取表身份、正文引用、引用计数或创建/更新时间；宿主经 `toDatabaseView` 投影存储记录，在创建回调闭包中补齐 tableId。视图切换由实例栈与投影完成。
卸载后的标题、属性与正文通过 `onDetachedRowPatch` 提交字段补丁；主进程事务检查最新表/行、字段和预期旧值，拒绝删除或冲突目标，不恢复行、不写旧整表快照。正文无法关联时不删除，留给开库回收。常规桌面保存通过 shared hook 的 `updateDataTableChanges` 能力在最新数据上合并字段差量，新增 ID 显式标记，行删除时正文引用由主进程差集交给延迟回收；不提供该能力的宿主保持既有保存方式。确认快照由桌面适配经 external `rows.receive` 接回实例，保留其他本地草稿。
桌面适配的保存与行清理回调固定实例所属库；切库后旧回调拒绝继续保存或释放引用，异步正文创建后也再次检查库身份与所属行。
文本、数字和链接的 Enter 提交后安全归还所属实例焦点，外部输入/其他实例/浮层已获得焦点时不抢焦点。画廊正文查询 staleTime=0、聚焦刷新，正文事件只触发按原库命令重读，不直接缓存缺少库身份的事件正文；预览内容变化建立新的只读编辑器实例。

通用 Database 归 `@tau/database`，所有组件、类型、插件与 hooks 经根入口消费；桌面三个宿主统一使用 `features/shared/database/DesktopDatabase`。视图（含扩展视图）、store 与查询投影在包内：每个实例持运行时 `ViewRegistry`，内置四视图与扩展贡献的视图走同一注册路径，视图定义合并元数据与组件（`views/<View>/definition.ts`，`builtInViews.ts` 聚合），持久化 hook 与卡片偏好仍在宿主。残留的未知视图类型渲染通用占位（标签可见、可删除、可改类型，数据与 viewOptions 原样保留）。宿主提供 DndProvider、UiProvider、主题初始化与 Tailwind @source；包内键盘监听按实例根节点仲裁，并让位输入法与导航组合键。Cmd/Ctrl+Z 撤销、Shift+Cmd/Ctrl+Z 或 Ctrl+Y 重做只覆盖行与列数据（产生 user 变更落库，视图配置不回滚）；外部数据更新到达时撤销栈以新数据重建基线。`pnpm check:database-boundaries` 和独立 `@example/database` 构建守护无桌面依赖与私有深引。

Database 的字段插件、视图、聚合算子、命令与插槽只经 `extensions`（`defineDatabaseExtension`）装配，集合必须引用稳定；字段类型、覆盖目标、插槽键、视图类型、聚合算子与命令 id 重复均报错，扩展视图 type、聚合算子 op 与命令 id 必须带命名空间（含 "."）。扩展贡献的表尾聚合算子（`aggregates`）经每实例 `AggregateRegistry` 与内置 9 个同路径登记，仅表尾可用——公式（含表尾组合表达式）仍只认内置 `AggregateOp`，配置了未登记算子的表尾格显示为空、配置原样保留。扩展命令（`commands`）出现在行菜单（「删除」前）与列头菜单（「编辑」后），经受控 `DatabaseCommandApi` 读写（批量写只产生一次撤销步），readonly 实例不显示；toolbar 无现成溢出菜单承载点、暂不渲染；内置编辑/删除保持原确认流程不改为命令。正文、图片与画廊预览由扩展插槽提供，组件不读取宿主正文。桌面扩展 `tau.desktop`（`features/shared/database/desktopExtension.tsx`）贡献资源字段、link 渲染覆盖、正文会话与应用内链接，由 `DesktopDatabase` 默认装配；卡片视图另加 `tau.cards`。可信的桌面扩展直接使用宿主模块，Database 包不提供宿主能力。store 删除行只调用宿主的 `onRowCleanup`。行详情关闭或切换前等待正文插槽的 `flush()`，宿主绑定原数据库并在创建完成后复核所属行，已删除行或被拒补丁的迟到正文不重新建行，留给开库回收。无正文插槽时仅提供通用属性编辑。

**数据表正文引用**：存活的数据表（`data_tables.ref_count > 0`）对声明了 `contentRefs` 的字段单元格（rich-text 单元格 contentId）与行 `detailContentId` 的每次出现各持有一份 contents 引用，已删除的表不持有。收集口径由字段 model 的 `contentRefs` 声明：`@tau/database/model` 的 `collectContentRefs`/`diffContentRefs`，主进程 `modules/tables/field-models.ts` 登记内置与桌面字段 model；主进程 `DataTableTable` 每条写路径（create / update / patchRow / applyChanges / remove / incrementRefCount）在同一事务内按新旧差集 `retain` / `releaseDeferred`。渲染端不增减或删除这类正文引用，新建正文一律 `createPendingContent`（ref 0 + 待回收登记，进表时 retain）。释放到 0 只登记 `content_pending_releases`，开库（maintenance）回收超过 `CONTENT_RELEASE_GRACE_MS`（7 天）且仍为 0 的正文，删除级联同 `deleteContent`；宽限期内的撤销、粘贴与块复活会重新引用并撤销登记。没有 tableId 的宿主（卡片视图）行不带 detailContentId，删行即删除对应实体；`DesktopDatabase` 不再自行删除行正文，只在库仍为当前库时转发 `onRowCleanup`。

**数据表物理回收**：`data_tables.ref_count` 只是提示，不作删除依据（协作撤销删块、删除正文与项目条目都不回写计数）。`remove` 下限为 0，1→0 时登记 `data_table_pending_releases`，`incrementRefCount` 0→1 撤销登记。开库 maintenance 先执行 `DataTableTable.collectPendingTables`、后执行正文回收（复活的表 retain 正文，救回同批待回收正文）：存量 ref_count ≤ 0 的表补登记并归零；到期登记按实际引用对账——`database_item`、`project_item(ref_type='data-table')`、正文 JSON 中 `database` 节点的 `tableId`（一次调用只扫描一遍）以及本机协作与撤销历史的实体持有。仍有引用的按引用数复活并告警，无引用才删除表与视图；实体持有检查未就绪或失败时保守保留。新增任何持有 tableId 的位置，必须同时接入这份对账。

**查询数据库**。新建入口支持空白和查询生成；DSL / JavaScript 的纯核心与 Worker 在 shared 查询子入口，独立表和正文查询块共用 QueryDatabasePanel。结果只读、按来源事件全量重算，定义和视图配置持久保存。协议、执行边界与两个宿主的存储见[实时查询数据库](/docs/architecture/query-database.md)。

旧关联表在开库事务中自动生成 DSL，保留表身份、来源范围、源字段与可映射的视图；自建列及写回退役，源业务记录不修改。旧来源结构只作升级输入，转换成功后删除，不保留关联表运行时。两端的迁移边界见[实时查询数据库](/docs/architecture/query-database.md)。

- EditText 与 EditTextHandle 从 `@tau/ui` 消费；占位符样式同归 UI。日期周起始与日历事件布局纯函数经 `@tau/shared/calendar-utils` 共用，不依赖桌面日程类型。

- 所有新设计系统消费者使用 `@tau/ui` 单一入口；原桌面 ui 目录已删除，不保留转发。组件、`cn`、hooks 一律从桶入口导入（`import { Button, cn } from "@tau/ui"`）——包 exports 不提供组件子路径；例外仅 CSS（`@tau/ui/styles.css`）；主题不在本包，一律从 `@tau/themes` 导入（ER-011），新增控件只需在 `primitives/` 落文件并在 `index.ts` re-export。颜色/尺度词表与 cn、主题测试均在公共包，新增控件同步样板间档案。
- Popover 已包含锚点定位、嵌套外点仲裁和 Portal 支持；表单内 Tab 顺序移动，到末项才退出。输入法组合让位，busy 时关闭请求被拒绝。
- `UiProvider` 提供局部主题与 body Portal 根。主题运行时显式初始化，可清理；`createThemeRuntime` 可注入存储、DOM 根及系统媒体查询。首帧通过 Vite 注入 `createThemeBootstrapScript()`，与运行时共用解析和主题清单，不再维护 HTML 白名单。
