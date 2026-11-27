-- 业务变更随领域事务提交；序号不依赖时钟，删除保留原对象身份。
CREATE TABLE IF NOT EXISTS data_change_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
  action TEXT CHECK(action IN ('created','updated','deleted'))
);
-- 未指定动作的关联失效记为 updated，删除始终保留删除动作。
CREATE TRIGGER IF NOT EXISTS dc_log_action AFTER INSERT ON data_change_log WHEN NEW.action IS NULL
BEGIN
  UPDATE data_change_log SET action=CASE WHEN NEW.operation='delete' THEN 'deleted' ELSE 'updated' END WHERE seq=NEW.seq;
END;
CREATE INDEX IF NOT EXISTS idx_data_change_domain_seq ON data_change_log(domain,seq);
CREATE TABLE IF NOT EXISTS data_change_state (
  id TEXT PRIMARY KEY CHECK(id='main'),
  protocol_version INTEGER NOT NULL,
  pruned_through INTEGER NOT NULL DEFAULT 0,
  retention INTEGER NOT NULL DEFAULT 100000 CHECK(retention>0)
) WITHOUT ROWID;
INSERT OR IGNORE INTO data_change_state(id,protocol_version,pruned_through) VALUES('main',1,0);
-- 没有插件读取时也有界保留，清理及边界随原业务事务共同提交。
CREATE TRIGGER IF NOT EXISTS dc_log_retention AFTER INSERT ON data_change_log
WHEN NEW.seq > (SELECT retention FROM data_change_state WHERE id='main')
BEGIN
  UPDATE data_change_state SET pruned_through=MAX(pruned_through,NEW.seq-retention) WHERE id='main';
  DELETE FROM data_change_log WHERE seq<=(SELECT pruned_through FROM data_change_state WHERE id='main');
END;


CREATE TRIGGER IF NOT EXISTS dc_todo_item_insert AFTER INSERT ON todo_item
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo','todo:'||NEW.id||':'||NEW.create_time,'upsert','created';
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.parent_id WHERE NEW.parent_id IS NOT NULL UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_item_update AFTER UPDATE ON todo_item WHEN OLD.id IS NOT NEW.id OR OLD.group_id IS NOT NEW.group_id OR OLD.parent_id IS NOT NEW.parent_id OR OLD.title IS NOT NEW.title OR OLD.description_content_id IS NOT NEW.description_content_id OR OLD.is_completed IS NOT NEW.is_completed OR OLD.due_at IS NOT NEW.due_at OR OLD.completed_at IS NOT NEW.completed_at OR OLD.is_archived IS NOT NEW.is_archived OR OLD.create_time IS NOT NEW.create_time OR OLD.type IS NOT NEW.type OR OLD.start_at IS NOT NEW.start_at OR OLD.remind_before IS NOT NEW.remind_before
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||OLD.id||':'||OLD.create_time,'delete' WHERE OLD.id IS NOT NEW.id OR OLD.create_time IS NOT NEW.create_time;
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo','todo:'||NEW.id||':'||NEW.create_time,'upsert',CASE WHEN OLD.id IS NOT NEW.id OR OLD.create_time IS NOT NEW.create_time THEN 'created' ELSE 'updated' END;
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.parent_id WHERE OLD.parent_id IS NOT NULL UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.parent_id WHERE NEW.parent_id IS NOT NULL UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

