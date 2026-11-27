CREATE TEMP VIEW history_raw AS
SELECT d.document_id, e.sequence, e.checkpoint, e.metadata, e.document_id AS native_id,
  CASE WHEN json_extract(e.metadata,'$.kind')='baseline' THEN 'base:'||e.revision ELSE 'op:'||COALESCE(json_extract(e.metadata,'$.groupOperationId'),e.operation_id) END AS native_key
FROM temp.history_documents d JOIN history_cache.document_history_entries e ON e.document_id=d.cache_id;
CREATE TEMP VIEW history_payload AS
SELECT n.document_id,n.sequence,
  (SELECT CASE WHEN min(part)=0 AND count(*)=max(part)+1 THEN CAST(group_concat(state,X'') AS BLOB) END FROM (
     SELECT part,state FROM history_cache.document_history_payloads WHERE document_id=n.native_id AND sequence=n.sequence ORDER BY part
  )) AS state FROM temp.history_input n;
