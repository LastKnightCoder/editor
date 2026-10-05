-- 知识地图的离线结果：由主进程按「显式链接 + 语义近邻」离线计算，地图打开时直接读取。
-- 节点为卡片、文章、项目文档，node_key 形如 "card:12"。可再生的派生数据，放在索引库。
CREATE TABLE IF NOT EXISTS knowledge_map_nodes (
        node_key TEXT PRIMARY KEY,
        x REAL NOT NULL,
        y REAL NOT NULL,
        topic INTEGER NOT NULL DEFAULT -1,
        subtopic INTEGER NOT NULL DEFAULT -1,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS knowledge_map_topics (
        id INTEGER PRIMARY KEY,
        parent INTEGER NOT NULL DEFAULT -1,
        label TEXT NOT NULL,
        color_slot INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0
      );
