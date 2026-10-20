-- 桌面端用户反馈：正文与元数据在 D1，截图与日志在私有 R2 桶 tau-feedback。
CREATE TABLE app_feedback (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  client_request_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('bug','idea','other')),
  message TEXT NOT NULL,
  contact TEXT,
  context_json TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','doing','done','ignored')),
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(visitor_id,client_request_id)
);
CREATE INDEX app_feedback_page ON app_feedback(status,created_at DESC,id DESC);
CREATE INDEX app_feedback_time ON app_feedback(created_at DESC,id DESC);
CREATE INDEX app_feedback_visitor ON app_feedback(visitor_id,created_at);
CREATE TABLE app_feedback_attachments (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES app_feedback(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('image','log','perf')),
  object_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX app_feedback_attachments_feedback ON app_feedback_attachments(feedback_id,position);
-- 防滥用额度：IP 按日哈希分桶计数；全站按日累计写入字节，超出熔断。
CREATE TABLE app_feedback_ip_limits (
  bucket TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  count INTEGER NOT NULL
);
CREATE TABLE app_feedback_daily_bytes (
  day TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL
);
