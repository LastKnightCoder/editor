-- 助理操作回执与撤销材料；请求身份在当前库内唯一。
CREATE TABLE IF NOT EXISTS task_assistant_operation (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  tool_name TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  request_json TEXT,
  conversation_key TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','undone')),
  phase TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  result_json TEXT,
  error_json TEXT,
  create_time INTEGER NOT NULL,
  update_time INTEGER NOT NULL,
  undo_until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_assistant_batch ON task_assistant_operation(batch_id, create_time);
CREATE INDEX IF NOT EXISTS idx_task_assistant_status ON task_assistant_operation(status, update_time);
CREATE INDEX IF NOT EXISTS idx_task_assistant_expiry ON task_assistant_operation(undo_until);

-- 一份操作对正文只持有一个保留引用，释放时经过内容层。
CREATE TABLE IF NOT EXISTS task_assistant_content_pin (
  operation_id TEXT NOT NULL,
  content_id INTEGER NOT NULL,
  content_created_at INTEGER NOT NULL,
  PRIMARY KEY(operation_id, content_id)
);

CREATE TABLE IF NOT EXISTS doc_task_calendar_link (
  calendar_event_id INTEGER PRIMARY KEY,
  content_id INTEGER NOT NULL,
  content_created_at INTEGER NOT NULL,
  task_id TEXT NOT NULL,
  series_id TEXT,
  occurrence_date TEXT,
  create_time INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_task_calendar_source ON doc_task_calendar_link(content_id, task_id);

CREATE TABLE IF NOT EXISTS todo_recurrence_history (
  series_id TEXT PRIMARY KEY,
  todo_item_id INTEGER NOT NULL,
  todo_created_at INTEGER NOT NULL,
  effective_date TEXT NOT NULL,
  rule_json TEXT,
  create_time INTEGER NOT NULL,
  UNIQUE(todo_item_id, todo_created_at, effective_date)
);
CREATE INDEX IF NOT EXISTS idx_todo_recurrence_history_task ON todo_recurrence_history(todo_item_id, todo_created_at);

CREATE TABLE IF NOT EXISTS todo_occurrence_override (
  todo_item_id INTEGER NOT NULL,
  todo_created_at INTEGER NOT NULL,
  series_id TEXT NOT NULL,
  occurrence_date TEXT NOT NULL,
  state_json TEXT NOT NULL,
  update_time INTEGER NOT NULL,
  PRIMARY KEY(todo_item_id, todo_created_at, series_id, occurrence_date)
);

CREATE TABLE IF NOT EXISTS todo_schedule_occurrence (
  calendar_event_id INTEGER PRIMARY KEY,
  series_id TEXT NOT NULL,
  occurrence_date TEXT NOT NULL
);
