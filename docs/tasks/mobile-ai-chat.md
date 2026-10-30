# 移动端 AI 对话（第二期）

状态：进行中
目标：在移动端提供全屏对话页、首页问答条与对话记录，并把桌面端适合的 AI 工具迁移到移动端；AI 可写入笔记，每次写入前由用户确认。

## 需求

- 入口：「今天」页大标题下常驻问答条（点按进入新对话；麦克风按住说话直接发送），下方 3 个建议问题。对话页右上角进入对话记录。
- 对话页：二级页面，隐藏 Dock。用户消息浅色气泡靠右；助手回答全宽、不用气泡。工具调用收成一行小胶囊，可展开。输入框右侧一个位置三种状态：空内容为麦克风、有文字为发送、生成中为停止。副标题显示当前模型，点按临时切换（只影响本会话）。
- 生成中用户上滑阅读时停止自动滚动，出现「回到最新」。
- 写入确认：工具风险 `write` 每次都弹审批（固定 manual 模式），以回答内的确认卡片呈现，选项「允许 / 本会话允许 / 拒绝」；`execute` 同样需确认；`read` 不问。
- 按住说话：复用编辑器听写手势（按住录、上滑取消、松手发送），对话里不经语音整理。
- 对话记录：按今天 / 本周 / 更早分组，左滑删除；后台生成中的会话带脉冲点；切换数据库后列表随之切换。
- 未配置「对话」模型：入口照常显示，点进去是引导页（添加服务商 → 填 Key → 选模型）。
- 异常：401 / 断网 / 切后台暂停分别给出下一步。
- 视觉以 `apps/mobile/mockups/ai-mobile/` 第 2A、3、4、6 页为准（第 4 页左滑行与取消区按修正后的版本）。

本期不做：内容页就近提问与半屏对话、@ 引用笔记、拍照提问（第三期）；工具权限模式设置；MCP 管理界面。

## 工具迁移清单

依据桌面端盘点（渲染端 `ToolRegistry` + 主进程 pi 会话）。移动端执行端优先复用已有、经测试的原生能力，不移植桌面主进程引擎。AI 代表用户操作，执行端用应用自己页面使用的原生命令，不借用插件数据层（它绑定插件身份与 token，不应被宿主冒用）。工具入参沿用桌面同名工具的 schema 子集，同名同义。

| 工具                                                                                                                                                     | 风险       | 移动端执行端                                                                                                                                         | 本期   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `get_current_date`                                                                                                                                       | read       | 纯 JS                                                                                                                                                | ✓      |
| `ask-question`                                                                                                                                           | read       | 运行时 `question` 回调 + `@tau/chat-ui` 问题卡                                                                                                       | ✓      |
| `search_knowledge`                                                                                                                                       | read       | `search_all_content`（FTS5，无向量/重排，描述里说明）                                                                                                | ✓      |
| `get_content_markdown`                                                                                                                                   | read       | `get_content_detail` + `services/editorMarkdown.ts`                                                                                                  | ✓      |
| `sql_query`                                                                                                                                              | read       | 新增只读原生命令（`query_only` 连接、单条 SELECT、行数与超时上限）                                                                                   | ✓      |
| `list_skills` / `get_skill_readme` / `read_skill_file`                                                                                                   | read       | 内置 Skill 内联正文；插件 Skill 走已有 `skills` 注册表                                                                                               | ✓      |
| 待办与日程：`query_todos`、`query_calendar_events`                                                                                                       | read       | 应用自己页面用的 `todo_list_items` / `calendar_event_get_by_date_range` 等命令                                                                       | ✓      |
| 待办与日程：`create_todo`、`update_todo`、`set_todo_completed`、`delete_todo`、`create_calendar_event`、`update_calendar_event`、`delete_calendar_event` | write      | 同上，`todo_create_item` / `todo_update_item` / `todo_toggle_complete_cascade` / `todo_delete_item` / `calendar_event_*`；写后发数据库变更让页面刷新 | ✓      |
| 周期与撤销：`set_todo_recurrence`、`update_todo_occurrence`、`query_task_operations`、`undo_task_operation`                                              | read/write | 桌面引擎的操作回执与撤销移动端没有统一入口                                                                                                           | 后续   |
| 正文待办（卡片里的勾选项）                                                                                                                               | —          | 本期 `query_todos` 只返回独立待办（`source` 恒为 todo），描述里说明                                                                                  | 后续   |
| `find_content_ranges` / `apply_content_edit_operations` / `replace_content_by_text` / `rewrite_content_full`                                             | write      | 先把桌面 `services/content-editing` 纯逻辑抽到共享包，再做移动审阅卡                                                                                 | 后续   |
| `list_data_tables` / `read_data_table`                                                                                                                   | read       | 移动端无数据表命令                                                                                                                                   | 后续   |
| `get_current_context`                                                                                                                                    | read       | 第三期由内容页把当前笔记作为引用带入，不做工具                                                                                                       | 第三期 |
| `get_app_info`                                                                                                                                           | read       | Tauri 版本与平台                                                                                                                                     | ✓      |
| `http_fetch` / `read_image`                                                                                                                              | execute    | 需单独的受控网络通道                                                                                                                                 | 不做   |
| `generate_image` / `edit_image`                                                                                                                          | —          | 移动端无图片模型配置                                                                                                                                 | 不做   |
| `subagent_research`                                                                                                                                      | —          | 嵌套会话，耗电与费用高                                                                                                                               | 不做   |
| pi 文件/shell 工具、`run_skill_script`、stdio MCP、PDF/视频/学习项目工具、浏览器伴读页工具                                                               | —          | 依赖 Node、子进程或桌面专有索引                                                                                                                      | 不迁移 |

