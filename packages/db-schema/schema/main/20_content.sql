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
        , title TEXT, group_id INTEGER, archived INTEGER DEFAULT 0, parent_chat_id INTEGER, branch_index INTEGER DEFAULT 0, order_num INTEGER, message_schema_version INTEGER DEFAULT 3, title_dirty INTEGER DEFAULT 0, agent_type TEXT DEFAULT 'local', agent_session_id TEXT);
CREATE TABLE IF NOT EXISTS question_group (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        color TEXT,
        sort_index INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS chat_run (
        run_id TEXT PRIMARY KEY,
        session_key TEXT NOT NULL,
        source TEXT NOT NULL,
        chat_id INTEGER NOT NULL,
        agent_type TEXT NOT NULL DEFAULT 'local',
        status TEXT NOT NULL,
        request_payload TEXT NOT NULL,
        user_message_client_id TEXT NOT NULL,
        assistant_message_client_id TEXT NOT NULL,
        agent_session_id TEXT,
        attempt INTEGER NOT NULL DEFAULT 0,
        assistant_snapshot TEXT NOT NULL DEFAULT '',
        reasoning_snapshot TEXT NOT NULL DEFAULT '',
        tool_snapshot TEXT NOT NULL DEFAULT '[]',
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        question_content TEXT,
        answers TEXT DEFAULT '[]'
      , group_id INTEGER, sort_index INTEGER NOT NULL DEFAULT 0, resolved_time INTEGER, status TEXT NOT NULL DEFAULT 'not_started', description TEXT);
-- 问题的探究材料：多态关联（target_type = card | article | project_item | project | white_board | answer；
-- answer 的 target_id 为 contents.id，其余为各实体表主键）。content_id = 本关联持有引用计数的 contents.id
-- （卡片 / 文章 / 项目文档 / 独立答案有值，项目与白板为 NULL），目标实体被删后仍可据此释放引用。
CREATE TABLE IF NOT EXISTS question_link (
        id INTEGER PRIMARY KEY,
        question_id INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        content_id INTEGER,
        sort_index INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL
      );
-- 问题的探究轨迹：type = create | status | link | unlink | note，payload 为 JSON
CREATE TABLE IF NOT EXISTS question_event (
        id INTEGER PRIMARY KEY,
        question_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        create_time INTEGER NOT NULL
      );
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
