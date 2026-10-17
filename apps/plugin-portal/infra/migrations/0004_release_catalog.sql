-- 目录查询需要逐版本比较兼容性，资料列避免每次解析含 README 的 content_json。
ALTER TABLE releases ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE releases ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE releases ADD COLUMN min_app_version TEXT NOT NULL DEFAULT '';
UPDATE releases SET
  name=json_extract(content_json,'$.manifest.name'),
  description=json_extract(content_json,'$.manifest.description'),
  min_app_version=json_extract(content_json,'$.manifest.minAppVersion');
