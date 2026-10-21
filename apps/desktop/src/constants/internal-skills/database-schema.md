# database-schema：主数据库只读查询指南

使用 `sql_query` 前先阅读本 Skill。

## 规则

- 只查询当前主库；`sql_query` 只允许单条 SELECT/WITH/EXPLAIN 或受限结构 PRAGMA。
- 优先显式列名、必要 JOIN、WHERE 和 LIMIT；默认最多返回 200 行。
- `contents` 保存富文本编辑器结构，正文 Markdown、编辑快照和语义检索继续调用专用工具，不要把整列内容直接返回。
- 读取数据表内容优先使用 `list_data_tables` 与 `read_data_table`（单元格已按字段模型转纯文本、公式列现算）；`sql_query` 查询 `data_tables` 只用于统计聚合，`columns`/`rows` 是 JSON 列，不要整列返回。

## 常用查询

```sql
SELECT id, title, content_id, update_time FROM cards ORDER BY update_time DESC LIMIT 20;
SELECT id, title, content_id, create_time FROM articles WHERE create_time >= :start_time LIMIT 200;
SELECT i.id, i.title, i.is_completed, g.title AS group_title FROM todo_item i LEFT JOIN todo_group g ON g.id=i.group_id WHERE i.is_archived=0 LIMIT 200;
SELECT e.id, e.title, e.start_date, c.title AS calendar_title FROM calendar_event e LEFT JOIN calendar c ON c.id=e.calendar_id WHERE e.start_date >= :start_date LIMIT 200;
```

## 表和字段

### `task_assistant_operation`

助理业务操作的执行回执与撤销材料；不要将快照列整列返回模型。

| 字段               | SQLite 定义            |
| ------------------ | ---------------------- |
| `id`               | `TEXT PRIMARY KEY`     |
| `batch_id`         | `TEXT NOT NULL`        |
| `request_id`       | `TEXT NOT NULL UNIQUE` |
| `tool_name`        | `TEXT NOT NULL`        |
| `request_hash`     | `TEXT NOT NULL`        |
| `request_json`     | `TEXT`                 |
| `conversation_key` | `TEXT`                 |
| `status`           | `TEXT NOT NULL`        |
| `phase`            | `TEXT NOT NULL`        |
| `before_json`      | `TEXT`                 |
| `after_json`       | `TEXT`                 |
| `result_json`      | `TEXT`                 |
| `error_json`       | `TEXT`                 |
| `create_time`      | `INTEGER NOT NULL`     |
| `update_time`      | `INTEGER NOT NULL`     |
| `undo_until`       | `INTEGER NOT NULL`     |

### `plugin_operations`

插件对业务数据的可恢复操作（当前为删除）。`action` 为 `delete`；`entity` 为 `card` / `article` / `todo` / `event`；`payload` 为恢复所需的 JSON（卡片、文章是删除前的行快照，待办与日程是助理操作 ID），不要整列返回；`restored_time` 非空表示已恢复。写入新记录时清除超过 7 天的记录。

| 字段            | SQLite 定义                |
| --------------- | -------------------------- |
| `id`            | `INTEGER PRIMARY KEY`      |
| `plugin_id`     | `TEXT NOT NULL`            |
| `action`        | `TEXT NOT NULL`            |
| `entity`        | `TEXT NOT NULL`            |
| `entity_id`     | `TEXT NOT NULL`            |
| `title`         | `TEXT NOT NULL DEFAULT ''` |
| `payload`       | `TEXT NOT NULL`            |
| `create_time`   | `INTEGER NOT NULL`         |
| `restored_time` | `INTEGER`                  |

### `plugin_entities`

插件自建的内容（如周记），每项持有一份 `contents` 正文。`(plugin_id, kind, key)` 唯一，`kind` 与 `key` 由插件定义；`meta` 为插件附带的 JSON；`orphaned_time` 非空表示插件已不在本机，超过 7 天后删除。

| 字段            | SQLite 定义                  |
| --------------- | ---------------------------- |
| `id`            | `INTEGER PRIMARY KEY`        |
| `plugin_id`     | `TEXT NOT NULL`              |
| `kind`          | `TEXT NOT NULL`              |
| `key`           | `TEXT NOT NULL`              |
| `title`         | `TEXT NOT NULL DEFAULT ''`   |
| `content_id`    | `INTEGER NOT NULL`           |
| `meta`          | `TEXT NOT NULL DEFAULT '{}'` |
| `create_time`   | `INTEGER NOT NULL`           |
| `update_time`   | `INTEGER NOT NULL`           |
| `orphaned_time` | `INTEGER`                    |

### `plugin_entity_kinds`

插件为自建内容声明的类型外观，用于在搜索、引用等处显示。`label` 为类型名（如「周记」），`icon` 为图标 SVG 文本（空串表示未声明）。

| 字段          | SQLite 定义                |
| ------------- | -------------------------- |
| `plugin_id`   | `TEXT NOT NULL`            |
| `kind`        | `TEXT NOT NULL`            |
| `label`       | `TEXT NOT NULL`            |
| `icon`        | `TEXT NOT NULL DEFAULT ''` |
| `update_time` | `INTEGER NOT NULL`         |

### `plugin_kv`

插件的私有设置与数据（插件里的 `context.storage`），`value` 为 JSON 文本，内容由插件定义。

| 字段          | SQLite 定义        |
| ------------- | ------------------ |
| `plugin_id`   | `TEXT NOT NULL`    |
| `key`         | `TEXT NOT NULL`    |
| `value`       | `TEXT NOT NULL`    |
| `update_time` | `INTEGER NOT NULL` |

### `plugin_ref_grants`

用户在插件的选择窗口里亲手选过的内容，插件之后读取这些内容的标题不需要读取权限。`kind` 为插件引用类型（如 `card`、`material`），`ref_id` 为插件看到的引用 ID；`target_created_at` 为选择时目标的创建时间。

| 字段                | SQLite 定义        |
| ------------------- | ------------------ |
| `plugin_id`         | `TEXT NOT NULL`    |
| `kind`              | `TEXT NOT NULL`    |
| `ref_id`            | `TEXT NOT NULL`    |
| `target_created_at` | `INTEGER NOT NULL` |
| `create_time`       | `INTEGER NOT NULL` |

### `task_assistant_content_pin`

| 字段                 | SQLite 定义        |
| -------------------- | ------------------ |
| `operation_id`       | `TEXT NOT NULL`    |
| `content_id`         | `INTEGER NOT NULL` |
| `content_created_at` | `INTEGER NOT NULL` |

### `doc_task_calendar_link`

| 字段                 | SQLite 定义           |
| -------------------- | --------------------- |
| `calendar_event_id`  | `INTEGER PRIMARY KEY` |
| `content_id`         | `INTEGER NOT NULL`    |
| `content_created_at` | `INTEGER NOT NULL`    |
| `task_id`            | `TEXT NOT NULL`       |
| `series_id`          | `TEXT`                |
| `occurrence_date`    | `TEXT`                |
| `create_time`        | `INTEGER NOT NULL`    |

### `todo_recurrence_history`

| 字段              | SQLite 定义        |
| ----------------- | ------------------ |
| `series_id`       | `TEXT PRIMARY KEY` |
| `todo_item_id`    | `INTEGER NOT NULL` |
| `todo_created_at` | `INTEGER NOT NULL` |
| `effective_date`  | `TEXT NOT NULL`    |
| `rule_json`       | `TEXT`             |
| `create_time`     | `INTEGER NOT NULL` |

