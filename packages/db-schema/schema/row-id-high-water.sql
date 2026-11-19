-- 已知历史编号只用于抬高序列，不改变任何业务记录。
WITH aliases(kind, table_name) AS (VALUES
  ('card','cards'), ('article','articles'), ('content','contents'),
  ('project-item','project_item'), ('document','project_item'),
  ('document_item','project_item'), ('project_item','project_item'),
  ('project','project'), ('database-item','database_item'),
  ('vl-project','vibe_learning_project'), ('vibe-learning-project','vibe_learning_project'),
  ('whiteboard','white_boards'), ('whiteboard-content','white_board_contents'),
  ('data-table','data_tables'), ('data-table-view','data_table_views'),
  ('pdf','pdfs'), ('pdf-annotation','pdf_annotations'), ('pdf-bookmark','pdf_bookmarks'),
  ('daily','daily_notes'), ('daily-note','daily_notes'),
  ('diary','diary_segments'), ('diary-moment','diary_segments'), ('diary-entry','diary_entries'),
  ('video-note','video_notes'), ('web-clip','web_clip'), ('web-note','web_note'),
  ('vl-note','vl_note'), ('vibe-learning-resource','vibe_learning_resources'),
  ('flashcard','flashcards'), ('flashcard-deck','flashcard_decks'),
  ('todo','todo_item'), ('calendar-event','calendar_event'),
  ('plugin-entity','plugin_entities')
), kinds(kind, table_name) AS (
  SELECT name,name FROM sqlite_master WHERE type='table'
  UNION SELECT kind,table_name FROM aliases
), observed(kind, id) AS (
  SELECT operation_content_type,MAX(operation_id) FROM operation GROUP BY operation_content_type
  UNION ALL SELECT entity_kind,MAX(local_id) FROM entity_identities GROUP BY entity_kind
  UNION ALL SELECT src_kind,MAX(CAST(src_id AS INTEGER)) FROM entity_lineage GROUP BY src_kind
  UNION ALL SELECT dst_kind,MAX(CAST(dst_id AS INTEGER)) FROM entity_lineage GROUP BY dst_kind
  UNION ALL SELECT entity,MAX(CAST(entity_id AS INTEGER)) FROM plugin_operations GROUP BY entity
  UNION ALL SELECT to_kind,MAX(CAST(to_id AS INTEGER)) FROM plugin_links GROUP BY to_kind
  UNION ALL SELECT 'plugin-entity',MAX(from_id) FROM plugin_links
  UNION ALL SELECT kind,MAX(CAST(ref_id AS INTEGER)) FROM plugin_ref_grants GROUP BY kind
  UNION ALL SELECT substr(key,13),CAST(value AS INTEGER) FROM migration_meta WHERE key LIKE 'task:id-seq:%'
  UNION ALL SELECT 'document',CAST(value AS INTEGER) FROM migration_meta WHERE key='plugin:project-item-id-seq'
  UNION ALL SELECT 'project',CAST(value AS INTEGER) FROM migration_meta WHERE key='project:id-seq'
  UNION ALL SELECT 'database_item',CAST(value AS INTEGER) FROM migration_meta WHERE key='project:id-seq'
  UNION ALL SELECT 'vibe_learning_project',CAST(value AS INTEGER) FROM migration_meta WHERE key='project:id-seq'
)
SELECT kinds.table_name,MAX(observed.id) AS max_id
FROM observed JOIN kinds USING(kind)
WHERE observed.id > 0
GROUP BY kinds.table_name;
