-- 已建立来源基线的白板文档；页表只存投影，完整二进制用于从库快照恢复同一 CRDT。
CREATE TABLE IF NOT EXISTS whiteboard_documents (
  document_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  baseline_id TEXT NOT NULL,
  epoch INTEGER NOT NULL CHECK(epoch >= 0),
  board_id INTEGER UNIQUE REFERENCES white_boards(id) ON DELETE RESTRICT,
  board_created_at INTEGER,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  revision_hash TEXT NOT NULL,
  creation_hash TEXT NOT NULL,
  state BLOB NOT NULL,
  contracts TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  create_time INTEGER NOT NULL,
  update_time INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS whiteboard_document_pages (
  document_id TEXT NOT NULL REFERENCES whiteboard_documents(document_id) ON DELETE RESTRICT,
  page_id TEXT NOT NULL,
  content_id INTEGER NOT NULL UNIQUE REFERENCES white_board_contents(id) ON DELETE RESTRICT,
  content_created_at INTEGER NOT NULL,
  visible INTEGER NOT NULL CHECK(visible IN (0,1)),
  page_index INTEGER NOT NULL,
  PRIMARY KEY(document_id, page_id)
);
CREATE TABLE IF NOT EXISTS whiteboard_entity_relations (
  document_id TEXT NOT NULL REFERENCES whiteboard_documents(document_id) ON DELETE RESTRICT,
  root_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  source_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  PRIMARY KEY(document_id, root_id, node_id, slot)
);
CREATE INDEX IF NOT EXISTS idx_whiteboard_document_pages_document ON whiteboard_document_pages(document_id, visible, page_index);
CREATE INDEX IF NOT EXISTS idx_whiteboard_entity_relations_target ON whiteboard_entity_relations(source_id, entity_kind, entity_id);