### `todo_occurrence_override`

| 字段              | SQLite 定义        |
| ----------------- | ------------------ |
| `todo_item_id`    | `INTEGER NOT NULL` |
| `todo_created_at` | `INTEGER NOT NULL` |
| `series_id`       | `TEXT NOT NULL`    |
| `occurrence_date` | `TEXT NOT NULL`    |
| `state_json`      | `TEXT NOT NULL`    |
| `update_time`     | `INTEGER NOT NULL` |

### `todo_schedule_occurrence`

| 字段                | SQLite 定义           |
| ------------------- | --------------------- |
| `calendar_event_id` | `INTEGER PRIMARY KEY` |
| `series_id`         | `TEXT NOT NULL`       |
| `occurrence_date`   | `TEXT NOT NULL`       |

### `podcasts`

| 字段           | SQLite 定义           |
| -------------- | --------------------- |
| `id`           | `INTEGER PRIMARY KEY` |
| `create_time`  | `INTEGER NOT NULL`    |
| `update_time`  | `INTEGER NOT NULL`    |
| `audio_url`    | `TEXT NOT NULL`       |
| `script`       | `TEXT`                |
| `duration`     | `INTEGER`             |
| `speakers`     | `TEXT NOT NULL`       |
| `ref_count`    | `INTEGER DEFAULT 0`   |
| `name`         | `TEXT`                |
| `script_lines` | `TEXT`                |

### `contents`

| 字段          | SQLite 定义           |
| ------------- | --------------------- |
| `id`          | `INTEGER PRIMARY KEY` |
| `create_time` | `INTEGER NOT NULL`    |
| `update_time` | `INTEGER NOT NULL`    |
| `content`     | `TEXT`                |
| `count`       | `INTEGER DEFAULT 0`   |
| `ref_count`   | `INTEGER DEFAULT 0`   |

### `content_ai_meta`

正文的 AI 元信息（卡片 / 文章 / 项目文档），主键即 `contents.id`。`meta` 为 JSON：`title`（卡片标题）、`summary`（一句话要点）、`concepts`、`claims`；`text_digest` 为生成时正文的 MinHash 指纹；`model` 为 `providerId/modelId`。

| 字段          | SQLite 定义           |
| ------------- | --------------------- |
| `content_id`  | `INTEGER PRIMARY KEY` |
| `schema_ver`  | `INTEGER NOT NULL`    |
| `text_digest` | `TEXT NOT NULL`       |
| `meta`        | `TEXT NOT NULL`       |
| `model`       | `TEXT NOT NULL`       |
| `create_time` | `INTEGER NOT NULL`    |
| `update_time` | `INTEGER NOT NULL`    |

### `content_ai_insights`

正文的 AI 洞见（用户在详情页点「AI 洞见」时生成），主键即 `contents.id`。`result` 为 JSON：`lead`（位置概述）、`marks`（可连接 / 重复 / 矛盾 / 可以展开，带原文片段、对方与处理状态）、`asks`；`text_digest` 为分析时的正文指纹。

| 字段          | SQLite 定义           |
| ------------- | --------------------- |
| `content_id`  | `INTEGER PRIMARY KEY` |
| `schema_ver`  | `INTEGER NOT NULL`    |
| `text_digest` | `TEXT NOT NULL`       |
| `result`      | `TEXT NOT NULL`       |
| `model`       | `TEXT NOT NULL`       |
| `create_time` | `INTEGER NOT NULL`    |
| `update_time` | `INTEGER NOT NULL`    |

### `content_pending_releases`

引用计数归零但暂缓删除的正文登记（`contents.id`）。开库时回收超过宽限期且引用仍为 0 的正文，撤销重新引用时删除登记。

| 字段          | SQLite 定义           |
| ------------- | --------------------- |
| `content_id`  | `INTEGER PRIMARY KEY` |
| `released_at` | `INTEGER NOT NULL`    |

### `compose_boards`

创作模式的素材板：一份正文（`contents.id`）对应一页白板画布（`white_board_contents.id`，不建 `white_boards` 行，不出现在白板列表）。`intent` 为写作意图；`dismissed` 为 JSON 字符串数组，记用户移走的 AI 召集资料（实体 key，如 `card:12`），再找时排除。

| 字段          | SQLite 定义                  |
| ------------- | ---------------------------- |
| `content_id`  | `INTEGER PRIMARY KEY`        |
| `page_id`     | `INTEGER NOT NULL`           |
| `intent`      | `TEXT NOT NULL DEFAULT ''`   |
| `dismissed`   | `TEXT NOT NULL DEFAULT '[]'` |
| `create_time` | `INTEGER NOT NULL`           |
| `update_time` | `INTEGER NOT NULL`           |

### `knowledge_ai_insights`

主题与全局层的 AI 洞见（后台按知识地图主题分层生成）与项目回顾。`scope` 取 `subtopic` / `topic` / `global` / `project`；`members` 为 JSON 成员快照 `[[contentId, 元信息指纹]]`（主题身份对应与变化量都靠它）；`overview` 为给上一层读的概述 JSON；`result` 为 JSON：`lead`、`marks`（呼应 / 问了没写 / 重复 / 矛盾 / 缺一环 / 同一思路 / 还缺 / 可能属于这里 / 还薄，带处理状态）、`asks`；`increments` 为连续增量改写的次数。

| 字段          | SQLite 定义                         |
| ------------- | ----------------------------------- |
| `id`          | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `scope`       | `TEXT NOT NULL`                     |
| `parent_id`   | `INTEGER`                           |
| `project_id`  | `INTEGER`                           |
| `label`       | `TEXT NOT NULL`                     |
| `members`     | `TEXT NOT NULL`                     |
| `overview`    | `TEXT NOT NULL`                     |
| `result`      | `TEXT NOT NULL`                     |
| `increments`  | `INTEGER NOT NULL DEFAULT 0`        |
| `model`       | `TEXT NOT NULL`                     |
| `create_time` | `INTEGER NOT NULL`                  |
| `update_time` | `INTEGER NOT NULL`                  |

### `white_board_contents`

| 字段          | SQLite 定义                    |
| ------------- | ------------------------------ |
| `id`          | `INTEGER PRIMARY KEY NOT NULL` |
| `create_time` | `INTEGER NOT NULL`             |
| `update_time` | `INTEGER NOT NULL`             |
| `name`        | `TEXT`                         |
| `data`        | `TEXT`                         |
| `ref_count`   | `INTEGER DEFAULT 0`            |
| `img_url`     | `TEXT DEFAULT ''`              |

### `white_boards`

| 字段                            | SQLite 定义                    |
| ------------------------------- | ------------------------------ |
| `id`                            | `INTEGER PRIMARY KEY NOT NULL` |
| `create_time`                   | `INTEGER NOT NULL`             |
| `update_time`                   | `INTEGER NOT NULL`             |
| `tags`                          | `TEXT`                         |
| `title`                         | `TEXT`                         |
| `description`                   | `TEXT`                         |
| `snapshot`                      | `TEXT`                         |
| `white_board_content_ids`       | `TEXT DEFAULT '[]'`            |
| `active_white_board_content_id` | `INTEGER DEFAULT NULL`         |

