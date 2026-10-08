# @tau/whiteboard

私有源码工作区包，包含通用画布、交互、基础文字、脑图、演示和导出。桌面通过 DesktopWhiteboard 注入业务能力；存储格式不变。

## 接入

从根入口导入 WhiteBoard、WhiteBoardRef、WhiteboardSnapshot、插件及工具；CSS 使用 `@tau/whiteboard/styles.css`，禁止私有深引。宿主提供 UiProvider、DndProvider 和主题运行时，Tailwind 扫描白板、UI、编辑器及格式/链接扩展源码。React、Slate 与 DnD 使用同一份运行时，完整配置参考 `examples/whiteboard`。

初始化参数只作为初始值；更换文档身份时由宿主更换 key，编辑经 onChange 回传。Ref 提供视口适应、缩放、元素读取和定位。

## 宿主边界

- services：正文创建与引用、上传/下载、文字 Kit、Markdown 导入和导出捕获。
- slots：正文编辑、低缩放快照订阅、业务元素、工具按钮和弹窗层；编辑、预览和测量必须共用 Kit 与正文绑定。
- outline：受控开关与宽度；实际占宽回调归所属页面，避免实例串扰。
- Board.captureSubmission：异步操作开始时捕获，提交前验证；只读切换、隐藏、卸载和目标删除使旧操作失效。

默认基础文字依赖 @tau/editor；URL 媒体可插入。业务能力缺失时隐藏创建入口，已有业务元素保留数据并显示占位。通用容器仅消费 @tau/ui。

本地上传入口要求上传服务与选择器同时就绪，选择器当前由 slots.Layers 承载；只注入上传服务仍可处理文件拖入，但不会展示无法完成的本地上传菜单。隐藏时结束临时交互并清理 pointerId 归属，恢复后保持原数据和撤销历史。

## 验证

运行 `pnpm --filter @tau/whiteboard check`、`test`、`bench:hit`、`bench:render`；边界检查为 `pnpm check:whiteboard-boundaries`。独立示例使用 `pnpm --filter @example/whiteboard build`。视觉验收由用户完成。
