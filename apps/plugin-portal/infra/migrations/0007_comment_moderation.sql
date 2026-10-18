ALTER TABLE visitors ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
CREATE INDEX plugin_comments_admin ON plugin_comments(created_at DESC,id DESC);
CREATE TABLE moderation_events (
  id TEXT PRIMARY KEY,
  reviewer_id TEXT NOT NULL REFERENCES publishers(id),
  client_request_id TEXT NOT NULL,
  comment_id TEXT NOT NULL REFERENCES plugin_comments(id),
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  action TEXT NOT NULL CHECK(action IN ('delete_comment','suspend_visitor','restore_visitor')),
  reason TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(reviewer_id,client_request_id)
);
CREATE INDEX moderation_events_page ON moderation_events(created_at DESC,id DESC);