工具 id 与桌面同名，描述沿用桌面原文（有降级的在描述里写清楚），历史会话在两端都能按同名渲染。

## 方案

现状事实已写入 [移动端架构 · AI 对话](/docs/architecture/mobile.md#ai-对话)，此处只记任务内的取舍：

- 执行端不移植桌面 task-assistant 引擎，改用移动端页面已有的原生命令；代价是周期、撤销与正文待办暂缺，工具描述里写明，模型遇到时引导用户到电脑端。
- 内置 Skill 正文从桌面 `constants/internal-skills/` 移到 `@tau/ai/skills/internal`，两端共用；`database-schema.md` 对账测试与路径约定（AGENTS.md、db-change-manual）同步改到新位置。
- `ask-question` 的入参 schema 与描述移到 `@tau/shared/chat-core`，桌面 pi 会话与移动运行时共用。
- 宿主工具行的可读叫法通过给 `@tau/chat-ui` 的 `ToolCallRow` / `ToolCallBlock` 加可选 title 实现，桌面与浏览器扩展不传即保持原样。

## 决策

- 2026-10-30 用户确认：继续第二期；AI 可写入笔记，每次写入前确认，写入确认因此从第三期提前到本期；桌面端工具中适合的都迁移到移动端。

## 进度

- [x] 桌面工具盘点与迁移清单
- [x] 会话服务装配（审批 / 提问宿主、系统提示词、工具注册）
- [x] 只读工具（含原生只读 SQL）
- [x] 待办与日程读写工具
- [x] 对话页、对话记录、首页问答条
- [x] 测试、架构文档同步
- [ ] 真机验收：真实模型调用、写入确认、按住说话发送、视觉走查（用户）
- [ ] 后续：周期 / 撤销 / 正文待办、内容改写工具与审阅卡、数据表工具

## 验证

- Rust：`pnpm --filter mobile run check:rust` 通过，324 项（新增 `sql_query` 9 项：写入/注释/多语句拒绝、受限 pragma、字面量不误判、截断、参数绑定、blob 与大整数、超时与 query_only 恢复）。
- 移动 vitest：对话与设置、语音、服务相关 142 项通过，其中新增 `taskTools` 7 项、`hostTools` 5 项（同名工具注册、manual 下写入先审批且拒绝不执行、ask-question 交给运行时、内置技能可解析）、`chat.page` 5 项（未配置引导、首发建会话与流式收尾、写入审批经宿主作答、401 提示、对话记录分组）。全量另有 6 项失败为改动前既有（插件中心安装、正文计数），与本任务无关。
- 移动 `tsc --noEmit`、`vite build` 通过；对话页与工具在独立 chunk，首屏包不含。桌面 `tsc --noEmit` 通过，内置技能与 ask-question 相关测试通过；`@tau/chat-ui` 20 项、`@tau/ai` 83 项与 `check:browser` 通过。
- 未做：真实模型与真机运行、视觉走查。
