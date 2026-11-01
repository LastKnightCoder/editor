CREATE TABLE IF NOT EXISTS _tau_device_local (
  id INTEGER PRIMARY KEY CHECK(id=1),
  generation TEXT NOT NULL
);
INSERT OR IGNORE INTO _tau_device_local VALUES(1,'');
CREATE TABLE IF NOT EXISTS _tau_device_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  payload TEXT NOT NULL,
  applying INTEGER NOT NULL DEFAULT 0,
  projection_bytes INTEGER NOT NULL DEFAULT 0,
  metadata_bytes INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS _tau_device_anchor (
  id INTEGER PRIMARY KEY CHECK(id=1),
  payload TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER IF NOT EXISTS _tau_device_anchor_insert AFTER INSERT ON _tau_device_state
WHEN CASE WHEN json_valid(NEW.payload) THEN json_type(NEW.payload,'$.library')='text' AND json_type(NEW.payload,'$.schema')='text' AND json_type(NEW.payload,'$.node')='text' AND json_type(NEW.payload,'$.authority')='text' AND json_type(NEW.payload,'$.epoch')='text' AND json_type(NEW.payload,'$.head')='text' AND json_type(NEW.payload,'$.ackHead')='text' AND json_type(NEW.payload,'$.ackSeq')='integer' AND json_extract(NEW.payload,'$.ackSeq')>=0 AND json_type(NEW.payload,'$.revision')='integer' AND json_extract(NEW.payload,'$.revision')>=0 AND json_type(NEW.payload,'$.enabled') IN ('true','false') ELSE 0 END
BEGIN INSERT INTO _tau_device_anchor(id,payload) VALUES(1,NEW.payload) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload; END;
CREATE TRIGGER IF NOT EXISTS _tau_device_anchor_update AFTER UPDATE OF payload ON _tau_device_state
WHEN CASE WHEN json_valid(NEW.payload) THEN json_type(NEW.payload,'$.library')='text' AND json_type(NEW.payload,'$.schema')='text' AND json_type(NEW.payload,'$.node')='text' AND json_type(NEW.payload,'$.authority')='text' AND json_type(NEW.payload,'$.epoch')='text' AND json_type(NEW.payload,'$.head')='text' AND json_type(NEW.payload,'$.ackHead')='text' AND json_type(NEW.payload,'$.ackSeq')='integer' AND json_extract(NEW.payload,'$.ackSeq')>=0 AND json_type(NEW.payload,'$.revision')='integer' AND json_extract(NEW.payload,'$.revision')>=0 AND json_type(NEW.payload,'$.enabled') IN ('true','false') ELSE 0 END
BEGIN INSERT INTO _tau_device_anchor(id,payload) VALUES(1,NEW.payload) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload; END;
CREATE TABLE IF NOT EXISTS _tau_device_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_key TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  phase INTEGER NOT NULL DEFAULT 0,
  integrity TEXT
);
CREATE TRIGGER IF NOT EXISTS _tau_device_log_integrity AFTER INSERT ON _tau_device_log
BEGIN UPDATE _tau_device_log SET integrity=json_array(NEW.seq,NEW.table_name,NEW.row_key||'',NEW.before_json||'',NEW.after_json||'',NEW.phase) WHERE seq=NEW.seq; END;
CREATE TRIGGER IF NOT EXISTS _tau_device_projection_bytes AFTER INSERT ON _tau_device_log
BEGIN UPDATE _tau_device_state SET
  pending_count=pending_count+1,
  projection_bytes=projection_bytes+CASE WHEN NEW.phase=1 THEN coalesce(length(CAST(NEW.before_json AS BLOB)),0)+coalesce(length(CAST(NEW.after_json AS BLOB)),0)+length(CAST(json_array(NEW.seq,NEW.table_name,NEW.row_key||'',NEW.before_json||'',NEW.after_json||'',NEW.phase) AS BLOB)) ELSE 0 END,
  metadata_bytes=metadata_bytes+CASE WHEN NEW.phase=0 AND NEW.table_name NOT IN ('_document','_json') THEN length(NEW.row_key)+coalesce(length(CAST(NEW.before_json AS BLOB)),0)+coalesce(length(CAST(NEW.after_json AS BLOB)),0)+length(CAST(json_array(NEW.seq,NEW.table_name,NEW.row_key||'',NEW.before_json||'',NEW.after_json||'',NEW.phase) AS BLOB)) ELSE 0 END
  WHERE id=1; END;
