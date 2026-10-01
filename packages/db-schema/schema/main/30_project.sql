-- 项目域表
CREATE TABLE IF NOT EXISTS project (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            title TEXT NOT NULL,
            desc TEXT,
            children TEXT
        , archived INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0, project_type TEXT DEFAULT 'document-tree', data_table_id INTEGER DEFAULT 0, last_open_time INTEGER, last_open_item_id INTEGER);
CREATE TABLE IF NOT EXISTS project_item (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            title TEXT NOT NULL,
            children TEXT,
            parents TEXT,
            projects TEXT,
            ref_type TEXT,
            ref_id INTEGER
        , project_item_type TEXT DEFAULT 'document', content_id INTEGER, white_board_content_id INTEGER, podcast_id INTEGER DEFAULT NULL, tags TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS migration_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
