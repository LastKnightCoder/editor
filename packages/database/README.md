# @tau/database

仓库内 React 多视图组件包，提供表格、画廊、日历、看板、字段插件、查询投影与通用行详情。源码由宿主构建，不单独发布 npm。

## 宿主接入

组件需要宿主提供 React、React DOM、react-dnd，以及已有的 DndProvider。UI 与主题使用 `@tau/ui`、`@tau/themes`；主题运行时由宿主初始化并清理，Database 不创建全局 Provider。

```tsx
import Database, { type DatabaseRef } from "@tau/database";

<Database
  ref={databaseRef}
  columns={columns}
  data={rows}
  views={views}
  activeViewId={activeViewId}
  viewConfig={viewConfig}
  onDataChange={saveData}
  onViewConfigChange={saveViewConfig}
/>;
```

所有组件、类型、插件管理、store、Context、hooks、DateValue 与 DatePluginConfig 均从根入口导入；不深引 src。视图协议为 DatabaseView / CreateDatabaseView，只含界面需要的标识、名称、类型、顺序与配置；表身份、时间戳、引用计数和正文身份均由宿主掌握。根入口导出内置通用字段插件及 builtInPlugins。

## 字段 model 子入口（`@tau/database/model`）

字段的纯数据部分与 React 组件分文件（D-130）：`defineFieldModel` 声明 `DatabaseFieldModel`（`toText` 值转纯文本、可选 `contentRefs` 资源声明、`valueType` / `toScalar`），内置十个字段经 `builtInFieldModels` 提供；根入口的 CellPlugin 从同一份 model 组装纯成员，行为不变。主进程与 MCP 等非 UI 消费方只依赖该子入口。子入口的运行时依赖闭包不可达 React / DOM 与 UI、状态库（type-only 导入不计入），由 `scripts/check-database-boundaries.mjs` 守护；新增成员时保持 model 文件零 `.tsx`、零 UI 导入。

字段还可声明 `ConfigPanel`（列配置编辑面板，受控组件，ColumnEditModal 在类型区下方渲染；未声明的字段保存时不改动 config）与可选 `validateConfig` 保存前最终校验；面板需要更宽弹窗时在组件上挂 `dialogWidth` 静态属性（如公式构造器 880）。

字段配置带版本（D-130）：列定义的 `configVersion` 缺省视为 1，字段 model 声明 `configVersion` 与逐级 `migrateConfig`（声明 >1 却缺迁移函数在 `defineFieldModel` 时抛错）；model 子入口的 `upgradeColumnConfig` / `upgradeColumns` 把旧版本配置逐级升到当前版本，列版本更高时原样保留不降级。Database 初始化与外部 `column.configure` 到达时升级，升级不立即触发保存，随用户下次修改一并落库；新建列写入 model 声明的当前版本。

宿主 Tailwind v4 入口导入主题 token、主题 Tailwind 桥接和 UI 公共样式，并显式扫描本包与 UI 源码：

```css
@import "tailwindcss";
@import "@tau/themes/tokens.css";
@import "@tau/themes/tailwind.css";
/* 下列路径相对宿主 CSS 文件；examples/database/src/style.css 使用这组路径。 */
@source "../../../packages/database/src";
@source "../../../packages/ui/src";
```

宿主入口另需导入 `@tau/ui/styles.css`。Web 接线示例位于 `examples/database`，启动命令：`pnpm --filter @example/database dev`。

## 数据与状态

- data、columns、views、activeViewId、viewConfig 提供实例初始状态，重渲染不覆盖本地编辑。
- 用户编辑经 onDataChange/onViewConfigChange 通知宿主持久化；会话查询不写入视图配置。
- 外部确认更新经 `ref.dispatch(command, "external")`，不触发保存回调；使用 rows.apply 提交字段差量，rows.receive 提交确认快照。
- 查询经 `ref.setQuery()` 接入；四种视图、键盘与拖拽共用内部 projection。
- 键盘仅作用于事件目标所在实例，输入、输入法组合及导航组合键让行。
- Cmd/Ctrl+Z 撤销、Shift+Cmd/Ctrl+Z 或 Ctrl+Y 重做，只覆盖行与列数据（经 user 变更落库，视图配置不回滚）；外部确认更新到达时撤销栈以新数据重建基线。
- 行详情的卸载草稿和异步正文经 onDetachedRowPatch 提交行标识、字段补丁与原行预期值；父级订阅退出后不再调用整表 onDataChange。宿主检查最新目标并返回是否应用，缺少该能力或目标删除时拒绝提交。宿主只按实体身份建立实例，不按活动视图重挂载。
- 表格视图底部有表尾汇总行，配置存 `viewConfig.footer`（列 id → `{ kind: "aggregate", op }`），按视图持久化；汇总输入是投影后（筛选后）的行。宿主持久化视图配置时须保留 `footer` 键。
- 通用字段、查询配置经 shared 的纯类型入口复用；本包不消费持久化模型，也不访问 SQLite、Electron 或业务页面。插槽接收的行字段是不透明数据，不读取业务标识。

