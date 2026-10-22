# @tau/database 架构文档

本文档拆解 `packages/database`（`@tau/database`）组件包的架构、数据流、插件体系与多视图实现，并提供维护、缺陷修复与功能扩展的实践指南。桌面宿主装配见 `apps/desktop/src/features/shared/database/`。

## 技术栈

React 19（peerDependency，宿主提供）+ TypeScript + Zustand（状态与快照）+ ahooks；UI 与主题用 `@tau/ui` / `@tau/themes`（颜色只消费 `--tau-*` 语义类）；react-dnd（列/视图拖拽，宿主提供 DndProvider，peerDependency）；@tanstack/react-virtual（表格/画廊虚拟滚动）；dayjs（日历视图）；immer / lucide-react / uuid。

## 文件结构

以下相对路径均在 `packages/database/src/` 下：

- 入口：`Database.tsx`——装配扩展（`extensions.ts` 的 installDatabaseExtensions）、创建 Zustand store、绑定键盘/列宽事件、渲染视图与 tabs。
- 状态：`DatabaseStore.ts`——单一数据源（columns/rows/views/viewConfig/history/selection/query/projection）。
- 插件：`plugins/*`——内置列类型、过滤/排序/分组/搜索策略、beforeSave/afterLoad；公式引擎在 `core/formula/*`。
- 视图：`views/TableView | GalleryView | CalendarView | KanbanView`——同源数据（store 内统一投影）不同呈现；类型元数据在 `views/registry.ts`，组件映射在 `views/components.ts`。
- 组件：`components/RowDetailModal`、`components/FormulaBuilder`、`ViewTabs`、`FilterPanel/GroupPanel/SortPanel`、`ViewTypeSelectModal` 等。
- Hook：`hooks/*`（单元格编辑、列宽、可见列、键盘导航、校验、行详情开合）。
- 常量：`constants/select.ts` 的 SELECT_COLORS 与 `@tau/ui` Tag 七色板对应。
- 桌面宿主：`DesktopDatabase.tsx` 装配 tau.desktop 扩展并做切库保护；`desktopExtension.tsx` 贡献资源字段、link 覆盖、正文会话与应用内链接；`plugins/*`（宿主侧）提供 image/attachment/rich-text 字段与 link 渲染覆盖。

## 数据模型与对外 API

- `ColumnDef`：id/title/type/config/width/hidden/isPrimary/validation；`config` 由插件自定义。
- `RowData`：`{ id, [columnId]: CellValue }`；CellValue 形态由插件决定（date 为 `{start,end}`，select 为 optionId，multi-select 为 `Array<{id,name,color}>` 等）。
- `TableViewConfig`（@tau/shared）：columnOrder/columnWidths/rowOrder/groupBy/sorts/filters（FilterGroup 条件树）/footer（表尾汇总：单列聚合或以各列汇总为叶子的组合表达式）+ galleryConfig（封面类型/图片列）、calendarConfig（日期列）、kanbanConfig（分组列/列顺序）。
- Props 要点：`data/columns/views/activeViewId/viewConfig` 必填；`extensions` 声明式扩展集合（必须引用稳定，变更即报错）；`config` 控制增删行列开关；`onDataChange`（仅用户操作触发）/`onViewConfigChange`；视图 CRUD 回调（onCreateView 等）；行回调（onRowDetailOpen/onRowAdd/onRowDelete/onRowCleanup/onDetachedRowPatch）；`theme/readonly/bare/className`。
- `DatabaseRef`：`deleteRow/addRow/updateRow/getRows`、`dispatch(command, source?)`（外部变更入口：`rows.apply` 差量 / `rows.receive` 确认快照 / `column.configure` / `column.resize` / `view.receive` / `view.remove` / `views.reorder`）、`setQuery(query)`（会话查询，不写入视图配置）。

## 状态管理与数据流

- 初始化 `createDatabaseStore`：合并列宽（viewConfig.columnWidths ‖ col.width ‖ 200）、行/列顺序回落初始数据序、filters 深拷贝。
- 用户编辑：store 写入前 `commitHistory`（最多 50 条，redo 栈遇新操作截断）；Database.tsx 订阅 store 按 `lastChange`（source 为 "user"）触发 onDataChange/onViewConfigChange。
- 外部更新：必须经 `ref.dispatch(command, "external")`——改 props 不会覆盖本地编辑；桌面适配在 tableId 数据变化时以 `rows.receive` 接回确认快照（保留其他本地草稿）。
- 查询投影：store 的 `commit` 只在数据/视图/查询变化时经 `core/projection.ts` 的 `projectDatabase` 重算一次，管线为：公式派生 → filters → search → sorts → rowOrder 合并 → groupBy；四种视图、键盘导航与拖拽共用投影结果。
- 行/列生命周期：删列是纯数据操作（正文引用由主进程按差集维护并延迟回收，无插件清理钩子）；删行经宿主 `onRowCleanup`（删除前行快照）；新增正文一律 `createPendingContent`（ref 0 + 待回收登记），保存进表时由主进程差集 retain。

## 插件体系（CellPlugin）

- `CellPlugin`：type/name/Icon/Renderer（必需）/Editor（可选，editable）/beforeSave/afterLoad（格式归一化）/getGroupKey/sort/filters（可按列给出）/search/valueType/toScalar/formatScalar（参与汇总与公式的值口径，未声明 valueType 只能计数）/capabilities（date/singleOption/boolean/images 字段能力声明）。
- 注册：`PluginManager.registerPlugin` 遇重复 type 报错，显式替换用 replacePlugin；内置插件与扩展贡献（fieldTypes/fieldOverrides）在装配扩展时统一注册。字段插件无 onMount/onUnmount，实例级启停由扩展 activate() 承担。
- 能力查询：视图与面板只经 `hasCapability(type, capability)` 判定（日历日期列、看板分组列、封面图片列），不按列类型名特判；搜索未实现时回落字符串包含。
- 内置列类型：text / number / date（单/区间，兼容旧数据）/ select（看板依赖其 getGroupKey）/ multi-select / checkbox / link / star / progress / formula（表达式存 config，值只在投影派生 `{value, error?}`，可筛选/排序/搜索/分组）。
- 图片、附件与富文本字段不在包内：由桌面扩展 tau.desktop 经 fieldTypes/fieldOverrides 贡献，缺失插件的字段不可编辑并保留原值。

