# desktop 增量合并记录

日期：2026-10-01。

- 目标分支：codex/editor-p9。合并前先将已验收的补清理保存为 `2f12126fc`，保留 `ced892518` 中的本地 Y.Doc 和整体设值接口退役。
- 来源：本地 refactor/desktop-refactor，`564dd28cb6c8cd716890fe8884c45ca9e76c43f7`。已 fetch 对应远端，本地领先远端 55 个提交；目标分支尚未包含其中 17 个提交。
- 来源包含：源码预览卡片展开与全屏工作台、渲染错误保留旧结果、Mermaid 主题 token、聊天工作目录与分支切换、项目整体导出、列表排布与最近打开、卡片预览删除收起、PageHost 布局处理。

## 冲突处理

Git 报出 21 个冲突文件，其中 4 个为重命名目录内的新文件位置冲突，另有代码及文档内容冲突。

- 保留 editor-extensions 和 editor-source-view 的拆包结构，把旧核心／shared 路径上的新功能迁入实际归属包，不恢复旧扩展目录和领域渲染器出口。
- 预览工作台、错误上下文、样式与辅助组件归 source-view；保留已有源码回写、块导航、宿主返回仲裁测试，同时把新工作台集成测试放到 desktop。
- Mermaid token 适配与测试归 diagram；Katex／图表错误测试随各自渲染器归属迁移。shared 的 useDocumentTheme 是通用 DOM 主题订阅，继续留在 shared。
- 共用 FloatingToolbar、缩放锚点几何由核心公开 API 提供，扩展不深引核心文件。CodeMirror 模式与 CSS 继续由 source-view 管理。
- 保留新 UI 和旧宿主仲裁：全屏支持 Esc、滚轮缩放与拖动，也响应 OverlayBackDismiss；Portal 使用当前 UI 容器。
- 两边执行记录均保留。来源 ER-021 与现有服务契约编号冲突，新预览决策重编号 ER-054；已退役的 setEditorValue、桌面 useEditContent 不恢复。
- 主题基线检查发现核心 useTheme 兼容出口已无消费者（现有调用均为正式 useEditorTheme 的本地别名），删除该出口和包装实现；不放宽旧用法基线。

## 验证

schema 增加最近打开字段，没有新增表或索引；已执行 db:schema:build 与 db:schema:check，数量仍为 63 张主表、103 个主索引，内部数据库字段文档对账通过。

回归覆盖核心、协作、预览编辑、媒体、数学与图表扩展，以及新增的工作目录、最近打开、批量导出、页面布局、主题配色和聊天状态。类型、行为、结构和生产构建由 Agent 检查，视觉与实机交互由用户验收。

验证结果：

- 核心 332 项、协作 26 项、source-view 3 项、diagram 31 项、math 5 项、media 120 项，以及 desktop 相关 127 项，共 644 项测试通过（含拆包后懒加载时序的定向复验）。
- desktop、mobile TypeScript 检查及两端 Vite 生产构建通过；desktop 包含主进程与 preload。
- 扩展边界与 bundle、重构基线、antd 禁用、schema 构建／对账、数据库字段文档测试通过；变更文件 ESLint 0 错误，存量警告保留。
- Git 未合并文件清零，旧整体设值接口、桌面旧正文 Hook 和 shared 领域渲染器入口未恢复；未进行视觉验收或安装包发布。
