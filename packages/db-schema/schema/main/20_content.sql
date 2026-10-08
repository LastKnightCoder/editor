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
