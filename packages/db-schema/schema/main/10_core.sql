-- 核心内容域表
CREATE TABLE IF NOT EXISTS podcasts (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        audio_url TEXT NOT NULL,
        script TEXT,
        duration INTEGER,
        speakers TEXT NOT NULL,
        ref_count INTEGER DEFAULT 0
      , name TEXT, script_lines TEXT);
CREATE TABLE IF NOT EXISTS contents (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        content TEXT,
        count INTEGER DEFAULT 0,
        ref_count INTEGER DEFAULT 0
      );
-- 正文的 AI 元信息（卡片 / 文章 / 项目文档，按 content_id，共用正文的投影共用一份）。
-- meta 为 JSON：{ title, summary, concepts[], claims[] }；schema_ver 低于当前的只补缺字段；
-- text_digest 为生成时正文纯文本的 MinHash 指纹，正文大改才重算；model = providerId/modelId。
-- 正文真正删除时同事务删除，连库对账兜底清理孤儿行。
CREATE TABLE IF NOT EXISTS content_ai_meta (
        content_id INTEGER PRIMARY KEY,
        schema_ver INTEGER NOT NULL,
        text_digest TEXT NOT NULL,
        meta TEXT NOT NULL,
        model TEXT NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
-- 正文的 AI 洞见（用户点「AI 洞见」时生成，按 content_id）：result 为 JSON（lead、marks[]、asks[]，
-- 每条带处理状态 open / linked / questioned / dismissed）；text_digest 为分析时的正文指纹。
-- 删除与孤儿清理同 content_ai_meta。
CREATE TABLE IF NOT EXISTS content_ai_insights (
        content_id INTEGER PRIMARY KEY,
        schema_ver INTEGER NOT NULL,
        text_digest TEXT NOT NULL,
        result TEXT NOT NULL,
        model TEXT NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS knowledge_ai_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        parent_id INTEGER,
        project_id INTEGER,
        label TEXT NOT NULL,
        members TEXT NOT NULL,
        overview TEXT NOT NULL,
        result TEXT NOT NULL,
        increments INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS white_board_contents (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        name TEXT,
        data TEXT,
        ref_count INTEGER DEFAULT 0
      , img_url TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS white_boards (
            id INTEGER PRIMARY KEY NOT NULL,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            tags TEXT,
            title TEXT,
            description TEXT,
            snapshot TEXT
        , white_board_content_ids TEXT DEFAULT '[]', active_white_board_content_id INTEGER DEFAULT NULL);
CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            tags TEXT,
            links TEXT,
            content_id INTEGER, is_top INTEGER DEFAULT 0, podcast_id INTEGER DEFAULT NULL);
CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            tags TEXT,
            links TEXT, banner_bg TEXT DEFAULT '', is_top INTEGER DEFAULT 0, is_delete INTEGER DEFAULT 0, banner_position TEXT DEFAULT 'center', content_id INTEGER, podcast_id INTEGER DEFAULT NULL);
CREATE TABLE IF NOT EXISTS collaboration_bindings (
            content_id INTEGER PRIMARY KEY,
            content_created_at INTEGER NOT NULL,
            server_url TEXT NOT NULL,
            document_id TEXT NOT NULL,
            source_type TEXT,
            source_id INTEGER,
            source_title TEXT,
            FOREIGN KEY(content_id) REFERENCES contents(id));
CREATE TABLE IF NOT EXISTS pdfs (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            tags TEXT,
            content TEXT,
            is_local INTEGER NOT NULL,
            category TEXT DEFAULT 'default',
            file_name TEXT,
            file_path TEXT,
            remote_url TEXT,
            page_count INTEGER,
            last_open_time INTEGER,
            last_page INTEGER
        );
CREATE TABLE IF NOT EXISTS pdf_annotations (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        pdf_id INTEGER NOT NULL,
        page_num INTEGER NOT NULL,
        annotation_payload TEXT NOT NULL,
        color TEXT,
        notes TEXT NOT NULL,
        type TEXT,
        area_data TEXT
      );
CREATE TABLE IF NOT EXISTS pdf_bookmarks (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        pdf_id INTEGER NOT NULL,
        bookmark_payload TEXT NOT NULL
      );
CREATE TABLE IF NOT EXISTS daily_notes (
            id INTEGER PRIMARY KEY,
            date TEXT NOT NULL,
            content_id INTEGER);
CREATE TABLE IF NOT EXISTS diary_entries (
        id INTEGER PRIMARY KEY NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('daily', 'weekly', 'monthly')),
        date TEXT NOT NULL UNIQUE,
        content_id INTEGER,
        weather TEXT,
        mood TEXT,
        tags TEXT DEFAULT '[]',
        word_count INTEGER DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        FOREIGN KEY(content_id) REFERENCES contents(id)
      );
CREATE TABLE IF NOT EXISTS diary_segments (
        id INTEGER PRIMARY KEY NOT NULL,
        diary_id INTEGER NOT NULL,
        content_id INTEGER NOT NULL,
        tags TEXT DEFAULT '[]',
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        FOREIGN KEY(diary_id) REFERENCES diary_entries(id) ON DELETE CASCADE,
        FOREIGN KEY(content_id) REFERENCES contents(id)
      );
CREATE TABLE IF NOT EXISTS diary_tag_settings (
        name TEXT PRIMARY KEY NOT NULL,
        color TEXT NOT NULL,
        sort INTEGER DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS operation (
            id INTEGER PRIMARY KEY,
            operation_time INTEGER NOT NULL,
            operation_id INTEGER,
            operation_content_type TEXT,
            operation_action TEXT
        );
CREATE TABLE IF NOT EXISTS statistic (
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL,
        statistic_type TEXT NOT NULL,
        content TEXT NOT NULL
      );
CREATE TABLE IF NOT EXISTS video_note_item (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        video_note_id INTEGER NOT NULL,
        content_id INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT ''
      );
CREATE TABLE IF NOT EXISTS video_notes (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        meta_info TEXT NOT NULL,
        description TEXT DEFAULT '',
        transcript TEXT DEFAULT ''
      , transcript_segments TEXT DEFAULT '', transcript_word_segments TEXT DEFAULT '', summary TEXT DEFAULT '', highlights TEXT DEFAULT '[]', insights TEXT DEFAULT '');
