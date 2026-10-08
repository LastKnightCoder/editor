use rusqlite::{params, Connection};
use serde_json::Value;

use crate::models::{
    CardDetailResponse, CardListItem, CardsOverviewResponse, ContentCardMeta, ContentDetailResponse,
};

use super::search;

#[derive(Debug, Clone)]
pub struct RawCardRow {
    pub id: i64,
    pub content_id: i64,
    pub update_time: i64,
    pub tags_raw: Option<String>,
    pub content_raw: Option<String>,
}

fn parse_string_array(raw_json: Option<String>) -> Vec<String> {
    let Some(raw) = raw_json else {
        return vec![];
    };
    let parsed = serde_json::from_str::<Value>(&raw);
    let Ok(value) = parsed else {
        return vec![];
    };
    value
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.as_str().map(|v| v.to_string()))
                .collect::<Vec<String>>()
        })
        .unwrap_or_default()
}

fn parse_tags(raw_tags: Option<String>) -> Vec<String> {
    parse_string_array(raw_tags)
}

/// 与正文显式连接、且有卡片投影的对方正文（content_links 无向边、绑定正文），
/// 按连接建立时间排序。update_card_links 只对这些做差量：没有卡片投影的邻居
/// （文章 / 项目文档）移动端看不到，不能因整表保存被误删。
pub(super) fn card_backed_neighbor_contents(conn: &Connection, content_id: i64) -> Vec<i64> {
    let Ok(mut stmt) = conn.prepare(
        "
        SELECT c2.content_id
        FROM content_links cl
        JOIN cards c2 ON c2.content_id IN (cl.content_id, cl.target_content_id)
        WHERE (cl.content_id = ?1 OR cl.target_content_id = ?1)
          AND c2.content_id != ?1
        GROUP BY c2.content_id
        ORDER BY MIN(cl.create_time)
        ",
    ) else {
        return vec![];
    };
    stmt.query_map(params![content_id], |row| row.get::<_, i64>(0))
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
}

/// 正文显式连接落到卡片身份的邻居：每个对方正文取一张卡片作代表（多卡共用取最小 id），
/// 按连接建立时间排序。没有卡片投影的邻居在移动端不展示，桌面端脉络可见。
pub(super) fn linked_card_ids(conn: &Connection, content_id: i64) -> Vec<i64> {
    let Ok(mut stmt) = conn.prepare(
        "
        SELECT MIN(c2.id)
        FROM content_links cl
        JOIN cards c2 ON c2.content_id IN (cl.content_id, cl.target_content_id)
        WHERE (cl.content_id = ?1 OR cl.target_content_id = ?1)
          AND c2.content_id != ?1
        GROUP BY c2.content_id
        ORDER BY MIN(cl.create_time)
        ",
    ) else {
        return vec![];
    };
    stmt.query_map(params![content_id], |row| row.get::<_, i64>(0))
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
}

fn parse_content(raw_content: Option<String>) -> Value {
    let Some(raw) = raw_content else {
        return Value::Array(vec![]);
    };
    match serde_json::from_str::<Value>(&raw) {
        Ok(Value::Array(items)) => Value::Array(items),
        _ => Value::Array(vec![]),
    }
}

fn find_first_text(value: &Value) -> Option<String> {
    match value {
        Value::Object(map) => {
            if let Some(text) = map.get("text").and_then(|v| v.as_str()) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
            for child in map.values() {
                if let Some(hit) = find_first_text(child) {
                    return Some(hit);
                }
            }
            None
        }
        Value::Array(array) => {
            for child in array {
                if let Some(hit) = find_first_text(child) {
                    return Some(hit);
                }
            }
            None
        }
        _ => None,
    }
}

fn extract_excerpt(content_json: Option<String>) -> String {
    let Some(raw) = content_json else {
        return String::new();
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
        return String::new();
    };
    let text = find_first_text(&parsed)
        .unwrap_or_default()
        .replace('\n', " ");
    let mut result = String::new();
    for (idx, ch) in text.chars().enumerate() {
        if idx >= 80 {
            result.push('…');
            break;
        }
        result.push(ch);
    }
    result
}

fn normalize_query(query: Option<&str>) -> String {
    query.unwrap_or_default().trim().to_string()
}