-- 独立捕获仅优先级或标签发生变化的更新。
CREATE TRIGGER IF NOT EXISTS dc_todo_item_meta_update
AFTER UPDATE OF priority,tags ON todo_item
WHEN (OLD.priority,OLD.tags) IS NOT (NEW.priority,NEW.tags)
 AND (OLD.id,OLD.group_id,OLD.parent_id,OLD.title,OLD.description_content_id,OLD.is_completed,OLD.due_at,OLD.completed_at,OLD.is_archived,OLD.create_time,OLD.type,OLD.start_at,OLD.remind_before)
  IS (NEW.id,NEW.group_id,NEW.parent_id,NEW.title,NEW.description_content_id,NEW.is_completed,NEW.due_at,NEW.completed_at,NEW.is_archived,NEW.create_time,NEW.type,NEW.start_at,NEW.remind_before)
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation,action) VALUES('todo','todo:'||NEW.id||':'||NEW.create_time,'upsert','updated');
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_item_delete AFTER DELETE ON todo_item
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||OLD.id||':'||OLD.create_time,'delete';
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.parent_id WHERE OLD.parent_id IS NOT NULL UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_calendar_event_insert AFTER INSERT ON calendar_event
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'event',NEW.id||':'||NEW.create_time,'upsert','created';
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_item_id WHERE NEW.todo_item_id IS NOT NULL UNION SELECT todo_item_id FROM todo_calendar_mapping WHERE calendar_event_id=NEW.id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_calendar_event_update AFTER UPDATE ON calendar_event WHEN OLD.id IS NOT NEW.id OR OLD.create_time IS NOT NEW.create_time OR OLD.calendar_id IS NOT NEW.calendar_id OR OLD.title IS NOT NEW.title OR OLD.detail_content_id IS NOT NEW.detail_content_id OR OLD.start_date IS NOT NEW.start_date OR OLD.end_date IS NOT NEW.end_date OR OLD.start_time IS NOT NEW.start_time OR OLD.end_time IS NOT NEW.end_time OR OLD.color IS NOT NEW.color OR OLD.all_day IS NOT NEW.all_day OR OLD.todo_item_id IS NOT NEW.todo_item_id
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',OLD.id||':'||OLD.create_time,'delete' WHERE OLD.id IS NOT NEW.id OR OLD.create_time IS NOT NEW.create_time;
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'event',NEW.id||':'||NEW.create_time,'upsert',CASE WHEN OLD.id IS NOT NEW.id OR OLD.create_time IS NOT NEW.create_time THEN 'created' ELSE 'updated' END;
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_item_id WHERE OLD.todo_item_id IS NOT NULL UNION SELECT todo_item_id FROM todo_calendar_mapping WHERE calendar_event_id=OLD.id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_item_id WHERE NEW.todo_item_id IS NOT NULL UNION SELECT todo_item_id FROM todo_calendar_mapping WHERE calendar_event_id=NEW.id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

-- 旧端开库会重建普通更新触发器；独立捕获仅新版字段发生变化的更新。
CREATE TRIGGER IF NOT EXISTS dc_calendar_event_zone_update
AFTER UPDATE OF start_utc_ms,end_utc_ms,start_time_zone,end_time_zone ON calendar_event
WHEN (OLD.start_utc_ms,OLD.end_utc_ms,OLD.start_time_zone,OLD.end_time_zone)
  IS NOT (NEW.start_utc_ms,NEW.end_utc_ms,NEW.start_time_zone,NEW.end_time_zone)
 AND (OLD.id,OLD.create_time,OLD.calendar_id,OLD.title,OLD.detail_content_id,OLD.start_date,OLD.end_date,OLD.start_time,OLD.end_time,OLD.color,OLD.all_day,OLD.todo_item_id)
  IS (NEW.id,NEW.create_time,NEW.calendar_id,NEW.title,NEW.detail_content_id,NEW.start_date,NEW.end_date,NEW.start_time,NEW.end_time,NEW.color,NEW.all_day,NEW.todo_item_id)
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation,action) VALUES('event',NEW.id||':'||NEW.create_time,'upsert','updated');
END;

CREATE TRIGGER IF NOT EXISTS dc_calendar_event_delete AFTER DELETE ON calendar_event
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',OLD.id||':'||OLD.create_time,'delete';
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_item_id WHERE OLD.todo_item_id IS NOT NULL UNION SELECT todo_item_id FROM todo_calendar_mapping WHERE calendar_event_id=OLD.id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_group_insert AFTER INSERT ON todo_group
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo-list',CAST(NEW.id AS TEXT),'upsert','created';
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT id FROM todo_item WHERE group_id=NEW.id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_group_update AFTER UPDATE ON todo_group WHEN OLD.id IS NOT NEW.id OR OLD.title IS NOT NEW.title OR OLD.color IS NOT NEW.color OR OLD.is_archived IS NOT NEW.is_archived OR OLD.create_time IS NOT NEW.create_time OR OLD.is_system IS NOT NEW.is_system OR OLD.system_type IS NOT NEW.system_type
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo-list',CAST(OLD.id AS TEXT),'delete' WHERE OLD.id IS NOT NEW.id;
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo-list',CAST(NEW.id AS TEXT),'upsert',CASE WHEN OLD.id IS NOT NEW.id THEN 'created' ELSE 'updated' END;
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT id FROM todo_item WHERE group_id=NEW.id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_group_delete AFTER DELETE ON todo_group
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo-list',CAST(OLD.id AS TEXT),'delete';
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT id FROM todo_item WHERE group_id=OLD.id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_calendar_insert AFTER INSERT ON calendar
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'calendar',CAST(NEW.id AS TEXT),'upsert','created';
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE calendar_id=NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS dc_calendar_update AFTER UPDATE ON calendar WHEN OLD.id IS NOT NEW.id OR OLD.create_time IS NOT NEW.create_time OR OLD.title IS NOT NEW.title OR OLD.color IS NOT NEW.color OR OLD.archived IS NOT NEW.archived OR OLD.visible IS NOT NEW.visible OR OLD.group_id IS NOT NEW.group_id
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'calendar',CAST(OLD.id AS TEXT),'delete' WHERE OLD.id IS NOT NEW.id;
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'calendar',CAST(NEW.id AS TEXT),'upsert',CASE WHEN OLD.id IS NOT NEW.id THEN 'created' ELSE 'updated' END;
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE calendar_id=NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS dc_calendar_delete AFTER DELETE ON calendar
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'calendar',CAST(OLD.id AS TEXT),'delete';
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE calendar_id=OLD.id);
END;

