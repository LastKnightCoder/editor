-- 文档待办：正文里的勾选项（check-list-item），由主进程从主库正文解析，待办页从这里查。
-- 正文是唯一真相源，这里是可重算的镜像，丢了会在连接数据库时对账重建，因此放在索引库。
CREATE TABLE IF NOT EXISTS doc_tasks (
        content_id INTEGER NOT NULL,
        task_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL DEFAULT '',
        checked INTEGER NOT NULL DEFAULT 0,
        depth INTEGER NOT NULL DEFAULT 0,
        parent_task_id TEXT,
        sort_index INTEGER NOT NULL DEFAULT 0,
        group_id INTEGER,
        group_token TEXT,
        date_hint TEXT,
        -- 相对日期词（周五、明天）的换算锚点：首次收集或日期原文改变的时刻
        date_anchor INTEGER,
        due_at INTEGER,
        PRIMARY KEY (content_id, task_id)
      );
-- 每份正文最后一次解析时的 contents.update_time，对账时与主库比较
CREATE TABLE IF NOT EXISTS doc_task_sources (
        content_id INTEGER PRIMARY KEY,
        update_time INTEGER NOT NULL
      );

CREATE TABLE IF NOT EXISTS doc_task_attributes (
        content_id INTEGER NOT NULL,
        task_id TEXT NOT NULL,
        attributes_json TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        recurring INTEGER NOT NULL DEFAULT 0,
        reminder_at TEXT,
        PRIMARY KEY(content_id, task_id)
      );
