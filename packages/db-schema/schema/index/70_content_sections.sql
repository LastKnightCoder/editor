-- 节位置可从正文重算，索引丢失时随全文索引恢复。
CREATE TABLE IF NOT EXISTS content_sections (
        prefixed_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        heading_path TEXT NOT NULL,
        block_start INTEGER NOT NULL,
        block_end INTEGER NOT NULL,
        char_count INTEGER NOT NULL,
        PRIMARY KEY (prefixed_id, chunk_index)
      );
