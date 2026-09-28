# @tau/ui

Tau 新设计系统的公共组件实现：基础组件、浮层定位与关闭、通用滚动行为都位于本包。主题（token 契约、主题定义、运行时）在 `@tau/themes`，本包依赖它。

## 使用

React 组件从 `@tau/ui` 导入，`@tau/ui/hooks` 提供滚动与边缘渐隐。没有任意 `src/*` 深层导出。主题相关的一律从 `@tau/themes` 导入，见该包 README。

```css
@import "tailwindcss";
@import "@tau/themes/tokens.css";
@import "@tau/themes/tailwind.css";
@import "@tau/ui/styles.css";
/* 具体相对路径以应用入口为准。 */
@source "../../../packages/ui/src";
```

`initScrollbarAutoHide()` 返回清理函数。包导入不读取存储或启动 DOM 监听。

`UiProvider theme="cocoa"` 提供局部主题和 body 级 Portal 容器。浮层的外点注册按 Document 隔离，关闭后移除监听；嵌套 Dialog 的滚动锁使用引用计数。Popover 的表单内部 Tab 顺序移动，到最后一个控件才退出；Esc 让位输入法组合。

Dialog 内自动提供局部 Portal 容器，挂载点位于当前遮罩内、正文滚动区外。内部 Select、Menu 和字段编辑浮层继承该容器，既不被遮罩盖住，也不受正文滚动区裁切；消费者无需覆盖层级。Database 样板的详情附件编辑覆盖此路径。

## 控件

现有 Button、IconButton、Panel、Loading、Toast、Tooltip、Select、Menu、Dialog、ConfirmDialog、Popover、YearHeatmap 全量迁移。

新增 Input/Textarea/NumberInput、FormField、Checkbox/RadioGroup/Switch、Tabs、Tag/ColorSwatch、InlineEdit、Rating、ProgressBar、CalendarPanel/TimeInput/DatePicker、ImagePreview。Select 支持多选；选项 CRUD 由上层字段编辑器负责。

日期面板支持手输年月日、范围、清空和秒级时间，可独立放进其他容器。布局密度和业务浮层返回由宿主选择；包不导入 Page 或移动 router。

## 验证

`pnpm --filter @tau/ui check`、`pnpm --filter @tau/ui test`。桌面样板间直接使用公共组件，新增“输入与值展示”档案覆盖控件交互。
