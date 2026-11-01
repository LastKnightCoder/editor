SELECT 'state' AS damaged WHERE EXISTS (
  SELECT 1 FROM _tau_device_state WHERE applying NOT IN (0,1,2,3) OR NOT json_valid(payload)
)
OR (EXISTS (SELECT 1 FROM _tau_device_anchor) AND NOT EXISTS (SELECT 1 FROM _tau_device_state))
UNION ALL SELECT 'missing-log' WHERE EXISTS (SELECT 1 FROM _tau_device_state WHERE pending_count<>(SELECT count(*) FROM _tau_device_log))
UNION ALL SELECT 'sequence' WHERE (SELECT count(*) FROM sqlite_sequence WHERE name='_tau_device_log')>1
  OR coalesce((SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'),0)>=9007199254740990
  OR coalesce((SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'),0)<coalesce((SELECT sequence FROM _tau_device_anchor WHERE id=1),0)
  OR coalesce((SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'),0)<coalesce((SELECT CASE WHEN json_valid(payload) THEN json_extract(payload,'$.ackSeq') ELSE 0 END FROM _tau_device_state WHERE id=1),0)
UNION ALL SELECT 'log' WHERE EXISTS (
  SELECT 1 FROM _tau_device_log WHERE CASE WHEN json_valid(row_key) THEN json_type(row_key)<>'array' ELSE 1 END
    OR (before_json IS NOT NULL AND CASE WHEN json_valid(before_json) THEN json_type(before_json)<>'object' ELSE 1 END)
    OR (after_json IS NOT NULL AND CASE WHEN json_valid(after_json) THEN json_type(after_json)<>'object' ELSE 1 END) OR phase NOT IN (0,1)
    OR integrity IS NOT json_array(seq,table_name,row_key||'',before_json||'',after_json||'',phase)
)
UNION ALL SELECT 'history' WHERE EXISTS (SELECT 1 FROM _tau_device_history WHERE payload IS NOT integrity OR CASE WHEN json_valid(payload) THEN json_type(payload)<>'object' OR coalesce(json_type(payload,'$.changes'),'')<>'array' OR coalesce(json_type(payload,'$.documents'),'')<>'array' OR coalesce(json_type(payload,'$.parent'),'')<>'text' OR coalesce(json_type(payload,'$.id'),'')<>'text' ELSE 1 END)
UNION ALL SELECT 'receipts' WHERE EXISTS (SELECT 1 FROM _tau_device_receipts WHERE CASE WHEN json_valid(outcome) THEN json_type(outcome)<>'object' ELSE 1 END OR sequence<0)
UNION ALL SELECT 'documents' WHERE EXISTS (
  SELECT 1 FROM _tau_device_documents WHERE CASE WHEN json_valid(paths) THEN json_type(paths)<>'object' ELSE 1 END OR CASE WHEN json_valid(metric_rules) THEN json_type(metric_rules)<>'array' ELSE 1 END
)
UNION ALL SELECT 'intents' WHERE EXISTS (
  SELECT 1 FROM _tau_device_json_intents WHERE CASE WHEN json_valid(base_entry) THEN json_type(base_entry)<>'object' ELSE 1 END
    OR CASE WHEN json_valid(target_content) THEN json_type(target_content)<>'array' ELSE 1 END OR CASE WHEN json_valid(target_contracts) THEN json_type(target_contracts)<>'object' ELSE 1 END
)
UNION ALL SELECT 'copies' WHERE EXISTS (SELECT 1 FROM _tau_device_note_copies WHERE NOT json_valid(payload))
UNION ALL SELECT 'branches' WHERE EXISTS (SELECT 1 FROM _tau_device_branches WHERE NOT json_valid(payload))
UNION ALL SELECT 'shape' FROM _tau_device_anchor WHERE rowid<0 AND (payload IS NULL OR sequence IS NULL)
UNION ALL SELECT 'shape' FROM _tau_device_state WHERE rowid<0 AND (projection_bytes IS NULL OR metadata_bytes IS NULL)
UNION ALL SELECT 'shape' FROM _tau_device_documents WHERE rowid<0 AND (document_id IS NULL OR baseline_id IS NULL OR epoch IS NULL OR state IS NULL OR updated_at IS NULL OR checksum IS NULL)
UNION ALL SELECT 'shape' FROM _tau_device_log WHERE rowid<0 AND (seq IS NULL OR table_name IS NULL)
UNION ALL SELECT 'shape' FROM _tau_device_history WHERE rowid<0 AND (ordinal IS NULL OR id IS NULL)
UNION ALL SELECT 'shape' FROM _tau_device_receipts WHERE rowid<0 AND (node IS NULL OR sequence IS NULL OR fingerprint IS NULL)
UNION ALL SELECT 'shape' FROM _tau_device_json_intents WHERE rowid<0 AND token IS NULL
UNION ALL SELECT 'shape' FROM _tau_device_branches WHERE rowid<0 AND (id IS NULL OR reason IS NULL)
UNION ALL SELECT 'shape' FROM _tau_device_note_copies WHERE rowid<0 AND (id IS NULL OR reason IS NULL);
