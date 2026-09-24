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
    let conn = open_active_database(&app)?;
    let created_at: i64 = conn
        .query_row(
            "SELECT create_time FROM contents WHERE id = ?1",
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
pub fn collab_unbind_content(app: AppHandle, content_id: i64) -> Result<(), String> {
    let conn = open_active_database(&app)?;
    conn.execute(
        "DELETE FROM collaboration_bindings WHERE content_id = ?1",
        params![content_id],
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContentPayload {
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
    mut payload: ProjectContentPayload,
) -> Result<Value, String> {
    let mut conn = open_active_database(&app)?;
    let Some(binding) = read_binding(&conn, payload.content_id)? else {
        // 已解绑（结束共享/退出）后迟到的投影：幂等跳过
        return Ok(json!({ "projected": false, "reason": "unbound" }));
    };
    if let Some(mapping) = super::knowledge_migration::read_mapping(&conn)? {
        super::knowledge_migration::references(&mut payload.content, &mapping)?;
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);

    let tx = conn
        .transaction()
        .map_err(|e| db_err("COLLAB_PROJECT_FAILED", "begin transaction", e))?;
    let create_time: Option<i64> = tx
        .query_row(
            "SELECT create_time FROM contents WHERE id = ?1",
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

    let changed = super::write_content_snapshot(
        &tx,
        payload.content_id,
        &payload.content,
        payload.count,
        now,
        "COLLAB_PROJECT_FAILED",
    )?;
    tx.commit()
        .map_err(|e| db_err("COLLAB_PROJECT_FAILED", "commit projection", e))?;

    let setting = crate::setting::load_or_init_setting(&app)?;
    let db_name = crate::setting::get_active_database_name(&setting);
    super::reconcile::trigger_reconcile(&app, &db_name);
    Ok(json!({ "projected": true, "changed": changed > 0 }))
}

/// 仅向本库绑定的房间提供映射，避免将其他数据库的实体 ID 错误转换。
#[tauri::command]
pub fn collab_knowledge_mapping(app: AppHandle, document_id: String) -> Result<Value, String> {
    let conn = open_active_database(&app)?;
    let bound: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM collaboration_bindings WHERE document_id=?1)",
            [document_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !bound {
        return Ok(Value::Null);
    }
    serde_json::to_value(super::knowledge_migration::read_mapping(&conn)?)
        .map_err(|e| e.to_string())
}
