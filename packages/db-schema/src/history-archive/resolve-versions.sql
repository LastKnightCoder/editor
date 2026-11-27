CREATE TEMP VIEW history_input AS
SELECT n.document_id,n.sequence,n.checkpoint,n.metadata,n.native_id,
  CASE WHEN json_extract(saved.metadata,'$.sealed')=1
    AND json_extract(saved.metadata,'$.operationId')!=json_extract(n.metadata,'$.operationId')
    AND json_extract(n.metadata,'$.kind')!='baseline'
    THEN 'revision:'||json_extract(n.metadata,'$.operationId') ELSE n.native_key END AS version_key
FROM temp.history_raw n LEFT JOIN main.content_history_versions saved
  ON saved.document_id=n.document_id AND saved.version_key=n.native_key;
