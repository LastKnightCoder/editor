# Table 组件说明（@Table/）

本目录实现一个类似 Notion 高级表格的可扩展组件，具备列拖拽/缩放、单元格编辑、键盘导航、可插拔的单元格类型（文本、数字、日期、单选、多选）等能力。本文档总结目录结构、代码架构、数据与状态流转、插件规范、样式与工程规范，便于后续迭代与扩展。

---

## 目录结构

```text
@Table/
  - components/
    - Cell/
      - index.tsx                  // 单元格渲染与编辑入口（承接插件 Editor/Renderer）
    - ColumnEditModal/
      - index.module.less
      - index.tsx                  // 列配置弹窗（新增/编辑列，宽度、类型、选项等）
    - ColumnHeader/
      - index.tsx                  // 列头，支持拖拽排序、双击编辑、拉条缩放
    - Row/
      - index.tsx                  // 行容器，支持行拖拽排序
    - SelectEditor/
      - index.module.less
      - index.tsx                  // 单/多选的统一编辑器（供 Select/MultiSelect 插件复用）
    - Table/
      - index.module.less
      - index.tsx                  // 根容器：上下文提供者、插件注册、订阅 onChange、列缩放/键盘导航
    - TableContent/
      - index.tsx                  // 头部 + 行列表渲染，组织交互回调
  - constants/
    - index.ts                     // 常量导出（re-export）
    - select.ts                    // 选择类颜色常量（SELECT_COLORS、配置）
  - hooks/
    - index.ts                     // hooks 汇总导出
    - useCellEditor.ts             // 单元格草稿值/保存/取消
    - useColumnResize.ts           // 列宽拖拽缩放
    - useColumnVisibility.ts       // 列显示/隐藏管理
    - useKeyboardNavigation.ts     // 表级键盘导航（↑↓←→、Enter）
    - useTableStore.ts             // TableContext + zustand 选择器封装
    - useValidation.ts             // 校验（必填、min/max、pattern、自定义）
  - plugins/
    - index.ts                     // 内置插件集合导出（builtInPlugins）
    - TextPlugin/
      - components/Editor/
        - index.module.less
        - index.tsx
      - components/Renderer/
        - index.module.less
        - index.tsx
      - index.tsx
    - NumberPlugin/
      - components/Editor/
        - index.module.less
        - index.tsx
      - components/Renderer/
        - index.module.less
        - index.tsx
      - utils/numberUtils.ts
      - index.tsx
    - DatePlugin/
      - components/Editor/
        - index.module.less
        - index.tsx
      - components/Renderer/
        - index.module.less
        - index.tsx
      - utils/dateUtils.ts
      - index.tsx
    - SelectPlugin/
      - components/Renderer/
        - index.module.less
        - index.tsx
      - index.tsx
    - MultiSelectPlugin/
      - components/Renderer/
        - index.module.less
        - index.tsx
      - index.tsx
  - PluginManager.ts               // 插件注册、装载/卸载、数据转换
  - TableContext.tsx               // Table zustand store 上下文定义
  - TableStore.ts                  // 表格核心状态与动作（zustand + immer）
  - types.ts                       // 类型声明（列/行/插件/校验/交互）
  - index.ts                       // 包装导出（默认 Table、插件、hooks、类型等）
```

---

## 核心类型与数据模型（`types.ts`）

- 列与行
  - `ColumnDef<T = any>`: `id`、`title`、`type`、`width`、`config`、`validation`、`hidden`、`icon`。
  - `RowData`: `{ id: string; [columnId: string]: CellValue }`。
  - `CellValue`: `string | number | Date | string[] | any`。
  - `TableData`: `{ columns: ColumnDef[]; rows: RowData[] }`。
- 插件接口 `CellPlugin`
  - `type` 必填；`Icon?`；`Renderer`；`Editor?`；生命周期：`onMount? / onUnmount?`；数据钩子：`beforeSave? / afterLoad?`。
- 校验 `ValidationRule`
  - `required`、`min/max`、`pattern`、`custom(value) => string | null`。

---

## 状态管理与数据流（`TableStore.ts` + `TableContext.tsx`）

- 技术栈：`zustand` + `immer`。
- 状态切片（简要）：
  - `columns`、`rows`、`columnOrder`、`columnWidths`。
  - 选中/编辑：`selectedCell`、`editingCell`。
  - 历史记录：`history`、`historyIndex`（支持 `undo/redo`，最多保留 50 条）。
