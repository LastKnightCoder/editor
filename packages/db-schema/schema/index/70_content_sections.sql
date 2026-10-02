-- 节位置可从正文重算。按（实体, 正文版本 update_time）存：全文与向量可能各自停在不同版本的正文上。
CREATE TABLE IF NOT EXISTS content_sections (
        prefixed_id TEXT NOT NULL,
        update_time INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        heading_path TEXT NOT NULL,
        block_start INTEGER NOT NULL,
        block_end INTEGER NOT NULL,
        char_count INTEGER NOT NULL,
        text TEXT NOT NULL,
        PRIMARY KEY (prefixed_id, update_time, chunk_index)
      );
