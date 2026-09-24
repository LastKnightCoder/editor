// 首页汇总统计：一次只读查询返回各内容域计数，避免前端为拿 total 拉多个列表接口。
// 口径与各列表接口及首页"最近动态"的过滤保持一致（文章排除软删，文档节点仅计自持正文）。

use rusqlite::Connection;
use serde::Serialize;
use tauri::AppHandle;

use super::common::db_err;
use super::schema;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeStatsResponse {
    pub articles_total: i64,
    pub projects_total: i64,
    pub project_documents_total: i64,
}

fn count(conn: &Connection, sql: &str) -> Result<i64, String> {
    conn.query_row(sql, [], |row| row.get::<_, i64>(0))
        .map_err(|e| db_err("HOME_STATS_QUERY_FAILED", "count rows", e))
}

#[tauri::command]
pub fn get_home_stats(app: AppHandle) -> Result<HomeStatsResponse, String> {
    let conn = schema::open_active_database(&app)?;
    Ok(HomeStatsResponse {
        articles_total: count(&conn, "SELECT COUNT(1) FROM articles WHERE is_delete = 0")?,
        projects_total: count(&conn, "SELECT COUNT(1) FROM project")?,
        project_documents_total: count(
            &conn,
            "SELECT COUNT(1) FROM project_item
             WHERE project_item_type = 'document' AND COALESCE(ref_type, '') = ''",
        )?,
    })
}
