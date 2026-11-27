CREATE TABLE IF NOT EXISTS content_history_versions (
  document_id TEXT NOT NULL REFERENCES content_documents(document_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  version_key TEXT NOT NULL,
  previous_key TEXT,
  target_key TEXT,
  checkpoint INTEGER NOT NULL CHECK (checkpoint IN (0,1)),
  metadata TEXT NOT NULL,
  state BLOB NOT NULL CHECK (length(state) BETWEEN 1 AND 8388608),
  PRIMARY KEY (document_id,sequence),
  UNIQUE (document_id,version_key),
  FOREIGN KEY (document_id,previous_key) REFERENCES content_history_versions(document_id,version_key) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (document_id,target_key) REFERENCES content_history_versions(document_id,version_key) DEFERRABLE INITIALLY DEFERRED,
  CHECK (json_extract(metadata,'$.kind')='baseline' OR previous_key IS NOT NULL)
);
