-- 扩展提交状态，复制并恢复反馈，保留已有提交ID和资料。
CREATE TABLE submissions_next (
  id TEXT PRIMARY KEY, publisher_id TEXT NOT NULL REFERENCES publishers(id),
  client_request_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review','changes_requested','rejected','approved')),
  package_upload_id TEXT REFERENCES uploads(id), content_json TEXT,
  repository TEXT NOT NULL DEFAULT '', source_commit TEXT, repository_id TEXT,
  plugin_id TEXT, plugin_version TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT,
  UNIQUE(publisher_id,client_request_id)
);
INSERT INTO submissions_next SELECT * FROM submissions;
CREATE TABLE feedback_snapshot AS SELECT * FROM submission_feedback;
DROP TABLE submission_feedback;
DROP TABLE submissions;
ALTER TABLE submissions_next RENAME TO submissions;
CREATE INDEX submissions_owner ON submissions(publisher_id,created_at,id);
CREATE UNIQUE INDEX submissions_pending_version ON submissions(plugin_id,plugin_version)
  WHERE status IN ('pending_review','changes_requested','approved');
CREATE TABLE submission_feedback (
  id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id),
  publisher_id TEXT NOT NULL REFERENCES publishers(id), client_request_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('author','reviewer')), message TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(submission_id,publisher_id,client_request_id)
);
INSERT INTO submission_feedback SELECT * FROM feedback_snapshot;
DROP TABLE feedback_snapshot;
CREATE INDEX feedback_submission ON submission_feedback(submission_id,created_at,id);

CREATE TABLE submission_reviews (
  id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id),
  reviewed_revision INTEGER NOT NULL, package_upload_id TEXT NOT NULL REFERENCES uploads(id),
  sha256 TEXT NOT NULL, manifest_json TEXT NOT NULL, repository TEXT NOT NULL, source_commit TEXT NOT NULL,
  reviewer_id TEXT NOT NULL REFERENCES publishers(id),
  decision TEXT NOT NULL CHECK(decision IN ('approve','request_changes','reject')),
  comment TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(submission_id,reviewed_revision)
);
CREATE TABLE releases (
  id TEXT PRIMARY KEY, plugin_id TEXT NOT NULL, version TEXT NOT NULL,
  submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
  package_upload_id TEXT NOT NULL REFERENCES uploads(id),
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  object_key TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL,
  content_json TEXT NOT NULL, repository TEXT NOT NULL, source_commit TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','publishing','published','failed')),
  error TEXT, attempt_id TEXT, lease_until INTEGER,
  created_at TEXT NOT NULL, published_at TEXT,
  UNIQUE(plugin_id,version)
);
CREATE INDEX releases_published ON releases(state,published_at,id);
