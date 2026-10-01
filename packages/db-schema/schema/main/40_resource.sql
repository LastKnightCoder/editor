-- 资源域表
CREATE TABLE IF NOT EXISTS web_link (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN ('remote', 'local'))
      );
CREATE TABLE IF NOT EXISTS web_clip (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        content_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL
      );
CREATE TABLE IF NOT EXISTS web_note (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        project_item_id INTEGER NOT NULL,
        content_id INTEGER NOT NULL,
        title TEXT NOT NULL
      );
CREATE TABLE IF NOT EXISTS web_view_preference (
        project_item_id INTEGER PRIMARY KEY,
        preferred_content_id INTEGER
      );
CREATE TABLE IF NOT EXISTS entity_lineage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        src_kind TEXT NOT NULL,
        src_id TEXT NOT NULL,
        src_anchor TEXT,
        dst_kind TEXT NOT NULL,
        dst_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        create_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS resource_sync_blacklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL UNIQUE,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS publish_selections (
        id INTEGER PRIMARY KEY,
        content_type TEXT NOT NULL,
        content_id INTEGER NOT NULL,
        parent_path TEXT DEFAULT '',
        selected INTEGER DEFAULT 1,
        update_time INTEGER NOT NULL,
        UNIQUE(content_type, content_id)
      );
CREATE TABLE IF NOT EXISTS publish_history (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        content_hash TEXT NOT NULL,
        source_type TEXT,
        source_id INTEGER,
        publish_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS transcriptions (
        id INTEGER PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id INTEGER,
        source_path TEXT NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        text TEXT NOT NULL,
        language TEXT NOT NULL,
        language_probability REAL NOT NULL,
        duration REAL NOT NULL,
        processing_time REAL NOT NULL,
        model_size TEXT NOT NULL,
        segments TEXT NOT NULL,
        word_segments TEXT,
        ref_count INTEGER DEFAULT 1
      );
