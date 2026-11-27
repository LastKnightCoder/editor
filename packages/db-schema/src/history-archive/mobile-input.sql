CREATE TEMP VIEW history_raw AS
SELECT d.document_id,e.sequence,e.checkpoint,e.metadata,e.document_id AS native_id,
  CASE WHEN json_extract(e.metadata,'$.kind')='baseline' THEN 'mobile-base:'||e.baseline_id ELSE 'op:'||COALESCE(json_extract(e.metadata,'$.groupOperationId'),e.operation_id) END AS native_key
FROM temp.history_documents d JOIN history_cache.local_content_history e ON e.document_id=d.cache_id;
CREATE TEMP VIEW history_payload AS
SELECT n.document_id,n.sequence,e.state FROM temp.history_input n JOIN history_cache.local_content_history e
  ON e.document_id=n.native_id AND e.sequence=n.sequence;
