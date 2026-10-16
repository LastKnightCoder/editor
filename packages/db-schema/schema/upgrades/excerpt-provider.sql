-- 摘录提供方升级：为存量摘录补位置与外链、登记提供方名称。桌面开库与移动端 v7→v8 共用。
-- 调用方先补齐 excerpt.location / excerpt.url 两列；以 web 提供方行是否存在作为已完成标记。
-- 全部设备升级后随下一次清洁版删除。
UPDATE excerpt SET location = COALESCE(json_extract(anchor, '$.chapterTitle'), '')
  WHERE source_type = 'weread' AND json_valid(anchor);
UPDATE excerpt SET url = (
    SELECT NULLIF(n.pc_url, '') FROM weread_notebook n WHERE n.book_id = excerpt.source_key
  )
  WHERE source_type = 'weread' AND url IS NULL;
UPDATE excerpt SET url = source_key || '#tau-hl=' || external_id
  WHERE source_type = 'web' AND url IS NULL;
INSERT INTO excerpt_provider (source_type, label, update_time)
  SELECT 'weread', '微信读书', CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE EXISTS (SELECT 1 FROM excerpt WHERE source_type = 'weread')
  ON CONFLICT(source_type) DO NOTHING;
INSERT INTO excerpt_provider (source_type, label, update_time)
  VALUES ('web', '网页', CAST(strftime('%s', 'now') AS INTEGER) * 1000)
  ON CONFLICT(source_type) DO NOTHING;
