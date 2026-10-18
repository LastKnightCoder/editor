CREATE TABLE plugin_likes (
  plugin_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  PRIMARY KEY(plugin_id,visitor_id)
);
CREATE TABLE plugin_comments (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  client_request_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
  UNIQUE(visitor_id,client_request_id)
);
CREATE INDEX plugin_comments_page ON plugin_comments(plugin_id,deleted,created_at DESC,id DESC);
CREATE INDEX plugin_comments_daily ON plugin_comments(visitor_id,created_at);
