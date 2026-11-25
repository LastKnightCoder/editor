-- 正文任务身份与正文主库投影同事务更新；查询索引不是可靠变化来源。
CREATE TABLE IF NOT EXISTS document_task_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  content_created_at INTEGER NOT NULL,
  part_key TEXT NOT NULL,
  task_id TEXT NOT NULL,
  UNIQUE(content_id,content_created_at,part_key,task_id)
);
CREATE INDEX IF NOT EXISTS idx_document_task_identity_content ON document_task_identities(content_id,part_key);
CREATE INDEX IF NOT EXISTS idx_document_task_identity_task ON document_task_identities(content_id,content_created_at,task_id);
CREATE TABLE IF NOT EXISTS document_task_projection_state (
  id TEXT PRIMARY KEY CHECK(id='main'),
  version INTEGER NOT NULL,
  after_content_id INTEGER NOT NULL DEFAULT 0,
  ready INTEGER NOT NULL DEFAULT 0,
  epoch TEXT NOT NULL DEFAULT (lower(hex(randomblob(16))))
) WITHOUT ROWID;
INSERT OR IGNORE INTO document_task_projection_state(id,version) VALUES('main',1);
CREATE TABLE IF NOT EXISTS document_task_projection_errors (
  content_id INTEGER NOT NULL,
  part_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY(content_id,part_key)
) WITHOUT ROWID;

CREATE VIEW IF NOT EXISTS document_task_projection_parts AS
SELECT id AS content_id,create_time AS content_created_at,'' AS part_key,content FROM contents WHERE content IS NOT NULL
UNION ALL
SELECT b.content_id,c.create_time,b.block_id,b.content FROM content_document_blocks b JOIN contents c ON c.id=b.content_id WHERE c.content IS NULL;
CREATE VIEW IF NOT EXISTS document_task_projection_candidates AS
SELECT p.content_id,p.content_created_at,p.part_key,CAST(json_extract(j.value,'$.taskId') AS TEXT) AS task_id
FROM document_task_projection_parts p,json_tree(CASE WHEN json_valid(p.content) THEN p.content ELSE '[]' END) j
WHERE j.type='object' AND CASE WHEN j.type='object' THEN json_extract(j.value,'$.type') END='check-list-item'
AND CASE WHEN j.type='object' THEN json_type(j.value,'$.taskId') END='text'
AND CASE WHEN j.type='object' THEN length(json_extract(j.value,'$.taskId')) END>0;
CREATE VIEW IF NOT EXISTS document_task_invalid_parts AS
SELECT content_id,part_key,'invalid task projection' AS reason FROM document_task_projection_parts p
WHERE NOT json_valid(p.content) OR json_type(CASE WHEN json_valid(p.content) THEN p.content ELSE 'null' END) NOT IN ('array','object')
OR EXISTS(SELECT 1 FROM json_tree(CASE WHEN json_valid(p.content) THEN p.content ELSE '[]' END) j
WHERE j.type='object' AND CASE WHEN j.type='object' THEN json_extract(j.value,'$.type') END='check-list-item'
AND (CASE WHEN j.type='object' THEN json_type(j.value,'$.taskId') END IS NOT 'text' OR CASE WHEN j.type='object' THEN length(json_extract(j.value,'$.taskId')) END=0))
OR EXISTS(SELECT 1 FROM document_task_projection_candidates t WHERE t.content_id=p.content_id AND t.part_key=p.part_key GROUP BY task_id HAVING COUNT(*)>1);
CREATE VIEW IF NOT EXISTS document_task_source_contents AS
SELECT content_id FROM cards WHERE content_id IS NOT NULL
UNION ALL SELECT content_id FROM articles WHERE is_delete=0 AND content_id IS NOT NULL
UNION ALL SELECT content_id FROM project_item WHERE content_id IS NOT NULL
UNION ALL SELECT s.content_id FROM diary_segments s JOIN diary_entries d ON d.id=s.diary_id
UNION ALL SELECT content_id FROM diary_entries WHERE content_id IS NOT NULL;
CREATE VIEW IF NOT EXISTS document_task_visible_identities AS
SELECT i.* FROM document_task_identities i JOIN contents c ON c.id=i.content_id AND c.create_time=i.content_created_at
WHERE EXISTS(SELECT 1 FROM document_task_source_contents s WHERE s.content_id=i.content_id)
AND NOT EXISTS(SELECT 1 FROM doc_task_settings s WHERE s.content_id=i.content_id AND (s.kind='excluded' OR (s.kind='promoted' AND s.task_id=i.task_id)));

