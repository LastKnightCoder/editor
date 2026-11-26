# 查询数据库

用于编写、修改与修复查询数据库的 DSL / JavaScript，以及正文中的 tau-query / tau-queryjs 查询块。普通静态 Markdown 表格、普通代码展示和一般文字润色按原任务处理。

查询面板与实时查询块的编辑、执行入口在电脑提供。手机可使用本技能准备代码；不能把手机中的普通代码块当作已创建并运行的查询块。

## 确定目标与上下文

- 根据用户当前需求区分正文里的查询块与独立数据库。修改查询定义不会修改源卡片、文章、项目文档、待办或日程。
- 用户指“当前文档”“这个查询”时，有 get_current_context 工具就先定位实际 contentId、选区、光标块与前后文；contentId 不等于 cardId/articleId/projectItemId。
- 用 get_content_markdown 读取目标正文和 snapshotId；必要时用 resolve_entity_content_id 定位正文。正文中的 tau-query/tau-queryjs 围栏给出当前语言、代码，以及可选 qdb 元数据。
- 主对话不会自动得到查询面板的实时错误、结果行与当前列结构；只能使用实际取得的信息，不能把“用户没提供错误”说成“执行无错误”。
- 元数据中的真实项目、表、正文和字段 ID 来自当前定义、参数、用户或可用的只读工具；不编造编号。使用 sql_query 探查结构前读取 database-schema 技能。

## 编辑已有正文查询

工具可用时沿用正文的快照与审阅链路：

1. 读取目标查询的完整 Markdown 围栏。多个查询相似时利用前后文与选区消歧，不只猜第一个匹配。
2. 只改用户要求的语言、代码或参数。保持原有列 key、未要求修改的来源范围及展示配置。
3. 用 find_content_ranges 精确定位完整查询块，携带其 snapshotId 和实际返回的 matchId 提交 apply_content_edit_operations；replace 可附 expectedText 防止误替换。当前正文工具对块内源码子串未必能无损定位，遇到 UNSUPPORTED_RANGE 时重读并针对完整查询块处理，不升级为整篇覆盖。
4. 参数与展示配置存在时，围栏后的 qdb= 值是 encodeURIComponent(JSON.stringify({params,presentation}))。只改代码时保留原 qdb 值；确需改参数时解码后仅改 params，保留 presentation 并正确重编码。没有可靠编码方法时给出具体参数改法，不手猜编码，也不清空配置。
5. 沿用工具返回的定位与版本信息，不自造或擦写节点身份。SCOPE_CONFLICT/ANCHOR_CHANGED 时重读目标并基于新内容生成操作；COMMIT_PENDING 按工具说明仅携带原 resumeProposalId 查询或补交。
   同一目标重读后再次冲突时停止改写并报告未完成，不扩大为整篇覆盖，也不覆盖用户正在输入的内容。

6. 根据工具返回区分已提交、待审阅、冲突和失败。遵守既有 Agent × 正文权限；技能不会授予写入或直接应用权限。

新建正文查询时插入专用围栏：

````markdown
```tau-query
TABLE title AS "内容", source AS "来源"
FROM cards
WHERE hasTag("读书")
```
````

JavaScript 使用 tau-queryjs。普通 javascript 围栏只展示代码。不要把实时结果写成静态 Markdown 表格替代查询，也不要把整个正文改造成一个查询块。

## 独立数据库与验证边界

独立查询定义在 data_table_queries，计算结果只存在内存；data_tables.rows 为空不能证明查询结果为空。只读数据表工具也不等于查询执行器。

只有提供了可写查询定义的工具，才按其版本与权限提交；工具缺失时提供可使用的代码和所需参数，明确尚未写入。不得通过 SQL UPDATE、直接文件改库或写 data_tables.rows 绕过只读接口。

正文编辑的 dryRun 仅验证编辑可应用，不代表 DSL/脚本已执行。没有查询执行或结果反馈工具时，不声称已运行成功；按实际返回说明代码或建议已提交，必要时让用户通过面板“刷新”取得运行错误。编写和修复代码时使用下方共用参考。
