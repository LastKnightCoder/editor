use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, TransactionBehavior};
use serde_json::{json, Value};
use std::path::Path;
use tauri::AppHandle;

macro_rules! archive_sql {
    ($name:literal) => {
        include_str!(concat!(
            "../../../../packages/db-schema/src/history-archive/",
            $name,
            ".sql"
        ))
    };
}

pub(crate) fn capture(
    db: &mut Connection,
    cache_path: &Path,
    document: Option<&str>,
    replacing: bool,
    preview: Option<i64>,
) -> Result<(), String> {
    db.execute(
        "ATTACH DATABASE ? AS history_cache",
        [cache_path.to_string_lossy().as_ref()],
    )
    .map_err(|e| e.to_string())?;
    let result = (|| -> rusqlite::Result<()> {
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute_batch(archive_sql!("documents"))?;
        tx.execute(archive_sql!("select-documents"), [document])?;
        tx.execute_batch(archive_sql!("recover"))?;
        for input in [archive_sql!("closed-input"), archive_sql!("mobile-input")] {
            tx.execute_batch(input)?;
            tx.execute_batch(archive_sql!("resolve-versions"))?;
            tx.execute_batch(archive_sql!("capture"))?;
            tx.execute_batch("DROP VIEW temp.history_payload; DROP VIEW temp.history_input; DROP VIEW temp.history_raw")?;
        }
        if document.is_none() || preview.is_some() {
            tx.execute(archive_sql!("fix-versions"), [preview])?;
        }
        if replacing {
            tx.execute_batch(archive_sql!("preserve"))?;
        }
        if document.is_none() || preview.is_some() {
            tx.execute("UPDATE history_cache.local_content_history AS e SET metadata=json_set(metadata,'$.sealed',json('true'))
            WHERE document_id IN (SELECT cache_id FROM temp.history_documents) AND sequence=(
            SELECT MAX(sequence) FROM history_cache.local_content_history WHERE document_id=e.document_id)
            AND json_extract(metadata,'$.kind')='edit' AND json_extract(metadata,'$.sealed') IS NOT 1
            AND (?1 OR EXISTS(SELECT 1 FROM content_history_versions v JOIN temp.history_documents d USING(document_id)
              WHERE d.cache_id=e.document_id AND v.sequence=?2 AND json_extract(v.metadata,'$.operationId')=e.operation_id))",params![document.is_none(),preview])?;
        }
        tx.execute_batch("DROP TABLE temp.history_documents")?;
        tx.commit()
    })();
    let detach = db.execute_batch("DETACH DATABASE history_cache");
    result.and(detach).map_err(|e| e.to_string())
}

pub(crate) fn read(
    app: &AppHandle,
    cache: &Connection,
    session: &Value,
    before: Option<i64>,
    sequence: Option<i64>,
) -> Result<Value, String> {
    let source = &session["source"];
    let document = source["contentDocumentId"].as_str().ok_or("正文身份缺失")?;
    let library = source["librarySourceId"].as_str().ok_or("资料库身份缺失")?;
    let mut db = crate::database::open_active_database(app)?;
    let matches:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM library_identity l JOIN content_documents d ON d.document_id=?1 WHERE l.id=1 AND l.source_id=?2 AND d.content_id=?3)",params![document,library,source["contentId"].as_i64()],|r|r.get(0)).map_err(|e|e.to_string())?;
    if session["mode"] != "local" || !matches {
        return Err("正文历史来源已变化".into());
    }
    capture(
        &mut db,
        Path::new(cache.path().ok_or("正文历史库路径缺失")?),
        Some(document),
        false,
        sequence,
    )?;
    read_versions(&db, document, before, sequence)
}

fn read_versions(
    db: &Connection,
    document: &str,
    before: Option<i64>,
    sequence: Option<i64>,
) -> Result<Value, String> {
    db.execute_batch(
        &archive_sql!("entries").replace("CREATE TEMP VIEW", "CREATE TEMP VIEW IF NOT EXISTS"),
    )
    .map_err(|e| e.to_string())?;
    let Some(sequence) = sequence else {
        let mut stmt = db
            .prepare(archive_sql!("list"))
            .map_err(|e| e.to_string())?;
        let raw = stmt
            .query_map(params![document, before], |r| r.get::<_, String>(0))
            .and_then(|rows| rows.collect::<rusqlite::Result<Vec<_>>>())
            .map_err(|e| e.to_string())?;
        return raw
            .iter()
            .map(|r| serde_json::from_str(r))
            .collect::<Result<Vec<Value>, _>>()
            .map(Value::Array)
            .map_err(|e| e.to_string());
    };
    let (raw, previous,key,undone):(String,Option<i64>,String,bool)=db.query_row("SELECT metadata,previous_sequence,version_key,undone FROM temp.history_version_entries WHERE document_id=? AND sequence=?",params![document,sequence],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(|e|e.to_string())?;
    let entry: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(archive_sql!("read"))
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params![document, sequence])
        .map_err(|e| e.to_string())?;
    let mut updates = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        if updates.is_empty() && !row.get::<_, bool>(1).map_err(|e| e.to_string())? {
            return Err("历史版本缺少起点".into());
        }
        updates.push(STANDARD.encode(row.get::<_, Vec<u8>>(0).map_err(|e| e.to_string())?));
    }
    if updates.is_empty() {
        return Err("历史版本缺少数据".into());
    }
    Ok(
        json!({"entry":entry,"updates":updates,"previousSequence":previous,"versionKey":key,"undone":undone}),
    )
}

#[cfg(test)]
#[path = "history_archive_tests.rs"]
mod tests;
