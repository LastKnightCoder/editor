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
            category TEXT DEFAULT 'permanent', content_id INTEGER, is_top INTEGER DEFAULT 0, podcast_id INTEGER DEFAULT NULL);
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
CREATE TABLE IF NOT EXISTS audio_notes (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        meta_info TEXT NOT NULL,
        description TEXT DEFAULT '',
        transcript TEXT DEFAULT '',
        transcript_segments TEXT DEFAULT '',
        transcript_word_segments TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        highlights TEXT DEFAULT '[]',
        insights TEXT DEFAULT '',
        speakers TEXT DEFAULT '[]',
        chapters TEXT DEFAULT '[]'
      );
CREATE TABLE IF NOT EXISTS audio_note_item (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        audio_note_id INTEGER NOT NULL,
        content_id INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT ''
      );