fn query_cards_plain(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Result<(u64, Vec<RawCardRow>), String> {
    let total: u64 = conn
        .query_row(
            "
            SELECT COUNT(1)
            FROM cards c
            ",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("DB_OPEN_FAILED: count query failed: {e}"))?;

    let mut stmt = conn
        .prepare(
            "
            SELECT c.id, c.content_id, c.update_time, c.tags, ct.content
            FROM cards c
            LEFT JOIN contents ct ON c.content_id = ct.id
            ORDER BY c.is_top DESC, c.create_time DESC
            LIMIT ?1 OFFSET ?2
            ",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: card query prepare failed: {e}"))?;

    let mut rows = stmt
        .query(params![limit, offset])
        .map_err(|e| format!("DB_OPEN_FAILED: card query failed: {e}"))?;
    let mut items = vec![];
    while let Some(row) = rows
        .next()
        .map_err(|e| format!("DB_OPEN_FAILED: row read failed: {e}"))?
    {
        items.push(RawCardRow {
            id: row
                .get(0)
                .map_err(|e| format!("DB_OPEN_FAILED: row id parse failed: {e}"))?,
            content_id: row
                .get(1)
                .map_err(|e| format!("DB_OPEN_FAILED: row content_id parse failed: {e}"))?,
            update_time: row
                .get(2)
                .map_err(|e| format!("DB_OPEN_FAILED: row update_time parse failed: {e}"))?,
            tags_raw: row
                .get(3)
                .map_err(|e| format!("DB_OPEN_FAILED: row tags parse failed: {e}"))?,
            content_raw: row
                .get(4)
                .map_err(|e| format!("DB_OPEN_FAILED: row content parse failed: {e}"))?,
        });
    }

    Ok((total, items))
}

fn to_card_items(rows: Vec<RawCardRow>) -> Vec<CardListItem> {
    rows.into_iter()
        .map(|row| CardListItem {
            id: row.id,
            content_id: row.content_id,
            update_time: row.update_time,
            tags: parse_tags(row.tags_raw),
            excerpt: extract_excerpt(row.content_raw.clone()),
            content: parse_content(row.content_raw),
        })
        .collect()
}

/// 按卡片 id 集合取列表项（关联面板展示用），保持传入顺序无关、按更新时间倒序
pub fn query_cards_by_ids(conn: &Connection, ids: &[i64]) -> Result<Vec<CardListItem>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!(
        "SELECT c.id, c.content_id, c.update_time, c.tags, ct.content
        FROM cards c
        LEFT JOIN contents ct ON c.content_id = ct.id
        WHERE c.id IN ({placeholders})
        ORDER BY c.update_time DESC"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("DB_OPEN_FAILED: cards by ids prepare failed: {e}"))?;
    let params: Vec<&dyn rusqlite::ToSql> =
        ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
    let mut rows = stmt
        .query(params.as_slice())
        .map_err(|e| format!("DB_OPEN_FAILED: cards by ids query failed: {e}"))?;
    let mut items = vec![];
    while let Some(row) = rows
        .next()
        .map_err(|e| format!("DB_OPEN_FAILED: cards by ids row read failed: {e}"))?
    {
        items.push(RawCardRow {
            id: row
                .get(0)
                .map_err(|e| format!("DB_OPEN_FAILED: cards by ids id parse failed: {e}"))?,
            content_id: row.get(1).map_err(|e| {
                format!("DB_OPEN_FAILED: cards by ids content_id parse failed: {e}")
            })?,
            update_time: row.get(2).map_err(|e| {
                format!("DB_OPEN_FAILED: cards by ids update_time parse failed: {e}")
            })?,
            tags_raw: row
                .get(3)
                .map_err(|e| format!("DB_OPEN_FAILED: cards by ids tags parse failed: {e}"))?,
            content_raw: row
                .get(4)
                .map_err(|e| format!("DB_OPEN_FAILED: cards by ids content parse failed: {e}"))?,
        });
    }

    Ok(to_card_items(items))
}

pub fn query_card_detail(conn: &Connection, card_id: i64) -> Result<CardDetailResponse, String> {
    let mut stmt = conn
        .prepare(
            "
            SELECT
              c.id,
              c.content_id,
              c.create_time,
              c.update_time,
              c.tags,
              ct.content,
              ct.count
            FROM cards c
            LEFT JOIN contents ct ON c.content_id = ct.id
            WHERE c.id = ?1
            LIMIT 1
            ",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: card detail prepare failed: {e}"))?;

    let mut rows = stmt
        .query(params![card_id])
        .map_err(|e| format!("DB_OPEN_FAILED: card detail query failed: {e}"))?;

    let Some(row) = rows
        .next()
        .map_err(|e| format!("DB_OPEN_FAILED: card detail row read failed: {e}"))?
    else {
        return Err("CARD_NOT_FOUND: card does not exist".to_string());
    };

    let id: i64 = row
        .get(0)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail id parse failed: {e}"))?;
    let content_id: i64 = row
        .get(1)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail content_id parse failed: {e}"))?;
    let create_time: i64 = row
        .get(2)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail create_time parse failed: {e}"))?;
    let update_time: i64 = row
        .get(3)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail update_time parse failed: {e}"))?;
    let tags_raw: Option<String> = row
        .get(4)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail tags parse failed: {e}"))?;
    let content_raw: Option<String> = row
        .get(5)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail content parse failed: {e}"))?;
    let count: i64 = row.get(6).unwrap_or(0);

    Ok(CardDetailResponse {
        id,
        content_id,
        create_time,
        update_time,
        tags: parse_tags(tags_raw),
        links: linked_card_ids(conn, content_id),
        content: parse_content(content_raw),
        count,
    })
}

