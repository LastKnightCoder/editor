// 协作绑定：记录本地 content 与协作房间（documentId）的对应关系。
// 表结构在共享 schema（packages/db-schema/schema/main.sql 的 collaboration_bindings），
// 与桌面端同名字段同语义，便于同一数据库跨端打开时互认。
//
// 绑定表不参与全文索引，因此不写 operation 记录（避免 reconcile 遇到未知 content_type）。

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use super::common::db_err;
use super::schema::open_active_database;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationBinding {
    pub content_id: i64,
    pub content_created_at: i64,
    pub server_url: String,
    pub document_id: String,
    pub source_type: Option<String>,
    pub source_id: Option<i64>,
    pub source_title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindContentPayload {
    pub content_id: i64,
    pub expected_document_id: String,
    pub expected_source_id: String,
    pub expected_revision: String,
    pub server_url: String,
    pub document_id: String,
    pub source_type: Option<String>,
    pub source_id: Option<i64>,
    pub source_title: Option<String>,
}

fn read_binding(
    conn: &rusqlite::Connection,
    content_id: i64,
) -> Result<Option<CollaborationBinding>, String> {
    conn.query_row(
        "SELECT content_id, content_created_at, server_url, document_id, source_type, source_id, source_title
         FROM collaboration_bindings WHERE content_id = ?1",
        params![content_id],
        |row| {
            Ok(CollaborationBinding {
                content_id: row.get(0)?,
                content_created_at: row.get(1)?,
                server_url: row.get(2)?,
                document_id: row.get(3)?,
                source_type: row.get(4)?,
                source_id: row.get(5)?,
                source_title: row.get(6)?,
            })
        },
    )
    .optional()
    .map_err(|e| db_err("COLLAB_BIND_READ_FAILED", "query collaboration binding", e))
}

/// 建立/更新内容与协作房间的绑定。content_created_at 取自 contents 表，
/// 作为回写前的漂移校验依据（与桌面端同义）。
#[tauri::command]
pub fn collab_bind_content(
    app: AppHandle,
    payload: BindContentPayload,
) -> Result<CollaborationBinding, String> {
    let mut connection = open_active_database(&app)?;
    let conn = connection.transaction().map_err(|e| e.to_string())?;
    let identity: (String, String, String) = conn.query_row("SELECT d.document_id,d.revision,l.source_id FROM content_documents d CROSS JOIN library_identity l WHERE d.content_id=?1 AND l.id=1", [payload.content_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?))).map_err(|_| "COLLAB_BIND_FAILED: 正文身份尚未建立".to_string())?;
    if identity
        != (
            payload.expected_document_id,
            payload.expected_revision,
            payload.expected_source_id,
        )
    {
        return Err("COLLAB_BIND_FAILED: 正文或资料库身份已变化".into());
    }
    if let Some(previous) = read_binding(&conn, payload.content_id)? {
        if previous.document_id != payload.document_id || previous.server_url != payload.server_url
        {
            return Err("COLLAB_BIND_FAILED: 已关联另一共享文档".into());
        }
    }
    let created_at: i64 = conn
        .query_row(
            "SELECT create_time FROM content_snapshots WHERE id = ?1",
            params![payload.content_id],
            |row| row.get(0),
        )
        .map_err(|_| "COLLAB_CONTENT_NOT_FOUND: 内容不存在，无法发起协作".to_string())?;
    conn.execute(
        "
        INSERT INTO collaboration_bindings
          (content_id, content_created_at, server_url, document_id, source_type, source_id, source_title)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(content_id) DO UPDATE SET
          content_created_at = excluded.content_created_at,
          server_url = excluded.server_url,
          document_id = excluded.document_id,
          source_type = excluded.source_type,
          source_id = excluded.source_id,
          source_title = excluded.source_title
        ",
        params![
            payload.content_id,
            created_at,
            payload.server_url,
            payload.document_id,
            payload.source_type,
            payload.source_id,
            payload.source_title
        ],
    )
    .map_err(|e| db_err("COLLAB_BIND_FAILED", "upsert collaboration binding", e))?;
    conn.commit()
        .map_err(|e| db_err("COLLAB_BIND_FAILED", "commit binding", e))?;
    Ok(CollaborationBinding {
        content_id: payload.content_id,
        content_created_at: created_at,
        server_url: payload.server_url,
        document_id: payload.document_id,
        source_type: payload.source_type,
        source_id: payload.source_id,
        source_title: payload.source_title,
    })
}

