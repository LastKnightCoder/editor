-- 统一数据库索引库 schema（不包含 vec_documents，运行时动态创建）
-- 请优先修改 schema/index/*.sql

-- 索引库基础 PRAGMA
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 倒排索引表
CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
        prefixed_id,
        update_time,
        content,
        type,
        title,
        chunk_index,
        tokenize='porter unicode61'
      );

-- 索引库元数据表
CREATE TABLE IF NOT EXISTS vec_index_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      );
CREATE TABLE IF NOT EXISTS index_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      );

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

-- 正文里的内联引用（content-link）：由主进程从主库正文解析，脉络的「被引用」从这里查。
-- 可从主库重算的派生数据，丢了会在连接数据库时对账重建，因此放在索引库。
CREATE TABLE IF NOT EXISTS entity_refs (
        src_content_id INTEGER NOT NULL,
        dst_kind TEXT NOT NULL,
        dst_id INTEGER NOT NULL,
        dst_content_id INTEGER,
        snippet_before TEXT NOT NULL DEFAULT '',
        snippet_label TEXT NOT NULL DEFAULT '',
        snippet_after TEXT NOT NULL DEFAULT ''
      );
CREATE INDEX IF NOT EXISTS idx_entity_refs_src ON entity_refs(src_content_id);
CREATE INDEX IF NOT EXISTS idx_entity_refs_dst ON entity_refs(dst_kind, dst_id);
CREATE INDEX IF NOT EXISTS idx_entity_refs_dst_content ON entity_refs(dst_content_id);
-- 每份正文最后一次解析时的 contents.update_time，对账时与主库比较
CREATE TABLE IF NOT EXISTS entity_ref_sources (
        content_id INTEGER PRIMARY KEY,
        update_time INTEGER NOT NULL
      );

-- 白板对笔记的使用：由主进程按元素类型解析白板页画布，脉络的「被使用 · 白板」从这里查。
-- 可从主库重算的派生数据，丢了会在连接数据库时对账重建，因此放在索引库。
-- dst_kind：card / article / project-item / diary（按实体）或 content（按正文 id）；
-- via：card（卡片元素）/ richtext（文本块）/ mind-node（思维导图节点关联的笔记）/
--      entity（元素的通用 entityRef）/ inline（元素文字里的引用）
CREATE TABLE IF NOT EXISTS whiteboard_refs (
        page_id INTEGER NOT NULL,
        dst_kind TEXT NOT NULL,
        dst_id INTEGER NOT NULL,
        via TEXT NOT NULL,
        PRIMARY KEY (page_id, dst_kind, dst_id, via)
      );
CREATE INDEX IF NOT EXISTS idx_whiteboard_refs_dst ON whiteboard_refs(dst_kind, dst_id);
-- 每个白板页最后一次解析时的 white_board_contents.update_time，对账时与主库比较
CREATE TABLE IF NOT EXISTS whiteboard_ref_sources (
        page_id INTEGER PRIMARY KEY,
        update_time INTEGER NOT NULL
      );
-- 文档正文里嵌入的白板块：宿主正文 → 白板页。由引用索引器随 entity_refs 一起维护
CREATE TABLE IF NOT EXISTS whiteboard_embeds (
        host_content_id INTEGER NOT NULL,
        page_id INTEGER NOT NULL,
        PRIMARY KEY (host_content_id, page_id)
      );
CREATE INDEX IF NOT EXISTS idx_whiteboard_embeds_page ON whiteboard_embeds(page_id);