- 动作：
  - 单元格/列/行：`updateCellValue`、`resizeColumn`、`moveColumn`、`moveRow`。
  - 选择与编辑：`selectCell`、`startEditing`、`stopEditing`、`clearCellSelection`、`moveCellSelection`（方向键）。
  - 列增删改：`addColumn`、`deleteColumn`、`editColumn`。
  - 行增删：`addRow`、`deleteRow`。
  - 外部数据同步：`syncExternalData(columns, rows)`。
  - 历史：`commitHistory`、`undo`、`redo`。
- 上下文：`TableContext` 提供 `TableStoreType`，通过 `useTableStore(selector)` 选择订阅，避免直接暴露 store 实例；`useMemoizedFn` 保证选择器稳定性。

数据更新约定：破坏性更新前都会 `commitHistory()`，方便撤销/重做；列宽、行序、列序、单元格值更改后均进入历史队列。

---

## 插件体系（`PluginManager.ts` + `plugins/*`）

- `PluginManager`
  - 注册：`registerPlugin / registerPlugins`；查询：`getPlugin / hasPlugin / getAllPlugins`。
  - 装载/卸载：`loadPlugin / unloadPlugin / loadAllPlugins / unloadAllPlugins`，会调用插件的 `onMount/onUnmount`。
  - 数据转换：`transformBeforeSave(type, value)`、`transformAfterLoad(type, value)`。
- 内置插件（`plugins/index.ts` → `builtInPlugins`）：
  - `text`（`MdTextFields`）：字符串编辑/渲染。
  - `number`（`TbNumber`）：格式化显示（精度、千分位、前后缀）、解析保存。
  - `date`（`MdCalendarToday`）：`antd DatePicker` 编辑，`dayjs` 格式化。
  - `select`（`MdArrowDropDownCircle`）：使用通用 `SelectEditor` 编辑；渲染支持色板。
  - `multiSelect`（`MdChecklist`）：同上，值为字符串数组，渲染多个标签。
- 通用选择编辑器（`components/SelectEditor`）
  - 维护 options 与选中项；支持搜索、新增选项（自动赋色，持久化到列 `config.options`）。
  - 统一用于 `select` 与 `multiSelect` 插件的 `Editor`。

扩展新插件：实现 `CellPlugin` 接口的 `Renderer`（必需）和 `Editor`（可选），并在 `Table` 挂载时通过 `plugins` 属性或内置注册。

---

## 组件架构与交互流程

- 根组件 `components/Table/index.tsx`
  - 创建 `PluginManager`，注册内置与自定义插件，挂载/卸载。
  - 创建 `createTableStore(columns, data)`，通过 `TableContext.Provider` 下发。
  - 订阅 store 变化并回调 `onChange(TableData)`（列与行）。
  - 绑定列缩放（`useColumnResize`）与键盘导航（`useKeyboardNavigation`）。
- 内容容器 `components/TableContent/index.tsx`
  - 头部：渲染 `ColumnHeader`（拖拽排序、双击编辑、列宽调整、插件图标）。
  - 行区：渲染 `Row` 列表（行拖拽排序、单元格编辑/选择）。
  - 操作：底部 `+ 添加行`，以及 `ColumnEditModal`（新增/编辑列）。
- 行 `components/Row/index.tsx`
  - 集成 `react-dnd` 实现行拖拽；提供行号与拖柄样式。
  - 逐列渲染 `Cell` 并分发当前选择/编辑状态。
- 列头 `components/ColumnHeader/index.tsx`
  - 集成 `react-dnd` 实现列拖拽；右侧拉条触发 `onResizeStart`；双击进入列编辑。
  - 插件图标优先从插件 `Icon` 获取。
- 单元格 `components/Cell/index.tsx`
  - 组合 `useCellEditor` 与 `useValidation` 管理草稿值与校验。
  - 根据 `isEditing` 切换：若插件有 `Editor` 则使用，否则回退通用 `EditText`。
  - 非编辑态使用插件 `Renderer` 或回退只读文本。
  - 单击选择；再次点击进入编辑；双击强制进入编辑；失焦提交或撤销（有错即撤销）。

键盘导航：在 Table 根节点阻止默认滚动，支持 `↑↓←→` 移动选区、`Enter` 切入编辑（若已选未编辑）。

---

## 样式与 UI 规范

- 技术栈：Tailwind CSS + 少量 Less（模块化）。
- 根容器 `Table/index.module.less`：
  - `.databaseTable` 高度/宽度撑满；`.resizing` 状态下光标与选区处理。
  - `.tableCell` 历史样式保留（实际 Cell 内已多为 Tailwind 样式）。
