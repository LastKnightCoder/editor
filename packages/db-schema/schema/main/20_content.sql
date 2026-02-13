-- 内容组织域表
CREATE TABLE IF NOT EXISTS chat_group (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id INTEGER,
        order_index INTEGER DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES chat_group(id) ON DELETE CASCADE
      );
CREATE TABLE IF NOT EXISTS chat_message (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            messages TEXT
        , title TEXT, group_id INTEGER, archived INTEGER DEFAULT 0, prompt_id INTEGER, parent_chat_id INTEGER, branch_index INTEGER DEFAULT 0, order_num INTEGER);
CREATE TABLE IF NOT EXISTS question_group (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        color TEXT,
        sort_index INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        question_content TEXT,
        answers TEXT DEFAULT '[]'
      , group_id INTEGER, sort_index INTEGER NOT NULL DEFAULT 0, resolved_time INTEGER, status TEXT NOT NULL DEFAULT 'not_started', description TEXT);
CREATE TABLE IF NOT EXISTS data_tables (
          id INTEGER PRIMARY KEY,
          create_time INTEGER NOT NULL,
          update_time INTEGER NOT NULL,
          columns TEXT NOT NULL,
          rows TEXT NOT NULL,
          active_view_id INTEGER
        , ref_count INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS data_table_views (
        id INTEGER PRIMARY KEY,
        table_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        config TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