CREATE TRIGGER IF NOT EXISTS dc_document_task_identity_insert AFTER INSERT ON document_task_identities BEGIN
INSERT INTO data_change_log(domain,entity_id,operation,action) VALUES('todo',(CASE WHEN instr(NEW.task_id,'@')>0 OR substr(NEW.task_id,1,1)='~' OR instr(NEW.task_id,char(10))>0 OR instr(NEW.task_id,char(13))>0 OR instr(NEW.task_id,char(8232))>0 OR instr(NEW.task_id,char(8233))>0 THEN 'document:v2:'||NEW.content_id||':'||NEW.content_created_at||':'||hex(CAST(NEW.task_id AS BLOB)) ELSE 'document:'||NEW.content_id||':'||NEW.content_created_at||':'||NEW.task_id END),'upsert','created');
DELETE FROM document_task_projection_errors WHERE content_id=NEW.content_id AND part_key='!duplicate/'||NEW.task_id;
INSERT INTO document_task_projection_errors SELECT NEW.content_id,'!duplicate/'||NEW.task_id,'duplicate task identity'
WHERE (SELECT COUNT(*) FROM document_task_identities WHERE content_id=NEW.content_id AND content_created_at=NEW.content_created_at AND task_id=NEW.task_id)>1;
END;
CREATE TRIGGER IF NOT EXISTS dc_document_task_identity_delete AFTER DELETE ON document_task_identities BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) VALUES('todo',(CASE WHEN instr(OLD.task_id,'@')>0 OR substr(OLD.task_id,1,1)='~' OR instr(OLD.task_id,char(10))>0 OR instr(OLD.task_id,char(13))>0 OR instr(OLD.task_id,char(8232))>0 OR instr(OLD.task_id,char(8233))>0 THEN 'document:v2:'||OLD.content_id||':'||OLD.content_created_at||':'||hex(CAST(OLD.task_id AS BLOB)) ELSE 'document:'||OLD.content_id||':'||OLD.content_created_at||':'||OLD.task_id END),'delete');
DELETE FROM document_task_projection_errors WHERE content_id=OLD.content_id AND part_key='!duplicate/'||OLD.task_id;
INSERT INTO document_task_projection_errors SELECT OLD.content_id,'!duplicate/'||OLD.task_id,'duplicate task identity'
WHERE (SELECT COUNT(*) FROM document_task_identities WHERE content_id=OLD.content_id AND content_created_at=OLD.content_created_at AND task_id=OLD.task_id)>1;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_contents_insert AFTER INSERT ON contents
BEGIN
DELETE FROM document_task_projection_errors WHERE content_id=NEW.id AND part_key='';
INSERT INTO document_task_projection_errors SELECT content_id,part_key,reason FROM document_task_invalid_parts WHERE content_id=NEW.id AND part_key='';
DELETE FROM document_task_identities WHERE content_id=NEW.id AND part_key='' AND NOT EXISTS(SELECT 1 FROM document_task_invalid_parts WHERE content_id=NEW.id AND part_key='') AND (content_created_at IS NOT (SELECT create_time FROM contents WHERE id=NEW.id) OR task_id NOT IN (SELECT task_id FROM document_task_projection_candidates WHERE content_id=NEW.id AND part_key=''));
INSERT OR IGNORE INTO document_task_identities(content_id,content_created_at,part_key,task_id)
SELECT content_id,content_created_at,part_key,task_id FROM document_task_projection_candidates WHERE content_id=NEW.id AND part_key='' AND NOT EXISTS(SELECT 1 FROM document_task_invalid_parts WHERE content_id=NEW.id AND part_key='');
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_contents_update AFTER UPDATE ON contents WHEN OLD.content IS NOT NEW.content OR OLD.create_time IS NOT NEW.create_time
BEGIN
DELETE FROM document_task_projection_errors WHERE content_id=NEW.id AND part_key='';
INSERT INTO document_task_projection_errors SELECT content_id,part_key,reason FROM document_task_invalid_parts WHERE content_id=NEW.id AND part_key='';
DELETE FROM document_task_identities WHERE content_id=NEW.id AND part_key='' AND NOT EXISTS(SELECT 1 FROM document_task_invalid_parts WHERE content_id=NEW.id AND part_key='') AND (content_created_at IS NOT (SELECT create_time FROM contents WHERE id=NEW.id) OR task_id NOT IN (SELECT task_id FROM document_task_projection_candidates WHERE content_id=NEW.id AND part_key=''));
INSERT OR IGNORE INTO document_task_identities(content_id,content_created_at,part_key,task_id)
SELECT content_id,content_created_at,part_key,task_id FROM document_task_projection_candidates WHERE content_id=NEW.id AND part_key='' AND NOT EXISTS(SELECT 1 FROM document_task_invalid_parts WHERE content_id=NEW.id AND part_key='');
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_contents_split AFTER UPDATE OF content ON contents WHEN OLD.content IS NOT NULL AND NEW.content IS NULL
BEGIN
INSERT OR IGNORE INTO document_task_projection_errors SELECT content_id,part_key,reason FROM document_task_invalid_parts WHERE content_id=NEW.id;
INSERT OR IGNORE INTO document_task_identities(content_id,content_created_at,part_key,task_id)
SELECT p.content_id,p.content_created_at,p.part_key,p.task_id FROM document_task_projection_candidates p
WHERE p.content_id=NEW.id AND NOT EXISTS(SELECT 1 FROM document_task_projection_errors e WHERE e.content_id=p.content_id AND e.part_key=p.part_key);
END;
CREATE TRIGGER IF NOT EXISTS dc_task_content_document_blocks_insert AFTER INSERT ON content_document_blocks
BEGIN
DELETE FROM document_task_projection_errors WHERE content_id=NEW.content_id AND part_key=NEW.block_id;
INSERT INTO document_task_projection_errors SELECT content_id,part_key,reason FROM document_task_invalid_parts WHERE content_id=NEW.content_id AND part_key=NEW.block_id;
DELETE FROM document_task_identities WHERE content_id=NEW.content_id AND part_key=NEW.block_id AND NOT EXISTS(SELECT 1 FROM document_task_invalid_parts WHERE content_id=NEW.content_id AND part_key=NEW.block_id) AND (content_created_at IS NOT (SELECT create_time FROM contents WHERE id=NEW.content_id) OR task_id NOT IN (SELECT task_id FROM document_task_projection_candidates WHERE content_id=NEW.content_id AND part_key=NEW.block_id));
INSERT OR IGNORE INTO document_task_identities(content_id,content_created_at,part_key,task_id)
SELECT content_id,content_created_at,part_key,task_id FROM document_task_projection_candidates WHERE content_id=NEW.content_id AND part_key=NEW.block_id AND NOT EXISTS(SELECT 1 FROM document_task_invalid_parts WHERE content_id=NEW.content_id AND part_key=NEW.block_id);
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_content_document_blocks_update AFTER UPDATE ON content_document_blocks WHEN OLD.content IS NOT NEW.content OR OLD.content_id IS NOT NEW.content_id OR OLD.block_id IS NOT NEW.block_id
BEGIN
DELETE FROM document_task_projection_errors WHERE content_id=NEW.content_id AND part_key=NEW.block_id;
INSERT INTO document_task_projection_errors SELECT content_id,part_key,reason FROM document_task_invalid_parts WHERE content_id=NEW.content_id AND part_key=NEW.block_id;
DELETE FROM document_task_identities WHERE content_id=NEW.content_id AND part_key=NEW.block_id AND NOT EXISTS(SELECT 1 FROM document_task_invalid_parts WHERE content_id=NEW.content_id AND part_key=NEW.block_id) AND (content_created_at IS NOT (SELECT create_time FROM contents WHERE id=NEW.content_id) OR task_id NOT IN (SELECT task_id FROM document_task_projection_candidates WHERE content_id=NEW.content_id AND part_key=NEW.block_id));
INSERT OR IGNORE INTO document_task_identities(content_id,content_created_at,part_key,task_id)
SELECT content_id,content_created_at,part_key,task_id FROM document_task_projection_candidates WHERE content_id=NEW.content_id AND part_key=NEW.block_id AND NOT EXISTS(SELECT 1 FROM document_task_invalid_parts WHERE content_id=NEW.content_id AND part_key=NEW.block_id);
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_contents_delete AFTER DELETE ON contents BEGIN
DELETE FROM document_task_identities WHERE content_id=OLD.id;
DELETE FROM document_task_projection_errors WHERE content_id=OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS dc_task_block_delete AFTER DELETE ON content_document_blocks BEGIN
DELETE FROM document_task_identities WHERE content_id=OLD.content_id AND part_key=OLD.block_id;
DELETE FROM document_task_projection_errors WHERE content_id=OLD.content_id AND part_key=OLD.block_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_cards_insert AFTER INSERT ON cards BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_cards_update AFTER UPDATE ON cards BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id OR i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_cards_delete AFTER DELETE ON cards BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_articles_insert AFTER INSERT ON articles BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_articles_update AFTER UPDATE ON articles BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id OR i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_articles_delete AFTER DELETE ON articles BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_project_item_insert AFTER INSERT ON project_item BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_project_item_update AFTER UPDATE ON project_item BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id OR i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_project_item_delete AFTER DELETE ON project_item BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_diary_segments_insert AFTER INSERT ON diary_segments BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_diary_segments_update AFTER UPDATE ON diary_segments BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id OR i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_diary_segments_delete AFTER DELETE ON diary_segments BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_diary_entries_insert AFTER INSERT ON diary_entries BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.content_id OR i.content_id IN (SELECT content_id FROM diary_segments WHERE diary_id IN (NEW.id));
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_diary_entries_update AFTER UPDATE ON diary_entries BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id OR i.content_id=NEW.content_id OR i.content_id IN (SELECT content_id FROM diary_segments WHERE diary_id IN (OLD.id,NEW.id));
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_diary_entries_delete AFTER DELETE ON diary_entries BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id OR i.content_id IN (SELECT content_id FROM diary_segments WHERE diary_id IN (OLD.id));
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_collaboration_bindings_insert AFTER INSERT ON collaboration_bindings BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_collaboration_bindings_update AFTER UPDATE ON collaboration_bindings BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id OR i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_collaboration_bindings_delete AFTER DELETE ON collaboration_bindings BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_content_ai_meta_insert AFTER INSERT ON content_ai_meta BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_content_ai_meta_update AFTER UPDATE ON content_ai_meta BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id OR i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_content_ai_meta_delete AFTER DELETE ON content_ai_meta BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_doc_task_settings_insert AFTER INSERT ON doc_task_settings BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_doc_task_settings_update AFTER UPDATE ON doc_task_settings BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id OR i.content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_source_doc_task_settings_delete AFTER DELETE ON doc_task_settings BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE i.content_id=OLD.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_group_insert AFTER INSERT ON todo_group BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE 1=1;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_group_update AFTER UPDATE OF title,is_archived,is_system,system_type,id,create_time ON todo_group
WHEN OLD.title IS NOT NEW.title OR OLD.is_archived IS NOT NEW.is_archived OR OLD.is_system IS NOT NEW.is_system OR OLD.system_type IS NOT NEW.system_type OR OLD.id IS NOT NEW.id OR OLD.create_time IS NOT NEW.create_time BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE 1=1;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_group_delete AFTER DELETE ON todo_group BEGIN
INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END FROM document_task_identities i WHERE 1=1;
END;

