-- 正文块是主库中的当前正文，contents.content 仅承载尚未拆块的整篇快照。
CREATE TABLE IF NOT EXISTS content_document_blocks (
  content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  content TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (content_id, block_id)
);
CREATE TABLE IF NOT EXISTS content_document_node_blocks (
  content_id INTEGER NOT NULL,
  node_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  PRIMARY KEY (content_id, node_id),
  FOREIGN KEY (content_id, block_id) REFERENCES content_document_blocks(content_id, block_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS content_document_block_counts (
  content_id INTEGER PRIMARY KEY REFERENCES contents(id) ON DELETE CASCADE,
  rules TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS document_history_entries (
  document_id TEXT NOT NULL REFERENCES content_documents(document_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  operation_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  checkpoint INTEGER NOT NULL,
  byte_count INTEGER NOT NULL,
  metadata TEXT NOT NULL,
  PRIMARY KEY (document_id, sequence),
  UNIQUE (document_id, operation_id)
);
CREATE TABLE IF NOT EXISTS document_history_payloads (
  document_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  part INTEGER NOT NULL,
  state BLOB NOT NULL,
  PRIMARY KEY (document_id, sequence, part),
  FOREIGN KEY (document_id, sequence) REFERENCES document_history_entries(document_id, sequence) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS document_history_operations (
  document_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  revision TEXT NOT NULL,
  PRIMARY KEY (document_id, operation_id),
  FOREIGN KEY (document_id, sequence) REFERENCES document_history_entries(document_id, sequence) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_content_document_blocks_position
  ON content_document_blocks(content_id, position);
CREATE INDEX IF NOT EXISTS idx_content_document_node_blocks_block
  ON content_document_node_blocks(content_id, block_id);

CREATE VIEW IF NOT EXISTS content_snapshots AS
SELECT c.id,c.create_time,c.update_time,
  COALESCE(c.content,(
    SELECT '[' || COALESCE(group_concat(block.content,','),'') || ']'
    FROM (
      SELECT content FROM content_document_blocks
      WHERE content_id=c.id ORDER BY position,block_id
    ) block
  )) AS content,
  c.count,c.ref_count
FROM contents c;

-- 整篇替换使旧分块失效，移动端及其他完整快照写入沿用同一规则。
CREATE TRIGGER IF NOT EXISTS content_document_blocks_reset
AFTER UPDATE OF content ON contents WHEN NEW.content IS NOT NULL
BEGIN
  DELETE FROM content_document_blocks WHERE content_id=NEW.id;
  DELETE FROM content_document_block_counts WHERE content_id=NEW.id;
END;