### `cards`

| 字段          | SQLite 定义            |
| ------------- | ---------------------- |
| `id`          | `INTEGER PRIMARY KEY`  |
| `create_time` | `INTEGER NOT NULL`     |
| `update_time` | `INTEGER NOT NULL`     |
| `tags`        | `TEXT`                 |
| `links`       | `TEXT`                 |
| `content_id`  | `INTEGER`              |
| `is_top`      | `INTEGER DEFAULT 0`    |
| `podcast_id`  | `INTEGER DEFAULT NULL` |

### `articles`

| 字段              | SQLite 定义             |
| ----------------- | ----------------------- |
| `id`              | `INTEGER PRIMARY KEY`   |
| `title`           | `TEXT NOT NULL`         |
| `author`          | `TEXT`                  |
| `create_time`     | `INTEGER NOT NULL`      |
| `update_time`     | `INTEGER NOT NULL`      |
| `tags`            | `TEXT`                  |
| `links`           | `TEXT`                  |
| `banner_bg`       | `TEXT DEFAULT ''`       |
| `is_top`          | `INTEGER DEFAULT 0`     |
| `is_delete`       | `INTEGER DEFAULT 0`     |
| `banner_position` | `TEXT DEFAULT 'center'` |
| `content_id`      | `INTEGER`               |
| `podcast_id`      | `INTEGER DEFAULT NULL`  |

### `collaboration_bindings`

| 字段                 | SQLite 定义           |
| -------------------- | --------------------- |
| `content_id`         | `INTEGER PRIMARY KEY` |
| `content_created_at` | `INTEGER NOT NULL`    |
| `server_url`         | `TEXT NOT NULL`       |
| `document_id`        | `TEXT NOT NULL`       |
| `source_type`        | `TEXT`                |
| `source_id`          | `INTEGER`             |
| `source_title`       | `TEXT`                |

### `pdfs`

| 字段             | SQLite 定义              |
| ---------------- | ------------------------ |
| `id`             | `INTEGER PRIMARY KEY`    |
| `create_time`    | `INTEGER NOT NULL`       |
| `update_time`    | `INTEGER NOT NULL`       |
| `tags`           | `TEXT`                   |
| `content`        | `TEXT`                   |
| `is_local`       | `INTEGER NOT NULL`       |
| `category`       | `TEXT DEFAULT 'default'` |
| `file_name`      | `TEXT`                   |
| `file_path`      | `TEXT`                   |
| `remote_url`     | `TEXT`                   |
| `page_count`     | `INTEGER`                |
| `last_open_time` | `INTEGER`                |
| `last_page`      | `INTEGER`                |

### `pdf_annotations`

| 字段                 | SQLite 定义           |
| -------------------- | --------------------- |
| `id`                 | `INTEGER PRIMARY KEY` |
| `create_time`        | `INTEGER NOT NULL`    |
| `update_time`        | `INTEGER NOT NULL`    |
| `pdf_id`             | `INTEGER NOT NULL`    |
| `page_num`           | `INTEGER NOT NULL`    |
| `annotation_payload` | `TEXT NOT NULL`       |
| `color`              | `TEXT`                |
| `notes`              | `TEXT NOT NULL`       |
| `type`               | `TEXT`                |
| `area_data`          | `TEXT`                |

### `pdf_bookmarks`

| 字段               | SQLite 定义           |
| ------------------ | --------------------- |
| `id`               | `INTEGER PRIMARY KEY` |
| `create_time`      | `INTEGER NOT NULL`    |
| `update_time`      | `INTEGER NOT NULL`    |
| `pdf_id`           | `INTEGER NOT NULL`    |
| `bookmark_payload` | `TEXT NOT NULL`       |

### `daily_notes`

| 字段         | SQLite 定义           |
| ------------ | --------------------- |
| `id`         | `INTEGER PRIMARY KEY` |
| `date`       | `TEXT NOT NULL`       |
| `content_id` | `INTEGER`             |

### `diary_entries`

| 字段          | SQLite 定义                            |
| ------------- | -------------------------------------- |
| `id`          | `INTEGER PRIMARY KEY NOT NULL`         |
| `type`        | `TEXT NOT NULL CHECK(type IN ('daily'` |
| `date`        | `TEXT NOT NULL UNIQUE`                 |
| `content_id`  | `INTEGER`                              |
| `weather`     | `TEXT`                                 |
| `mood`        | `TEXT`                                 |
| `tags`        | `TEXT DEFAULT '[]'`                    |
| `word_count`  | `INTEGER DEFAULT 0`                    |
| `create_time` | `INTEGER NOT NULL`                     |
| `update_time` | `INTEGER NOT NULL`                     |

### `diary_segments`

| 字段          | SQLite 定义                    |
| ------------- | ------------------------------ |
| `id`          | `INTEGER PRIMARY KEY NOT NULL` |
| `diary_id`    | `INTEGER NOT NULL`             |
| `content_id`  | `INTEGER NOT NULL`             |
| `tags`        | `TEXT DEFAULT '[]'`            |
| `create_time` | `INTEGER NOT NULL`             |
| `update_time` | `INTEGER NOT NULL`             |

### `diary_tag_settings`

| 字段          | SQLite 定义                 |
| ------------- | --------------------------- |
| `name`        | `TEXT PRIMARY KEY NOT NULL` |
| `color`       | `TEXT NOT NULL`             |
| `sort`        | `INTEGER DEFAULT 0`         |
| `create_time` | `INTEGER NOT NULL`          |
| `update_time` | `INTEGER NOT NULL`          |

### `operation`

| 字段                     | SQLite 定义           |
| ------------------------ | --------------------- |
| `id`                     | `INTEGER PRIMARY KEY` |
| `operation_time`         | `INTEGER NOT NULL`    |
| `operation_id`           | `INTEGER`             |
| `operation_content_type` | `TEXT`                |
| `operation_action`       | `TEXT`                |

### `operation_daily_counts`

| 字段    | SQLite 定义        |
| ------- | ------------------ |
| `date`  | `TEXT PRIMARY KEY` |
| `count` | `INTEGER NOT NULL` |

### `statistic`

| 字段             | SQLite 定义           |
| ---------------- | --------------------- |
| `id`             | `INTEGER PRIMARY KEY` |
| `date`           | `TEXT NOT NULL`       |
| `statistic_type` | `TEXT NOT NULL`       |
| `content`        | `TEXT NOT NULL`       |

### `video_note_item`

| 字段            | SQLite 定义                |
| --------------- | -------------------------- |
| `id`            | `INTEGER PRIMARY KEY`      |
| `create_time`   | `INTEGER NOT NULL`         |
| `update_time`   | `INTEGER NOT NULL`         |
| `video_note_id` | `INTEGER NOT NULL`         |
| `content_id`    | `INTEGER NOT NULL`         |
| `title`         | `TEXT NOT NULL DEFAULT ''` |

### `video_notes`

| 字段                       | SQLite 定义           |
| -------------------------- | --------------------- |
| `id`                       | `INTEGER PRIMARY KEY` |
| `create_time`              | `INTEGER NOT NULL`    |
| `update_time`              | `INTEGER NOT NULL`    |
| `meta_info`                | `TEXT NOT NULL`       |
| `description`              | `TEXT DEFAULT ''`     |
| `transcript`               | `TEXT DEFAULT ''`     |
| `transcript_segments`      | `TEXT DEFAULT ''`     |
| `transcript_word_segments` | `TEXT DEFAULT ''`     |
| `summary`                  | `TEXT DEFAULT ''`     |
| `highlights`               | `TEXT DEFAULT '[]'`   |
| `insights`                 | `TEXT DEFAULT ''`     |

