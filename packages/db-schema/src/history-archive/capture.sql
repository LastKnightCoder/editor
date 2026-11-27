-- history_input provides the versions of one native archive, already scoped to this library.
-- Edges use operation identities since sequence numbers can collide across devices.
WITH missing AS (
  SELECT n.*, ROW_NUMBER() OVER (PARTITION BY n.document_id ORDER BY n.sequence) AS ordinal
  FROM temp.history_input n
  WHERE (json_extract(n.metadata,'$.kind')!='baseline' OR EXISTS(
    SELECT 1 FROM temp.history_input following WHERE following.document_id=n.document_id AND following.sequence>n.sequence
  )) AND NOT EXISTS (SELECT 1 FROM content_history_versions v
    WHERE v.document_id=n.document_id AND v.version_key=n.version_key)
), heads AS MATERIALIZED (
  SELECT d.document_id,(SELECT MAX(v.sequence) FROM content_history_versions v WHERE v.document_id=d.document_id) AS seq FROM temp.history_documents d
)
INSERT INTO content_history_versions(document_id,sequence,version_key,previous_key,target_key,checkpoint,metadata,state)
SELECT n.document_id,COALESCE(h.seq,-1)+n.ordinal,n.version_key,
  CASE WHEN json_extract(n.metadata,'$.kind')!='baseline' THEN prev.version_key END,
  COALESCE(json_extract(n.metadata,'$.targetVersion'),target.version_key),
  n.checkpoint=n.sequence,n.metadata,p.state
FROM missing n
LEFT JOIN heads h USING(document_id)
LEFT JOIN temp.history_input prev ON prev.document_id=n.document_id AND prev.sequence=n.sequence-1
LEFT JOIN temp.history_input target ON target.document_id=n.document_id AND target.sequence=json_extract(n.metadata,'$.target')
LEFT JOIN temp.history_payload p ON p.document_id=n.document_id AND p.sequence=n.sequence
ORDER BY n.document_id,n.sequence;


-- A listed but unsealed group may absorb another edit before it is previewed or synced.
UPDATE content_history_versions AS v
SET (metadata,checkpoint,state)=(SELECT n.metadata,n.checkpoint=n.sequence,p.state
  FROM temp.history_input n JOIN temp.history_payload p USING(document_id,sequence)
  WHERE n.document_id=v.document_id AND n.version_key=v.version_key)
WHERE (v.document_id,v.version_key) IN (
  SELECT n.document_id,n.version_key FROM temp.history_input n
  JOIN content_history_versions saved ON saved.document_id=n.document_id AND saved.version_key=n.version_key
  WHERE json_extract(n.metadata,'$.groupOperationId') IS NOT NULL
    AND json_extract(saved.metadata,'$.operationId')!=json_extract(n.metadata,'$.operationId')
    AND json_extract(saved.metadata,'$.sealed') IS NOT 1
);
