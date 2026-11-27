INSERT INTO temp.history_documents
SELECT d.document_id,json_array(l.source_id,d.document_id) FROM main.content_documents d
JOIN main.library_identity l ON l.id=1 WHERE (?1 IS NULL OR d.document_id=?1);
