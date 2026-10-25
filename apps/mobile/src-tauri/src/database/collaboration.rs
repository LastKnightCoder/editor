// 协作绑定：记录本地 content 与协作房间（documentId）的对应关系。
// 表结构在共享 schema（packages/db-schema/schema/main.sql 的 collaboration_bindings），
// 与桌面端同名字段同语义，便于同一数据库跨端打开时互认。
//
// 绑定表不参与全文索引，因此不写 operation 记录（避免 reconcile 遇到未知 content_type）。

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::AppHandle;

use super::common::db_err;
use super::schema::open_active_database;

pub fn migrate_collaboration_endpoints(
    app: &AppHandle,
    canonical: &str,
    hashes: &[String],
) -> Result<(), String> {
    if hashes.is_empty() {
        return Ok(());
    }
    let mut conn = open_active_database(app)?;
    migrate_binding_origins(&mut conn, canonical, hashes)
}

fn migrate_binding_origins(
    conn: &mut rusqlite::Connection,
    canonical: &str,
    hashes: &[String],
) -> Result<(), String> {
    let origins = {
        let mut query = conn
            .prepare("SELECT DISTINCT server_url FROM collaboration_bindings")
            .map_err(|e| {
                db_err(
                    "COLLAB_ENDPOINT_MIGRATION_FAILED",
                    "read binding origins",
                    e,
                )
            })?;
        let values = query
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| {
                db_err(
                    "COLLAB_ENDPOINT_MIGRATION_FAILED",
                    "query binding origins",
                    e,
                )
            })?;
        values.collect::<Result<Vec<_>, _>>().map_err(|e| {
            db_err(
                "COLLAB_ENDPOINT_MIGRATION_FAILED",
                "collect binding origins",
                e,
            )
        })?
    };
    let transaction = conn.transaction().map_err(|e| {
        db_err(
            "COLLAB_ENDPOINT_MIGRATION_FAILED",
            "begin endpoint migration",
            e,
        )
    })?;
    for origin in origins {
        let digest = format!("{:x}", Sha256::digest(origin.as_bytes()));
        if hashes.contains(&digest) {
            transaction
                .execute(
                    "UPDATE collaboration_bindings SET server_url=?1 WHERE server_url=?2",
                    params![canonical, origin],
                )
                .map_err(|e| {
                    db_err(
                        "COLLAB_ENDPOINT_MIGRATION_FAILED",
                        "migrate binding origin",
                        e,
                    )
                })?;
        }
    }
    transaction.commit().map_err(|e| {
        db_err(
            "COLLAB_ENDPOINT_MIGRATION_FAILED",
            "commit endpoint migration",
            e,
        )
    })
}

#[cfg(test)]
mod endpoint_tests {
    use super::*;

    #[test]
    fn endpoint_migration_preserves_rooms_and_self_hosted_bindings() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE collaboration_bindings (
                content_id INTEGER PRIMARY KEY,
                server_url TEXT NOT NULL,
                document_id TEXT NOT NULL
            );",
        )
        .unwrap();
        let former = "https://former-service.example.com";
        let canonical = "https://collab.taunote.app";
        let self_hosted = "https://private-server.example.org";
        for (id, origin, room) in [(1, former, "room-a"), (2, self_hosted, "room-b")] {
            conn.execute(
                "INSERT INTO collaboration_bindings VALUES (?1, ?2, ?3)",
                params![id, origin, room],
            )
            .unwrap();
        }
        let hashes = [format!("{:x}", Sha256::digest(former.as_bytes()))];
        migrate_binding_origins(&mut conn, canonical, &hashes).unwrap();
        migrate_binding_origins(&mut conn, canonical, &hashes).unwrap();
        let rows = conn
            .prepare("SELECT content_id, server_url, document_id FROM collaboration_bindings ORDER BY content_id")
            .unwrap()
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            rows,
            vec![
                (1, canonical.to_string(), "room-a".to_string()),
                (2, self_hosted.to_string(), "room-b".to_string()),
            ]
        );
    }
}

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
    let mut conn = open_active_database(&app)?;
    let Some(binding) = read_binding(&conn, payload.content_id)? else {
        // 已解绑（结束共享/退出）后迟到的投影：幂等跳过
        return Ok(json!({ "projected": false, "reason": "unbound" }));
    };
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

    if payload.document_id != binding.document_id {
        return Err("COLLAB_PROJECT_FAILED: 共享绑定已变化".into());
    }
    let changed = super::write_content_snapshot(
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
    )?;
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

    let setting = crate::setting::load_or_init_setting(&app)?;
    let db_name = crate::setting::get_active_database_name(&setting);
    super::reconcile::trigger_reconcile(&app, &db_name);
    Ok(json!({ "projected": true, "changed": changed > 0, "revision": revision }))
}
