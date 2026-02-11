use rusqlite::{params, Connection};
use serde_json::Value;

use crate::models::{CardDetailResponse, CardListItem, CardsOverviewResponse};

use super::search;

#[derive(Debug, Clone)]
pub struct RawCardRow {
    pub id: i64,
    pub update_time: i64,
    pub category: String,
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

fn parse_links(raw_links: Option<String>) -> Vec<String> {
    parse_string_array(raw_links)
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
    let text = find_first_text(&parsed).unwrap_or_default().replace('\n', " ");
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

fn normalize_category(category: Option<&str>) -> String {
    let value = category.unwrap_or_default().trim();
    if value.eq_ignore_ascii_case("all") {
        String::new()
    } else {
        value.to_string()
    }
}

fn normalize_query(query: Option<&str>) -> String {
    query.unwrap_or_default().trim().to_string()
}

fn query_cards_plain(
    conn: &Connection,
    category: &str,
    limit: i64,
    offset: i64,
) -> Result<(u64, Vec<RawCardRow>), String> {
    let total: u64 = conn
        .query_row(
            "
            SELECT COUNT(1)
            FROM cards c
            WHERE (?1 = '' OR c.category = ?1)
            ",
            params![category],
            |row| row.get(0),
        )
        .map_err(|e| format!("DB_OPEN_FAILED: count query failed: {e}"))?;

    let mut stmt = conn
        .prepare(
            "
            SELECT c.id, c.update_time, c.category, c.tags, ct.content
            FROM cards c
            LEFT JOIN contents ct ON c.content_id = ct.id
            WHERE (?1 = '' OR c.category = ?1)
            ORDER BY c.is_top DESC, c.create_time DESC
            LIMIT ?2 OFFSET ?3
            ",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: card query prepare failed: {e}"))?;

    let mut rows = stmt
        .query(params![category, limit, offset])
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
            update_time: row
                .get(1)
                .map_err(|e| format!("DB_OPEN_FAILED: row update_time parse failed: {e}"))?,
            category: row
                .get(2)
                .map_err(|e| format!("DB_OPEN_FAILED: row category parse failed: {e}"))?,
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
            update_time: row.update_time,
            category: row.category,
            tags: parse_tags(row.tags_raw),
            excerpt: extract_excerpt(row.content_raw),
        })
        .collect()
}

pub fn query_card_detail(conn: &Connection, card_id: i64) -> Result<CardDetailResponse, String> {
    let mut stmt = conn
        .prepare(
            "
            SELECT
              c.id,
              c.create_time,
              c.update_time,
              c.category,
              c.tags,
              c.links,
              ct.content
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
    let create_time: i64 = row
        .get(1)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail create_time parse failed: {e}"))?;
    let update_time: i64 = row
        .get(2)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail update_time parse failed: {e}"))?;
    let category: String = row
        .get(3)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail category parse failed: {e}"))?;
    let tags_raw: Option<String> = row
        .get(4)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail tags parse failed: {e}"))?;
    let links_raw: Option<String> = row
        .get(5)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail links parse failed: {e}"))?;
    let content_raw: Option<String> = row
        .get(6)
        .map_err(|e| format!("DB_OPEN_FAILED: card detail content parse failed: {e}"))?;

    Ok(CardDetailResponse {
        id,
        create_time,
        update_time,
        category,
        tags: parse_tags(tags_raw),
        links: parse_links(links_raw),
        content: parse_content(content_raw),
    })
}

pub fn query_cards_overview(
    conn: &Connection,
    page: u32,
    page_size: u32,
    query: Option<&str>,
    category: Option<&str>,
) -> Result<CardsOverviewResponse, String> {
    let page = if page == 0 { 1 } else { page };
    let page_size = page_size.clamp(1, 100);
    let offset = ((page - 1) * page_size) as i64;
    let limit = page_size as i64;

    let query = normalize_query(query);
    let category = normalize_category(category);

    let (search_mode, total, rows) = if query.is_empty() {
        let (total, rows) = query_cards_plain(conn, &category, limit, offset)?;
        ("none".to_string(), total, rows)
    } else {
        let result = search::query_cards_by_search(conn, &query, &category, limit, offset)?;
        (result.mode.to_string(), result.total, result.rows)
    };

    Ok(CardsOverviewResponse {
        total,
        page,
        page_size,
        query,
        category,
        search_mode,
        items: to_card_items(rows),
    })
}
