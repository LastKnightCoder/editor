# database-schema：主数据库只读查询指南

使用 `sql_query` 前先阅读本 Skill。

## 规则

- 只查询当前主库；`sql_query` 只允许单条 SELECT/WITH/EXPLAIN 或受限结构 PRAGMA。
- 优先显式列名、必要 JOIN、WHERE 和 LIMIT；默认最多返回 200 行。
- `contents` 保存富文本编辑器结构，正文 Markdown、编辑快照和语义检索继续调用专用工具，不要把整列内容直接返回。

## 常用查询

```sql
SELECT id, title, content_id, update_time FROM cards ORDER BY update_time DESC LIMIT 20;
SELECT id, title, content_id, create_time FROM articles WHERE create_time >= :start_time LIMIT 200;
SELECT i.id, i.title, i.completed, g.title AS group_title FROM todo_item i LEFT JOIN todo_group g ON g.id=i.group_id WHERE i.archived=0 LIMIT 200;
SELECT e.id, e.title, e.start_date, c.title AS calendar_title FROM calendar_event e LEFT JOIN calendar c ON c.id=e.calendar_id WHERE e.start_date >= :start_date LIMIT 200;
```

## 表和字段

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

| 字段          | SQLite 定义                |
| ------------- | -------------------------- |
| `id`          | `INTEGER PRIMARY KEY`      |
| `create_time` | `INTEGER NOT NULL`         |
| `update_time` | `INTEGER NOT NULL`         |
| `tags`        | `TEXT`                     |
| `links`       | `TEXT`                     |
| `category`    | `TEXT DEFAULT 'permanent'` |
| `content_id`  | `INTEGER`                  |
| `is_top`      | `INTEGER DEFAULT 0`        |
| `podcast_id`  | `INTEGER DEFAULT NULL`     |

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

| 字段          | SQLite 定义                  |
| ------------- | ---------------------------- |
| `id`          | `INTEGER PRIMARY KEY`        |
| `question_id` | `INTEGER NOT NULL`           |
| `target_type` | `TEXT NOT NULL`              |
| `target_id`   | `INTEGER NOT NULL`           |
| `content_id`  | `INTEGER`                    |
| `sort_index`  | `INTEGER NOT NULL DEFAULT 0` |
| `create_time` | `INTEGER NOT NULL`           |

### `question_event`

| 字段          | SQLite 定义                  |
| ------------- | ---------------------------- |
| `id`          | `INTEGER PRIMARY KEY`        |
| `question_id` | `INTEGER NOT NULL`           |
| `type`        | `TEXT NOT NULL`              |
| `payload`     | `TEXT NOT NULL DEFAULT '{}'` |
| `create_time` | `INTEGER NOT NULL`           |

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

### `content_link`

| 字段          | SQLite 定义           |
| ------------- | --------------------- |
| `id`          | `INTEGER PRIMARY KEY` |
| `create_time` | `INTEGER NOT NULL`    |
| `source_id`   | `INTEGER NOT NULL`    |
| `source_type` | `TEXT NOT NULL`       |
| `target_id`   | `INTEGER NOT NULL`    |
| `target_type` | `TEXT NOT NULL`       |

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

### `weread_notebook`

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

| 字段         | SQLite 定义        |
| ------------ | ------------------ |
| `key`        | `TEXT PRIMARY KEY` |
| `value`      | `TEXT`             |
| `updated_at` | `INTEGER NOT NULL` |

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
| `review_level`      | `INTEGER DEFAULT 0`       |
| `due_time`          | `INTEGER NOT NULL`        |
| `last_review_time`  | `INTEGER`                 |
| `review_count`      | `INTEGER DEFAULT 0`       |
| `ease_factor`       | `REAL DEFAULT 2.5`        |
| `status`            | `TEXT DEFAULT 'new'`      |
| `reference_summary` | `TEXT`                    |
| `create_time`       | `INTEGER NOT NULL`        |
| `update_time`       | `INTEGER NOT NULL`        |

### `flashcard_reviews`

| 字段           | SQLite 定义           |
| -------------- | --------------------- |
| `id`           | `INTEGER PRIMARY KEY` |
| `card_id`      | `INTEGER NOT NULL`    |
| `deck_id`      | `INTEGER NOT NULL`    |
| `rating`       | `TEXT NOT NULL`       |
| `review_time`  | `INTEGER NOT NULL`    |
| `interval`     | `INTEGER NOT NULL`    |
| `review_level` | `INTEGER NOT NULL`    |
| `ease_factor`  | `REAL NOT NULL`       |
| `notes`        | `TEXT`                |

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
