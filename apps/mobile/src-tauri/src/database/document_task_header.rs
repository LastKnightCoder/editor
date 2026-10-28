use rusqlite::{params, Connection};
use serde_json::Value;
fn sql_error(error: rusqlite::Error) -> String {
    error.to_string()
}
pub(super) fn parse(
    conn: &Connection,
    node: &Value,
) -> Result<(String, Option<String>, Option<String>, Option<String>), String> {
    let text = text(&node["children"][0]);
    let mut title = text.clone();
    let mut group = None;
    let binding = &node["taskGroup"];
    if let (Some(id), Some(token)) = (binding["id"].as_i64(), binding["token"].as_str()) {
        let valid=conn.query_row("SELECT EXISTS(SELECT 1 FROM todo_group WHERE id=?1 AND is_archived=0 AND (?2 IS NULL OR create_time=?2))",params![id,binding["createdAt"].as_i64()],|row|row.get::<_,bool>(0)).map_err(sql_error)?;
        if valid && title.contains(token) {
            group = Some(token.to_owned());
        }
    }
    if group.is_none() {
        let mut stmt=conn.prepare("SELECT title FROM (SELECT title FROM todo_group WHERE is_archived=0 UNION SELECT n.title FROM doc_task_group_names n JOIN todo_group g ON g.id=n.group_id AND g.create_time=n.group_created_at WHERE g.is_archived=0) ORDER BY length(title) DESC").map_err(sql_error)?;
        for name in stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(sql_error)?
        {
            let token = format!("#{}", name.map_err(sql_error)?);
            if title.contains(&token) {
                group = Some(token);
                break;
            }
        }
    }
    if let Some(token) = &group {
        title = title.replacen(token, " ", 1);
    }
    static DATE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let pattern=DATE.get_or_init(||regex::Regex::new(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日").expect("固定日期模式有效"));
    let anchor = &node["taskDateAnchor"];
    let hint = pattern
        .find(&title)
        .map(|value| value.as_str().to_owned())
        .or_else(|| {
            anchor["hint"]
                .as_str()
                .filter(|hint| title.contains(hint))
                .map(str::to_owned)
        });
    let due = if let Some(hint) = &hint {
        let parsed = if hint.contains('T') {
            chrono::DateTime::parse_from_rfc3339(hint).ok().map(|date| {
                date.with_timezone(&chrono::Utc)
                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
            })
        } else {
            ["%Y-%m-%d", "%Y/%m/%d", "%Y年%m月%d日"]
                .iter()
                .find_map(|format| chrono::NaiveDate::parse_from_str(hint, format).ok())
                .map(|date| date.format("%Y-%m-%d").to_string())
                .or_else(|| {
                    anchor["date"].as_str().and_then(|date| {
                        chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
                            .ok()
                            .map(|_| date.to_owned())
                    })
                })
        };
        title = title.replacen(hint, " ", 1);
        parsed
    } else {
        None
    };
    Ok((
        title.split_whitespace().collect::<Vec<_>>().join(" "),
        group,
        hint,
        due,
    ))
}

fn text(node: &Value) -> String {
    if let Some(value) = node["text"].as_str() {
        return value.to_owned();
    }
    node["children"]
        .as_array()
        .into_iter()
        .flatten()
        .map(text)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn formatted_leaves_do_not_insert_spaces_into_group_or_date_tokens() {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(7,'工作',1,1)",
            [],
        )
        .unwrap();
        let node = serde_json::json!({"children":[{"type":"paragraph","children":[{"text":"原","bold":true},{"text":"任务 #工"},{"text":"作 2026-10-28","italic":true}]}]});
        let parsed = parse(&conn, &node).unwrap();
        assert_eq!(parsed.0, "原任务");
        assert_eq!(parsed.1.as_deref(), Some("#工作"));
        assert_eq!(parsed.3.as_deref(), Some("2026-10-28"));
    }
}
