SELECT e.metadata FROM temp.history_version_entries e WHERE e.document_id=?1
  AND (?2 IS NULL OR (json_extract(e.metadata,'$.time'),e.sequence)<(
    SELECT json_extract(v.metadata,'$.time'),v.sequence FROM content_history_versions v
    WHERE v.document_id=?1 AND v.sequence=?2
  )) ORDER BY json_extract(e.metadata,'$.time') DESC,e.sequence DESC LIMIT 50;
