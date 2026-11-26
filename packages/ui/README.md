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

提供 Button、IconButton、Panel、Loading、Toast、Tooltip、Select、Menu、Dialog、ConfirmDialog、Popover 与 YearHeatmap。

值输入与展示包括 Input/Textarea/NumberInput、FormField、Checkbox/RadioGroup/Switch、Tabs、Tag/ColorSwatch、InlineEdit、Rating、ProgressBar、CalendarPanel/TimeField/DatePicker/DateRangePicker 与 ImagePreview。Select 支持多选；选项 CRUD 由上层字段编辑器负责。

日期面板提供单日、范围、清空和分钟精度时刻选择，可独立放进其他容器。布局密度和业务浮层返回由宿主选择；包不导入 Page 或移动 router。

`ProgressStatus` 在 `ProgressBar` 上方展示阶段文案与百分比，供两端传输任务共用；`value` 为 0–100，`label` 由宿主提供，组件不负责估算进度。

## 界面语言

Dialog、ConfirmDialog、Select、Input、Tag、YearHeatmap 与日期控件的默认文案跟随所在 `I18nRuntimeProvider`，内置简体、繁体与英文词典。调用方显式传入的按钮文案、占位和空态优先使用；没有翻译 Provider 时保持中文默认值。切换语言不重建控件，不清除输入、选中值或确认状态。

UI 词典位于本包的 `src/locales/{zh-CN,zh-TW,en-US}.json`，`src/i18n.ts` 只负责导入和绑定，不读取业务设置或插件词典。应用和插件只需由宿主提供语言运行时；外部内容和调用方自定义文案由其所有者翻译。

日期控件独立词典位于 `src/primitives/datepicker/locales/`，格式化显式接收 locale，解析值保持 ISO 日期/日期时刻。周一起始、15 分钟网格与提交/取消规则不随语言改变；翻月、范围端点和时刻草稿保持原状态。显式 placeholder 与预设文案仍由调用方决定。

## 验证

`pnpm --filter @tau/ui check`、`pnpm --filter @tau/ui test`。桌面样板间直接使用公共组件，新增“输入与值展示”档案覆盖控件交互。

## ConfigurationPanel

[ConfigurationPanel](src/patterns/ConfigurationPanel.tsx) 承载账号卡、位置字段和选择弹层。调用方提供字符串配置、账号字段、位置字段与异步 `onSave`，组件不依赖插件 SDK 或应用设置。

位置字段失焦保存，保存使用入队时的独立快照；账号字段保留在草稿中，只有明确保存才提交，取消恢复原值。失败保留当前输入并显示错误，排队旧操作的成功不会覆盖最新失败提示。服务是否选用和网络是否连通由宿主编排，不从配置保存成功推断。