### `chat_group`

| 字段          | SQLite 定义           |
| ------------- | --------------------- |
| `id`          | `INTEGER PRIMARY KEY` |
| `name`        | `TEXT NOT NULL`       |
| `parent_id`   | `INTEGER`             |
| `order_index` | `INTEGER DEFAULT 0`   |
| `create_time` | `INTEGER NOT NULL`    |
| `update_time` | `INTEGER NOT NULL`    |

### `chat_session`

| 字段            | SQLite 定义                       |
| --------------- | --------------------------------- |
| `id`            | `TEXT PRIMARY KEY`                |
| `scope`         | `TEXT NOT NULL`                   |
| `domain_ref`    | `TEXT`                            |
| `session_file`  | `TEXT NOT NULL`                   |
| `cwd`           | `TEXT NOT NULL DEFAULT ''`        |
| `title`         | `TEXT NOT NULL DEFAULT ''`        |
| `title_dirty`   | `INTEGER NOT NULL DEFAULT 0`      |
| `group_id`      | `INTEGER`                         |
| `order_num`     | `INTEGER`                         |
| `archived`      | `INTEGER NOT NULL DEFAULT 0`      |
| `source`        | `TEXT NOT NULL DEFAULT 'desktop'` |
| `message_count` | `INTEGER NOT NULL DEFAULT 0`      |
| `create_time`   | `INTEGER NOT NULL`                |
| `update_time`   | `INTEGER NOT NULL`                |

### `question_group`

| 字段          | SQLite 定义                                         |
| ------------- | --------------------------------------------------- |
| `id`          | `INTEGER PRIMARY KEY`                               |
| `title`       | `TEXT NOT NULL`                                     |
| `color`       | `TEXT`                                              |
| `sort_index`  | `INTEGER NOT NULL DEFAULT 0`                        |
| `is_default`  | `INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0` |
| `create_time` | `INTEGER NOT NULL`                                  |
| `update_time` | `INTEGER NOT NULL`                                  |

### `questions`

| 字段               | SQLite 定义                           |
| ------------------ | ------------------------------------- |
| `id`               | `INTEGER PRIMARY KEY`                 |
| `create_time`      | `INTEGER NOT NULL`                    |
| `update_time`      | `INTEGER NOT NULL`                    |
| `question_content` | `TEXT`                                |
| `answers`          | `TEXT DEFAULT '[]'`                   |
| `group_id`         | `INTEGER`                             |
| `sort_index`       | `INTEGER NOT NULL DEFAULT 0`          |
| `resolved_time`    | `INTEGER`                             |
| `status`           | `TEXT NOT NULL DEFAULT 'not_started'` |
| `description`      | `TEXT`                                |

### `question_link`

问题的探究材料。`target_type`：`card` / `article` / `project_item` / `project` / `white_board` / `answer`（`target_id` 为 `contents.id`）/ `excerpt` / `pdf-annotation` / `web-clip`；`target_id` 均为整数主键。对话关联在 `question_chat`。

| 字段          | SQLite 定义                  |
| ------------- | ---------------------------- |
| `id`          | `INTEGER PRIMARY KEY`        |
| `question_id` | `INTEGER NOT NULL`           |
| `target_type` | `TEXT NOT NULL`              |
| `target_id`   | `INTEGER NOT NULL`           |
| `content_id`  | `INTEGER`                    |
| `sort_index`  | `INTEGER NOT NULL DEFAULT 0` |
| `create_time` | `INTEGER NOT NULL`           |

### `question_chat`

问题的探究对话。`session_id` 为 `chat_session.id`；`message_ids` 为 JSON 数组（问题从哪几条消息转来，可空）。

| 字段          | SQLite 定义           |
| ------------- | --------------------- |
| `id`          | `INTEGER PRIMARY KEY` |
| `question_id` | `INTEGER NOT NULL`    |
| `session_id`  | `TEXT NOT NULL`       |
| `message_ids` | `TEXT`                |
| `create_time` | `INTEGER NOT NULL`    |

### `question_event`

| 字段          | SQLite 定义                  |
| ------------- | ---------------------------- |
| `id`          | `INTEGER PRIMARY KEY`        |
| `question_id` | `INTEGER NOT NULL`           |
| `type`        | `TEXT NOT NULL`              |
| `payload`     | `TEXT NOT NULL DEFAULT '{}'` |
| `create_time` | `INTEGER NOT NULL`           |

### `content_links`

正文之间的显式连接（无向边，一行一条；`content_id` 恒为较小一侧）。连接绑定 `contents.id`，共用同一份正文的身份（卡片、文章、项目文档、日记及其投影）共享同一组连接。

| 字段                | SQLite 定义        |
| ------------------- | ------------------ |
| `content_id`        | `INTEGER NOT NULL` |
| `target_content_id` | `INTEGER NOT NULL` |
| `create_time`       | `INTEGER NOT NULL` |

### `data_tables`

| 字段             | SQLite 定义           |
| ---------------- | --------------------- |
| `id`             | `INTEGER PRIMARY KEY` |
| `create_time`    | `INTEGER NOT NULL`    |
| `update_time`    | `INTEGER NOT NULL`    |
| `columns`        | `TEXT NOT NULL`       |
| `rows`           | `TEXT NOT NULL`       |
| `active_view_id` | `INTEGER`             |
| `ref_count`      | `INTEGER DEFAULT 1`   |

### `data_table_views`

数据表视图。`config` 为 JSON：公共键（columnOrder / rowOrder / columnWidths / groupBy / sorts / filters / footer）在顶层，视图专属配置在 `viewOptions`（键为视图 type：gallery / calendar / kanban…，值由该视图解释）；查询时不要整列返回。

| 字段          | SQLite 定义           |
| ------------- | --------------------- |
| `id`          | `INTEGER PRIMARY KEY` |
| `table_id`    | `INTEGER NOT NULL`    |
| `name`        | `TEXT NOT NULL`       |
| `type`        | `TEXT NOT NULL`       |
| `config`      | `TEXT NOT NULL`       |
| `sort_order`  | `INTEGER NOT NULL`    |
| `create_time` | `INTEGER NOT NULL`    |
| `update_time` | `INTEGER NOT NULL`    |

### `data_table_pending_releases`

引用计数归零但暂缓删除的数据表登记（`data_tables.id`）。开库时先按实际引用对账（database_item / project_item / 正文 database 节点 / 本机协作私有块），仍被引用的按引用数复活，超过宽限期且无引用才物理删除表与视图。

| 字段          | SQLite 定义           |
| ------------- | --------------------- |
| `table_id`    | `INTEGER PRIMARY KEY` |
| `released_at` | `INTEGER NOT NULL`    |

### `database_item`

| 字段             | SQLite 定义                  |
| ---------------- | ---------------------------- |
| `id`             | `INTEGER PRIMARY KEY`        |
| `create_time`    | `INTEGER NOT NULL`           |
| `update_time`    | `INTEGER NOT NULL`           |
| `title`          | `TEXT NOT NULL`              |
| `desc`           | `TEXT`                       |
| `archived`       | `INTEGER DEFAULT 0`          |
| `pinned`         | `INTEGER DEFAULT 0`          |
| `data_table_id`  | `INTEGER NOT NULL DEFAULT 0` |
| `last_open_time` | `INTEGER`                    |