## 宿主能力

宿主经 `extensions` 装配字段与插槽，集合在实例内必须引用稳定（模块级常量或 useMemo），变化即报错（D-128）：

```tsx
const acmeExtension = defineDatabaseExtension({
  id: "acme.fields", // 必须带命名空间
  create: () => ({
    fieldTypes: [RatingPlugin], // 新增类型，与内置或其它扩展重复即报错
    fieldOverrides: [{ type: "link", patch: { Renderer: LinkRenderer } }], // 浅合并改造已有类型
    slots: { RowDetailBody }, // 每个插槽键只能由一个扩展提供
    activate: () => () => {}, // 每实例挂载启动，返回值在卸载时清理
  }),
});
const extensions = [acmeExtension];
<Database extensions={extensions} {...props} />;
```

`create()` 每个实例调用一次，实例级状态放在其闭包内。覆盖在全部 `fieldTypes` 注册后应用；目标不存在、同一类型被两个扩展覆盖均报错。扩展不从本包获得文件、导航或模型等宿主能力，所需能力由宿主侧扩展自行持有。图片、附件、富文本与卡片业务字段由宿主扩展提供；缺失插件的字段不可编辑并保留原值。

插槽 `useFormulaAssist` 是 hook：返回调用模型的函数，返回 undefined 时公式构造器不显示 AI 输入框。

字段插件经 `capabilities`（`FieldCapabilities`：date / singleOption / boolean / images）静态声明值格式与内置同名字段兼容，视图与面板只经 `PluginManager.hasCapability` 判定可用性（日历日期列、看板分组列与完成列、日期分组粒度、封面图片列），不按列类型名特判。能力不从 `valueType` 推断：公式列结果为日期也不能作日历列。

视图类型元数据（名称、图标、创建所需列及初始配置片段）集中在 `views/registry.ts`，视图组件映射在 `views/components.ts`（仅根组件消费，分开以免视图组件与元数据循环依赖）。视图专属配置字段（gallery / calendar / kanban）与编辑面板配置区块暂未进入注册表（D-128）。

字段插件可选声明 `valueType`（number / text / boolean / date，可按列给出）、`toScalar`（存储值 → 参与运算的标量，空为 null）与 `formatScalar`（数值汇总的展示文本），以参与表尾汇总与公式。未声明 `valueType` 的字段只能计数。汇总与公式引擎在 `core/formula`，只经这三个成员读取字段，不认识具体插件。`filters` 也可按列给出，读取统一经 `PluginManager.getFilterDefinitions(column)`。

内置 `formula` 字段：表达式存 `config`（`FormulaColumnConfig`），值只在投影中派生（`{ value, error? }`），不写入行数据；可筛选、排序、搜索、分组。表尾除单列汇总外支持以各列汇总为叶子的组合表达式（`FooterSpec` 的 `expr` 形态）。

`slots` 按实例提供以下能力：

- RowDetailBody：接收 row、readonly、onRowChange 和 isRowPresent，ref 暴露异步 flush；关闭与切换行前等待 flush。卸载补存由宿主正文组件负责。异步创建后必须再次检查所属行，不得用迟到结果重建行。
- GalleryCover：接收行、列和画廊封面配置，提供正文或资源预览。
- Image：提供图片地址解析与加载错误回调；缺省使用浏览器 img。
- coverGradient：按行身份提供封面空态背景；缺省消费主题语义底色。
- formulaAssist：把消息交给模型并返回回答文本，失败时抛错；提供时公式构造器顶部出现「用一句话描述」输入框。提示词、解析与校验在包内，消息只含列结构不含行数据；缺省不提供。

`onRowCleanup` 接收删除前的行快照，宿主决定如何释放资源引用。只在实例 deleteRow 时调用，external 移除不重复清理；删除接口保持同步，异步清理错误单独报告。桌面持久化表的行清理由原子删除读取最新记录完成。字段正文引用由宿主数据层在保存时按差集维护，组件不做资源清理。

桌面统一使用 `features/shared/database/DesktopDatabase` 装配已有能力。业务页面、持久化 hook、卡片偏好与 SQLite 留在宿主。

## 验证

```sh
pnpm --filter @tau/database check
pnpm --filter @tau/database test
pnpm check:database-boundaries
pnpm --filter @example/database build
```

Web 构建同时检查实际模块图，禁止引入桌面、正文编辑器、SQLite 和 shared 运行时桶入口。视觉验收由用户完成。
