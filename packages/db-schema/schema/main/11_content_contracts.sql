-- 身份基线随完整库快照传播，不使用本机库名推断同源。
CREATE TABLE IF NOT EXISTS library_identity (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  source_id TEXT NOT NULL UNIQUE,
  baseline_id TEXT NOT NULL,
  confirmed_snapshot TEXT,
  create_time INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS content_documents (
  content_id INTEGER PRIMARY KEY REFERENCES contents(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL UNIQUE,
  format_version INTEGER NOT NULL,
  contracts TEXT NOT NULL,
  revision TEXT NOT NULL,
  migration_operation_id TEXT,
  migration_receipt TEXT
);
CREATE TABLE IF NOT EXISTS entity_identities (
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  retired_at INTEGER,
  PRIMARY KEY(entity_kind, entity_id)
);
CREATE TABLE IF NOT EXISTS content_entity_relations (
  document_id TEXT NOT NULL REFERENCES content_documents(document_id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  source_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  PRIMARY KEY(document_id, node_id, slot)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_identities_active
  ON entity_identities(entity_kind, local_id) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_content_entity_relations_target
  ON content_entity_relations(source_id, entity_kind, entity_id);