### `project`

| 字段                | SQLite 定义                    |
| ------------------- | ------------------------------ |
| `id`                | `INTEGER PRIMARY KEY`          |
| `create_time`       | `INTEGER NOT NULL`             |
| `update_time`       | `INTEGER NOT NULL`             |
| `title`             | `TEXT NOT NULL`                |
| `desc`              | `TEXT`                         |
| `children`          | `TEXT`                         |
| `archived`          | `INTEGER DEFAULT 0`            |
| `pinned`            | `INTEGER DEFAULT 0`            |
| `project_type`      | `TEXT DEFAULT 'document-tree'` |
| `data_table_id`     | `INTEGER DEFAULT 0`            |
| `last_open_time`    | `INTEGER`                      |
| `last_open_item_id` | `INTEGER`                      |

### `project_item`

| 字段                     | SQLite 定义                  |
| ------------------------ | ---------------------------- |
| `id`                     | `INTEGER PRIMARY KEY`        |
| `create_time`            | `INTEGER NOT NULL`           |
| `update_time`            | `INTEGER NOT NULL`           |
| `title`                  | `TEXT NOT NULL`              |
| `children`               | `TEXT`                       |
| `parents`                | `TEXT`                       |
| `projects`               | `TEXT`                       |
| `ref_type`               | `TEXT`                       |
| `ref_id`                 | `INTEGER`                    |
| `project_item_type`      | `TEXT DEFAULT 'document'`    |
| `content_id`             | `INTEGER`                    |
| `white_board_content_id` | `INTEGER`                    |
| `podcast_id`             | `INTEGER DEFAULT NULL`       |
| `tags`                   | `TEXT NOT NULL DEFAULT '[]'` |

### `migration_meta`

| 字段    | SQLite 定义        |
| ------- | ------------------ |
| `key`   | `TEXT PRIMARY KEY` |
| `value` | `TEXT NOT NULL`    |

### `web_link`

| 字段          | SQLite 定义                                    |
| ------------- | ---------------------------------------------- |
| `id`          | `INTEGER PRIMARY KEY`                          |
| `create_time` | `INTEGER NOT NULL`                             |
| `update_time` | `INTEGER NOT NULL`                             |
| `title`       | `TEXT NOT NULL`                                |
| `url`         | `TEXT NOT NULL`                                |
| `source_type` | `TEXT NOT NULL CHECK(source_type IN ('remote'` |

### `web_clip`

| 字段          | SQLite 定义           |
| ------------- | --------------------- |
| `id`          | `INTEGER PRIMARY KEY` |
| `create_time` | `INTEGER NOT NULL`    |
| `update_time` | `INTEGER NOT NULL`    |
| `content_id`  | `INTEGER NOT NULL`    |
| `url`         | `TEXT NOT NULL`       |
| `title`       | `TEXT NOT NULL`       |

### `web_note`

| 字段              | SQLite 定义           |
| ----------------- | --------------------- |
| `id`              | `INTEGER PRIMARY KEY` |
| `create_time`     | `INTEGER NOT NULL`    |
| `update_time`     | `INTEGER NOT NULL`    |
| `project_item_id` | `INTEGER NOT NULL`    |
| `content_id`      | `INTEGER NOT NULL`    |
| `title`           | `TEXT NOT NULL`       |

### `web_view_preference`

| 字段                   | SQLite 定义           |
| ---------------------- | --------------------- |
| `project_item_id`      | `INTEGER PRIMARY KEY` |
| `preferred_content_id` | `INTEGER`             |

### `entity_lineage`

谱系：「A 衍生出 B」中推导不出的事实，`src_id` / `dst_id` 均为文本。`relation`：`derived` / `saved_from` / `clipped_from` / `excerpt_of` / `upgraded_to`（问题 → Notebook）/ `discussed_in`（问题 → 对话）/ `distilled_from`（用到同一思路的笔记 → 据此新写的卡片）；端点 kind 含 `question`、`vl-project`。

| 字段          | SQLite 定义                         |
| ------------- | ----------------------------------- |
| `id`          | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `src_kind`    | `TEXT NOT NULL`                     |
| `src_id`      | `TEXT NOT NULL`                     |
| `src_anchor`  | `TEXT`                              |
| `dst_kind`    | `TEXT NOT NULL`                     |
| `dst_id`      | `TEXT NOT NULL`                     |
| `relation`    | `TEXT NOT NULL`                     |
| `create_time` | `INTEGER NOT NULL`                  |

### `resource_sync_blacklist`

| 字段          | SQLite 定义                         |
| ------------- | ----------------------------------- |
| `id`          | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `file_name`   | `TEXT NOT NULL UNIQUE`              |
| `create_time` | `INTEGER NOT NULL`                  |
| `update_time` | `INTEGER NOT NULL`                  |

### `publish_selections`

| 字段           | SQLite 定义           |
| -------------- | --------------------- |
| `id`           | `INTEGER PRIMARY KEY` |
| `content_type` | `TEXT NOT NULL`       |
| `content_id`   | `INTEGER NOT NULL`    |
| `parent_path`  | `TEXT DEFAULT ''`     |
| `selected`     | `INTEGER DEFAULT 1`   |
| `update_time`  | `INTEGER NOT NULL`    |

### `publish_history`

| 字段           | SQLite 定义            |
| -------------- | ---------------------- |
| `id`           | `INTEGER PRIMARY KEY`  |
| `file_path`    | `TEXT NOT NULL UNIQUE` |
| `content_hash` | `TEXT NOT NULL`        |
| `source_type`  | `TEXT`                 |
| `source_id`    | `INTEGER`              |
| `publish_time` | `INTEGER NOT NULL`     |

### `transcriptions`

| 字段                   | SQLite 定义           |
| ---------------------- | --------------------- |
| `id`                   | `INTEGER PRIMARY KEY` |
| `source_type`          | `TEXT NOT NULL`       |
| `source_id`            | `INTEGER`             |
| `source_path`          | `TEXT NOT NULL`       |
| `create_time`          | `INTEGER NOT NULL`    |
| `update_time`          | `INTEGER NOT NULL`    |
| `text`                 | `TEXT NOT NULL`       |
| `language`             | `TEXT NOT NULL`       |
| `language_probability` | `REAL NOT NULL`       |
| `duration`             | `REAL NOT NULL`       |
| `processing_time`      | `REAL NOT NULL`       |
| `model_size`           | `TEXT NOT NULL`       |
| `segments`             | `TEXT NOT NULL`       |
| `word_segments`        | `TEXT`                |
| `ref_count`            | `INTEGER DEFAULT 1`   |

### `todo_group`

| 字段          | SQLite 定义                                          |
| ------------- | ---------------------------------------------------- |
| `id`          | `INTEGER PRIMARY KEY`                                |
| `title`       | `TEXT NOT NULL`                                      |
| `color`       | `TEXT`                                               |
| `sort_index`  | `INTEGER NOT NULL DEFAULT 0`                         |
| `is_archived` | `INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0` |
| `create_time` | `INTEGER NOT NULL`                                   |
| `update_time` | `INTEGER NOT NULL`                                   |
| `is_system`   | `INTEGER NOT NULL DEFAULT 0`                         |
| `system_type` | `TEXT`                                               |

