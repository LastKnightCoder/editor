-- 插件禁用：disabled_at 非空即不进入公开目录/搜索/下载；只切断可见性，不影响作者提交与审核。
ALTER TABLE plugins ADD COLUMN disabled_at TEXT;
ALTER TABLE plugins ADD COLUMN disabled_by TEXT REFERENCES publishers(id);
ALTER TABLE plugins ADD COLUMN disabled_reason TEXT;
-- 独立于评论处置的审计表：moderation_events 的 comment_id/visitor_id 非空外键不适用于插件。
CREATE TABLE plugin_moderation_events (
  id TEXT PRIMARY KEY,
  reviewer_id TEXT NOT NULL REFERENCES publishers(id),
  client_request_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL REFERENCES plugins(id),
  action TEXT NOT NULL CHECK(action IN ('disable_plugin','enable_plugin')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(reviewer_id,client_request_id)
);
CREATE INDEX plugin_moderation_events_page ON plugin_moderation_events(created_at DESC,id DESC);
