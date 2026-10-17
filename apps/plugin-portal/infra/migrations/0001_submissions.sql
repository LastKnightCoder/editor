PRAGMA foreign_keys = ON;

CREATE TABLE publishers (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  avatar_url TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  github_token TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE oauth_states (
  token_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE uploads (
  id TEXT PRIMARY KEY, publisher_id TEXT NOT NULL REFERENCES publishers(id),
  status TEXT NOT NULL CHECK(status IN ('awaiting_upload','checking','ready','invalid')),
  processing_at INTEGER, file_name TEXT NOT NULL, size INTEGER NOT NULL,
  object_key TEXT, sha256 TEXT, content_json TEXT, error_json TEXT, created_at TEXT NOT NULL
);
CREATE INDEX uploads_owner ON uploads(publisher_id);
CREATE TABLE plugins (
  id TEXT PRIMARY KEY, publisher_id TEXT NOT NULL REFERENCES publishers(id),
  repository_id TEXT NOT NULL, repository TEXT NOT NULL
);
CREATE TABLE submissions (
  id TEXT PRIMARY KEY, publisher_id TEXT NOT NULL REFERENCES publishers(id),
  client_request_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review')),
  package_upload_id TEXT REFERENCES uploads(id), content_json TEXT,
  repository TEXT NOT NULL DEFAULT '', source_commit TEXT, repository_id TEXT,
  plugin_id TEXT, plugin_version TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT,
  UNIQUE(publisher_id,client_request_id)
);
CREATE INDEX submissions_owner ON submissions(publisher_id,created_at,id);
CREATE UNIQUE INDEX submissions_pending_version ON submissions(plugin_id,plugin_version) WHERE status='pending_review';
CREATE TABLE submission_feedback (
  id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id),
  publisher_id TEXT NOT NULL REFERENCES publishers(id), client_request_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('author','reviewer')), message TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(submission_id,publisher_id,client_request_id)
);
CREATE INDEX feedback_submission ON submission_feedback(submission_id,created_at,id);
