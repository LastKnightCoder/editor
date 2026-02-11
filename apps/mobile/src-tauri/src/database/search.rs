use std::sync::OnceLock;

use jieba_rs::Jieba;
use rusqlite::{params, Connection};

use super::query::RawCardRow;

pub struct SearchResult {
    pub mode: &'static str,
    pub total: u64,
    pub rows: Vec<RawCardRow>,
}

static JIEBA: OnceLock<Jieba> = OnceLock::new();

fn category_filter(category: &str) -> String {
    if category.eq_ignore_ascii_case("all") {
        String::new()
    } else {
        category.trim().to_string()
    }
}

fn has_fts5_support(conn: &Connection) -> bool {
    conn.query_row("SELECT sqlite_compileoption_used('ENABLE_FTS5')", [], |row| {
        row.get::<_, i64>(0)
    })
    .map(|v| v == 1)
    .unwrap_or(false)
}

fn has_content_fts_table(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT COUNT(1) FROM sqlite_master WHERE type = 'table' AND name = 'content_fts'",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(|v| v > 0)
    .unwrap_or(false)
}

fn escape_fts_token(token: &str) -> String {
    token.replace('"', "\"\"")
}

fn build_match_query(query: &str) -> Option<String> {
    let jieba = JIEBA.get_or_init(Jieba::new);
    let mut tokens: Vec<String> = vec![];
    for token in jieba.cut_for_search(query, true) {
        let normalized = token.trim();
        if normalized.is_empty() {
            continue;
        }
        if tokens.iter().any(|value| value == normalized) {
            continue;
        }
        tokens.push(normalized.to_string());
    }
    if tokens.is_empty() {
        return None;
    }
    let joined = tokens
        .iter()
        .map(|token| format!("\"{}\"", escape_fts_token(token)))
        .collect::<Vec<String>>()
        .join(" OR ");
    if joined.trim().is_empty() {
        None
    } else {
        Some(joined)
    }
}

fn escape_like_text(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn query_cards_by_like(
    conn: &Connection,
    query: &str,
    category: &str,
    limit: i64,
    offset: i64,
) -> Result<SearchResult, String> {
    let category = category_filter(category);
    let like_pattern = format!("%{}%", escape_like_text(query.trim()));

    let total: u64 = conn
        .query_row(
            "
            SELECT COUNT(1)
            FROM cards c
            LEFT JOIN contents ct ON c.content_id = ct.id
            WHERE (?1 = '' OR c.category = ?1)
              AND (
                ct.content LIKE ?2 ESCAPE '\\'
                OR c.tags LIKE ?2 ESCAPE '\\'
              )
            ",
            params![category, like_pattern],
            |row| row.get(0),
        )
        .map_err(|e| format!("DB_OPEN_FAILED: LIKE count query failed: {e}"))?;

    let mut stmt = conn
        .prepare(
            "
            SELECT c.id, c.update_time, c.category, c.tags, ct.content
            FROM cards c
            LEFT JOIN contents ct ON c.content_id = ct.id
            WHERE (?1 = '' OR c.category = ?1)
              AND (
                ct.content LIKE ?2 ESCAPE '\\'
                OR c.tags LIKE ?2 ESCAPE '\\'
              )
            ORDER BY c.is_top DESC, c.create_time DESC
            LIMIT ?3 OFFSET ?4
            ",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: LIKE query prepare failed: {e}"))?;
    let mut rows = stmt
        .query(params![category, like_pattern, limit, offset])
        .map_err(|e| format!("DB_OPEN_FAILED: LIKE query failed: {e}"))?;

    let mut items = vec![];
    while let Some(row) = rows
        .next()
        .map_err(|e| format!("DB_OPEN_FAILED: LIKE row read failed: {e}"))?
    {
        items.push(RawCardRow {
            id: row
                .get(0)
                .map_err(|e| format!("DB_OPEN_FAILED: LIKE row id parse failed: {e}"))?,
            update_time: row
                .get(1)
                .map_err(|e| format!("DB_OPEN_FAILED: LIKE row update_time parse failed: {e}"))?,
            category: row
                .get(2)
                .map_err(|e| format!("DB_OPEN_FAILED: LIKE row category parse failed: {e}"))?,
            tags_raw: row
                .get(3)
                .map_err(|e| format!("DB_OPEN_FAILED: LIKE row tags parse failed: {e}"))?,
            content_raw: row
                .get(4)
                .map_err(|e| format!("DB_OPEN_FAILED: LIKE row content parse failed: {e}"))?,
        });
    }

    Ok(SearchResult {
        mode: "like",
        total,
        rows: items,
    })
}