### `todo_item`

| 字段                     | SQLite 定义                                           |
| ------------------------ | ----------------------------------------------------- |
| `id`                     | `INTEGER PRIMARY KEY`                                 |
| `group_id`               | `INTEGER NOT NULL`                                    |
| `parent_id`              | `INTEGER`                                             |
| `title`                  | `TEXT NOT NULL`                                       |
| `description_content_id` | `INTEGER`                                             |
| `is_completed`           | `INTEGER NOT NULL DEFAULT 0 CHECK(is_completed IN (0` |
| `due_at`                 | `INTEGER`                                             |
| `completed_at`           | `INTEGER`                                             |
| `sort_index`             | `INTEGER NOT NULL DEFAULT 0`                          |
| `is_archived`            | `INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0`  |
| `create_time`            | `INTEGER NOT NULL`                                    |
| `update_time`            | `INTEGER NOT NULL`                                    |
| `type`                   | `TEXT NOT NULL DEFAULT 'normal'`                      |
| `start_at`               | `INTEGER`                                             |
| `remind_before`          | `INTEGER`                                             |

### `todo_note_link`

| 字段          | SQLite 定义                  |
| ------------- | ---------------------------- |
| `id`          | `INTEGER PRIMARY KEY`        |
| `todo_id`     | `INTEGER NOT NULL`           |
| `content_id`  | `INTEGER NOT NULL`           |
| `title`       | `TEXT`                       |
| `type`        | `TEXT`                       |
| `sort_index`  | `INTEGER NOT NULL DEFAULT 0` |
| `create_time` | `INTEGER NOT NULL`           |
| `update_time` | `INTEGER NOT NULL`           |

### `todo_recurrence`

| 字段               | SQLite 定义                  |
| ------------------ | ---------------------------- |
| `id`               | `INTEGER PRIMARY KEY`        |
| `todo_item_id`     | `INTEGER NOT NULL UNIQUE`    |
| `type`             | `TEXT NOT NULL`              |
| `interval`         | `INTEGER NOT NULL DEFAULT 1` |
| `weekdays`         | `TEXT`                       |
| `month_day`        | `INTEGER`                    |
| `year_month`       | `INTEGER`                    |
| `year_day`         | `INTEGER`                    |
| `exclude_holidays` | `INTEGER NOT NULL DEFAULT 0` |
| `start_date`       | `INTEGER NOT NULL`           |
| `end_date`         | `INTEGER`                    |
| `create_time`      | `INTEGER NOT NULL`           |
| `update_time`      | `INTEGER NOT NULL`           |
| `max_occurrences`  | `INTEGER`                    |

### `todo_recurrence_completion`

| 字段             | SQLite 定义                  |
| ---------------- | ---------------------------- |
| `id`             | `INTEGER PRIMARY KEY`        |
| `recurrence_id`  | `INTEGER NOT NULL`           |
| `scheduled_date` | `INTEGER NOT NULL`           |
| `completed_at`   | `INTEGER`                    |
| `skipped`        | `INTEGER NOT NULL DEFAULT 0` |
| `create_time`    | `INTEGER NOT NULL`           |

### `todo_calendar_mapping`

| 字段                | SQLite 定义           |
| ------------------- | --------------------- |
| `id`                | `INTEGER PRIMARY KEY` |
| `todo_item_id`      | `INTEGER NOT NULL`    |
| `calendar_event_id` | `INTEGER NOT NULL`    |
| `sync_type`         | `TEXT NOT NULL`       |
| `recurrence_date`   | `INTEGER`             |
| `create_time`       | `INTEGER NOT NULL`    |

### `doc_task_settings`

文档待办（正文勾选项）的用户设置：`kind='excluded'` 为整篇不收集（`task_id` 为空串），`kind='promoted'` 为该项已转为独立待办 `todo_item_id`。勾选项本身不在主库（以正文为准）。

| 字段           | SQLite 定义                                            |
| -------------- | ------------------------------------------------------ |
| `id`           | `INTEGER PRIMARY KEY`                                  |
| `content_id`   | `INTEGER NOT NULL`                                     |
| `task_id`      | `TEXT NOT NULL DEFAULT ''`                             |
| `kind`         | `TEXT NOT NULL CHECK(kind IN ('excluded','promoted'))` |
| `todo_item_id` | `INTEGER`                                              |
| `create_time`  | `INTEGER NOT NULL`                                     |

### `doc_task_group_names`

项目曾用名随主库保存，用于镜像重建与同步下载后的正文改名；创建时间防止项目 ID 重用时误认旧名。全库唯一复合主键表：`(group_id, group_created_at, title)` 三字段联合主键，即同一项目同一时点只存一份曾用名。

| 字段               | SQLite 定义        |
| ------------------ | ------------------ |
| `group_id`         | `INTEGER NOT NULL` |
| `group_created_at` | `INTEGER NOT NULL` |
| `title`            | `TEXT NOT NULL`    |

### `pomodoro_presets`

| 字段           | SQLite 定义                   |
| -------------- | ----------------------------- |
| `id`           | `INTEGER PRIMARY KEY`         |
| `name`         | `TEXT NOT NULL`               |
| `mode`         | `TEXT NOT NULL`               |
| `duration_min` | `INTEGER NOT NULL DEFAULT 25` |
| `sort_order`   | `INTEGER NOT NULL DEFAULT 0`  |
| `archived`     | `INTEGER NOT NULL DEFAULT 0`  |
| `create_time`  | `INTEGER NOT NULL`            |
| `update_time`  | `INTEGER NOT NULL`            |

### `pomodoro_sessions`

| 字段             | SQLite 定义                  |
| ---------------- | ---------------------------- |
| `id`             | `INTEGER PRIMARY KEY`        |
| `preset_id`      | `INTEGER NOT NULL`           |
| `start_time`     | `INTEGER NOT NULL`           |
| `end_time`       | `INTEGER`                    |
| `expected_ms`    | `INTEGER`                    |
| `focus_ms`       | `INTEGER NOT NULL DEFAULT 0` |
| `pause_total_ms` | `INTEGER NOT NULL DEFAULT 0` |
| `pause_count`    | `INTEGER NOT NULL DEFAULT 0` |
| `pauses`         | `TEXT NOT NULL DEFAULT '[]'` |
| `status`         | `TEXT NOT NULL`              |
| `create_time`    | `INTEGER NOT NULL`           |
| `update_time`    | `INTEGER NOT NULL`           |
| `bound_event_id` | `INTEGER`                    |
| `bound_todo_id`  | `INTEGER`                    |
| `bound_title`    | `TEXT`                       |

### `pomodoro_calendar_mapping`

| 字段                  | SQLite 定义           |
| --------------------- | --------------------- |
| `id`                  | `INTEGER PRIMARY KEY` |
| `pomodoro_session_id` | `INTEGER NOT NULL`    |
| `calendar_event_id`   | `INTEGER NOT NULL`    |
| `create_time`         | `INTEGER NOT NULL`    |

### `calendar_group`

