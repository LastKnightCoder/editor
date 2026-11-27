WITH RECURSIVE chain(sequence,previous_key,checkpoint) AS (
  SELECT sequence,previous_key,checkpoint FROM content_history_versions WHERE document_id=?1 AND sequence=?2
  UNION ALL
  SELECT p.sequence,p.previous_key,p.checkpoint FROM content_history_versions p JOIN chain c
    ON p.document_id=?1 AND p.version_key=c.previous_key AND p.sequence<c.sequence
  WHERE c.checkpoint=0
)
SELECT v.state,v.checkpoint,v.version_key,v.previous_key FROM chain JOIN content_history_versions v
  ON v.document_id=?1 AND v.sequence=chain.sequence ORDER BY v.sequence;
