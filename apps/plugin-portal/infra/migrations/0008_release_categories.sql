-- 分类与关键词随版本存储，目录取最高已发布版本；JSON 数组文本，便于 json_each 筛选。
ALTER TABLE releases ADD COLUMN categories TEXT NOT NULL DEFAULT '[]';
ALTER TABLE releases ADD COLUMN keywords TEXT NOT NULL DEFAULT '[]';
UPDATE releases SET
  categories=COALESCE(json_extract(content_json,'$.manifest.categories'),'[]'),
  keywords=COALESCE(json_extract(content_json,'$.manifest.keywords'),'[]');
