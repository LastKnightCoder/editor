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
