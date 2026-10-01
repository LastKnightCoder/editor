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
