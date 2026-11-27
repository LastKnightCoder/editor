-- 物理删除即退役稳定身份，数值主键和创建时间同时复用也不能误读新实体。
CREATE TRIGGER IF NOT EXISTS trg_entity_identity_white_board_contents_delete
AFTER DELETE ON white_board_contents
BEGIN
  UPDATE entity_identities SET retired_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE entity_kind = 'whiteboard-content' AND local_id = OLD.id AND retired_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS trg_entity_identity_data_tables_delete
AFTER DELETE ON data_tables
BEGIN
  UPDATE entity_identities SET retired_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE entity_kind = 'data-table' AND local_id = OLD.id AND retired_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS trg_entity_identity_project_item_delete
AFTER DELETE ON project_item
BEGIN
  UPDATE entity_identities SET retired_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE entity_kind = 'project-item' AND local_id = OLD.id AND retired_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS trg_entity_identity_cards_delete
AFTER DELETE ON cards
BEGIN
  UPDATE entity_identities SET retired_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE entity_kind = 'card' AND local_id = OLD.id AND retired_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS trg_entity_identity_articles_delete
AFTER DELETE ON articles
BEGIN
  UPDATE entity_identities SET retired_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE entity_kind = 'article' AND local_id = OLD.id AND retired_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS trg_entity_identity_diary_segments_delete
AFTER DELETE ON diary_segments
BEGIN
  UPDATE entity_identities SET retired_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE entity_kind = 'diary-moment' AND local_id = OLD.id AND retired_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS trg_entity_identity_white_boards_delete
AFTER DELETE ON white_boards
BEGIN
  UPDATE entity_identities SET retired_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE entity_kind = 'whiteboard' AND local_id = OLD.id AND retired_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS trg_entity_identity_contents_delete
AFTER DELETE ON contents
BEGIN
  UPDATE entity_identities SET retired_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE entity_kind = 'content' AND local_id = OLD.id AND retired_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS trg_entity_identity_video_notes_delete
AFTER DELETE ON video_notes
BEGIN
  UPDATE entity_identities SET retired_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE entity_kind = 'video-note' AND local_id = OLD.id AND retired_at IS NULL;
END;

-- 旧端可读旧日期与分钟；只改墙钟字段而留下旧 UTC 时刻会产生矛盾。
CREATE TRIGGER IF NOT EXISTS calendar_time_legacy_edit BEFORE UPDATE ON calendar_event
WHEN OLD.start_utc_ms IS NOT NULL AND NEW.start_utc_ms IS OLD.start_utc_ms AND NEW.end_utc_ms IS OLD.end_utc_ms
 AND (NEW.start_date IS NOT OLD.start_date OR COALESCE(NEW.end_date,NEW.start_date) IS NOT COALESCE(OLD.end_date,OLD.start_date) OR NEW.start_time IS NOT OLD.start_time OR NEW.end_time IS NOT OLD.end_time OR NEW.all_day IS NOT OLD.all_day)
BEGIN
  SELECT RAISE(ABORT,'该日程包含时区，请升级 Tau 后再修改时间。');
END;
