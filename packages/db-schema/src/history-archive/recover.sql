CREATE TABLE IF NOT EXISTS history_cache.library_history_backup (
  cache_id TEXT NOT NULL, sequence INTEGER NOT NULL, version_key TEXT NOT NULL,
  previous_key TEXT,target_key TEXT,checkpoint INTEGER NOT NULL,metadata TEXT NOT NULL,state BLOB NOT NULL,
  PRIMARY KEY(cache_id,version_key)
);
WITH missing AS (
  SELECT d.document_id,b.rowid AS backup_row,ROW_NUMBER() OVER(PARTITION BY d.document_id ORDER BY b.rowid) ordinal
  FROM temp.history_documents d JOIN history_cache.library_history_backup b USING(cache_id)
  WHERE NOT EXISTS(SELECT 1 FROM content_history_versions v WHERE v.document_id=d.document_id AND v.version_key=b.version_key)
), heads AS MATERIALIZED (
  SELECT d.document_id,(SELECT MAX(v.sequence) FROM content_history_versions v WHERE v.document_id=d.document_id) AS seq FROM temp.history_documents d
)
INSERT INTO content_history_versions(document_id,sequence,version_key,previous_key,target_key,checkpoint,metadata,state)
SELECT m.document_id,coalesce(h.seq,-1)+m.ordinal,b.version_key,b.previous_key,b.target_key,b.checkpoint,b.metadata,b.state
FROM missing m JOIN history_cache.library_history_backup b ON b.rowid=m.backup_row JOIN heads h USING(document_id);