CREATE TABLE IF NOT EXISTS _tau_device_documents (
  content_id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL,
  baseline_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  state TEXT NOT NULL,
  paths TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  metric_rules TEXT NOT NULL,
  checksum TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS _tau_device_sequence AFTER INSERT ON _tau_device_log
BEGIN UPDATE _tau_device_anchor SET sequence=max(sequence,NEW.seq) WHERE id=1; END;
CREATE TABLE IF NOT EXISTS _tau_device_json_intents (
  content_id INTEGER PRIMARY KEY,
  base_entry TEXT NOT NULL,
  target_content TEXT NOT NULL,
  target_contracts TEXT NOT NULL,
  token TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS _tau_device_json_content AFTER UPDATE OF content ON contents
WHEN OLD.content IS NOT NEW.content AND (SELECT CASE WHEN json_valid(payload) THEN applying IN (0,3) AND json_extract(payload,'$.enabled')=1 ELSE 0 END FROM _tau_device_state WHERE id=1)
AND EXISTS(SELECT 1 FROM _tau_device_documents WHERE content_id=NEW.id)
BEGIN
  INSERT INTO _tau_device_json_intents SELECT NEW.id,
    json_object('contentId',d.content_id,'documentId',d.document_id,'baselineId',d.baseline_id,'epoch',d.epoch,'state',d.state,'paths',json(CASE WHEN json_valid(d.paths) THEN d.paths ELSE '{}' END),'updatedAt',d.updated_at,'metricRules',json(CASE WHEN json_valid(d.metric_rules) THEN d.metric_rules ELSE '[]' END)),
    NEW.content,c.contracts,lower(hex(randomblob(16))) FROM _tau_device_documents d JOIN content_documents c ON c.content_id=d.content_id WHERE d.content_id=NEW.id
  ON CONFLICT(content_id) DO UPDATE SET target_content=excluded.target_content,target_contracts=excluded.target_contracts,token=excluded.token;
  INSERT INTO _tau_device_log(table_name,row_key,after_json) SELECT '_json',json_array(NEW.id),'{}' WHERE coalesce((SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'),0)<9007199254740990;
END;
CREATE TRIGGER IF NOT EXISTS _tau_device_json_contracts AFTER UPDATE OF contracts ON content_documents
WHEN OLD.contracts IS NOT NEW.contracts AND (SELECT CASE WHEN json_valid(payload) THEN applying IN (0,3) AND json_extract(payload,'$.enabled')=1 ELSE 0 END FROM _tau_device_state WHERE id=1)
AND EXISTS(SELECT 1 FROM _tau_device_documents WHERE content_id=NEW.content_id)
BEGIN
  INSERT INTO _tau_device_json_intents SELECT NEW.content_id,
    json_object('contentId',d.content_id,'documentId',d.document_id,'baselineId',d.baseline_id,'epoch',d.epoch,'state',d.state,'paths',json(CASE WHEN json_valid(d.paths) THEN d.paths ELSE '{}' END),'updatedAt',d.updated_at,'metricRules',json(CASE WHEN json_valid(d.metric_rules) THEN d.metric_rules ELSE '[]' END)),
    c.content,NEW.contracts,lower(hex(randomblob(16))) FROM _tau_device_documents d JOIN contents c ON c.id=d.content_id WHERE d.content_id=NEW.content_id
  ON CONFLICT(content_id) DO UPDATE SET target_content=excluded.target_content,target_contracts=excluded.target_contracts,token=excluded.token;
  INSERT INTO _tau_device_log(table_name,row_key,after_json) SELECT '_json',json_array(NEW.content_id),'{}' WHERE coalesce((SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'),0)<9007199254740990;
END;
CREATE TABLE IF NOT EXISTS _tau_device_history (
  ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  integrity TEXT
);
CREATE TRIGGER IF NOT EXISTS _tau_device_history_integrity AFTER INSERT ON _tau_device_history
BEGIN UPDATE _tau_device_history SET integrity=NEW.payload WHERE ordinal=NEW.ordinal; END;
CREATE TABLE IF NOT EXISTS _tau_device_receipts (
  node TEXT PRIMARY KEY,
  sequence INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  outcome TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS _tau_device_branches (
  id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS _tau_device_note_copies (
  id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  payload TEXT NOT NULL
);