CREATE TRIGGER IF NOT EXISTS dc_calendar_group_insert AFTER INSERT ON calendar_group
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'calendar',CAST(c.id AS TEXT),'upsert' FROM calendar c WHERE c.id IN (SELECT id FROM calendar WHERE group_id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.id UNION SELECT g.id FROM calendar_group g JOIN affected a ON g.parent_group_id=a.id) SELECT id FROM affected));
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE calendar_id IN (SELECT id FROM calendar WHERE group_id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.id UNION SELECT g.id FROM calendar_group g JOIN affected a ON g.parent_group_id=a.id) SELECT id FROM affected)));
END;

CREATE TRIGGER IF NOT EXISTS dc_calendar_group_update AFTER UPDATE ON calendar_group WHEN OLD.is_system IS NOT NEW.is_system OR OLD.parent_group_id IS NOT NEW.parent_group_id OR OLD.id IS NOT NEW.id
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'calendar',CAST(c.id AS TEXT),'upsert' FROM calendar c WHERE c.id IN (SELECT id FROM calendar WHERE group_id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.id UNION SELECT g.id FROM calendar_group g JOIN affected a ON g.parent_group_id=a.id) SELECT id FROM affected));
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE calendar_id IN (SELECT id FROM calendar WHERE group_id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.id UNION SELECT g.id FROM calendar_group g JOIN affected a ON g.parent_group_id=a.id) SELECT id FROM affected)));
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'calendar',CAST(c.id AS TEXT),'upsert' FROM calendar c WHERE c.id IN (SELECT id FROM calendar WHERE group_id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.id UNION SELECT g.id FROM calendar_group g JOIN affected a ON g.parent_group_id=a.id) SELECT id FROM affected));
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE calendar_id IN (SELECT id FROM calendar WHERE group_id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.id UNION SELECT g.id FROM calendar_group g JOIN affected a ON g.parent_group_id=a.id) SELECT id FROM affected)));
END;

