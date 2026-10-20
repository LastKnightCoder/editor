ALTER TABLE submission_reviews ADD COLUMN system_reviewed INTEGER NOT NULL DEFAULT 0 CHECK(system_reviewed IN (0, 1));
ALTER TABLE releases ADD COLUMN system_reviewed INTEGER NOT NULL DEFAULT 0 CHECK(system_reviewed IN (0, 1));
ALTER TABLE releases ADD COLUMN revoked_at TEXT;
ALTER TABLE releases ADD COLUMN revoked_reason TEXT;
CREATE TABLE release_revocations (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES releases(id),
  reviewer_id TEXT NOT NULL REFERENCES publishers(id),
  client_request_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(reviewer_id, client_request_id)
);