| 字段              | SQLite 定义            |
| ----------------- | ---------------------- |
| `id`              | `INTEGER PRIMARY KEY`  |
| `name`            | `TEXT NOT NULL`        |
| `is_system`       | `INTEGER DEFAULT 0`    |
| `order_index`     | `INTEGER DEFAULT 0`    |
| `create_time`     | `INTEGER NOT NULL`     |
| `update_time`     | `INTEGER NOT NULL`     |
| `parent_group_id` | `INTEGER DEFAULT NULL` |

### `calendar`

| 字段                     | SQLite 定义            |
| ------------------------ | ---------------------- |
| `id`                     | `INTEGER PRIMARY KEY`  |
| `create_time`            | `INTEGER NOT NULL`     |
| `update_time`            | `INTEGER NOT NULL`     |
| `title`                  | `TEXT NOT NULL`        |
| `color`                  | `TEXT NOT NULL`        |
| `description_content_id` | `INTEGER DEFAULT 0`    |
| `archived`               | `INTEGER DEFAULT 0`    |
| `pinned`                 | `INTEGER DEFAULT 0`    |
| `visible`                | `INTEGER DEFAULT 1`    |
| `order_index`            | `INTEGER DEFAULT 0`    |
| `group_id`               | `INTEGER DEFAULT NULL` |

### `calendar_event`

| 字段                | SQLite 定义           |
| ------------------- | --------------------- |
| `id`                | `INTEGER PRIMARY KEY` |
| `create_time`       | `INTEGER NOT NULL`    |
| `update_time`       | `INTEGER NOT NULL`    |
| `calendar_id`       | `INTEGER NOT NULL`    |
| `title`             | `TEXT NOT NULL`       |
| `detail_content_id` | `INTEGER DEFAULT 0`   |
| `start_date`        | `INTEGER NOT NULL`    |
| `end_date`          | `INTEGER`             |
| `start_time`        | `INTEGER`             |
| `end_time`          | `INTEGER`             |
| `color`             | `TEXT`                |
| `all_day`           | `INTEGER DEFAULT 0`   |
| `todo_item_id`      | `INTEGER`             |

### `weread_notebook`

已停用：微信读书改为插件后不再读写，下一版本删除；划线以 `excerpt`（`source_type = 'weread'`）为准。

| 字段                 | SQLite 定义         |
| -------------------- | ------------------- |
| `book_id`            | `TEXT PRIMARY KEY`  |
| `title`              | `TEXT NOT NULL`     |
| `author`             | `TEXT`              |
| `cover`              | `TEXT`              |
| `intro`              | `TEXT`              |
| `category`           | `TEXT`              |
| `publisher`          | `TEXT`              |
| `isbn`               | `TEXT`              |
| `total_words`        | `INTEGER`           |
| `rating`             | `TEXT`              |
| `book_type`          | `INTEGER`           |
| `publish_time`       | `TEXT`              |
| `note_count`         | `INTEGER DEFAULT 0` |
| `review_count`       | `INTEGER DEFAULT 0` |
| `bookmark_count`     | `INTEGER DEFAULT 0` |
| `archive_name`       | `TEXT`              |
| `last_read_date`     | `TEXT`              |
| `url`                | `TEXT`              |
| `pc_url`             | `TEXT`              |
| `reading_progress`   | `REAL DEFAULT 0`    |
| `reading_time`       | `INTEGER DEFAULT 0` |
| `reading_book_date`  | `INTEGER DEFAULT 0` |
| `finished_date`      | `INTEGER DEFAULT 0` |
| `marked_status`      | `INTEGER DEFAULT 0` |
| `total_read_day`     | `INTEGER DEFAULT 0` |
| `continue_read_days` | `INTEGER DEFAULT 0` |
| `reading_status`     | `INTEGER DEFAULT 0` |
| `synckey_highlights` | `INTEGER`           |
| `synckey_reviews`    | `INTEGER`           |
| `synckey_progress`   | `INTEGER`           |
| `chapter_highlights` | `TEXT`              |
| `book_review`        | `TEXT`              |
| `created_at`         | `INTEGER NOT NULL`  |
| `updated_at`         | `INTEGER NOT NULL`  |

### `weread_config`

已停用，同 `weread_notebook`。

| 字段         | SQLite 定义        |
| ------------ | ------------------ |
| `key`        | `TEXT PRIMARY KEY` |
| `value`      | `TEXT`             |
| `updated_at` | `INTEGER NOT NULL` |

### `excerpt`

摘录：外部来源的划线，一条一行，由提供方写入——`source_type` 为 `web`（浏览器插件网页划线）或插件 ID（如 `weread`）；`is_deleted = 1` 表示源端已删除（保留原文）。展示用提供方名称（`excerpt_provider.label`）· `source_title` · `location`；`anchor` 是提供方私有定位。

| 字段           | SQLite 定义                         |
| -------------- | ----------------------------------- |
| `id`           | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `source_type`  | `TEXT NOT NULL`                     |
| `source_key`   | `TEXT NOT NULL`                     |
| `source_title` | `TEXT NOT NULL DEFAULT ''`          |
| `external_id`  | `TEXT NOT NULL`                     |
| `quote`        | `TEXT NOT NULL`                     |
| `note`         | `TEXT NOT NULL DEFAULT ''`          |
| `anchor`       | `TEXT`                              |
| `color`        | `TEXT`                              |
| `source_time`  | `INTEGER`                           |
| `create_time`  | `INTEGER NOT NULL`                  |
| `update_time`  | `INTEGER NOT NULL`                  |
| `is_deleted`   | `INTEGER NOT NULL DEFAULT 0`        |
| `location`     | `TEXT NOT NULL DEFAULT ''`          |
| `url`          | `TEXT`                              |

### `excerpt_provider`

摘录提供方名称，按 `source_type` 一行；插件停用或卸载后仍用于显示来源。

| 字段          | SQLite 定义        |
| ------------- | ------------------ |
| `source_type` | `TEXT PRIMARY KEY` |
| `label`       | `TEXT NOT NULL`    |
| `update_time` | `INTEGER NOT NULL` |

### `flashcard_decks`

| 字段          | SQLite 定义              |
| ------------- | ------------------------ |
| `id`          | `INTEGER PRIMARY KEY`    |
| `name`        | `TEXT NOT NULL`          |
| `description` | `TEXT DEFAULT ''`        |
| `cover_color` | `TEXT DEFAULT '#2563eb'` |
| `emoji`       | `TEXT DEFAULT '🧠'`      |
| `sort_order`  | `INTEGER DEFAULT 0`      |
| `meta`        | `TEXT`                   |
| `create_time` | `INTEGER NOT NULL`       |
| `update_time` | `INTEGER NOT NULL`       |

### `flashcards`

| 字段                | SQLite 定义               |
| ------------------- | ------------------------- |
| `id`                | `INTEGER PRIMARY KEY`     |
| `deck_id`           | `INTEGER NOT NULL`        |
| `type`              | `TEXT NOT NULL`           |
| `prompt`            | `TEXT NOT NULL`           |
| `detail`            | `TEXT DEFAULT ''`         |
| `data`              | `TEXT NOT NULL`           |
| `tags`              | `TEXT DEFAULT '[]'`       |
| `difficulty`        | `TEXT DEFAULT 'standard'` |
| `due_time`          | `INTEGER NOT NULL`        |
| `last_review_time`  | `INTEGER`                 |
| `review_count`      | `INTEGER DEFAULT 0`       |
| `memory_stability`  | `REAL`                    |
| `memory_difficulty` | `REAL`                    |
| `status`            | `TEXT DEFAULT 'new'`      |
| `reference_summary` | `TEXT`                    |
| `create_time`       | `INTEGER NOT NULL`        |
| `update_time`       | `INTEGER NOT NULL`        |