- 弹窗 `ColumnEditModal/index.module.less`：自定义模态风格。
- 选择编辑器 `SelectEditor/index.module.less`：下拉、搜索框、标签与空态样式。
- 选择颜色 `constants/select.ts`：`SELECT_COLORS_CONFIG`（light/dark 背景、前景），`SELECT_COLORS`（颜色键列表）。

注意：项目整体 UI 规范遵循 workspace 规则，图标使用 `react-icons`，非必须不使用 `:global`（日期编辑器中对 `antd` 做了必要的局部全局覆盖）。

---

## 工程与代码规范

- 包管理器与依赖：遵循 workspace 规范（Electron 项目优先 `pnpm -D` 安装开发依赖）。
- 状态与不可变：使用 `zustand` 管理状态，`immer` 确保不可变更新。
- 类型：集中在 `types.ts`，避免 `any`（插件 `config` 属于按需泛型/宽松结构）。
- 目录约定：
  - 与 Electron 交互在 `src/commands`，表格组件仅前端无 Electron 绑定。
  - 长文件倾向拆分（已拆分组件与 hooks）。
- 组件导出：遵循“不要 `export default memo(Component)`，而是 `const Component = memo(...)` 再默认导出组件变量”的实践，便于 react-refresh（当前文件基本符合）。
- 样式：
  - 能用 Tailwind 即用；必要场景使用 Less module；避免不必要的 `:global`。
  - 用户偏好 CSS 使用 `em`（1em=16px）可在新增 Less 中优先考虑该单位（现有少量 px 来自历史/第三方组件）。
- 类名：统一使用 `classnames`/`classNames` 处理多类名。

---

## 扩展点与最佳实践

- 新增列类型（新插件）

  1. 在 `plugins/YourPlugin/` 实现 `Renderer`（必需）与 `Editor`（可选）。
  2. 在 `plugins/index.ts` 添加到 `builtInPlugins`，或通过 `Table` 的 `plugins` 属性从外部注册。
  3. 如需数据前后处理，实现 `beforeSave/afterLoad` 并在 `PluginManager` 生命周期中生效。

- 自定义列配置

  - 通过 `column.config` 传递插件参数（如 `number.precision`、`select.options`）。
  - 在编辑器内可调用 `onColumnChange(updatedColumn)` 回写列配置（`SelectEditor` 示例）。

- 校验

  - 为列定义 `validation`，`Cell` 在失焦时会自动校验：有错撤销、无错保存。
  - 复杂校验可用 `custom(value) => string | null`。

- 性能优化

  - 子组件普遍 `memo`；渲染器/编辑器也 memo；`useMemoizedFn` 稳定回调。
  - Store selector 精准订阅，避免全量重渲染。

- 历史记录与撤销/重做

  - 需要进入历史的动作内部已调用 `commitHistory()`；批量修改时可在外层协调以减少历史快照数量。

- 外部受控/同步
  - 外部传入 `columns`、`data` 后可用 `createTableStore` 初始化。
  - 如需响应外部数据变化，调用 `syncExternalData(columns, rows)`；内部会重建 `columnOrder/columnWidths` 映射并替换 `rows`。

---

## 使用方式（最小示例）

```tsx
import Table, { ColumnDef, RowData } from "@/components/Table";

const columns: ColumnDef[] = [
  { id: "title", title: "标题", type: "text", width: 240 },
  { id: "due", title: "截止", type: "date", width: 160 },
  { id: "status", title: "状态", type: "select", config: { options: [] } },
  { id: "tags", title: "标签", type: "multiSelect", config: { options: [] } },
  { id: "score", title: "分数", type: "number", config: { precision: 2 } },
];

const rows: RowData[] = [
  {
    id: "r1",
    title: "任务 A",
    due: new Date(),
    status: null,
    tags: [],
    score: 90,
  },
];

<Table
  columns={columns}
  data={rows}
  onChange={(data) => {
    console.log("table changed", data);
  }}
/>;
```

---

## 未来改进建议

- 选择编辑器：支撑选项重命名/排序、颜色选择器、批量管理弹窗。
- 粘贴板：支持跨单元格粘贴（含多行列）、跨表复制粘贴。
- 选择区：矩形多选、Shift 选择范围编辑、批量填充。
- 排序/筛选：列级排序与过滤（前端/后端）。
- 虚拟滚动：大数据量性能优化。
- 快照存储：与 SQLite/后端持久化结合，使用 `beforeSave/afterLoad` 做序列化适配。
