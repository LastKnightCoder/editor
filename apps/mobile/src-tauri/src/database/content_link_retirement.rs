use rusqlite::Connection;

/// content_link 能迁入谱系的唯一一种记录：网页条目 → 它的剪藏解析文档（与桌面 content-link-retirement.ts 同口径）
const MIGRATABLE: &str = "source_type = 'project_item' AND target_type = 'web_clip'";

pub(super) fn has_table(conn: &Connection) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='content_link')",
        [],
        |r| r.get(0),
    )
}

/// 在主库升级事务内把 content_link 迁入 entity_lineage 后删表；有无法迁移的记录时失败不放行。
/// 迁移 SQL 与 Node 端共用；备份由调用方在事务外做。
pub(super) fn retire(conn: &Connection) -> Result<(), String> {
    if !has_table(conn).map_err(|e| e.to_string())? {
        return Ok(());
    }
    let unexpected: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM content_link WHERE NOT ({MIGRATABLE})"),
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if unexpected > 0 {
        return Err(format!("content_link 含 {unexpected} 条无法迁移的记录"));
    }
    let sql: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../packages/db-schema/src/content-link-retirement-sql.json"
    ))
    .map_err(|e| e.to_string())?;
    conn.execute_batch(&sql.join("\n")).map_err(|e| e.to_string())
}