### `flashcard_reviews`

| 字段          | SQLite 定义               |
| ------------- | ------------------------- |
| `id`          | `INTEGER PRIMARY KEY`     |
| `card_id`     | `INTEGER NOT NULL`        |
| `deck_id`     | `INTEGER NOT NULL`        |
| `rating`      | `TEXT NOT NULL`           |
| `review_time` | `INTEGER NOT NULL`        |
| `interval`    | `INTEGER NOT NULL`        |
| `stability`   | `REAL NOT NULL DEFAULT 0` |
| `difficulty`  | `REAL NOT NULL DEFAULT 0` |
| `notes`       | `TEXT`                    |

### `flashcard_references`

| 字段          | SQLite 定义           |
| ------------- | --------------------- |
| `id`          | `INTEGER PRIMARY KEY` |
| `card_id`     | `INTEGER NOT NULL`    |
| `content_id`  | `INTEGER NOT NULL`    |
| `ref_type`    | `TEXT NOT NULL`       |
| `title`       | `TEXT NOT NULL`       |
| `create_time` | `INTEGER NOT NULL`    |
| `update_time` | `INTEGER NOT NULL`    |

### `walk_visits`

漫步重温记录：按实体地址（kind + entity_id）记录上次被漫步到的时间与屏蔽状态。

| 字段             | SQLite 定义                  |
| ---------------- | ---------------------------- |
| `kind`           | `TEXT NOT NULL`              |
| `entity_id`      | `INTEGER NOT NULL`           |
| `last_seen_time` | `INTEGER NOT NULL`           |
| `seen_count`     | `INTEGER NOT NULL DEFAULT 0` |
| `muted`          | `INTEGER NOT NULL DEFAULT 0` |
| `create_time`    | `INTEGER NOT NULL`           |
| `update_time`    | `INTEGER NOT NULL`           |

主键：`(kind, entity_id)`。

### `walk_daily_decks`

今日漫步牌堆：按本地日期缓存当天抽出的 5 张（items 为 WalkItem JSON），保证当天重进不换牌；cursor 为已翻过的张数。

| 字段          | SQLite 定义                  |
| ------------- | ---------------------------- |
| `date`        | `TEXT PRIMARY KEY NOT NULL`  |
| `items`       | `TEXT NOT NULL`              |
| `cursor`      | `INTEGER NOT NULL DEFAULT 0` |
| `create_time` | `INTEGER NOT NULL`           |
| `update_time` | `INTEGER NOT NULL`           |

### `vibe_learning_project`

| 字段                | SQLite 定义           |
| ------------------- | --------------------- |
| `id`                | `INTEGER PRIMARY KEY` |
| `create_time`       | `INTEGER NOT NULL`    |
| `update_time`       | `INTEGER NOT NULL`    |
| `title`             | `TEXT NOT NULL`       |
| `desc`              | `TEXT`                |
| `archived`          | `INTEGER DEFAULT 0`   |
| `pinned`            | `INTEGER DEFAULT 0`   |
| `last_open_time`    | `INTEGER`             |
| `last_open_kind`    | `TEXT`                |
| `last_open_item_id` | `INTEGER`             |

### `vibe_learning_resources`

`source_type`：`local` / `remote` / `note`（已有笔记，`source_meta_info.contentId`）/ `material`（外部材料快照，`source_meta_info.refs` 为摘录 / PDF 标注 / 剪藏）；其他值为在线视频提供方插件 ID（如 `bilibili`、`youtube`），`source_meta_info` 是该插件的视频引用加 `title` / `thumbnail`。

| 字段                  | SQLite 定义                  |
| --------------------- | ---------------------------- |
| `id`                  | `INTEGER PRIMARY KEY`        |
| `project_id`          | `INTEGER NOT NULL`           |
| `sort_index`          | `INTEGER NOT NULL DEFAULT 0` |
| `create_time`         | `INTEGER NOT NULL`           |
| `update_time`         | `INTEGER NOT NULL`           |
| `name`                | `TEXT NOT NULL`              |
| `original_path`       | `TEXT NOT NULL`              |
| `markdown_path`       | `TEXT`                       |
| `resource_type`       | `TEXT NOT NULL`              |
| `file_size`           | `INTEGER`                    |
| `duration`            | `INTEGER`                    |
| `source_type`         | `TEXT`                       |
| `source_meta_info`    | `TEXT`                       |
| `transcript_segments` | `TEXT`                       |

### `vl_note`

| 字段          | SQLite 定义                    |
| ------------- | ------------------------------ |
| `id`          | `INTEGER PRIMARY KEY`          |
| `create_time` | `INTEGER NOT NULL`             |
| `update_time` | `INTEGER NOT NULL`             |
| `project_id`  | `INTEGER NOT NULL`             |
| `content_id`  | `INTEGER NOT NULL`             |
| `title`       | `TEXT NOT NULL`                |
| `type`        | `TEXT NOT NULL DEFAULT 'note'` |
| `podcast_id`  | `INTEGER DEFAULT NULL`         |

### `vl_quiz_set`

| 字段           | SQLite 定义           |
| -------------- | --------------------- |
| `id`           | `INTEGER PRIMARY KEY` |
| `project_id`   | `INTEGER NOT NULL`    |
| `name`         | `TEXT NOT NULL`       |
| `description`  | `TEXT DEFAULT ''`     |
| `emoji`        | `TEXT DEFAULT '📝'`   |
| `resource_ids` | `TEXT DEFAULT '[]'`   |
| `prompt`       | `TEXT`                |
| `create_time`  | `INTEGER NOT NULL`    |
| `update_time`  | `INTEGER NOT NULL`    |

### `vl_quiz_item`

| 字段          | SQLite 定义               |
| ------------- | ------------------------- |
| `id`          | `INTEGER PRIMARY KEY`     |
| `quiz_set_id` | `INTEGER NOT NULL`        |
| `type`        | `TEXT NOT NULL`           |
| `prompt`      | `TEXT NOT NULL`           |
| `detail`      | `TEXT DEFAULT '[]'`       |
| `data`        | `TEXT NOT NULL`           |
| `tags`        | `TEXT DEFAULT '[]'`       |
| `difficulty`  | `TEXT DEFAULT 'standard'` |
| `sort_order`  | `INTEGER DEFAULT 0`       |
| `create_time` | `INTEGER NOT NULL`        |
| `update_time` | `INTEGER NOT NULL`        |

### `vl_quiz_record`

| 字段            | SQLite 定义           |
| --------------- | --------------------- |
| `id`            | `INTEGER PRIMARY KEY` |
| `quiz_set_id`   | `INTEGER NOT NULL`    |
| `project_id`    | `INTEGER NOT NULL`    |
| `score`         | `REAL NOT NULL`       |
| `correct_count` | `INTEGER NOT NULL`    |
| `total_count`   | `INTEGER NOT NULL`    |
| `answers`       | `TEXT NOT NULL`       |
| `duration`      | `INTEGER NOT NULL`    |
| `create_time`   | `INTEGER NOT NULL`    |