CREATE TRIGGER IF NOT EXISTS dc_calendar_group_delete AFTER DELETE ON calendar_group
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'calendar',CAST(c.id AS TEXT),'upsert' FROM calendar c WHERE c.id IN (SELECT id FROM calendar WHERE group_id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.id UNION SELECT g.id FROM calendar_group g JOIN affected a ON g.parent_group_id=a.id) SELECT id FROM affected));
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE calendar_id IN (SELECT id FROM calendar WHERE group_id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.id UNION SELECT g.id FROM calendar_group g JOIN affected a ON g.parent_group_id=a.id) SELECT id FROM affected)));
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_recurrence_insert AFTER INSERT ON todo_recurrence
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_recurrence_update AFTER UPDATE ON todo_recurrence WHEN OLD.id IS NOT NEW.id OR OLD.todo_item_id IS NOT NEW.todo_item_id OR OLD.type IS NOT NEW.type OR OLD.interval IS NOT NEW.interval OR OLD.weekdays IS NOT NEW.weekdays OR OLD.month_day IS NOT NEW.month_day OR OLD.year_month IS NOT NEW.year_month OR OLD.year_day IS NOT NEW.year_day OR OLD.exclude_holidays IS NOT NEW.exclude_holidays OR OLD.start_date IS NOT NEW.start_date OR OLD.end_date IS NOT NEW.end_date OR OLD.max_occurrences IS NOT NEW.max_occurrences
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_recurrence_delete AFTER DELETE ON todo_recurrence
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_recurrence_history_insert AFTER INSERT ON todo_recurrence_history
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_recurrence_history_update AFTER UPDATE ON todo_recurrence_history WHEN OLD.series_id IS NOT NEW.series_id OR OLD.todo_item_id IS NOT NEW.todo_item_id OR OLD.todo_created_at IS NOT NEW.todo_created_at OR OLD.effective_date IS NOT NEW.effective_date OR OLD.rule_json IS NOT NEW.rule_json
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_recurrence_history_delete AFTER DELETE ON todo_recurrence_history
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_recurrence_completion_insert AFTER INSERT ON todo_recurrence_completion
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT todo_item_id FROM todo_recurrence WHERE id=NEW.recurrence_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_recurrence_completion_update AFTER UPDATE ON todo_recurrence_completion WHEN OLD.id IS NOT NEW.id OR OLD.recurrence_id IS NOT NEW.recurrence_id OR OLD.scheduled_date IS NOT NEW.scheduled_date OR OLD.completed_at IS NOT NEW.completed_at OR OLD.skipped IS NOT NEW.skipped
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT todo_item_id FROM todo_recurrence WHERE id=OLD.recurrence_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT todo_item_id FROM todo_recurrence WHERE id=NEW.recurrence_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_recurrence_completion_delete AFTER DELETE ON todo_recurrence_completion
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT todo_item_id FROM todo_recurrence WHERE id=OLD.recurrence_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_occurrence_override_insert AFTER INSERT ON todo_occurrence_override
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_occurrence_override_update AFTER UPDATE ON todo_occurrence_override WHEN OLD.todo_item_id IS NOT NEW.todo_item_id OR OLD.todo_created_at IS NOT NEW.todo_created_at OR OLD.series_id IS NOT NEW.series_id OR OLD.occurrence_date IS NOT NEW.occurrence_date OR OLD.state_json IS NOT NEW.state_json
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_occurrence_override_delete AFTER DELETE ON todo_occurrence_override
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_calendar_mapping_insert AFTER INSERT ON todo_calendar_mapping
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT NEW.calendar_event_id);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_calendar_mapping_update AFTER UPDATE ON todo_calendar_mapping WHEN OLD.id IS NOT NEW.id OR OLD.todo_item_id IS NOT NEW.todo_item_id OR OLD.calendar_event_id IS NOT NEW.calendar_event_id OR OLD.sync_type IS NOT NEW.sync_type OR OLD.recurrence_date IS NOT NEW.recurrence_date
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT OLD.calendar_event_id);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT NEW.calendar_event_id);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_calendar_mapping_delete AFTER DELETE ON todo_calendar_mapping
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_item_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT OLD.calendar_event_id);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_note_link_insert AFTER INSERT ON todo_note_link
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_note_link_update AFTER UPDATE ON todo_note_link WHEN OLD.id IS NOT NEW.id OR OLD.todo_id IS NOT NEW.todo_id OR OLD.content_id IS NOT NEW.content_id OR OLD.title IS NOT NEW.title OR OLD.type IS NOT NEW.type OR OLD.sort_index IS NOT NEW.sort_index
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.todo_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_note_link_delete AFTER DELETE ON todo_note_link
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.todo_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
END;

CREATE TRIGGER IF NOT EXISTS dc_doc_task_calendar_link_insert AFTER INSERT ON doc_task_calendar_link
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT NEW.calendar_event_id);
END;

CREATE TRIGGER IF NOT EXISTS dc_doc_task_calendar_link_update AFTER UPDATE ON doc_task_calendar_link WHEN OLD.calendar_event_id IS NOT NEW.calendar_event_id OR OLD.content_id IS NOT NEW.content_id OR OLD.content_created_at IS NOT NEW.content_created_at OR OLD.task_id IS NOT NEW.task_id OR OLD.series_id IS NOT NEW.series_id OR OLD.occurrence_date IS NOT NEW.occurrence_date
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT OLD.calendar_event_id);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT NEW.calendar_event_id);
END;