#[tauri::command]
pub fn collab_get_binding(
    app: AppHandle,
    content_id: i64,
) -> Result<Option<CollaborationBinding>, String> {
    let conn = open_active_database(&app)?;
    read_binding(&conn, content_id)
}

#[tauri::command]
pub fn collab_list_bindings(app: AppHandle) -> Result<Vec<CollaborationBinding>, String> {
    let conn = open_active_database(&app)?;
    let mut statement = conn
        .prepare(
            "SELECT content_id, content_created_at, server_url, document_id, source_type, source_id, source_title
             FROM collaboration_bindings",
        )
        .map_err(|e| db_err("COLLAB_BIND_READ_FAILED", "prepare list bindings", e))?;
    let rows = statement
        .query_map([], |row| {
            Ok(CollaborationBinding {
                content_id: row.get(0)?,
                content_created_at: row.get(1)?,
                server_url: row.get(2)?,
                document_id: row.get(3)?,
                source_type: row.get(4)?,
                source_id: row.get(5)?,
                source_title: row.get(6)?,
            })
        })
        .map_err(|e| db_err("COLLAB_BIND_READ_FAILED", "list bindings", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| db_err("COLLAB_BIND_READ_FAILED", "collect bindings", e))
}

/// 解除绑定（结束共享或退出协作后调用）；本地内容保持不变。
#[tauri::command]
pub fn collab_unbind_content(
    app: AppHandle,
    content_id: i64,
    expected_document_id: Option<String>,
    expected_source_id: Option<String>,
) -> Result<(), String> {
    let conn = open_active_database(&app)?;
    if let Some(expected) = expected_source_id {
        let source: String = conn
            .query_row(
                "SELECT source_id FROM library_identity WHERE id=1",
                [],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if source != expected {
            return Err("请切回原资料库完成共享解绑".into());
        }
    }
    conn.execute(
        "DELETE FROM collaboration_bindings WHERE content_id = ?1 AND (?2 IS NULL OR document_id=?2)",
        params![content_id, expected_document_id],
    )
    .map_err(|e| db_err("COLLAB_UNBIND_FAILED", "delete collaboration binding", e))?;
    Ok(())
}

/// 绑定协作的内容只允许经投影管线（collab_project_content）写入或删除，
/// 与桌面端 tables/content.ts 的 assertContentIsLocal（COLLABORATION_WRITE_REQUIRED）同语义。
pub fn assert_content_local(conn: &rusqlite::Connection, content_id: i64) -> Result<(), String> {
    let bound = read_binding(conn, content_id)?;
    if bound.is_some() {
        return Err(
            "COLLABORATION_WRITE_REQUIRED: 这段内容正在协作，请在协作编辑页修改，或先结束共享"
                .to_string(),
        );
    }
    Ok(())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginProjectionOrigin {
    time_zone: Option<super::calendar_time::CalendarTimeZone>,
    task_operation_id: Option<i64>,
    task_restore_id: Option<i64>,
    token: String,
    database: String,
    plugin_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContentPayload {
    pub plugin: Option<PluginProjectionOrigin>,
    pub expected_source_id: Option<String>,
    pub document_id: String,
    pub contracts: Option<Value>,
    pub expected_revision: Option<String>,
    pub expected_document_id: Option<String>,
    pub content_id: i64,
    pub content: Value,
    pub count: i64,
}

/// 协作投影专用写入通道：云端内容物化回本地库。
/// 与常规 update_content 的差异——绑定漂移校验（contents.create_time 与绑定记录不一致
/// 视为本地内容已被删除重建，自动解绑并跳过写入，避免污染新内容）。
#[tauri::command]
pub fn collab_project_content(
    app: AppHandle,
    payload: ProjectContentPayload,
) -> Result<Value, String> {
    if let Some(origin) = payload.plugin.clone() {
        crate::provider_settings::validate_plugin_id(&origin.plugin_id)?;
        return crate::plugin_transport::with_database(&origin.token, &origin.database, || {
            project_content(app, payload)
        });
    }
    project_content(app, payload)
}

fn project_content(app: AppHandle, payload: ProjectContentPayload) -> Result<Value, String> {
    let mut conn = open_active_database(&app)?;
    let database_name = conn.database_name().to_owned();
    let before = payload
        .plugin
        .as_ref()
        .map(|_| super::plugin_data::last_operation(&conn))
        .transpose()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    let result = project_content_snapshot(&mut conn, &database_name, &payload, now)?;
    if result["projected"] == true {
        if let (Some(origin), Some(before)) = (&payload.plugin, before) {
            super::plugin_data::remember_origin(&conn, &origin.token, &origin.plugin_id, before)?;
        }
        super::reconcile::trigger_reconcile(&app, &database_name);
    }
    Ok(result)
}

pub(super) fn project_content_snapshot(
    conn: &mut rusqlite::Connection,
    database_name: &str,
    payload: &ProjectContentPayload,
    now: i64,
) -> Result<Value, String> {
    let tx = conn
        .transaction()
        .map_err(|e| db_err("COLLAB_PROJECT_FAILED", "begin transaction", e))?;
    if let Some(expected) = &payload.expected_source_id {
        let source: Option<String> = tx
            .query_row(
                "SELECT source_id FROM library_identity WHERE id=1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if source.as_ref() != Some(expected) {
            return Ok(json!({ "projected": false, "reason": "library" }));
        }
    }
    if payload
        .plugin
        .as_ref()
        .is_some_and(|origin| origin.database != database_name)
    {
        return Err("插件工作区已失效".into());
    }
    let Some(binding) = read_binding(&tx, payload.content_id)? else {
        // 已解绑（结束共享/退出）后迟到的投影：幂等跳过
        return Ok(json!({ "projected": false, "reason": "unbound" }));
    };
    let create_time: Option<i64> = tx
        .query_row(
            "SELECT create_time FROM content_snapshots WHERE id = ?1",
            params![payload.content_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| db_err("COLLAB_PROJECT_FAILED", "read content create_time", e))?;
    if create_time != Some(binding.content_created_at) {
        // 漂移：绑定指向的原内容已不存在（被删除重建），解绑放行本地直写
        tx.execute(
            "DELETE FROM collaboration_bindings WHERE content_id = ?1",
            params![payload.content_id],
        )
        .map_err(|e| db_err("COLLAB_PROJECT_FAILED", "unbind drifted content", e))?;
        tx.commit()
            .map_err(|e| db_err("COLLAB_PROJECT_FAILED", "commit drift cleanup", e))?;
        return Ok(json!({ "projected": false, "reason": "drift" }));
    }
    if payload.document_id != binding.document_id {
        return Err("COLLAB_PROJECT_FAILED: 共享绑定已变化".into());
    }
    let changed = super::write_content_snapshot_in_zone(
        &tx,
        payload.content_id,
        &payload.content,
        payload.count,
        now,
        "COLLAB_PROJECT_FAILED",
        payload.contracts.as_ref(),
        payload.expected_revision.as_deref(),
        payload.expected_document_id.as_deref(),
        payload.expected_source_id.as_deref(),
        payload.plugin.as_ref().and_then(|origin| origin.time_zone),
    )?;
    if let Some(origin) = &payload.plugin {
        if let Some(id) = origin.task_operation_id {
            super::plugin_document_tasks::finish_shared(
                &tx,
                &origin.plugin_id,
                id,
                &payload.document_id,
            )?;
        }
        if let Some(id) = origin.task_restore_id {
            super::plugin_document_tasks::finish_restore(
                &tx,
                &origin.plugin_id,
                id,
                &payload.document_id,
            )?;
        }
    }
    let revision: Option<String> = tx
        .query_row(
            "SELECT revision FROM content_documents WHERE content_id=?1",
            [payload.content_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    tx.commit()
        .map_err(|e| db_err("COLLAB_PROJECT_FAILED", "commit projection", e))?;

    Ok(json!({ "projected": true, "changed": changed > 0, "revision": revision }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{content_contracts, query, schema, update_content_snapshot};
    use rusqlite::Connection;

    fn ints(db: &Connection, sql: &str) -> Vec<i64> {
        let mut statement = db.prepare(sql).unwrap();
        let values = statement.query_map([], |row| row.get::<_, i64>(0)).unwrap();
        values.collect::<rusqlite::Result<_>>().unwrap()
    }

    fn assert_table_refs(db: &Connection, expected: &Value) {
        assert_eq!(
            json!(ints(db, "SELECT ref_count FROM data_tables ORDER BY id")),
            expected["tableRefs"]
        );
        assert_eq!(
            json!(ints(
                db,
                "SELECT ref_count FROM contents WHERE id IN (8,9) ORDER BY id"
            )),
            expected["rowRefs"]
        );
        assert_eq!(
            json!(ints(
                db,
                "SELECT content_id FROM content_pending_releases ORDER BY content_id"
            )),
            expected["pendingRows"]
        );
    }

    #[test]
    #[ignore = "由桌面交换测试提供隔离的共享正文布局 3 数据库文件"]
    fn desktop_shared_projection_roundtrip() {
        let baseline: Value = serde_json::from_str(include_str!(
            "../../../../../packages/db-schema/fixtures/content-storage-roundtrip-v1.json"
        ))
        .unwrap();
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../../../packages/db-schema/fixtures/content-storage-roundtrip-g4.json"
        ))
        .unwrap();
        assert_eq!(fixture["fixtureVersion"], 2);
        let mut db = content_contracts::open_roundtrip_database();
        let name = fixture["databaseName"].as_str().unwrap();
        let source = baseline["sourceId"].as_str().unwrap();
        let content_id = baseline["contentId"].as_i64().unwrap();
        let before = query::query_content_detail(&db, content_id).unwrap();
        let mut desktop_nodes = baseline["desktopInitial"].as_array().unwrap().clone();
        desktop_nodes.push(fixture["desktopNode"].clone());
        let mut mobile_nodes = baseline["mobileExpected"].as_array().unwrap().clone();
        mobile_nodes.push(fixture["mobileNode"].clone());
        let mut contracts = baseline["contracts"].as_object().unwrap().clone();
        contracts.extend(fixture["contract"].as_object().unwrap().clone());
        assert_eq!(
            before.document_id.as_deref(),
            baseline["documentId"].as_str()
        );
        assert_eq!(before.library_source_id.as_deref(), Some(source));
        assert_eq!(before.contracts, Some(json!(contracts)));
        assert_eq!(before.content, json!(desktop_nodes));
        assert_eq!(
            ints(
                &db,
                "SELECT format_version FROM content_documents WHERE content_id=7"
            ),
            vec![3]
        );
        let binding = read_binding(&db, content_id).unwrap().unwrap();
        let room = fixture["binding"]["documentId"].as_str().unwrap();
        assert_eq!(binding.document_id, room);
        assert_eq!(
            binding.server_url,
            fixture["binding"]["serverUrl"].as_str().unwrap()
        );
        assert_eq!(binding.source_type.as_deref(), Some("article"));
        assert_eq!(binding.source_id, baseline["articleId"].as_i64());
        assert_table_refs(&db, &fixture["expectedBefore"]);

        let generation = schema::database_generation(&db).unwrap();
        let direct = serde_json::from_value(json!({
            "expectedGeneration": generation,
            "expectedDatabaseName": name,
            "expectedSourceId": source,
            "expectedDocumentId": before.document_id,
            "expectedRevision": before.revision,
            "contentId": content_id,
            "content": mobile_nodes,
            "count": baseline["counts"]["mobile"],
            "contracts": contracts
        }))
        .unwrap();
        assert!(update_content_snapshot(&mut db, &direct, name)
            .unwrap_err()
            .starts_with("COLLABORATION_WRITE_REQUIRED"));

        let now = baseline["mobileWrittenAt"].as_i64().unwrap();
        let mut payload: ProjectContentPayload = serde_json::from_value(json!({
            "documentId": room,
            "contentId": content_id,
            "expectedSourceId": source,
            "expectedDocumentId": before.document_id,
            "expectedRevision": before.revision,
            "content": mobile_nodes,
            "count": baseline["counts"]["mobile"],
            "contracts": contracts
        }))
        .unwrap();
        payload.expected_source_id = Some("other-library".into());
        assert_eq!(
            project_content_snapshot(&mut db, name, &payload, now).unwrap(),
            json!({"projected": false, "reason": "library"})
        );
        payload.expected_source_id = Some(source.into());
        payload.document_id = "other-room".into();
        assert!(project_content_snapshot(&mut db, name, &payload, now)
            .unwrap_err()
            .contains("共享绑定已变化"));
        payload.document_id = room.into();
        payload.expected_revision = Some("obsolete".into());
        assert!(project_content_snapshot(&mut db, name, &payload, now)
            .unwrap_err()
            .starts_with("CONTENT_REVISION_CONFLICT"));
        payload.expected_revision = before.revision.clone();

        db.execute_batch(
            "CREATE TEMP TRIGGER fail_content_operation BEFORE INSERT ON operation
             WHEN NEW.operation_content_type='content' AND NEW.operation_id=7
             BEGIN SELECT RAISE(ABORT, '模拟正文流水失败'); END;",
        )
        .unwrap();
        assert!(project_content_snapshot(&mut db, name, &payload, now)
            .unwrap_err()
            .contains("模拟正文流水失败"));
        db.execute_batch("DROP TRIGGER fail_content_operation")
            .unwrap();
        let rolled_back = query::query_content_detail(&db, content_id).unwrap();
        assert_eq!(rolled_back.content, before.content);
        assert_eq!(rolled_back.revision, before.revision);
        assert_eq!(rolled_back.update_time, before.update_time);
        assert_eq!(
            rolled_back.card.unwrap().update_time,
            before.card.unwrap().update_time
        );
        assert_eq!(
            ints(
                &db,
                "SELECT format_version FROM content_documents WHERE content_id=7"
            ),
            vec![3]
        );
        assert_table_refs(&db, &fixture["expectedBefore"]);

        let accepted = project_content_snapshot(&mut db, name, &payload, now).unwrap();
        assert_eq!(accepted["projected"], true);
        assert_eq!(accepted["changed"], true);
        let saved = query::query_content_detail(&db, content_id).unwrap();
        assert_eq!(saved.content, json!(mobile_nodes));
        assert_eq!(saved.document_id, before.document_id);
        assert_eq!(saved.contracts, before.contracts);
        assert_ne!(saved.revision, before.revision);
        assert_eq!(accepted["revision"], json!(saved.revision));
        assert_eq!(
            ints(
                &db,
                "SELECT format_version FROM content_documents WHERE content_id=7"
            ),
            vec![2]
        );
        assert_eq!(ints(&db, "SELECT COUNT(*) FROM operation WHERE operation_content_type='content' AND operation_id=7 AND operation_action='update'"), vec![1]);
        assert_eq!(
            read_binding(&db, content_id).unwrap().unwrap().document_id,
            room
        );
        assert_table_refs(&db, &fixture["expectedAfter"]);

        let row_id = fixture["tables"][1]["rowContentId"].as_i64().unwrap();
        let row_before = query::query_content_detail(&db, row_id).unwrap();
        assert_eq!(row_before.content, fixture["rowBefore"]);
        let mut row = serde_json::from_value::<crate::database::UpdateContentPayload>(json!({
            "expectedGeneration": "obsolete",
            "expectedDatabaseName": name,
            "expectedSourceId": source,
            "expectedDocumentId": row_before.document_id,
            "expectedRevision": row_before.revision,
            "contentId": row_id,
            "content": fixture["rowAfter"],
            "count": 8,
            "contracts": row_before.contracts
        }))
        .unwrap();
        assert!(update_content_snapshot(&mut db, &row, name)
            .unwrap_err()
            .starts_with("DATABASE_REPLACED"));
        assert_eq!(
            query::query_content_detail(&db, row_id).unwrap().content,
            row_before.content
        );
        row.expected_generation = Some(generation);
        update_content_snapshot(&mut db, &row, name).unwrap();
        let row_saved = query::query_content_detail(&db, row_id).unwrap();
        assert_eq!(row_saved.content, fixture["rowAfter"]);
        assert_eq!(row_saved.document_id, row_before.document_id);
        assert_eq!(row_saved.contracts, row_before.contracts);
        assert_table_refs(&db, &fixture["expectedAfter"]);
        assert_eq!(
            db.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "ok"
        );
        db.close().unwrap();
        println!("TAU_CONTENT_STORAGE_ROUNDTRIP_RUST_OK");
    }
}
