-- 统一数据库索引库 schema（不包含 vec_documents，运行时动态创建）
-- 请优先修改 schema/index/*.sql

-- 索引库基础 PRAGMA
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 倒排索引表
CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
        prefixed_id,
        update_time,
        content,
        type,
        title,
        chunk_index,
        tokenize='porter unicode61'
      );

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