CREATE TRIGGER IF NOT EXISTS dc_doc_task_calendar_link_delete AFTER DELETE ON doc_task_calendar_link
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT OLD.calendar_event_id);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_schedule_occurrence_insert AFTER INSERT ON todo_schedule_occurrence
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT todo_item_id FROM calendar_event WHERE id=NEW.calendar_event_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT NEW.calendar_event_id);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_schedule_occurrence_update AFTER UPDATE ON todo_schedule_occurrence WHEN OLD.calendar_event_id IS NOT NEW.calendar_event_id OR OLD.series_id IS NOT NEW.series_id OR OLD.occurrence_date IS NOT NEW.occurrence_date
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT todo_item_id FROM calendar_event WHERE id=OLD.calendar_event_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT OLD.calendar_event_id);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT todo_item_id FROM calendar_event WHERE id=NEW.calendar_event_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT NEW.calendar_event_id);
END;

CREATE TRIGGER IF NOT EXISTS dc_todo_schedule_occurrence_delete AFTER DELETE ON todo_schedule_occurrence
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT todo_item_id FROM calendar_event WHERE id=OLD.calendar_event_id UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT OLD.calendar_event_id);
END;

CREATE TRIGGER IF NOT EXISTS dc_item_reminder_insert AFTER INSERT ON item_reminder
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.owner_id WHERE NEW.owner_type='todo' UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT NEW.owner_id WHERE NEW.owner_type='event');
END;

CREATE TRIGGER IF NOT EXISTS dc_item_reminder_update AFTER UPDATE ON item_reminder WHEN OLD.owner_type IS NOT NEW.owner_type OR OLD.owner_id IS NOT NEW.owner_id OR OLD.offset_ms IS NOT NEW.offset_ms
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.owner_id WHERE OLD.owner_type='todo' UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT OLD.owner_id WHERE OLD.owner_type='event');
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT NEW.owner_id WHERE NEW.owner_type='todo' UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT NEW.owner_id WHERE NEW.owner_type='event');
END;

CREATE TRIGGER IF NOT EXISTS dc_item_reminder_delete AFTER DELETE ON item_reminder
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert' FROM todo_item t WHERE t.id IN (WITH RECURSIVE affected(id) AS (SELECT OLD.owner_id WHERE OLD.owner_type='todo' UNION SELECT p.parent_id FROM todo_item p JOIN affected a ON p.id=a.id WHERE p.parent_id IS NOT NULL) SELECT id FROM affected);
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT OLD.owner_id WHERE OLD.owner_type='event');
END;

CREATE TRIGGER IF NOT EXISTS dc_content_documents_insert AFTER INSERT ON content_documents
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE detail_content_id=NEW.content_id);
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert','updated' FROM todo_item t WHERE t.description_content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_content_documents_update AFTER UPDATE ON content_documents WHEN OLD.revision IS NOT NEW.revision OR OLD.contracts IS NOT NEW.contracts OR OLD.format_version IS NOT NEW.format_version
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE detail_content_id=NEW.content_id);
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert','updated' FROM todo_item t WHERE t.description_content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_content_documents_delete AFTER DELETE ON content_documents
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE detail_content_id=OLD.content_id);
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert','updated' FROM todo_item t WHERE t.description_content_id=OLD.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_contents_update AFTER UPDATE ON contents WHEN OLD.content IS NOT NEW.content
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE detail_content_id=NEW.id);
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert','updated' FROM todo_item t WHERE t.description_content_id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS dc_contents_delete AFTER DELETE ON contents
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE detail_content_id=OLD.id);
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert','updated' FROM todo_item t WHERE t.description_content_id=OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS dc_content_document_blocks_insert AFTER INSERT ON content_document_blocks
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE detail_content_id=NEW.content_id);
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert','updated' FROM todo_item t WHERE t.description_content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_content_document_blocks_update AFTER UPDATE ON content_document_blocks WHEN OLD.content IS NOT NEW.content
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE detail_content_id=NEW.content_id);
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert','updated' FROM todo_item t WHERE t.description_content_id=NEW.content_id;
END;

CREATE TRIGGER IF NOT EXISTS dc_content_document_blocks_delete AFTER DELETE ON content_document_blocks
BEGIN
  INSERT INTO data_change_log(domain,entity_id,operation) SELECT 'event',e.id||':'||e.create_time,'upsert' FROM calendar_event e WHERE e.id IN (SELECT id FROM calendar_event WHERE detail_content_id=OLD.content_id);
  INSERT INTO data_change_log(domain,entity_id,operation,action) SELECT 'todo','todo:'||t.id||':'||t.create_time,'upsert','updated' FROM todo_item t WHERE t.description_content_id=OLD.content_id;
END;