## 视图系统

- **表格**：列拖拽/列宽调整（最小 50）/虚拟滚动（estimateSize=40，overscan 10）/行拖拽/单元格编辑与键盘导航/行详情/列编辑弹窗/表尾汇总行（配置存 viewConfig.footer，汇总输入是投影后的行）；主列不可删。
- **画廊**：响应式列数（ResizeObserver，最小 320px，1~6 列）+ 以卡片行为虚拟项；分组头用插件 Renderer + 计数；分组下新增行继承分组字段值；封面正文/资源预览由宿主 GalleryCover 插槽提供。
- **日历**：依赖声明 capabilities.date 的日期列（isRange 决定 endDate）；行映射为事件（title 取主列）；点击日期/拖拽区间创建行。
- **看板**：依赖声明 capabilities.singleOption 的单选列；分组键 optionId，未设置/未知归「未分类」；列顺序 kanbanConfig.columnOrder 持久化；行拖拽更新 rowOrder 与分组字段。
- 视图管理：ViewTabs 处理切换、拖拽排序、内联重命名、ConfirmDialog 删除、ViewTypeSelectModal 创建（类型卡片与必填列校验由 views/registry.ts 元数据驱动）；创建时复制当前配置并附加专属配置。

## 交互

- 键盘导航 `useKeyboardNavigation`：箭头/Enter/Space，按实例根节点仲裁（让位输入与输入法组合）；非编辑态进入编辑（若插件 editable）。
- 删除等确认走 `@tau/ui` ConfirmDialog/Dialog；readonly 禁用交互入口。

## 行详情与富文本

- `RowDetailModal` 包内骨架（左正文右属性栏，<960 容器查询退化单栏，同一棵树重排）。打开来源：行点击或宿主 onRowDetailOpen 接管。
- 正文由宿主插槽 RowDetailBody 提供（桌面为 ContentEditor 会话）；关闭/切换行前等待插槽 flush()；卸载后补丁经 onDetachedRowPatch 提交（带原行预期值，迟到结果不重建已删除行）。
- 属性与标题实时写回 store；详情侧可增删列（受 readonly/allowDeleteColumn 限制）；属性栏上移/下移排序（非拖拽）；上一条/下一条按当前视图投影后的行序。

## 扩展指南

**新列类型**：实现 CellPlugin（Renderer 必需、Editor 可选）；需要持久化格式转换提供 beforeSave/afterLoad；需要作为日历/看板/封面列时声明 capabilities；在 plugins/index.ts 注册到 builtInPlugins，或业务专属字段经宿主扩展 fieldTypes 贡献（不必进包）；自定义筛选在插件 filters 加操作符与初始值（operator 文本唯一）。

**新视图类型**：扩展 @tau/shared 的 DataTableView.type 与 TableViewConfig；新视图组件（参考 Table/Gallery）透传 pluginManager/theme/readonly 与行列回调；在 views/registry.ts 登记类型元数据、views/components.ts 注册组件映射（创建弹窗由注册表驱动，不在 ViewTabs/Database.tsx 加分支）；持久化专属配置到 viewConfig 并经 onUpdateView 回写。

## 排查与调试

- 数据不同步：用户编辑只经 lastChange（source "user"）上行；外部变更必须经 ref.dispatch(command, "external")。
- 列类型缺失/渲染异常：检查 builtInPlugins 或扩展 fieldTypes 注册（重复类型装配时报错）；column.type 与插件 type 对齐。
- 筛选不生效：插件 filters 的 operator 与 FilterPanel 下拉一致，处理 requiresValue。
- 日历/看板无法创建：至少一列声明 capabilities.date/singleOption（公式列结果为日期也不算）；查 views/registry.ts 元数据。
- 列删除后正文疑似泄漏：删列为纯数据操作，contentId 由主进程 DataTableTable 在写路径事务内按新旧差集 retain/releaseDeferred，释放到 0 只登记 content_pending_releases，开库回收超 7 天宽限且仍为 0 的正文；宽限期内撤销/粘贴会重新引用并撤销登记。
- 行详情未保存：查插槽 flush()、createPendingContent 成功与 detailContentId 回写、onDetachedRowPatch 是否被主进程拒绝（行已删或旧值冲突）。
- 键盘导航失效：按实例根节点仲裁，焦点在其他实例或输入框时不响应。
- 虚拟滚动错位：调 estimateSize、保持行高稳定。

## 关键调用链

- 入口事件流：Database.tsx → 视图组件回调 → store commit → lastChange → onDataChange/onViewConfigChange。
- 投影管线：projectDatabase（公式 → filters → search → sorts → rowOrder → groupBy）→ 各视图按 projection.rowIds/groups 渲染。
- 视图创建：ViewTabs → handleCreateView（registry createConfig 追加专属配置）→ onCreateView → view.receive → set*Config。
- 行详情：RowDetailModal → 属性实时写回（卸载后经 DatabaseWriteContext 的 commitRowPatch）→ 正文插槽 flush() → 宿主 createPendingContent + onRowChange 回写 detailContentId。
- 列宽：useColumnResize → store.resizeColumn → columnWidths + viewConfig。
