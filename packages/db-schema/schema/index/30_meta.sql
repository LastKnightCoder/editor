-- 索引库元数据表
CREATE TABLE IF NOT EXISTS vec_index_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      );
CREATE TABLE IF NOT EXISTS index_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      );