fn query_cards_by_fts(
    conn: &Connection,
    match_query: &str,
    category: &str,
    limit: i64,
    offset: i64,
) -> Result<SearchResult, String> {
    let category = category_filter(category);

    let total: u64 = conn
        .query_row(
            "
            WITH hits AS (
                SELECT prefixed_id, rank,
                       ROW_NUMBER() OVER (PARTITION BY prefixed_id ORDER BY rank) AS rn
                FROM content_fts
                WHERE content MATCH ?1
                  AND type = 'card'
            ),
            best AS (
                SELECT prefixed_id, rank
                FROM hits
                WHERE rn = 1
            ),
            ids AS (
                SELECT CAST(substr(prefixed_id, instr(prefixed_id, ':') + 1) AS INTEGER) AS card_id
                FROM best
            )
            SELECT COUNT(1)
            FROM ids i
            JOIN cards c ON c.id = i.card_id
            WHERE (?2 = '' OR c.category = ?2)
            ",
            params![match_query, category],
            |row| row.get(0),
        )
        .map_err(|e| format!("FTS_QUERY_FAILED: FTS count query failed: {e}"))?;

    let mut stmt = conn
        .prepare(
            "
            WITH hits AS (
                SELECT prefixed_id, rank,
                       ROW_NUMBER() OVER (PARTITION BY prefixed_id ORDER BY rank) AS rn
                FROM content_fts
                WHERE content MATCH ?1
                  AND type = 'card'
            ),
            best AS (
                SELECT prefixed_id, rank
                FROM hits
                WHERE rn = 1
            ),
            ids AS (
                SELECT CAST(substr(prefixed_id, instr(prefixed_id, ':') + 1) AS INTEGER) AS card_id, rank
                FROM best
            )
            SELECT c.id, c.update_time, c.category, c.tags, ct.content
            FROM ids i
            JOIN cards c ON c.id = i.card_id
            LEFT JOIN contents ct ON c.content_id = ct.id
            WHERE (?2 = '' OR c.category = ?2)
            ORDER BY c.is_top DESC, i.rank ASC, c.create_time DESC
            LIMIT ?3 OFFSET ?4
            ",
        )
        .map_err(|e| format!("FTS_QUERY_FAILED: FTS query prepare failed: {e}"))?;

    let mut rows = stmt
        .query(params![match_query, category, limit, offset])
        .map_err(|e| format!("FTS_QUERY_FAILED: FTS query failed: {e}"))?;
    let mut items = vec![];
    while let Some(row) = rows
        .next()
        .map_err(|e| format!("FTS_QUERY_FAILED: FTS row read failed: {e}"))?
    {
        items.push(RawCardRow {
            id: row
                .get(0)
                .map_err(|e| format!("FTS_QUERY_FAILED: FTS row id parse failed: {e}"))?,
            update_time: row
                .get(1)
                .map_err(|e| format!("FTS_QUERY_FAILED: FTS row update_time parse failed: {e}"))?,
            category: row
                .get(2)
                .map_err(|e| format!("FTS_QUERY_FAILED: FTS row category parse failed: {e}"))?,
            tags_raw: row
                .get(3)
                .map_err(|e| format!("FTS_QUERY_FAILED: FTS row tags parse failed: {e}"))?,
            content_raw: row
                .get(4)
                .map_err(|e| format!("FTS_QUERY_FAILED: FTS row content parse failed: {e}"))?,
        });
    }

    Ok(SearchResult {
        mode: "fts",
        total,
        rows: items,
    })
}

pub fn query_cards_by_search(
    conn: &Connection,
    query: &str,
    category: &str,
    limit: i64,
    offset: i64,
) -> Result<SearchResult, String> {
    if query.trim().is_empty() {
        return query_cards_by_like(conn, query, category, limit, offset);
    }

    let fts_ready = has_fts5_support(conn) && has_content_fts_table(conn);
    if fts_ready {
        if let Some(match_query) = build_match_query(query) {
            if let Ok(result) = query_cards_by_fts(conn, &match_query, category, limit, offset) {
                return Ok(result);
            }
        }
    }

    query_cards_by_like(conn, query, category, limit, offset)
}
