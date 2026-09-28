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

-- 知识地图（卡片图谱的离线结果）：由主进程按「显式链接 + 语义近邻」离线计算，
-- 图谱打开时直接读取。属于可再生的派生数据，丢了会自动重建，因此放在索引库。
CREATE TABLE IF NOT EXISTS knowledge_map_nodes (
        card_id INTEGER PRIMARY KEY,
        x REAL NOT NULL,
        y REAL NOT NULL,
        topic INTEGER NOT NULL DEFAULT -1,
        subtopic INTEGER NOT NULL DEFAULT -1,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS knowledge_map_topics (
        id INTEGER PRIMARY KEY,
        parent INTEGER NOT NULL DEFAULT -1,
        label TEXT NOT NULL,
        color_slot INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0
      );
