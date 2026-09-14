use std::path::Path;
use std::sync::OnceLock;

use jieba_rs::Jieba;
use rusqlite::{params, Connection, OptionalExtension};

use crate::models::UnifiedSearchResult;

use super::common::{json_content_plain_text, parse_id_array};
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
    conn.query_row(
        "SELECT sqlite_compileoption_used('ENABLE_FTS5')",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(|v| v == 1)
    .unwrap_or(false)
}

fn escape_sql_string(input: &str) -> String {
    input.replace('\'', "''")
}

fn resolve_main_db_path(conn: &Connection) -> Option<String> {
    let mut stmt = conn
        .prepare("SELECT file FROM pragma_database_list WHERE name='main'")
        .ok()?;
    stmt.query_row([], |row| row.get::<_, String>(0)).ok()
}

fn resolve_index_db_path(main_db_path: &str) -> String {
    if main_db_path.ends_with(".db") {
        let base = &main_db_path[..main_db_path.len() - 3];
        format!("{base}.index.db")
    } else {
        format!("{main_db_path}.index.db")
    }
}

fn ensure_index_attached(conn: &Connection) -> bool {
    let already_attached = conn
        .query_row(
            "SELECT COUNT(1) FROM pragma_database_list WHERE name='idx'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .unwrap_or(false);
    if already_attached {
        return true;
    }

    let Some(main_db_path) = resolve_main_db_path(conn) else {
        return false;
    };
    let index_db_path = resolve_index_db_path(&main_db_path);
    if !Path::new(&index_db_path).exists() {
        return false;
    }

    let escaped = escape_sql_string(&index_db_path);
    conn.execute_batch(&format!("ATTACH DATABASE '{escaped}' AS idx"))
        .map(|_| true)
        .unwrap_or(false)
}

fn has_content_fts_table(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT COUNT(1) FROM idx.sqlite_master WHERE type = 'table' AND name = 'content_fts'",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(|v| v > 0)
    .unwrap_or(false)
}

fn is_index_ready(conn: &Connection) -> bool {
    let migration_state = conn
        .query_row(
            "SELECT value FROM idx.index_meta WHERE key = 'migration_state'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .unwrap_or_else(|| "init".to_string());
    let rebuild_state = conn
        .query_row(
            "SELECT value FROM idx.index_meta WHERE key = 'rebuild_state'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .unwrap_or_else(|| "pending".to_string());
    migration_state == "done" && rebuild_state == "ready"
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
            SELECT c.id, c.content_id, c.update_time, c.category, c.tags, ct.content
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
            content_id: row
                .get(1)
                .map_err(|e| format!("DB_OPEN_FAILED: LIKE row content_id parse failed: {e}"))?,
            update_time: row
                .get(2)
                .map_err(|e| format!("DB_OPEN_FAILED: LIKE row update_time parse failed: {e}"))?,
            category: row
                .get(3)
                .map_err(|e| format!("DB_OPEN_FAILED: LIKE row category parse failed: {e}"))?,
            tags_raw: row
                .get(4)
                .map_err(|e| format!("DB_OPEN_FAILED: LIKE row tags parse failed: {e}"))?,
            content_raw: row
                .get(5)
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
                FROM idx.content_fts
                WHERE content_fts MATCH ?1
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
                FROM idx.content_fts
                WHERE content_fts MATCH ?1
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
            SELECT c.id, c.content_id, c.update_time, c.category, c.tags, ct.content
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
            content_id: row
                .get(1)
                .map_err(|e| format!("FTS_QUERY_FAILED: FTS row content_id parse failed: {e}"))?,
            update_time: row
                .get(2)
                .map_err(|e| format!("FTS_QUERY_FAILED: FTS row update_time parse failed: {e}"))?,
            category: row
                .get(3)
                .map_err(|e| format!("FTS_QUERY_FAILED: FTS row category parse failed: {e}"))?,
            tags_raw: row
                .get(4)
                .map_err(|e| format!("FTS_QUERY_FAILED: FTS row tags parse failed: {e}"))?,
            content_raw: row
                .get(5)
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

    let fts_ready = has_fts5_support(conn)
        && ensure_index_attached(conn)
        && has_content_fts_table(conn)
        && is_index_ready(conn);
    if fts_ready {
        if let Some(match_query) = build_match_query(query) {
            if let Ok(result) = query_cards_by_fts(conn, &match_query, category, limit, offset) {
                return Ok(result);
            }
        }
    }

    query_cards_by_like(conn, query, category, limit, offset)
}

const SEARCH_TYPES: &[&str] = &[
    "card",
    "article",
    "project-item",
    "document-item",
    "diary-daily",
    "flashcard",
];

fn normalize_search_types(types: Option<&[String]>) -> Vec<String> {
    let Some(types) = types else {
        return SEARCH_TYPES
            .iter()
            .map(|value| (*value).to_string())
            .collect();
    };
    let normalized = types
        .iter()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| SEARCH_TYPES.contains(&value.as_str()))
        .collect::<Vec<_>>();
    if normalized.is_empty() {
        SEARCH_TYPES
            .iter()
            .map(|value| (*value).to_string())
            .collect()
    } else {
        normalized
    }
}

fn type_sql(types: &[String]) -> String {
    types
        .iter()
        .map(|value| format!("'{value}'"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn truncate_excerpt(text: String) -> String {
    let mut excerpt = String::new();
    for (index, ch) in text.replace('\n', " ").chars().enumerate() {
        if index >= 120 {
            excerpt.push('…');
            break;
        }
        excerpt.push(ch);
    }
    excerpt
}

fn content_excerpt(raw: Option<String>) -> String {
    truncate_excerpt(json_content_plain_text(raw))
}

fn parse_first_id(raw: Option<String>) -> Option<i64> {
    parse_id_array(raw).into_iter().next()
}

fn query_container_title(conn: &Connection, table: &str, id: i64) -> Option<String> {
    let sql = match table {
        "project" => "SELECT title FROM project WHERE id = ?1",
        _ => return None,
    };
    conn.query_row(sql, params![id], |row| row.get::<_, String>(0))
        .optional()
        .ok()
        .flatten()
}

fn hydrate_unified_result(
    conn: &Connection,
    result_type: &str,
    id: i64,
    score: f64,
) -> Result<Option<UnifiedSearchResult>, String> {
    let result: Result<Option<UnifiedSearchResult>, String> = match result_type {
        "flashcard" => conn
            .query_row(
                "SELECT f.deck_id, f.update_time, f.prompt, d.name
                 FROM flashcards f LEFT JOIN flashcard_decks d ON f.deck_id = d.id
                 WHERE f.id = ?1",
                params![id],
                |row| {
                    let prompt: Option<String> = row.get(2)?;
                    let excerpt = content_excerpt(prompt);
                    Ok(UnifiedSearchResult {
                        id,
                        result_type: result_type.to_string(),
                        title: excerpt.lines().next().unwrap_or_default().to_string(),
                        excerpt,
                        content_id: None,
                        update_time: row.get(1)?,
                        score,
                        date: None,
                        container_id: row.get(0)?,
                        container_title: row.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("DB_OPEN_FAILED: flashcard hydrate failed: {e}")),
        "card" => conn
            .query_row(
                "SELECT c.content_id, c.update_time, c.tags, ct.content
                 FROM cards c LEFT JOIN contents ct ON c.content_id = ct.id WHERE c.id = ?1",
                params![id],
                |row| {
                    let content: Option<String> = row.get(3)?;
                    let excerpt = content_excerpt(content.clone());
                    Ok(UnifiedSearchResult {
                        id,
                        result_type: result_type.to_string(),
                        title: excerpt.lines().next().unwrap_or_default().to_string(),
                        excerpt,
                        content_id: row.get(0)?,
                        update_time: row.get(1)?,
                        score,
                        date: None,
                        container_id: None,
                        container_title: None,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("DB_OPEN_FAILED: hydrate card search result failed: {e}")),
        "article" => conn
            .query_row(
                "SELECT a.title, a.content_id, MAX(a.update_time, COALESCE(c.update_time, 0)), c.content
                 FROM articles a LEFT JOIN contents c ON a.content_id = c.id
                 WHERE a.id = ?1 AND a.is_delete = 0",
                params![id],
                |row| {
                    Ok(UnifiedSearchResult {
                        id,
                        result_type: result_type.to_string(),
                        title: row.get(0)?,
                        excerpt: content_excerpt(row.get(3)?),
                        content_id: row.get(1)?,
                        update_time: row.get(2)?,
                        score,
                        date: None,
                        container_id: None,
                        container_title: None,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("DB_OPEN_FAILED: hydrate article search result failed: {e}")),
        "project-item" => conn
            .query_row(
                "SELECT pi.title, pi.content_id, pi.update_time, pi.projects, c.content
                 FROM project_item pi LEFT JOIN contents c ON pi.content_id = c.id WHERE pi.id = ?1",
                params![id],
                |row| {
                    let projects: Option<String> = row.get(3)?;
                    let container_id = parse_first_id(projects);
                    let container_title = container_id
                        .and_then(|value| query_container_title(conn, "project", value));
                    Ok(UnifiedSearchResult {
                        id,
                        result_type: result_type.to_string(),
                        title: row.get(0)?,
                        excerpt: content_excerpt(row.get(4)?),
                        content_id: row.get(1)?,
                        update_time: row.get(2)?,
                        score,
                        date: None,
                        container_id,
                        container_title,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("DB_OPEN_FAILED: hydrate project search result failed: {e}")),
        "diary-daily" => {
            let base = conn
                .query_row(
                    "SELECT d.type, d.date, d.update_time, d.tags FROM diary_entries d WHERE d.id = ?1",
                    params![id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, i64>(2)?,
                            row.get::<_, Option<String>>(3)?,
                        ))
                    },
                )
                .optional()
                .map_err(|e| format!("DB_OPEN_FAILED: hydrate diary search result failed: {e}"))?;
            let Some((diary_type, date, update_time, _tags)) = base else {
                return Ok(None);
            };
            let mut content_id = None;
            let mut parts = Vec::new();
            let mut segments_stmt = conn
                .prepare(
                    "SELECT s.content_id, c.content FROM diary_segments s
                     JOIN contents c ON c.id = s.content_id WHERE s.diary_id = ?1 ORDER BY s.create_time, s.id",
                )
                .map_err(|e| format!("DB_OPEN_FAILED: prepare diary search details: {e}"))?;
            let mut segments = segments_stmt
                .query(params![id])
                .map_err(|e| format!("DB_OPEN_FAILED: query diary search details: {e}"))?;
            while let Some(row) = segments
                .next()
                .map_err(|e| format!("DB_OPEN_FAILED: read diary search details: {e}"))?
            {
                if content_id.is_none() {
                    content_id = row.get(0).ok();
                }
                let raw: Option<String> = row.get(1).map_err(|e| e.to_string())?;
                let text = json_content_plain_text(raw);
                if !text.is_empty() {
                    parts.push(text);
                }
            }
            Ok(Some(UnifiedSearchResult {
                id,
                result_type: result_type.to_string(),
                title: date.clone(),
                excerpt: truncate_excerpt(parts.join(" ")),
                content_id,
                update_time,
                score,
                date: Some(date),
                container_id: None,
                container_title: Some(diary_type),
            }))
        }
        _ => Ok(None),
    };
    result
}

fn unified_like_sql() -> &'static str {
    "SELECT prefixed_id, type, update_time FROM (
       SELECT 'card:' || c.id AS prefixed_id, 'card' AS type, c.update_time
       FROM cards c LEFT JOIN contents ct ON c.content_id = ct.id
       WHERE ct.content LIKE ?1 ESCAPE '\\' OR c.tags LIKE ?1 ESCAPE '\\'
       UNION ALL
       SELECT 'article:' || a.id, 'article', MAX(a.update_time, COALESCE(c.update_time, 0))
       FROM articles a LEFT JOIN contents c ON a.content_id = c.id
       WHERE a.is_delete = 0 AND (a.title LIKE ?1 ESCAPE '\\' OR a.author LIKE ?1 ESCAPE '\\' OR a.tags LIKE ?1 ESCAPE '\\' OR c.content LIKE ?1 ESCAPE '\\')
       UNION ALL
       SELECT 'project-item:' || pi.id, 'project-item', MAX(pi.update_time, COALESCE(c.update_time, 0))
       FROM project_item pi LEFT JOIN contents c ON pi.content_id = c.id
       WHERE COALESCE(pi.ref_type, '') = '' AND (pi.title LIKE ?1 ESCAPE '\\' OR pi.tags LIKE ?1 ESCAPE '\\' OR c.content LIKE ?1 ESCAPE '\\')
       UNION ALL
       SELECT 'diary-daily:' || d.id, 'diary-daily', d.update_time
       FROM diary_entries d LEFT JOIN contents c ON d.content_id = c.id
       WHERE d.date LIKE ?1 ESCAPE '\\' OR d.tags LIKE ?1 ESCAPE '\\' OR c.content LIKE ?1 ESCAPE '\\'
         OR EXISTS (SELECT 1 FROM diary_segments s JOIN contents sc ON sc.id = s.content_id WHERE s.diary_id = d.id AND sc.content LIKE ?1 ESCAPE '\\')
       UNION ALL
       SELECT 'flashcard:' || f.id, 'flashcard', f.update_time
       FROM flashcards f
       WHERE f.prompt LIKE ?1 ESCAPE '\\' OR f.detail LIKE ?1 ESCAPE '\\' OR f.tags LIKE ?1 ESCAPE '\\'
     )"
}

fn hit_id(prefixed_id: &str) -> Option<(&str, i64)> {
    let (result_type, raw_id) = prefixed_id.split_once(':')?;
    Some((result_type, raw_id.parse().ok()?))
}

pub fn query_unified_search(
    conn: &Connection,
    query: &str,
    types: Option<&[String]>,
    page: u32,
    page_size: u32,
) -> Result<(String, u64, Vec<UnifiedSearchResult>), String> {
    let query = query.trim();
    let page = page.max(1);
    let page_size = page_size.clamp(1, 100);
    let offset = ((page - 1) * page_size) as i64;
    let limit = page_size as i64;
    if query.is_empty() {
        return Ok(("none".to_string(), 0, Vec::new()));
    }
    let types = normalize_search_types(types);
    let type_clause = type_sql(&types);
    let fts_ready = has_fts5_support(conn)
        && ensure_index_attached(conn)
        && has_content_fts_table(conn)
        && is_index_ready(conn);

    let (mode, total, hits): (&str, u64, Vec<(String, f64)>) = if fts_ready {
        if let Some(match_query) = build_match_query(query) {
            let count_sql = format!(
                "SELECT COUNT(1) FROM (SELECT prefixed_id FROM idx.content_fts
                 WHERE content_fts MATCH ?1 AND type IN ({type_clause}) GROUP BY prefixed_id)"
            );
            let total =
                conn.query_row(&count_sql, params![match_query], |row| row.get::<_, u64>(0));
            let result_sql = format!(
                "SELECT prefixed_id, MIN(rank) FROM idx.content_fts
                 WHERE content_fts MATCH ?1 AND type IN ({type_clause})
                 GROUP BY prefixed_id ORDER BY MIN(rank) ASC LIMIT ?2 OFFSET ?3"
            );
            if let Ok(total) = total {
                if let Ok(mut stmt) = conn.prepare(&result_sql) {
                    if let Ok(rows) = stmt.query_map(params![match_query, limit, offset], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
                    }) {
                        let hits = rows.filter_map(Result::ok).collect::<Vec<_>>();
                        ("fts", total, hits)
                    } else {
                        ("like", 0, Vec::new())
                    }
                } else {
                    ("like", 0, Vec::new())
                }
            } else {
                ("like", 0, Vec::new())
            }
        } else {
            ("like", 0, Vec::new())
        }
    } else {
        ("like", 0, Vec::new())
    };

    if mode == "fts" && !hits.is_empty() {
        let mut items = Vec::new();
        for (prefixed_id, score) in hits {
            if let Some((result_type, id)) = hit_id(&prefixed_id) {
                if let Some(item) = hydrate_unified_result(conn, result_type, id, score)? {
                    items.push(item);
                }
            }
        }
        return Ok((mode.to_string(), total, items));
    }

    let like_pattern = format!("%{}%", escape_like_text(query));
    let base_sql = unified_like_sql();
    let type_filter = format!(" WHERE type IN ({type_clause})");
    let count_sql = format!("SELECT COUNT(1) FROM ({base_sql}) AS hits{type_filter}");
    let total = conn
        .query_row(&count_sql, params![like_pattern], |row| {
            row.get::<_, u64>(0)
        })
        .map_err(|e| format!("DB_OPEN_FAILED: unified LIKE count query failed: {e}"))?;
    let result_sql = format!(
        "SELECT prefixed_id, type, update_time FROM ({base_sql}) AS hits{type_filter}
         ORDER BY update_time DESC LIMIT ?2 OFFSET ?3"
    );
    let mut stmt = conn
        .prepare(&result_sql)
        .map_err(|e| format!("DB_OPEN_FAILED: unified LIKE query prepare failed: {e}"))?;
    let rows = stmt
        .query_map(params![like_pattern, limit, offset], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("DB_OPEN_FAILED: unified LIKE query failed: {e}"))?;
    let mut items = Vec::new();
    for row in rows.filter_map(Result::ok) {
        if let Some((result_type, id)) = hit_id(&row.0) {
            if let Some(item) = hydrate_unified_result(conn, result_type, id, 0.0)? {
                items.push(item);
            }
        }
    }
    Ok(("like".to_string(), total, items))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unified_like_search_covers_all_content_types() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE contents (id INTEGER PRIMARY KEY, content TEXT, update_time INTEGER);
            CREATE TABLE cards (id INTEGER PRIMARY KEY, content_id INTEGER, update_time INTEGER, tags TEXT);
            CREATE TABLE articles (id INTEGER PRIMARY KEY, title TEXT, author TEXT, tags TEXT, content_id INTEGER, update_time INTEGER, is_delete INTEGER);
            CREATE TABLE project (id INTEGER PRIMARY KEY, title TEXT);
            CREATE TABLE project_item (id INTEGER PRIMARY KEY, title TEXT, content_id INTEGER, update_time INTEGER, projects TEXT, ref_type TEXT, tags TEXT);
            CREATE TABLE diary_entries (id INTEGER PRIMARY KEY, type TEXT, date TEXT, tags TEXT, content_id INTEGER, update_time INTEGER);
            CREATE TABLE diary_segments (id INTEGER PRIMARY KEY, diary_id INTEGER, content_id INTEGER, create_time INTEGER);
            CREATE TABLE flashcards (id INTEGER PRIMARY KEY, deck_id INTEGER, update_time INTEGER, prompt TEXT, detail TEXT, tags TEXT);
            CREATE TABLE flashcard_decks (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO contents VALUES
              (1, '[{\"text\":\"卡片统一搜索\"}]', 10),
              (2, '[{\"text\":\"文章统一搜索\"}]', 20),
              (3, '[{\"text\":\"项目统一搜索\"}]', 30),
              (4, '[{\"text\":\"未挂载内容统一搜索\"}]', 40),
              (5, '[{\"text\":\"日记统一搜索\"}]', 50);
            INSERT INTO cards VALUES (1, 1, 10, '[]');
            INSERT INTO articles VALUES (2, '文章标题', '作者', '[]', 2, 20, 0);
            INSERT INTO project VALUES (3, '项目一');
            INSERT INTO project_item VALUES (3, '项目文档', 3, 30, '[3]', '', '[]');
            INSERT INTO diary_entries VALUES (5, 'daily', '2026-09-13', '[]', NULL, 50);
            INSERT INTO diary_segments VALUES (5, 5, 5, 1);
            INSERT INTO flashcard_decks VALUES (9, '算法面试');
            INSERT INTO flashcards VALUES (6, 9, 60, '[{\"type\":\"paragraph\",\"children\":[{\"type\":\"formatted\",\"text\":\"闪卡统一搜索\"}]}]', '[]', '[]');
            ",
        )
        .unwrap();

        let (mode, total, items) = query_unified_search(&conn, "统一搜索", None, 1, 20).unwrap();
        assert_eq!(mode, "like");
        assert_eq!(total, 6);
        assert_eq!(items.len(), 6);
        assert!(items.iter().any(|item| item.result_type == "card"));
        assert!(items.iter().any(|item| item.result_type == "article"));
        assert!(items.iter().any(|item| item.result_type == "project-item"));
        assert!(items.iter().any(|item| item.result_type == "diary-daily"));
        let flashcard = items.iter().find(|item| item.result_type == "flashcard").unwrap();
        assert_eq!(flashcard.title, "闪卡统一搜索");
        assert_eq!(flashcard.container_id, Some(9));
        assert_eq!(flashcard.container_title.as_deref(), Some("算法面试"));
    }

    #[test]
    fn unified_search_uses_fts_index_when_ready() {
        let base = std::env::temp_dir().join(format!("tau-search-test-{}.db", std::process::id()));
        let index_path = base.with_extension("index.db");
        let _ = std::fs::remove_file(&base);
        let _ = std::fs::remove_file(&index_path);
        let conn = Connection::open(&base).unwrap();
        conn.execute_batch(
            "CREATE TABLE contents (id INTEGER PRIMARY KEY, content TEXT, update_time INTEGER);
             CREATE TABLE articles (id INTEGER PRIMARY KEY, title TEXT, author TEXT, tags TEXT, content_id INTEGER, update_time INTEGER, is_delete INTEGER);
             CREATE TABLE cards (id INTEGER PRIMARY KEY, content_id INTEGER, update_time INTEGER, tags TEXT);
             CREATE TABLE project_item (id INTEGER PRIMARY KEY, title TEXT, content_id INTEGER, update_time INTEGER, projects TEXT, ref_type TEXT, tags TEXT);
             CREATE TABLE diary_entries (id INTEGER PRIMARY KEY, type TEXT, date TEXT, tags TEXT, content_id INTEGER, update_time INTEGER);
             CREATE TABLE diary_segments (id INTEGER PRIMARY KEY, diary_id INTEGER, content_id INTEGER, create_time INTEGER);
             CREATE TABLE flashcards (id INTEGER PRIMARY KEY, deck_id INTEGER, update_time INTEGER, prompt TEXT, detail TEXT, tags TEXT);
             CREATE TABLE flashcard_decks (id INTEGER PRIMARY KEY, name TEXT);
             INSERT INTO contents VALUES (1, '[{\"text\":\"全文索引命中\"}]', 10);
             INSERT INTO articles VALUES (1, '文章标题', '', '[]', 1, 10, 0);
             INSERT INTO flashcard_decks VALUES (7, '英语高频词');
             INSERT INTO flashcards VALUES (2, 7, 20, '[{\"type\":\"paragraph\",\"children\":[{\"type\":\"formatted\",\"text\":\"全文索引闪卡题干\"}]}]', '[]', '[]');",
        )
        .unwrap();
        let index = Connection::open(&index_path).unwrap();
        index
            .execute_batch(
                "CREATE VIRTUAL TABLE content_fts USING fts5(prefixed_id, update_time, content, type, title, chunk_index, tokenize='porter unicode61');
                 CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER);
                 INSERT INTO index_meta VALUES ('migration_state', 'done', 0);
                 INSERT INTO index_meta VALUES ('rebuild_state', 'ready', 0);
                 INSERT INTO content_fts(prefixed_id, update_time, content, type, title, chunk_index)
                 VALUES ('article:1', 10, '全文 索引 命中', 'article', '文章 标题', 0);
                 INSERT INTO content_fts(prefixed_id, update_time, content, type, title, chunk_index)
                 VALUES ('flashcard:2', 20, '全文 索引 闪卡 题干', 'flashcard', '', 0);",
            )
            .unwrap();

        let (mode, total, items) = query_unified_search(&conn, "全文索引", None, 1, 20).unwrap();
        assert_eq!(mode, "fts");
        assert_eq!(total, 2);
        assert!(items.iter().any(|item| item.result_type == "article"));
        let flashcard = items.iter().find(|item| item.result_type == "flashcard").unwrap();
        assert_eq!(flashcard.title, "全文索引闪卡题干");
        assert_eq!(flashcard.container_title.as_deref(), Some("英语高频词"));
        drop(index);
        drop(conn);
        let _ = std::fs::remove_file(&base);
        let _ = std::fs::remove_file(&index_path);
    }
}
