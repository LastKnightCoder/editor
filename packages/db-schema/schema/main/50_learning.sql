-- 学习与任务域表
CREATE TABLE IF NOT EXISTS todo_group (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        color TEXT,
        sort_index INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1)),
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      , is_system INTEGER NOT NULL DEFAULT 0, system_type TEXT);
CREATE TABLE IF NOT EXISTS todo_item (
          id INTEGER PRIMARY KEY,
          group_id INTEGER NOT NULL,
          parent_id INTEGER,
          title TEXT NOT NULL,
          description_content_id INTEGER,
          is_completed INTEGER NOT NULL DEFAULT 0 CHECK(is_completed IN (0,1)),
          due_at INTEGER,
          completed_at INTEGER,
          sort_index INTEGER NOT NULL DEFAULT 0,
          is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1)),
          create_time INTEGER NOT NULL,
          update_time INTEGER NOT NULL
        , type TEXT NOT NULL DEFAULT 'normal', start_at INTEGER, remind_before INTEGER);
CREATE TABLE IF NOT EXISTS todo_note_link (
        id INTEGER PRIMARY KEY,
        todo_id INTEGER NOT NULL,
        content_id INTEGER NOT NULL,
        title TEXT,
        type TEXT,
        sort_index INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS todo_recurrence (
        id INTEGER PRIMARY KEY,
        todo_item_id INTEGER NOT NULL UNIQUE,
        type TEXT NOT NULL,
        interval INTEGER NOT NULL DEFAULT 1,
        weekdays TEXT,
        month_day INTEGER,
        year_month INTEGER,
        year_day INTEGER,
        exclude_holidays INTEGER NOT NULL DEFAULT 0,
        start_date INTEGER NOT NULL,
        end_date INTEGER,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      , max_occurrences INTEGER);
CREATE TABLE IF NOT EXISTS todo_recurrence_completion (
        id INTEGER PRIMARY KEY,
        recurrence_id INTEGER NOT NULL,
        scheduled_date INTEGER NOT NULL,
        completed_at INTEGER,
        skipped INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL,
        UNIQUE(recurrence_id, scheduled_date)
      );
CREATE TABLE IF NOT EXISTS todo_calendar_mapping (
        id INTEGER PRIMARY KEY,
        todo_item_id INTEGER NOT NULL,
        calendar_event_id INTEGER NOT NULL,
        sync_type TEXT NOT NULL,
        recurrence_date INTEGER,
        create_time INTEGER NOT NULL,
        UNIQUE(todo_item_id, calendar_event_id, recurrence_date)
      );
-- 文档待办的用户设置（镜像本身在索引库 doc_tasks，可重建；这里是不能丢的用户选择）：
-- excluded = 整篇「本文不收集」（task_id 为空）；promoted = 某一项已转为独立待办 todo_item_id
CREATE TABLE IF NOT EXISTS doc_task_settings (
        id INTEGER PRIMARY KEY,
        content_id INTEGER NOT NULL,
        task_id TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL CHECK(kind IN ('excluded','promoted')),
        todo_item_id INTEGER,
        create_time INTEGER NOT NULL,
        UNIQUE(content_id, task_id, kind)
      );
-- 项目旧名随主库保留，重建镜像与同步下载后仍可完成正文改名。
CREATE TABLE IF NOT EXISTS doc_task_group_names (
        group_id INTEGER NOT NULL,
        group_created_at INTEGER NOT NULL,
        title TEXT NOT NULL,
        PRIMARY KEY(group_id, group_created_at, title)
      );
CREATE TABLE IF NOT EXISTS pomodoro_presets (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        duration_min INTEGER NOT NULL DEFAULT 25,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
        id INTEGER PRIMARY KEY,
        preset_id INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        expected_ms INTEGER,
        focus_ms INTEGER NOT NULL DEFAULT 0,
        pause_total_ms INTEGER NOT NULL DEFAULT 0,
        pause_count INTEGER NOT NULL DEFAULT 0,
        pauses TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        bound_event_id INTEGER,
        bound_todo_id INTEGER,
        bound_title TEXT
      );
CREATE TABLE IF NOT EXISTS pomodoro_calendar_mapping (
        id INTEGER PRIMARY KEY,
        pomodoro_session_id INTEGER NOT NULL,
        calendar_event_id INTEGER NOT NULL,
        create_time INTEGER NOT NULL,
        UNIQUE(pomodoro_session_id, calendar_event_id)
      );
CREATE TABLE IF NOT EXISTS calendar_group (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        is_system INTEGER DEFAULT 0,
        order_index INTEGER DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      , parent_group_id INTEGER DEFAULT NULL);
CREATE TABLE IF NOT EXISTS calendar (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        color TEXT NOT NULL,
        description_content_id INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        pinned INTEGER DEFAULT 0,
        visible INTEGER DEFAULT 1,
        order_index INTEGER DEFAULT 0
      , group_id INTEGER DEFAULT NULL);
CREATE TABLE IF NOT EXISTS calendar_event (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        calendar_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        detail_content_id INTEGER DEFAULT 0,
        start_date INTEGER NOT NULL,
        end_date INTEGER,
        start_time INTEGER,
        end_time INTEGER,
        color TEXT,
        all_day INTEGER DEFAULT 0,
        todo_item_id INTEGER
      );
CREATE TABLE IF NOT EXISTS weread_notebook (
        book_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT,
        cover TEXT,
        intro TEXT,
        category TEXT,
        publisher TEXT,
        isbn TEXT,
        total_words INTEGER,
        rating TEXT,
        book_type INTEGER,
        publish_time TEXT,
        note_count INTEGER DEFAULT 0,
        review_count INTEGER DEFAULT 0,
        bookmark_count INTEGER DEFAULT 0,
        archive_name TEXT,
        last_read_date TEXT,
        url TEXT,
        pc_url TEXT,
        -- 阅读进度相关
        reading_progress REAL DEFAULT 0,
        reading_time INTEGER DEFAULT 0,
        reading_book_date INTEGER DEFAULT 0,
        finished_date INTEGER DEFAULT 0,
        marked_status INTEGER DEFAULT 0,
        total_read_day INTEGER DEFAULT 0,
        continue_read_days INTEGER DEFAULT 0,
        -- 阅读状态：0=未开始，1=进行中，2=已完成
        reading_status INTEGER DEFAULT 0,
        -- synckey 用于增量同步
        synckey_highlights INTEGER,
        synckey_reviews INTEGER,
        synckey_progress INTEGER,
        -- 笔记内容（存储为 JSON）
        chapter_highlights TEXT,
        book_review TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS weread_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER NOT NULL
      );
-- 摘录：来源不是主库行的划线，由提供方写入（内置网页划线 web、插件以插件 ID 为来源类型）。源端删除即软删除，保留引文
CREATE TABLE IF NOT EXISTS excerpt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,            -- 提供方：web 或插件 ID
        source_key TEXT NOT NULL,             -- 来源在提供方内的标识（书 ID、去掉 hash 的 URL…）
        source_title TEXT NOT NULL DEFAULT '',
        external_id TEXT NOT NULL,            -- 条目在提供方内的稳定标识
        quote TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        anchor TEXT,                          -- JSON：提供方私有定位，宿主不解读
        color TEXT,
        source_time INTEGER,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        location TEXT NOT NULL DEFAULT '',    -- 给人看的位置（章节、页码）
        url TEXT                              -- 打开原处的外部链接兜底
      );
