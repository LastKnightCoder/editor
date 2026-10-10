//! entity_refs 索引的移动端重建：解析器在前端（@tau/shared/inline-refs，与桌面端同一份代码，
//! 口径零漂移），Rust 只负责对账与事务写入。对账口径与桌面 ref-indexer.ts 一致：
//! entity_ref_sources.update_time 与主库 contents.update_time 比较，主库已删除的正文
//! 连同索引行一起清除；index_meta 里的解析版本号与桌面共用取值，口径升级时双端全量重解析。

use rusqlite::{params, params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::AppHandle;

use super::schema;
use crate::setting::{get_active_database_name, load_or_init_setting};

/** 与桌面 ref-indexer.ts 的 REF_INDEX_VERSION 保持一致 */
const REF_INDEX_VERSION: &str = "5";
const REF_INDEX_VERSION_KEY: &str = "entity-refs:version";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingRefContent {
    pub content_id: i64,
    pub update_time: i64,
    /// 只有含 content-link 的正文才带正文（SQL 预过滤），否则为 null
    pub content: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingRefBatch {
    /// 新增或更新过的正文（引用可为空，仍要回写对账时间）
    pub pending: Vec<PendingRefContent>,
    /// 主库已删除、需要清除索引行的正文
    pub removed: Vec<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefRowInput {
    pub dst_kind: String,
    pub dst_id: i64,
    pub dst_content_id: Option<i64>,
    pub snippet_before: String,
    pub snippet_label: String,
    pub snippet_after: String,
    pub src_block: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedRefContent {
    pub content_id: i64,
    pub update_time: i64,
    pub refs: Vec<RefRowInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRefsPayload {
    pub applied: Vec<AppliedRefContent>,
    pub removed: Vec<i64>,
}

fn open_connections(app: &AppHandle) -> Result<(schema::ActiveConnection, Connection), String> {
    let conn = schema::open_active_database(app)?;
    let setting = load_or_init_setting(app)?;
    let db_name = get_active_database_name(&setting);
    let index_conn = super::index_db::open_index_database(app, &db_name)?;
    Ok((conn, index_conn))
}

/** 解析口径版本：与桌面约定不一致时清空对账状态，下一次对账全量重解析 */
fn ensure_ref_index_version(index_conn: &Connection) -> Result<(), String> {
    let has_meta = index_conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='index_meta' AND type='table')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|found| found > 0)
        .unwrap_or(false);
    if !has_meta {
        return Ok(());
    }
    let current = index_conn
        .query_row(
            "SELECT value FROM index_meta WHERE key = ?1",
            params![REF_INDEX_VERSION_KEY],
            |row| row.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten();
    if current.as_deref() == Some(REF_INDEX_VERSION) {
        return Ok(());
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    index_conn
        .execute_batch("BEGIN IMMEDIATE")
        .and_then(|_| {
            index_conn.execute("DELETE FROM entity_ref_sources", [])?;
            index_conn.execute(
                "INSERT INTO index_meta (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![REF_INDEX_VERSION_KEY, REF_INDEX_VERSION, now],
            )?;
            index_conn.execute_batch("COMMIT")
        })
        .map_err(|e| format!("ENTITY_REFS_FAILED: Failed to refresh index version: {e}"))
}

/** 主库与索引库不一致的正文（新增或更新过的，以及主库已删除的），每批至多 limit 条 */
fn diff_pending(
    conn: &Connection,
    index_conn: &Connection,
    limit: usize,
) -> Result<PendingRefBatch, String> {
    let mut indexed = HashMap::new();
    let mut stmt = index_conn
        .prepare("SELECT content_id, update_time FROM entity_ref_sources")
        .map_err(|e| format!("ENTITY_REFS_FAILED: Failed to read index sources: {e}"))?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| format!("ENTITY_REFS_FAILED: Failed to read index sources: {e}"))?;
    for row in rows {
        let (content_id, update_time) =
            row.map_err(|e| format!("ENTITY_REFS_FAILED: Failed to read index sources: {e}"))?;
        indexed.insert(content_id, update_time);
    }

    let mut pending_ids = Vec::new();
    let mut main_stmt = conn
        .prepare("SELECT id, update_time FROM contents")
        .map_err(|e| format!("ENTITY_REFS_FAILED: Failed to read contents: {e}"))?;
    let main_rows = main_stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| format!("ENTITY_REFS_FAILED: Failed to read contents: {e}"))?;
    let mut main_times: HashMap<i64, i64> = HashMap::new();
    for row in main_rows {
        let (id, update_time) =
            row.map_err(|e| format!("ENTITY_REFS_FAILED: Failed to read contents: {e}"))?;
        main_times.insert(id, update_time);
        if indexed.get(&id) != Some(&update_time) {
            pending_ids.push((id, update_time));
        }
        indexed.remove(&id);
    }
    // 剩下的只在索引里，主库已删除
    let removed: Vec<i64> = indexed.keys().copied().collect();

    pending_ids.truncate(limit);
    let ids: Vec<i64> = pending_ids.iter().map(|(id, _)| *id).collect();
    let contents = read_contents(conn, &ids)?;
    let pending = pending_ids
        .into_iter()
        .map(|(content_id, update_time)| PendingRefContent {
            content_id,
            update_time,
            content: contents.get(&content_id).cloned().flatten(),
        })
        .collect();
    Ok(PendingRefBatch { pending, removed })
}

/** 只有含 content-link 的正文才取正文，与桌面 reindexContents 的预过滤一致 */
fn read_contents(conn: &Connection, ids: &[i64]) -> Result<HashMap<i64, Option<String>>, String> {
    let mut result = HashMap::new();
    if ids.is_empty() {
        return Ok(result);
    }
    let marks = vec!["?"; ids.len()].join(",");
    let sql = format!(
        "SELECT id, CASE WHEN instr(content, '\"content-link\"') > 0 THEN content END FROM contents
         WHERE id IN ({marks})"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("ENTITY_REFS_FAILED: Failed to read contents: {e}"))?;
    let rows = stmt
        .query_map(params_from_iter(ids.iter().copied()), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| format!("ENTITY_REFS_FAILED: Failed to read contents: {e}"))?;
    for row in rows {
        let (id, content) =
            row.map_err(|e| format!("ENTITY_REFS_FAILED: Failed to read contents: {e}"))?;
        result.insert(id, content);
    }
    Ok(result)
}

#[tauri::command]
pub fn entity_refs_pending(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<PendingRefBatch, String> {
    let limit = limit.unwrap_or(50).clamp(1, 200);
    let (conn, index_conn) = open_connections(&app)?;
    ensure_ref_index_version(&index_conn)?;
    diff_pending(&conn, &index_conn, limit)
}

#[tauri::command]
pub fn entity_refs_apply(app: AppHandle, payload: ApplyRefsPayload) -> Result<(), String> {
    let (_conn, index_conn) = open_connections(&app)?;
    index_conn
        .execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| format!("ENTITY_REFS_FAILED: Failed to begin transaction: {e}"))?;
    let result = (|| -> Result<(), rusqlite::Error> {
        for content_id in &payload.removed {
            index_conn.execute(
                "DELETE FROM entity_refs WHERE src_content_id = ?1",
                params![content_id],
            )?;
            index_conn.execute(
                "DELETE FROM entity_ref_sources WHERE content_id = ?1",
                params![content_id],
            )?;
        }
        for applied in &payload.applied {
            index_conn.execute(
                "DELETE FROM entity_refs WHERE src_content_id = ?1",
                params![applied.content_id],
            )?;
            for reference in &applied.refs {
                index_conn.execute(
                    "INSERT INTO entity_refs
                       (src_content_id, dst_kind, dst_id, dst_content_id,
                        snippet_before, snippet_label, snippet_after, src_block)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        applied.content_id,
                        reference.dst_kind,
                        reference.dst_id,
                        reference.dst_content_id,
                        reference.snippet_before,
                        reference.snippet_label,
                        reference.snippet_after,
                        reference.src_block
                    ],
                )?;
            }
            index_conn.execute(
                "INSERT INTO entity_ref_sources (content_id, update_time) VALUES (?1, ?2)
                 ON CONFLICT(content_id) DO UPDATE SET update_time = excluded.update_time",
                params![applied.content_id, applied.update_time],
            )?;
        }
        Ok(())
    })();
    match result {
        Ok(()) => index_conn
            .execute_batch("COMMIT")
            .map_err(|e| format!("ENTITY_REFS_FAILED: Failed to commit: {e}")),
        Err(err) => {
            let _ = index_conn.execute_batch("ROLLBACK");
            Err(format!("ENTITY_REFS_FAILED: Failed to apply refs: {err}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const INDEX_DDL: &str = "
        CREATE TABLE entity_refs (
          src_content_id INTEGER NOT NULL,
          src_block INTEGER NOT NULL DEFAULT 0,
          dst_kind TEXT NOT NULL,
          dst_id INTEGER NOT NULL,
          dst_content_id INTEGER,
          snippet_before TEXT NOT NULL DEFAULT '',
          snippet_label TEXT NOT NULL DEFAULT '',
          snippet_after TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE entity_ref_sources (
          content_id INTEGER PRIMARY KEY,
          update_time INTEGER NOT NULL
        );
        CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER);
    ";

    fn test_setup() -> (Connection, Connection) {
        let main = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&main).unwrap();
        let index = Connection::open_in_memory().unwrap();
        index.execute_batch(INDEX_DDL).unwrap();
        (main, index)
    }

    fn insert_content(conn: &Connection, id: i64, update_time: i64, content: &str) {
        conn.execute(
            "INSERT INTO contents (id, create_time, update_time, content) VALUES (?1, ?2, ?2, ?3)",
            params![id, update_time, content],
        )
        .unwrap();
    }

    #[test]
    fn diff_and_apply_converge_and_track_removals() {
        let (main, index) = test_setup();
        insert_content(&main, 10, 100, "[{\"type\":\"content-link\"}]");
        insert_content(&main, 20, 200, "[{\"type\":\"paragraph\"}]");

        // 版本对账：首次写入版本号
        ensure_ref_index_version(&index).unwrap();
        let batch = diff_pending(&main, &index, 50).unwrap();
        assert_eq!(batch.pending.len(), 2);
        assert!(batch.removed.is_empty());
        // 含 content-link 的正文带回正文，其余为 null
        let with_link = batch
            .pending
            .iter()
            .find(|item| item.content_id == 10)
            .unwrap();
        assert!(with_link
            .content
            .as_deref()
            .unwrap()
            .contains("content-link"));
        let without_link = batch
            .pending
            .iter()
            .find(|item| item.content_id == 20)
            .unwrap();
        assert!(without_link.content.is_none());

        // 写入索引（content 10 有一条引用，content 20 无引用只回写对账时间）
        entity_refs_apply_rows(
            &index,
            &[
                AppliedRefContent {
                    content_id: 10,
                    update_time: 100,
                    refs: vec![RefRowInput {
                        dst_kind: "card".to_string(),
                        dst_id: 5,
                        dst_content_id: Some(30),
                        snippet_before: "前".to_string(),
                        snippet_label: "链接".to_string(),
                        snippet_after: "后".to_string(),
                        src_block: 0,
                    }],
                },
                AppliedRefContent {
                    content_id: 20,
                    update_time: 200,
                    refs: vec![],
                },
            ],
        );

        // 收敛：再次对账无待处理
        let batch = diff_pending(&main, &index, 50).unwrap();
        assert!(batch.pending.is_empty());
        assert!(batch.removed.is_empty());

        // 正文更新后再次 stale；删除后进入 removed
        main.execute("UPDATE contents SET update_time = 300 WHERE id = 10", [])
            .unwrap();
        main.execute("DELETE FROM contents WHERE id = 20", [])
            .unwrap();
        let batch = diff_pending(&main, &index, 50).unwrap();
        assert_eq!(batch.pending.len(), 1);
        assert_eq!(batch.pending[0].content_id, 10);
        assert_eq!(batch.removed, vec![20]);
    }

    #[test]
    fn version_mismatch_clears_sources() {
        let (main, index) = test_setup();
        ensure_ref_index_version(&index).unwrap();
        entity_refs_apply_rows(
            &index,
            &[AppliedRefContent {
                content_id: 10,
                update_time: 1,
                refs: vec![],
            }],
        );
        insert_content(&main, 10, 1, "[]");
        assert!(diff_pending(&main, &index, 50).unwrap().pending.is_empty());
        // 版本号变化（口径升级）→ 对账状态清空，全部正文重新待处理
        index
            .execute(
                "UPDATE index_meta SET value = '4' WHERE key = ?1",
                params![REF_INDEX_VERSION_KEY],
            )
            .unwrap();
        ensure_ref_index_version(&index).unwrap();
        let batch = diff_pending(&main, &index, 50).unwrap();
        assert_eq!(batch.pending.len(), 1);
    }

    /// 与 entity_refs_apply 命令同一写入逻辑，绕开 AppHandle 直测
    fn entity_refs_apply_rows(index: &Connection, applied: &[AppliedRefContent]) {
        index.execute_batch("BEGIN IMMEDIATE").unwrap();
        for item in applied {
            index
                .execute(
                    "DELETE FROM entity_refs WHERE src_content_id = ?1",
                    params![item.content_id],
                )
                .unwrap();
            for reference in &item.refs {
                index
                    .execute(
                        "INSERT INTO entity_refs
                           (src_content_id, dst_kind, dst_id, dst_content_id,
                            snippet_before, snippet_label, snippet_after, src_block)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![
                            item.content_id,
                            reference.dst_kind,
                            reference.dst_id,
                            reference.dst_content_id,
                            reference.snippet_before,
                            reference.snippet_label,
                            reference.snippet_after,
                            reference.src_block
                        ],
                    )
                    .unwrap();
            }
            index
                .execute(
                    "INSERT INTO entity_ref_sources (content_id, update_time) VALUES (?1, ?2)
                     ON CONFLICT(content_id) DO UPDATE SET update_time = excluded.update_time",
                    params![item.content_id, item.update_time],
                )
                .unwrap();
        }
        index.execute_batch("COMMIT").unwrap();
    }
}
