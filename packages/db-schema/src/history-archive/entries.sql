CREATE TEMP VIEW history_version_entries AS
SELECT v.document_id, v.sequence, v.version_key, p.sequence AS previous_sequence,
  json_set(v.metadata,'$.sequence',v.sequence,'$.versionKey',v.version_key,'$.target',t.sequence) AS metadata,
  EXISTS(SELECT 1 FROM content_history_versions u WHERE u.document_id=v.document_id AND u.target_key=v.version_key AND json_extract(u.metadata,'$.kind')='undo') AS undone
FROM content_history_versions v
LEFT JOIN content_history_versions p ON p.document_id=v.document_id AND p.version_key=v.previous_key
LEFT JOIN content_history_versions t ON t.document_id=v.document_id AND t.version_key=v.target_key;
