-- 两端共用的主库基线；版本与 SQL 指纹由建库事务写入。
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
