INSERT INTO history_cache.library_history_backup(cache_id,sequence,version_key,previous_key,target_key,checkpoint,metadata,state)
SELECT d.cache_id,v.sequence,v.version_key,v.previous_key,v.target_key,v.checkpoint,v.metadata,v.state
FROM temp.history_documents d JOIN content_history_versions v USING(document_id)
WHERE NOT EXISTS(SELECT 1 FROM history_cache.library_history_backup b WHERE b.cache_id=d.cache_id AND b.version_key=v.version_key) ORDER BY d.cache_id,v.sequence;
