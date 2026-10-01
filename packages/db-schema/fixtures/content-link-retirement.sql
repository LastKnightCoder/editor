-- content_link 退役前的老库片段：网页条目 → 剪藏解析文档（桌面与移动端迁移测试共用）
CREATE TABLE IF NOT EXISTS content_link (
  id INTEGER PRIMARY KEY,
  create_time INTEGER NOT NULL,
  source_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  target_type TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_link_unique
  ON content_link(source_id, source_type, target_id, target_type);
INSERT INTO content_link VALUES
  (1, 100, 5, 'project_item', 9, 'web_clip'),
  (2, 200, 6, 'project_item', 10, 'web_clip');
