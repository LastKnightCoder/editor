use super::plugin_data::sql_error;
use rusqlite::{params, Connection, OptionalExtension};

pub(super) fn prepare(conn: &Connection) -> Result<(), String> {
    loop {
        let tx = conn.unchecked_transaction().map_err(sql_error)?;
        let (ready, after): (bool, i64) = tx
            .query_row(
                "SELECT ready,after_content_id FROM document_task_projection_state WHERE id='main'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(sql_error)?;
        if ready {
            tx.commit().map_err(sql_error)?;
            return Ok(());
        }
        let ids = tx
            .prepare("SELECT id FROM contents WHERE id>?1 ORDER BY id LIMIT 100")
            .map_err(sql_error)?
            .query_map([after], |r| r.get::<_, i64>(0))
            .map_err(sql_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sql_error)?;
        let Some(through) = ids.last() else {
            tx.execute(
                "UPDATE document_task_projection_state SET ready=1 WHERE id='main'",
                [],
            )
            .map_err(sql_error)?;
            tx.commit().map_err(sql_error)?;
            return Ok(());
        };
        tx.execute("INSERT OR REPLACE INTO document_task_projection_errors SELECT content_id,part_key,reason FROM document_task_invalid_parts WHERE content_id>?1 AND content_id<=?2",params![after,through]).map_err(sql_error)?;
        tx.execute("INSERT OR IGNORE INTO document_task_identities(content_id,content_created_at,part_key,task_id) SELECT p.content_id,p.content_created_at,p.part_key,p.task_id FROM document_task_projection_candidates p WHERE p.content_id>?1 AND p.content_id<=?2 AND NOT EXISTS(SELECT 1 FROM document_task_projection_errors e WHERE e.content_id=p.content_id AND e.part_key=p.part_key)",params![after,through]).map_err(sql_error)?;
        tx.execute(
            "UPDATE document_task_projection_state SET after_content_id=?1 WHERE id='main'",
            [through],
        )
        .map_err(sql_error)?;
        tx.commit().map_err(sql_error)?;
    }
}
pub(super) fn require_ready(conn: &Connection) -> Result<String, String> {
    let state = conn
        .query_row(
            "SELECT ready,epoch FROM document_task_projection_state WHERE id='main'",
            [],
            |r| Ok((r.get::<_, bool>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(sql_error)?;
    let Some((true, epoch)) = state else {
        return Err("正文任务身份目录正在准备".into());
    };
    let error=conn.query_row("SELECT e.content_id,e.reason FROM document_task_projection_errors e WHERE EXISTS(SELECT 1 FROM document_task_source_contents s WHERE s.content_id=e.content_id) AND NOT EXISTS(SELECT 1 FROM doc_task_settings s WHERE s.content_id=e.content_id AND s.kind='excluded') LIMIT 1",[],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?))).optional().map_err(sql_error)?;
    if let Some((id, reason)) = error {
        return Err(format!("正文 {id} 的任务身份尚未完整解析：{reason}"));
    }
    Ok(epoch)
}