pub fn query_content_detail(
    conn: &Connection,
    content_id: i64,
) -> Result<ContentDetailResponse, String> {
    let mut stmt = conn
        .prepare(
            "
            SELECT
              ct.id,
              ct.create_time,
              ct.update_time,
              ct.content,
              ct.count,
              c.id,
              c.create_time,
              c.update_time,
              c.tags
            FROM contents ct
            LEFT JOIN cards c ON c.content_id = ct.id
            WHERE ct.id = ?1
            ORDER BY c.update_time DESC
            LIMIT 1
            ",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: content detail prepare failed: {e}"))?;

    let mut rows = stmt
        .query(params![content_id])
        .map_err(|e| format!("DB_OPEN_FAILED: content detail query failed: {e}"))?;

    let Some(row) = rows
        .next()
        .map_err(|e| format!("DB_OPEN_FAILED: content detail row read failed: {e}"))?
    else {
        return Err("CONTENT_NOT_FOUND: content does not exist".to_string());
    };

    let id: i64 = row
        .get(0)
        .map_err(|e| format!("DB_OPEN_FAILED: content detail id parse failed: {e}"))?;
    let create_time: i64 = row
        .get(1)
        .map_err(|e| format!("DB_OPEN_FAILED: content detail create_time parse failed: {e}"))?;
    let update_time: i64 = row
        .get(2)
        .map_err(|e| format!("DB_OPEN_FAILED: content detail update_time parse failed: {e}"))?;
    let content_raw: Option<String> = row
        .get(3)
        .map_err(|e| format!("DB_OPEN_FAILED: content detail content parse failed: {e}"))?;
    let count: i64 = row.get(4).unwrap_or(0);

    let card_id: Option<i64> = row
        .get(5)
        .map_err(|e| format!("DB_OPEN_FAILED: content detail card id parse failed: {e}"))?;
    let card = if let Some(card_id) = card_id {
        let card_create_time: i64 = row.get(6).unwrap_or(0);
        let card_update_time: i64 = row.get(7).unwrap_or(0);
        let card_tags_raw: Option<String> = row
            .get(8)
            .map_err(|e| format!("DB_OPEN_FAILED: content detail card tags parse failed: {e}"))?;
        Some(ContentCardMeta {
            id: card_id,
            create_time: card_create_time,
            update_time: card_update_time,
            tags: parse_tags(card_tags_raw),
            links: linked_card_ids(conn, id),
        })
    } else {
        None
    };

    Ok(ContentDetailResponse {
        content_id: id,
        create_time,
        update_time,
        content: parse_content(content_raw),
        count,
        card,
    })
}

pub fn query_cards_overview(
    conn: &Connection,
    page: u32,
    page_size: u32,
    query: Option<&str>,
) -> Result<CardsOverviewResponse, String> {
    let page = if page == 0 { 1 } else { page };
    let page_size = page_size.clamp(1, 100);
    let offset = ((page - 1) * page_size) as i64;
    let limit = page_size as i64;

    let query = normalize_query(query);

    let (search_mode, total, rows) = if query.is_empty() {
        let (total, rows) = query_cards_plain(conn, limit, offset)?;
        ("none".to_string(), total, rows)
    } else {
        let result = search::query_cards_by_search(conn, &query, limit, offset)?;
        (result.mode.to_string(), result.total, result.rows)
    };

    Ok(CardsOverviewResponse {
        total,
        page,
        page_size,
        query,
        search_mode,
        items: to_card_items(rows),
    })
}
