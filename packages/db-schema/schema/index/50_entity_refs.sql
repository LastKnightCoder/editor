-- 正文里的内联引用（content-link）：由主进程从主库正文解析，脉络的「被引用」从这里查。
-- 可从主库重算的派生数据，丢了会在连接数据库时对账重建，因此放在索引库。
CREATE TABLE IF NOT EXISTS entity_refs (
        src_content_id INTEGER NOT NULL,
        src_block INTEGER NOT NULL DEFAULT 0,
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