CREATE TRIGGER IF NOT EXISTS dc_task_block_move AFTER UPDATE OF content_id,block_id ON content_document_blocks
WHEN OLD.content_id IS NOT NEW.content_id OR OLD.block_id IS NOT NEW.block_id
BEGIN
DELETE FROM document_task_identities WHERE content_id=OLD.content_id AND part_key=OLD.block_id;
DELETE FROM document_task_projection_errors WHERE content_id=OLD.content_id AND part_key=OLD.block_id;
INSERT INTO data_change_log(domain,entity_id,operation)
SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),
CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END
FROM document_task_identities i WHERE i.content_id=OLD.content_id;
END;
CREATE TRIGGER IF NOT EXISTS dc_task_block_position AFTER UPDATE OF position ON content_document_blocks WHEN OLD.position IS NOT NEW.position
BEGIN
INSERT INTO data_change_log(domain,entity_id,operation)
SELECT 'todo',(CASE WHEN instr(i.task_id,'@')>0 OR substr(i.task_id,1,1)='~' OR instr(i.task_id,char(10))>0 OR instr(i.task_id,char(13))>0 OR instr(i.task_id,char(8232))>0 OR instr(i.task_id,char(8233))>0 THEN 'document:v2:'||i.content_id||':'||i.content_created_at||':'||hex(CAST(i.task_id AS BLOB)) ELSE 'document:'||i.content_id||':'||i.content_created_at||':'||i.task_id END),
CASE WHEN EXISTS(SELECT 1 FROM document_task_visible_identities v WHERE v.id=i.id) THEN 'upsert' ELSE 'delete' END
FROM document_task_identities i WHERE i.content_id=NEW.content_id;
END;
CREATE TRIGGER IF NOT EXISTS dc_task_content_identity AFTER UPDATE OF create_time ON contents WHEN OLD.create_time IS NOT NEW.create_time
BEGIN
DELETE FROM document_task_identities WHERE content_id=OLD.id AND content_created_at=OLD.create_time;
INSERT OR IGNORE INTO document_task_identities(content_id,content_created_at,part_key,task_id)
SELECT p.content_id,p.content_created_at,p.part_key,p.task_id FROM document_task_projection_candidates p
WHERE p.content_id=NEW.id AND NOT EXISTS(SELECT 1 FROM document_task_projection_errors e WHERE e.content_id=p.content_id AND e.part_key=p.part_key);
END;
