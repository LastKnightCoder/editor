-- 数据库 / Vibe Learning 独立模块表
-- 这两个模块原先寄生在 project 表上（project_type = 'data-table' / 'vibe-learning'），
-- 拆分后各自拥有列表实体表。id 与 project 共用 migration_meta:'project:id-seq' 序列，
-- 因为 VL 的磁盘索引库、markdown 目录、chat_session.domain_id 均以该 id 命名。
CREATE TABLE IF NOT EXISTS database_item (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        desc TEXT,
        archived INTEGER DEFAULT 0,
        pinned INTEGER DEFAULT 0,
        data_table_id INTEGER NOT NULL DEFAULT 0,
        last_open_time INTEGER
      );
CREATE TABLE IF NOT EXISTS vibe_learning_project (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        desc TEXT,
        archived INTEGER DEFAULT 0,
        pinned INTEGER DEFAULT 0,
        last_open_time INTEGER,
        last_open_kind TEXT,
        last_open_item_id INTEGER
      );
