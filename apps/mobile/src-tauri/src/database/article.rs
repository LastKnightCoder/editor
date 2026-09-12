use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use super::common::{
    db_err, decrement_or_delete_content, insert_content_record, now_millis, parse_json_content,
    parse_string_array, write_operation,
};
use super::schema;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleListItem {
    pub id: i64,
    pub title: String,
    pub author: Option<String>,
    pub tags: Vec<String>,
    pub banner_bg: String,
    pub banner_position: String,
    pub is_top: bool,
    pub content_id: Option<i64>,
    pub count: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub content: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleListResponse {
    pub items: Vec<ArticleListItem>,
    pub total: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleListPayload {
    pub offset: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateArticlePayload {
    pub title: String,
    pub author: Option<String>,
    pub content: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateArticlePayload {
    pub id: i64,
    pub title: Option<String>,
    pub author: Option<String>,
    pub tags: Option<Vec<String>>,
    pub banner_bg: Option<String>,
    pub banner_position: Option<String>,
    pub is_top: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleIdPayload {
    pub id: i64,
}

const ARTICLE_SELECT: &str = "
    SELECT a.id, a.title, a.author, a.tags, a.banner_bg, a.banner_position, a.is_top, a.content_id,
           COALESCE(c.count, 0), a.create_time,
           MAX(a.update_time, COALESCE(c.update_time, 0)),
           c.content
    FROM articles a
    LEFT JOIN contents c ON c.id = a.content_id
    WHERE a.is_delete = 0
";

fn parse_article_row(row: &Row<'_>) -> rusqlite::Result<ArticleListItem> {
    Ok(ArticleListItem {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        tags: parse_string_array(row.get(3)?),
        banner_bg: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        banner_position: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
        is_top: row.get::<_, i64>(6)? == 1,
        content_id: row.get(7)?,
        count: row.get(8)?,
        create_time: row.get(9)?,
        update_time: row.get(10)?,
        content: parse_json_content(row.get(11)?),
    })
}

fn query_article_by_id(conn: &Connection, id: i64) -> Result<Option<ArticleListItem>, String> {
    let sql = format!("{ARTICLE_SELECT} AND a.id = ?1 LIMIT 1");
    conn.query_row(&sql, params![id], parse_article_row)
        .optional()
        .map_err(|e| db_err("ARTICLE_QUERY_FAILED", "query article", e))
}

#[tauri::command]
pub fn article_list(
    app: AppHandle,
    payload: ArticleListPayload,
) -> Result<ArticleListResponse, String> {
    let conn = schema::open_active_database(&app)?;
    let total = conn
        .query_row(
            "SELECT COUNT(1) FROM articles WHERE is_delete = 0",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| db_err("ARTICLE_QUERY_FAILED", "count articles", e))?;
    let offset = payload.offset.unwrap_or(0).max(0);
    let limit = payload.limit.unwrap_or(50).clamp(1, 200);
    // 列表恒按创建时间倒序（与桌面端 articles 列表一致），a.id 兜底保证同毫秒创建时顺序稳定；
    // 排序键不可变，正文/属性更新不会让条目跳位，offset 分页也不会因编辑而重复或漏项。
    let sql = format!(
        "{ARTICLE_SELECT}
        ORDER BY a.is_top DESC, a.create_time DESC, a.id DESC
        LIMIT ?1 OFFSET ?2"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| db_err("ARTICLE_QUERY_FAILED", "prepare list query", e))?;
    let rows = stmt
        .query_map(params![limit, offset], parse_article_row)
        .map_err(|e| db_err("ARTICLE_QUERY_FAILED", "query articles", e))?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| db_err("ARTICLE_QUERY_FAILED", "parse article row", e))?);
    }
    Ok(ArticleListResponse { items, total })
}

#[tauri::command]
pub fn article_get(app: AppHandle, payload: ArticleIdPayload) -> Result<ArticleListItem, String> {
    let conn = schema::open_active_database(&app)?;
    query_article_by_id(&conn, payload.id)?
        .ok_or_else(|| "ARTICLE_NOT_FOUND: article does not exist".to_string())
}

#[tauri::command]
pub fn article_create(
    app: AppHandle,
    payload: CreateArticlePayload,
) -> Result<ArticleListItem, String> {
    let title = payload.title.trim().to_string();
    if title.is_empty() {
        return Err("ARTICLE_INVALID: title must not be empty".to_string());
    }
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("ARTICLE_CREATE_FAILED", "begin transaction", e))?;
    let now = now_millis();
    let content = if payload.content.is_some() {
        payload.content.unwrap()
    } else {
        Value::Array(vec![serde_json::json!({
            "type": "paragraph",
            "children": [{"type": "formatted", "text": ""}]
        })])
    };
    let content_id = insert_content_record(&tx, &content, 0, now)?;
    tx.execute(
        "
        INSERT INTO articles (title, author, create_time, update_time, tags, links, banner_bg, is_top, is_delete, content_id)
        VALUES (?1, ?2, ?3, ?3, '[]', '[]', '', 0, 0, ?4)
        ",
        params![title, payload.author, now, content_id],
    )
    .map_err(|e| db_err("ARTICLE_CREATE_FAILED", "insert article", e))?;
    let article_id = tx.last_insert_rowid();
    write_operation(&tx, "article", "insert", article_id, now)?;
    let article = query_article_by_id(&tx, article_id)?
        .ok_or_else(|| "ARTICLE_NOT_FOUND: article does not exist".to_string())?;
    tx.commit()
        .map_err(|e| db_err("ARTICLE_CREATE_FAILED", "commit transaction", e))?;
    super::common::trigger_reconcile(&app);
    Ok(article)
}

#[tauri::command]
pub fn article_update(
    app: AppHandle,
    payload: UpdateArticlePayload,
) -> Result<ArticleListItem, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("ARTICLE_UPDATE_FAILED", "begin transaction", e))?;
    let current = query_article_by_id(&tx, payload.id)?
        .ok_or_else(|| "ARTICLE_NOT_FOUND: article does not exist".to_string())?;
    let now = now_millis();
    let tags = payload
        .tags
        .map(|tags| serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()))
        .unwrap_or_else(|| {
            serde_json::to_string(&current.tags).unwrap_or_else(|_| "[]".to_string())
        });
    tx.execute(
        "
        UPDATE articles
        SET title = ?1, author = ?2, tags = ?3, banner_bg = ?4, banner_position = ?5, is_top = ?6, update_time = ?7
        WHERE id = ?8
        ",
        params![
            payload.title.unwrap_or(current.title),
            payload.author.or(current.author),
            tags,
            payload.banner_bg.unwrap_or(current.banner_bg),
            payload.banner_position.unwrap_or(current.banner_position),
            if payload.is_top.unwrap_or(current.is_top) { 1 } else { 0 },
            now,
            payload.id
        ],
    )
    .map_err(|e| db_err("ARTICLE_UPDATE_FAILED", "update article", e))?;
    write_operation(&tx, "article", "update", payload.id, now)?;
    let article = query_article_by_id(&tx, payload.id)?
        .ok_or_else(|| "ARTICLE_NOT_FOUND: article does not exist".to_string())?;
    tx.commit()
        .map_err(|e| db_err("ARTICLE_UPDATE_FAILED", "commit transaction", e))?;
    super::common::trigger_reconcile(&app);
    Ok(article)
}

#[tauri::command]
pub fn article_delete(app: AppHandle, payload: ArticleIdPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("ARTICLE_DELETE_FAILED", "begin transaction", e))?;
    let content_id = tx
        .query_row(
            "SELECT content_id FROM articles WHERE id = ?1 AND is_delete = 0 LIMIT 1",
            params![payload.id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|e| db_err("ARTICLE_DELETE_FAILED", "query article", e))?
        .ok_or_else(|| "ARTICLE_NOT_FOUND: article does not exist".to_string())?;
    let now = now_millis();
    tx.execute(
        "UPDATE articles SET is_delete = 1, update_time = ?1 WHERE id = ?2",
        params![now, payload.id],
    )
    .map_err(|e| db_err("ARTICLE_DELETE_FAILED", "mark deleted", e))?;
    write_operation(&tx, "article", "delete", payload.id, now)?;
    if let Some(content_id) = content_id {
        decrement_or_delete_content(&tx, content_id)?;
    }
    tx.commit()
        .map_err(|e| db_err("ARTICLE_DELETE_FAILED", "commit transaction", e))?;
    super::common::trigger_reconcile(&app);
    Ok(1)
}
