-- 向量索引模板（运行时按维度替换 __VEC_DIMENSION__）
CREATE VIRTUAL TABLE IF NOT EXISTS vec_documents USING vec0(
        prefixed_id TEXT,
        update_time FLOAT,
        content TEXT,
        type TEXT,
        vec_embedding FLOAT[__VEC_DIMENSION__] distance_metric=cosine
      );