-- 摘录提供方：来源名称持久化，插件停用或卸载后、移动端仍可显示
CREATE TABLE IF NOT EXISTS excerpt_provider (
        source_type TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS flashcard_decks (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        cover_color TEXT DEFAULT '#2563eb',
        emoji TEXT DEFAULT '🧠',
        sort_order INTEGER DEFAULT 0,
        meta TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS flashcards (
        id INTEGER PRIMARY KEY,
        deck_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        detail TEXT DEFAULT '',
        data TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        difficulty TEXT DEFAULT 'standard',
        due_time INTEGER NOT NULL,
        last_review_time INTEGER,
        review_count INTEGER DEFAULT 0,
        memory_stability REAL,
        memory_difficulty REAL,
        status TEXT DEFAULT 'new',
        reference_summary TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        FOREIGN KEY(deck_id) REFERENCES flashcard_decks(id)
      );
CREATE TABLE IF NOT EXISTS flashcard_reviews (
        id INTEGER PRIMARY KEY,
        card_id INTEGER NOT NULL,
        deck_id INTEGER NOT NULL,
        rating TEXT NOT NULL,
        review_time INTEGER NOT NULL,
        interval INTEGER NOT NULL,
        stability REAL NOT NULL DEFAULT 0,
        difficulty REAL NOT NULL DEFAULT 0,
        notes TEXT,
        FOREIGN KEY(card_id) REFERENCES flashcards(id),
        FOREIGN KEY(deck_id) REFERENCES flashcard_decks(id)
      );
CREATE TABLE IF NOT EXISTS flashcard_references (
            id INTEGER PRIMARY KEY,
            card_id INTEGER NOT NULL,
            content_id INTEGER NOT NULL,
            ref_type TEXT NOT NULL,
            title TEXT NOT NULL,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL
          );
CREATE TABLE IF NOT EXISTS vibe_learning_resources (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        sort_index INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        name TEXT NOT NULL,
        original_path TEXT NOT NULL,
        markdown_path TEXT,
        resource_type TEXT NOT NULL,
        file_size INTEGER,
        duration INTEGER, source_type TEXT, source_meta_info TEXT, transcript_segments TEXT,
        FOREIGN KEY(project_id) REFERENCES vibe_learning_project(id)
      );
CREATE TABLE IF NOT EXISTS vl_note (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        project_id INTEGER NOT NULL,
        content_id INTEGER NOT NULL,
        title TEXT NOT NULL
      , type TEXT NOT NULL DEFAULT 'note', podcast_id INTEGER DEFAULT NULL);
CREATE TABLE IF NOT EXISTS vl_quiz_set (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        emoji TEXT DEFAULT '📝',
        resource_ids TEXT DEFAULT '[]',
        prompt TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS vl_quiz_item (
        id INTEGER PRIMARY KEY,
        quiz_set_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        detail TEXT DEFAULT '[]',
        data TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        difficulty TEXT DEFAULT 'standard',
        sort_order INTEGER DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        FOREIGN KEY(quiz_set_id) REFERENCES vl_quiz_set(id)
      );
CREATE TABLE IF NOT EXISTS vl_quiz_record (
        id INTEGER PRIMARY KEY,
        quiz_set_id INTEGER NOT NULL,
        project_id INTEGER NOT NULL,
        score REAL NOT NULL,
        correct_count INTEGER NOT NULL,
        total_count INTEGER NOT NULL,
        answers TEXT NOT NULL,
        duration INTEGER NOT NULL,
        create_time INTEGER NOT NULL,
        FOREIGN KEY(quiz_set_id) REFERENCES vl_quiz_set(id)
      );
-- 漫步重温记录：按实体地址（kind + entity_id）记录上次被漫步到的时间与屏蔽状态
CREATE TABLE IF NOT EXISTS walk_visits (
        kind TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        last_seen_time INTEGER NOT NULL,
        seen_count INTEGER NOT NULL DEFAULT 0,
        muted INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        PRIMARY KEY (kind, entity_id)
      );
-- 今日漫步牌堆：按本地日期缓存当天抽出的 5 张（items 为 WalkItem JSON），保证当天重进不换牌；cursor 为已翻过的张数
CREATE TABLE IF NOT EXISTS walk_daily_decks (
        date TEXT PRIMARY KEY NOT NULL,
        items TEXT NOT NULL,
        cursor INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
