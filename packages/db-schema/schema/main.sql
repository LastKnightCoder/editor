-- 统一数据库主库 schema（按域拆分后汇总）
-- 请优先修改 schema/main/*.sql

-- 主库基础 PRAGMA
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

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
-- 引用计数归零但暂缓删除的正文：开库回收超过宽限期且仍为 0 的条目（D-136）
CREATE TABLE IF NOT EXISTS content_pending_releases (
        content_id INTEGER PRIMARY KEY,
        released_at INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS compose_boards (
        content_id INTEGER PRIMARY KEY,
        page_id INTEGER NOT NULL,
        intent TEXT NOT NULL DEFAULT '',
        dismissed TEXT NOT NULL DEFAULT '[]',
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
-- 引用归零的白板页：登记释放时间，超过宽限期且仍无引用时才删除，期间被重新引用（撤销、恢复）即撤销登记
CREATE TABLE IF NOT EXISTS white_board_content_pending_releases (
  content_id INTEGER PRIMARY KEY,
  released_at INTEGER NOT NULL
);
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
CREATE TABLE IF NOT EXISTS operation_daily_counts (
            date TEXT PRIMARY KEY,
            count INTEGER NOT NULL
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
-- pi 会话目录表（M4）：会话内容的事实源是 pi JSONL（~/.editor/sessions/<库名>/），
-- 本表只存列表与管理需要的轻量元数据。id 即 pi 会话 id；session_file 是相对会话目录的文件名
-- （不存绝对路径：换机/换库不该带着别人的磁盘布局）。
-- scope 区分五个聊天场景，domain_ref 指向所属对象（PDF/视频笔记/学习项目的 id；主聊天为 NULL）。
CREATE TABLE IF NOT EXISTS chat_session (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        domain_ref TEXT,
        session_file TEXT NOT NULL,
        cwd TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        title_dirty INTEGER NOT NULL DEFAULT 0,
        group_id INTEGER,
        order_num INTEGER,
        archived INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'desktop',
        message_count INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
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
-- 问题的探究材料：多态关联（target_type = card | article | project_item | project | white_board | answer
-- | excerpt | pdf-annotation | web-clip；answer 的 target_id 为 contents.id，其余为各实体表主键，均为整数）。
-- content_id = 本关联持有引用计数的 contents.id（卡片 / 文章 / 项目文档 / 独立答案有值，项目、白板与外部材料为 NULL），
-- 目标实体被删后仍可据此释放引用。对话不在此表，见 question_chat。
CREATE TABLE IF NOT EXISTS question_link (
        id INTEGER PRIMARY KEY,
        question_id INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        content_id INTEGER,
        sort_index INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL
      );
-- 问题的探究对话：session_id = chat_session.id（pi 会话 UUID）；message_ids 为 JSON 数组，记录问题从哪几条消息转来（可空）。
-- 弱引用：对话被删不级联，解析时降级；删除问题时一并删除。
CREATE TABLE IF NOT EXISTS question_chat (
        id INTEGER PRIMARY KEY,
        question_id INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        message_ids TEXT,
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
-- 正文之间的显式连接（无向边，一行一条；content_id 规范化为较小一侧）。
-- 连接绑定 contents.id：共用同一份正文的身份（卡片、文章、项目文档、日记，及从卡片创建
-- 而共用正文的项目文档）共享同一组连接。任一侧正文删除（引用计数归零）时整条边释放。
-- 卡片旧存储 cards.links 已迁入本表，该列不再读写。
CREATE TABLE IF NOT EXISTS content_links (
        content_id INTEGER NOT NULL,
        target_content_id INTEGER NOT NULL,
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
-- 引用归零的数据表：开库对账实际引用后回收超过宽限期且无引用的表（D-136）
CREATE TABLE IF NOT EXISTS data_table_pending_releases (
        table_id INTEGER PRIMARY KEY,
        released_at INTEGER NOT NULL
      );

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

-- 助理操作回执与撤销材料；请求身份在当前库内唯一。
CREATE TABLE IF NOT EXISTS task_assistant_operation (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  tool_name TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  request_json TEXT,
  conversation_key TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','undone')),
  phase TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  result_json TEXT,
  error_json TEXT,
  create_time INTEGER NOT NULL,
  update_time INTEGER NOT NULL,
  undo_until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_assistant_batch ON task_assistant_operation(batch_id, create_time);
CREATE INDEX IF NOT EXISTS idx_task_assistant_status ON task_assistant_operation(status, update_time);
CREATE INDEX IF NOT EXISTS idx_task_assistant_expiry ON task_assistant_operation(undo_until);

-- 一份操作对正文只持有一个保留引用，释放时经过内容层。
CREATE TABLE IF NOT EXISTS task_assistant_content_pin (
  operation_id TEXT NOT NULL,
  content_id INTEGER NOT NULL,
  content_created_at INTEGER NOT NULL,
  PRIMARY KEY(operation_id, content_id)
);

CREATE TABLE IF NOT EXISTS doc_task_calendar_link (
  calendar_event_id INTEGER PRIMARY KEY,
  content_id INTEGER NOT NULL,
  content_created_at INTEGER NOT NULL,
  task_id TEXT NOT NULL,
  series_id TEXT,
  occurrence_date TEXT,
  create_time INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_task_calendar_source ON doc_task_calendar_link(content_id, task_id);

CREATE TABLE IF NOT EXISTS todo_recurrence_history (
  series_id TEXT PRIMARY KEY,
  todo_item_id INTEGER NOT NULL,
  todo_created_at INTEGER NOT NULL,
  effective_date TEXT NOT NULL,
  rule_json TEXT,
  create_time INTEGER NOT NULL,
  UNIQUE(todo_item_id, todo_created_at, effective_date)
);
CREATE INDEX IF NOT EXISTS idx_todo_recurrence_history_task ON todo_recurrence_history(todo_item_id, todo_created_at);

CREATE TABLE IF NOT EXISTS todo_occurrence_override (
  todo_item_id INTEGER NOT NULL,
  todo_created_at INTEGER NOT NULL,
  series_id TEXT NOT NULL,
  occurrence_date TEXT NOT NULL,
  state_json TEXT NOT NULL,
  update_time INTEGER NOT NULL,
  PRIMARY KEY(todo_item_id, todo_created_at, series_id, occurrence_date)
);

CREATE TABLE IF NOT EXISTS todo_schedule_occurrence (
  calendar_event_id INTEGER PRIMARY KEY,
  series_id TEXT NOT NULL,
  occurrence_date TEXT NOT NULL
);

-- 插件对业务数据的可恢复操作：删除前的快照或待办撤销凭据，宽限期内可由用户在插件详情页恢复
CREATE TABLE IF NOT EXISTS plugin_operations (
  id INTEGER PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  create_time INTEGER NOT NULL,
  restored_time INTEGER
);
CREATE INDEX IF NOT EXISTS idx_plugin_operations_plugin ON plugin_operations(plugin_id, create_time);

-- 插件自建的业务对象：持有一份正文引用，作为搜索、@ 与反链的实体单位；
-- 插件目录不在时记 orphaned_time，超过宽限期才删除，期间重新安装即恢复
CREATE TABLE IF NOT EXISTS plugin_entities (
  id INTEGER PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content_id INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  create_time INTEGER NOT NULL,
  update_time INTEGER NOT NULL,
  orphaned_time INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_entities_key ON plugin_entities(plugin_id, kind, key);
CREATE INDEX IF NOT EXISTS idx_plugin_entities_content ON plugin_entities(content_id);
CREATE INDEX IF NOT EXISTS idx_plugin_entities_created ON plugin_entities(plugin_id, kind, create_time, id);

-- 插件声明的内容类型外观（类型名与图标 SVG）：随库保存，插件停用、卸载宽限期内与其他设备上照样显示
CREATE TABLE IF NOT EXISTS plugin_entity_kinds (
  plugin_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  update_time INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, kind)
);

-- 插件节点的资源声明（哪些字段是图片、视频、音频或文件）：随库保存，供协作上传与 CLI 在插件不运行时读取
CREATE TABLE IF NOT EXISTS plugin_element_resources (
  plugin_id TEXT NOT NULL,
  type TEXT NOT NULL,
  resources TEXT NOT NULL,
  update_time INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, type)
);

-- 插件私有存储（context.storage）：按插件与键保存 JSON，随主库云同步
CREATE TABLE IF NOT EXISTS plugin_kv (
  plugin_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  update_time INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, key)
);

-- 插件记录（context.records）：插件内部的结构化数据，按插件与集合保存 JSON，随主库云同步；
-- orphaned_time 非空表示插件已不在本机，与插件实体一同在宽限期后删除
CREATE TABLE IF NOT EXISTS plugin_records (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  create_time INTEGER NOT NULL,
  update_time INTEGER NOT NULL,
  orphaned_time INTEGER
);
CREATE INDEX IF NOT EXISTS idx_plugin_records_created ON plugin_records(plugin_id, collection, create_time, id);

-- 用户在插件选择窗口中亲手选过的内容：插件此后读取这些引用的标题不需要读取权限；
-- target_created_at 是选择时目标的创建时间，编号被新内容复用时授权不会落到新内容上
CREATE TABLE IF NOT EXISTS plugin_ref_grants (
  plugin_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  target_created_at INTEGER NOT NULL,
  create_time INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, kind, ref_id)
);

-- 主库索引
CREATE INDEX IF NOT EXISTS idx_podcasts_ref_count ON podcasts(ref_count);
CREATE INDEX IF NOT EXISTS idx_contents_update_time ON contents(update_time);
CREATE INDEX IF NOT EXISTS idx_contents_create_time ON contents(create_time);
CREATE INDEX IF NOT EXISTS idx_contents_ref_count ON contents(ref_count);
CREATE INDEX IF NOT EXISTS idx_cards_podcast_id ON cards(podcast_id);
CREATE INDEX IF NOT EXISTS idx_articles_podcast_id ON articles(podcast_id);
CREATE INDEX IF NOT EXISTS idx_diary_entries_type ON diary_entries(type);
CREATE INDEX IF NOT EXISTS idx_diary_entries_date ON diary_entries(date);
CREATE INDEX IF NOT EXISTS idx_diary_entries_create_time ON diary_entries(create_time);
CREATE INDEX IF NOT EXISTS idx_diary_segments_diary_id ON diary_segments(diary_id);
CREATE INDEX IF NOT EXISTS idx_diary_segments_create_time ON diary_segments(create_time);
CREATE INDEX IF NOT EXISTS idx_video_note_item_video ON video_note_item(video_note_id);
CREATE INDEX IF NOT EXISTS idx_chat_group_parent_id ON chat_group(parent_id);
CREATE INDEX IF NOT EXISTS idx_chat_group_order_index ON chat_group(order_index);
CREATE INDEX IF NOT EXISTS idx_chat_session_scope ON chat_session(scope, domain_ref);
CREATE INDEX IF NOT EXISTS idx_chat_session_update_time ON chat_session(update_time);
CREATE INDEX IF NOT EXISTS idx_chat_session_group_id ON chat_session(group_id);
CREATE INDEX IF NOT EXISTS idx_question_group_sort ON question_group(sort_index);
CREATE INDEX IF NOT EXISTS idx_question_group_default ON question_group(is_default);
CREATE INDEX IF NOT EXISTS idx_questions_group_id ON questions(group_id);
CREATE INDEX IF NOT EXISTS idx_questions_sort_index ON questions(sort_index);
CREATE INDEX IF NOT EXISTS idx_questions_create_time ON questions(create_time);
CREATE INDEX IF NOT EXISTS idx_questions_resolved_time ON questions(resolved_time);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_question_link_unique ON question_link(question_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_question_link_target ON question_link(target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_question_chat_unique ON question_chat(question_id, session_id);
CREATE INDEX IF NOT EXISTS idx_question_chat_session ON question_chat(session_id);
CREATE INDEX IF NOT EXISTS idx_question_event_question ON question_event(question_id, create_time);
CREATE INDEX IF NOT EXISTS idx_data_table_views_table_id
      ON data_table_views(table_id);
CREATE INDEX IF NOT EXISTS idx_project_item_podcast_id ON project_item(podcast_id);
CREATE INDEX IF NOT EXISTS idx_web_link_source ON web_link(source_type);
CREATE INDEX IF NOT EXISTS idx_web_clip_content_id ON web_clip(content_id);
CREATE INDEX IF NOT EXISTS idx_web_note_project ON web_note(project_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_lineage_unique
      ON entity_lineage(src_kind, src_id, dst_kind, dst_id, relation);
CREATE INDEX IF NOT EXISTS idx_entity_lineage_dst ON entity_lineage(dst_kind, dst_id);
CREATE INDEX IF NOT EXISTS idx_resource_sync_blacklist_file_name ON resource_sync_blacklist(file_name);
CREATE INDEX IF NOT EXISTS idx_publish_selections_type
      ON publish_selections(content_type);
CREATE INDEX IF NOT EXISTS idx_publish_selections_selected
      ON publish_selections(selected);
CREATE INDEX IF NOT EXISTS idx_publish_history_path
      ON publish_history(file_path);
CREATE INDEX IF NOT EXISTS idx_publish_history_source
      ON publish_history(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_source_path ON transcriptions(source_path);
CREATE INDEX IF NOT EXISTS idx_transcriptions_source_type ON transcriptions(source_type);
CREATE INDEX IF NOT EXISTS idx_transcriptions_source_id ON transcriptions(source_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_language ON transcriptions(language);
CREATE INDEX IF NOT EXISTS idx_todo_group_sort ON todo_group(sort_index);
CREATE INDEX IF NOT EXISTS idx_todo_group_archived ON todo_group(is_archived);
CREATE INDEX IF NOT EXISTS idx_todo_group_system ON todo_group(is_system);
CREATE INDEX IF NOT EXISTS idx_todo_group_system_type ON todo_group(system_type);
CREATE INDEX IF NOT EXISTS idx_todo_item_group ON todo_item(group_id);
CREATE INDEX IF NOT EXISTS idx_todo_item_parent ON todo_item(parent_id);
CREATE INDEX IF NOT EXISTS idx_todo_item_sort ON todo_item(parent_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_todo_item_completed ON todo_item(is_completed);
CREATE INDEX IF NOT EXISTS idx_todo_item_due ON todo_item(due_at);
CREATE INDEX IF NOT EXISTS idx_todo_item_description_content ON todo_item(description_content_id);
CREATE INDEX IF NOT EXISTS idx_todo_item_type ON todo_item(type);
CREATE INDEX IF NOT EXISTS idx_todo_item_start ON todo_item(start_at);
CREATE INDEX IF NOT EXISTS idx_todo_note_todo ON todo_note_link(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_note_content ON todo_note_link(content_id);
CREATE INDEX IF NOT EXISTS idx_todo_note_sort ON todo_note_link(todo_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_todo_recurrence_todo_item ON todo_recurrence(todo_item_id);
CREATE INDEX IF NOT EXISTS idx_todo_recurrence_type ON todo_recurrence(type);
CREATE INDEX IF NOT EXISTS idx_todo_recurrence_start_date ON todo_recurrence(start_date);
CREATE INDEX IF NOT EXISTS idx_todo_recurrence_end_date ON todo_recurrence(end_date);
CREATE INDEX IF NOT EXISTS idx_recurrence_completion_recurrence ON todo_recurrence_completion(recurrence_id);
CREATE INDEX IF NOT EXISTS idx_recurrence_completion_date ON todo_recurrence_completion(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_recurrence_completion_completed ON todo_recurrence_completion(completed_at);
CREATE INDEX IF NOT EXISTS idx_todo_calendar_mapping_todo ON todo_calendar_mapping(todo_item_id);
CREATE INDEX IF NOT EXISTS idx_todo_calendar_mapping_event ON todo_calendar_mapping(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_todo_calendar_mapping_type ON todo_calendar_mapping(sync_type);
CREATE INDEX IF NOT EXISTS idx_todo_calendar_mapping_recurrence_date ON todo_calendar_mapping(recurrence_date);
CREATE INDEX IF NOT EXISTS idx_preset_archived ON pomodoro_presets(archived);
CREATE INDEX IF NOT EXISTS idx_session_status ON pomodoro_sessions(status);
CREATE INDEX IF NOT EXISTS idx_session_start ON pomodoro_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_session_preset ON pomodoro_sessions(preset_id);
CREATE INDEX IF NOT EXISTS idx_mapping_session ON pomodoro_calendar_mapping(pomodoro_session_id);
CREATE INDEX IF NOT EXISTS idx_mapping_event ON pomodoro_calendar_mapping(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_group_is_system ON calendar_group(is_system);
CREATE INDEX IF NOT EXISTS idx_calendar_group_order_index ON calendar_group(order_index);
CREATE INDEX IF NOT EXISTS idx_calendar_group_parent ON calendar_group(parent_group_id);
CREATE INDEX IF NOT EXISTS idx_calendar_archived ON calendar(archived);
CREATE INDEX IF NOT EXISTS idx_calendar_visible ON calendar(visible);
CREATE INDEX IF NOT EXISTS idx_calendar_order_index ON calendar(order_index);
CREATE INDEX IF NOT EXISTS idx_calendar_group_id ON calendar(group_id);
CREATE INDEX IF NOT EXISTS idx_calendar_event_calendar_id ON calendar_event(calendar_id);
CREATE INDEX IF NOT EXISTS idx_calendar_event_start_date ON calendar_event(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_event_end_date ON calendar_event(end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_event_date_range ON calendar_event(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_event_todo_item ON calendar_event(todo_item_id);
CREATE INDEX IF NOT EXISTS idx_weread_notebook_title ON weread_notebook(title);
CREATE INDEX IF NOT EXISTS idx_weread_notebook_reading_status ON weread_notebook(reading_status);
CREATE INDEX IF NOT EXISTS idx_weread_notebook_last_read_date ON weread_notebook(last_read_date);
CREATE INDEX IF NOT EXISTS idx_weread_notebook_updated_at ON weread_notebook(updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_excerpt_external ON excerpt(source_type, external_id);
CREATE INDEX IF NOT EXISTS idx_excerpt_source ON excerpt(source_type, source_key);
CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_due_time ON flashcards(due_time);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card ON flashcard_reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_references_card ON flashcard_references(card_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_references_content ON flashcard_references(content_id);
CREATE INDEX IF NOT EXISTS idx_vlr_project_id
      ON vibe_learning_resources(project_id);
CREATE INDEX IF NOT EXISTS idx_vl_note_project ON vl_note(project_id);
CREATE INDEX IF NOT EXISTS idx_vl_quiz_set_project ON vl_quiz_set(project_id);
CREATE INDEX IF NOT EXISTS idx_vl_quiz_item_set ON vl_quiz_item(quiz_set_id);
CREATE INDEX IF NOT EXISTS idx_vl_quiz_record_set ON vl_quiz_record(quiz_set_id);
CREATE INDEX IF NOT EXISTS idx_vl_quiz_record_project ON vl_quiz_record(project_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_time ON flashcard_reviews(review_time);
-- 由正文反查所属实体（一份正文可被多个实体共用）
CREATE INDEX IF NOT EXISTS idx_cards_content_id ON cards(content_id);
CREATE INDEX IF NOT EXISTS idx_articles_content_id ON articles(content_id);
CREATE INDEX IF NOT EXISTS idx_project_item_content_id ON project_item(content_id);
CREATE INDEX IF NOT EXISTS idx_diary_segments_content_id ON diary_segments(content_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_ai_insights_scope ON knowledge_ai_insights(scope, project_id);
-- 正文显式连接：成对唯一 + 反向查（正向由成对唯一索引前缀覆盖）
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_links_pair ON content_links(content_id, target_content_id);
CREATE INDEX IF NOT EXISTS idx_content_links_target ON content_links(target_content_id);
-- 创作模式素材板：一页画布只属于一份正文
CREATE UNIQUE INDEX IF NOT EXISTS idx_compose_boards_page ON compose_boards(page_id);
-- 首页热力图按年聚合操作流水（get-operation-daily-counts）；带 operation_id 形成覆盖索引，聚合免回表
CREATE INDEX IF NOT EXISTS idx_operation_time ON operation(operation_time, operation_id);
