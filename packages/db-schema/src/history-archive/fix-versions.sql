UPDATE content_history_versions SET metadata=json_set(metadata,'$.sealed',json('true'))
WHERE document_id IN (SELECT document_id FROM temp.history_documents)
  AND (?1 IS NULL OR sequence=?1) AND json_extract(metadata,'$.kind')='edit'
  AND json_extract(metadata,'$.sealed') IS NOT 1;
