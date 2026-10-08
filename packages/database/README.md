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

所有组件、类型、插件管理、store、Context、hooks、DateValue 与 DatePluginConfig 均从根入口导入；不深引 src。`plugins` 命名空间包含九类通用字段及 builtInPlugins。

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
- 存储模型归 shared，经 `@tau/shared/database-types` 仅类型导入；本包不访问 SQLite、Electron 或业务页面。

## 宿主能力

`plugins` 属性追加或覆盖通用字段插件。图片、附件、富文本与卡片业务插件由宿主装配；缺失插件的字段不可编辑并保留原值。

`slots` 按实例提供以下能力：

- RowDetailBody：接收 row、readonly、onRowChange 和 isRowPresent，ref 暴露异步 flush；关闭与切换行前等待 flush。卸载补存由宿主正文组件负责。异步创建后必须再次检查所属行，不得用迟到结果重建行。
- GalleryCover：接收行、列和画廊封面配置，提供正文或资源预览。
- Image：提供图片地址解析与加载错误回调；缺省使用浏览器 img。
- coverGradient：按行身份提供封面空态背景；缺省消费主题语义底色。

`onRowCleanup` 接收删除前的行快照，用于释放宿主资源引用。只在实例 deleteRow 时调用，external 移除不重复清理；删除接口保持同步，异步清理错误单独报告。富文本列清理沿用 CellPlugin.onColumnCleanup，每个持有引用分别释放。

桌面统一使用 `features/shared/database/DesktopDatabase` 装配已有能力。业务页面、持久化 hook、卡片偏好与 SQLite 留在宿主。

## 验证

```sh
pnpm --filter @tau/database check
pnpm --filter @tau/database test
pnpm check:database-boundaries
pnpm --filter @example/database build
```

Web 构建同时检查实际模块图，禁止引入桌面、正文编辑器、SQLite 和 shared 运行时桶入口。视觉验收由用户完成。
