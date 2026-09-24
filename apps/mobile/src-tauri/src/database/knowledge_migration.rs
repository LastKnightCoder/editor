use rusqlite::{params, types::ValueRef, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

const KEY: &str = "knowledge-to-project:v1";
const MAX_SAFE_ID: i64 = 9_007_199_254_740_991;
/// 与 Node 端 packages/db-schema/src/model-version.ts 的 DATA_MODEL_VERSION 保持一致。
pub(crate) const DATA_MODEL_VERSION: u64 = 1;

#[derive(Debug, Default, Serialize, Deserialize)]
pub(crate) struct Mapping {
    pub projects: BTreeMap<i64, i64>,
    pub items: BTreeMap<i64, i64>,
}

/// 已迁移库的映射在同一文件内不可变；按主库路径缓存，协作命令避免每次解析大 JSON。
/// 缓存随 invalidate_cached_connection 一并清空（下载替换库文件后必须失效）。
fn mapping_cache() -> &'static Mutex<HashMap<PathBuf, Arc<Mapping>>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, Arc<Mapping>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn connection_path(conn: &Connection) -> Option<PathBuf> {
    let mut statement = conn.prepare("PRAGMA database_list").ok()?;
    let mut rows = statement.query([]).ok()?;
    while let Ok(Some(row)) = rows.next() {
        if row.get::<_, String>(1).ok()? == "main" {
            let file = row.get::<_, String>(2).ok()?;
            if !file.is_empty() {
                return Some(PathBuf::from(file));
            }
        }
    }
    None
}

pub(crate) fn clear_mapping_cache() {
    mapping_cache().lock().unwrap().clear();
}

pub(crate) fn read_mapping(conn: &Connection) -> Result<Option<Arc<Mapping>>, String> {
    let cache_key = connection_path(conn);
    if let Some(path) = &cache_key {
        if let Some(hit) = mapping_cache().lock().unwrap().get(path) {
            return Ok(Some(hit.clone()));
        }
    }
    if !table_exists(conn, "migration_meta")? {
        return Ok(None);
    }
    let raw = conn
        .query_row(
            "SELECT value FROM migration_meta WHERE key=?1",
            [KEY],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(error)?;
    let result = raw
        .map(|raw| {
            let report: Value = serde_json::from_str(&raw).map_err(error)?;
            let mapping: Mapping = serde_json::from_value(report["mapping"].clone()).map_err(error)?;
            if mapping
                .projects
                .iter()
                .chain(mapping.items.iter())
                .any(|(id, target)| {
                    *id <= 0 || *id > MAX_SAFE_ID || *target <= 0 || *target > MAX_SAFE_ID
                })
            {
                return Err(error("迁移映射损坏，已停止打开数据库"));
            }
            Ok(Arc::new(mapping))
        })
        .transpose()?;
    if let (Some(path), Some(mapping)) = (&cache_key, &result) {
        mapping_cache().lock().unwrap().insert(path.clone(), mapping.clone());
    }
    Ok(result)
}

pub(crate) fn migrate_index(main: &Connection, index: &Connection) -> Result<(), String> {
    let Some(mapping) = read_mapping(main)? else {
        return Ok(());
    };
    let key = "knowledge-to-project:index-v1";
    let fingerprint = serde_json::to_string(&mapping).map_err(error)?;
    let previous = index
        .query_row("SELECT value FROM index_meta WHERE key=?1", [key], |r| {
            r.get::<_, String>(0)
        })
        .optional()
        .map_err(error)?;
    if previous.as_deref() == Some(&fingerprint) {
        return Ok(());
    }
    let tx = index.unchecked_transaction().map_err(error)?;
    for table in ["content_fts", "vec_documents"] {
        if !table_exists(&tx, table)? {
            continue;
        }
        for (before, after) in &mapping.items {
            let target = format!("project-item:{after}");
            let source = format!("document-item:{before}");
            tx.execute(
                &format!("DELETE FROM {table} WHERE prefixed_id=?1"),
                [&target],
            )
            .map_err(error)?;
            if table == "content_fts" {
                tx.execute("UPDATE content_fts SET prefixed_id=?1,type='project-item' WHERE prefixed_id=?2",params![target,source]).map_err(error)?;
            } else {
                tx.execute("INSERT INTO vec_documents(prefixed_id,update_time,content,type,vec_embedding) SELECT ?1,update_time,content,'project-item',vec_embedding FROM vec_documents WHERE prefixed_id=?2",params![target,source]).map_err(error)?;
            }
        }
        tx.execute(
            &format!("DELETE FROM {table} WHERE type='document-item'"),
            [],
        )
        .map_err(error)?;
    }
    tx.execute("INSERT INTO index_meta(key,value,updated_at) VALUES(?1,?2,0) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,fingerprint]).map_err(error)?;
    tx.commit().map_err(error)
}

fn error(message: impl std::fmt::Display) -> String {
    format!("KNOWLEDGE_MIGRATION_FAILED: {message}")
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
        [table],
        |r| r.get(0),
    )
    .map_err(error)
}

fn rows(conn: &Connection, sql: &str) -> Result<Vec<Value>, String> {
    let mut stmt = conn.prepare(sql).map_err(error)?;
    let names: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect();
    let values = stmt
        .query_map([], |row| {
            let mut value = serde_json::Map::new();
            for (index, name) in names.iter().enumerate() {
                let item = match row.get_ref(index)? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(n) => json!(n),
                    ValueRef::Real(n) => json!(n),
                    ValueRef::Text(text) => json!(String::from_utf8_lossy(text)),
                    ValueRef::Blob(_) => {
                        return Err(rusqlite::Error::InvalidColumnType(
                            index,
                            name.clone(),
                            rusqlite::types::Type::Blob,
                        ))
                    }
                };
                value.insert(name.clone(), item);
            }
            Ok(Value::Object(value))
        })
        .map_err(error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| match e {
            rusqlite::Error::InvalidColumnType(_, _, rusqlite::types::Type::Blob) => {
                error(format!("{sql} 查询到 BLOB 列，历史数据不是合法 JSON"))
            }
            other => error(other.to_string()),
        })?;
    Ok(values)
}

fn records(conn: &Connection, table: &str) -> Result<Vec<Value>, String> {
    if !table_exists(conn, table)? {
        return Ok(Vec::new());
    }
    rows(conn, &format!("SELECT * FROM {table} ORDER BY id"))
}

fn has_rows(conn: &Connection, table: &str) -> Result<bool, String> {
    conn.query_row(
        &format!("SELECT EXISTS(SELECT 1 FROM {table})"),
        [],
        |r| r.get(0),
    )
    .map_err(error)
}

fn array(value: &Value, label: &str) -> Result<Vec<Value>, String> {
    // 非文本值（整数/BLOB 等违反列约定的历史数据）直接失败，不静默按空数组迁移
    let raw = match value {
        Value::Null => return Ok(Vec::new()),
        Value::String(text) => text.as_str(),
        _ => return Err(error(format!("{label} 不是文本数组"))),
    };
    let parsed: Value = serde_json::from_str(if raw.is_empty() { "[]" } else { raw })
        .map_err(|_| error(format!("{label} 不是合法 JSON")))?;
    parsed
        .as_array()
        .cloned()
        .ok_or_else(|| error(format!("{label} 必须是数组")))
}

fn ids(value: &Value, label: &str) -> Result<Vec<i64>, String> {
    let mut seen = BTreeSet::new();
    array(value, label)?
        .into_iter()
        .map(|id| {
            let id = id
                .as_i64()
                .filter(|id| *id > 0 && *id <= MAX_SAFE_ID)
                .ok_or_else(|| error(format!("{label} 包含无效 ID")))?;
            if !seen.insert(id) {
                return Err(error(format!("{label} 包含重复节点")));
            }
            Ok(id)
        })
        .collect()
}

fn number(value: &Value, field: &str) -> Result<i64, String> {
    value[field]
        .as_i64()
        .ok_or_else(|| error(format!("{}.{field} 不是整数", value["id"])))
}

fn mapped(map: &BTreeMap<i64, i64>, id: i64) -> Result<i64, String> {
    map.get(&id)
        .copied()
        .ok_or_else(|| error(format!("无法定位历史引用 {id}")))
}

pub(crate) fn references(value: &mut Value, mapping: &Mapping) -> Result<(), String> {
    match value {
        Value::Array(list) => {
            for item in list {
                references(item, mapping)?;
            }
        }
        Value::Object(object) => {
            for item in object.values_mut() {
                references(item, mapping)?;
            }
            if object.get("type").and_then(Value::as_str) == Some("document-card-list") {
                let id = object
                    .get("documentItemId")
                    .and_then(Value::as_i64)
                    .ok_or_else(|| error("文档列表块缺少 ID"))?;
                object.insert("type".into(), json!("project-card-list"));
                object.insert("projectItemId".into(), json!(mapped(&mapping.items, id)?));
                object.remove("documentItemId");
            }
            let mut replacements = Vec::new();
            for (kind, key) in [
                ("contentType", "refId"),
                ("sourceType", "sourceId"),
                ("entityType", "entityId"),
                ("refType", "refId"),
                ("type", "id"),
                ("type", "originalId"),
            ] {
                if object.get(kind).and_then(Value::as_str) == Some("document-item")
                    && object.contains_key(key)
                {
                    let id = object[key].as_i64().ok_or_else(|| error("引用 ID 无效"))?;
                    replacements.push((kind, key, mapped(&mapping.items, id)?));
                }
            }
            for (kind, key, id) in replacements {
                object.insert(kind.into(), json!("project-item"));
                object.insert(key.into(), json!(id));
            }
        }
        _ => {}
    }
    Ok(())
}

struct Prepared {
    roots: Vec<Value>,
    items: Vec<Value>,
    mapping: Mapping,
    children: BTreeMap<i64, Vec<i64>>,
    root_children: BTreeMap<i64, Vec<i64>>,
    projects: BTreeMap<i64, BTreeSet<i64>>,
    repaired: usize,
    dangling: usize,
    orphans: Vec<i64>,
    rescue_project_id: Option<i64>,
}

fn prepare(conn: &Connection) -> Result<Prepared, String> {
    let roots = records(conn, "documents")?;
    let items = records(conn, "document_items")?;
    let max_id = |table: &str| -> Result<i64, String> {
        if !table_exists(conn, table)? {
            return Ok(0);
        }
        conn.query_row(
            &format!("SELECT COALESCE(MAX(id),0) FROM {table}"),
            [],
            |r| r.get(0),
        )
        .map_err(error)
    };
    let sequence = if table_exists(conn, "migration_meta")? {
        conn.query_row(
            "SELECT value FROM migration_meta WHERE key='project:id-seq'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(error)?
        .unwrap_or_else(|| "0".into())
        .parse::<i64>()
        .map_err(error)?
    } else {
        0
    };
    if sequence < 0 {
        return Err(error("项目 ID 序列无效"));
    }
    let mut mapping = Mapping::default();
    for row in roots.iter().chain(items.iter()) {
        let old_id = number(row, "id")?;
        if old_id <= 0 || old_id > MAX_SAFE_ID {
            return Err(error(format!("历史实体 ID 无效：{old_id}")));
        }
    }
    let item_ids: BTreeSet<i64> = items
        .iter()
        .map(|row| number(row, "id"))
        .collect::<Result<_, _>>()?;
    // 悬空 child 引用是旧版"删子节点不清父引用"的残留：剔除并计数，不再视为致命损坏
    let mut dangling = 0usize;
    let mut children: BTreeMap<i64, Vec<i64>> = BTreeMap::new();
    for row in &items {
        let id = number(row, "id")?;
        let list = ids(&row["children"], &format!("节点 {id}"))?;
        dangling += list.iter().filter(|child| !item_ids.contains(child)).count();
        children.insert(
            id,
            list.into_iter().filter(|child| item_ids.contains(child)).collect(),
        );
    }
    let mut root_children: BTreeMap<i64, Vec<i64>> = BTreeMap::new();
    for row in &roots {
        let id = number(row, "id")?;
        array(&row["content"], &format!("知识库 {id} 正文"))?;
        let list = ids(&row["children"], &format!("知识库 {id}"))?;
        dangling += list.iter().filter(|child| !item_ids.contains(child)).count();
        root_children.insert(
            id,
            list.into_iter().filter(|child| item_ids.contains(child)).collect(),
        );
    }
    // 从知识库根沿 children 做可达闭包（迭代 BFS，避免深层文档树耗尽调用栈）
    let mut reachable: BTreeSet<i64> = BTreeSet::new();
    let mut queue: VecDeque<i64> = VecDeque::new();
    for list in root_children.values() {
        for child in list.iter().copied() {
            if reachable.insert(child) {
                queue.push_back(child);
            }
        }
    }
    while let Some(id) = queue.pop_front() {
        if let Some(list) = children.get(&id) {
            for child in list.iter().copied() {
                if reachable.insert(child) {
                    queue.push_back(child);
                }
            }
        }
    }
    // 从任何知识库根不可达的孤儿节点是历史结构变化的遗留（旧树 UI 同样不可见）：
    // 不丢弃数据，统一收拢进一个「未挂载文档」项目，避免正文失去全部入口
    let mut reachable_items: Vec<&Value> = Vec::new();
    let mut orphan_items: Vec<&Value> = Vec::new();
    for row in &items {
        if reachable.contains(&number(row, "id")?) {
            reachable_items.push(row);
        } else {
            orphan_items.push(row);
        }
    }
    let orphans: Vec<i64> = orphan_items
        .iter()
        .map(|row| number(row, "id"))
        .collect::<Result<_, _>>()?;
    let allocate = |target: i64, index: usize| -> Result<i64, String> {
        target
            .checked_add(index as i64 + 1)
            .filter(|id| *id <= MAX_SAFE_ID)
            .ok_or_else(|| error("迁移后的 ID 超出安全整数范围"))
    };
    let project_start = max_id("project")?.max(sequence);
    let item_start = max_id("project_item")?;
    for (index, row) in roots.iter().enumerate() {
        mapping.projects.insert(number(row, "id")?, allocate(project_start, index)?);
    }
    let rescue_project_id = if orphan_items.is_empty() {
        None
    } else {
        Some(allocate(project_start, roots.len())?)
    };
    for (index, row) in reachable_items.iter().enumerate() {
        mapping.items.insert(number(row, "id")?, allocate(item_start, index)?);
    }
    for (index, row) in orphan_items.iter().enumerate() {
        mapping
            .items
            .insert(number(row, "id")?, allocate(item_start, reachable_items.len() + index)?);
    }
    let mut parents: BTreeMap<i64, BTreeSet<i64>> = BTreeMap::new();
    let mut projects: BTreeMap<i64, BTreeSet<i64>> = BTreeMap::new();
    for row in &items {
        let id = number(row, "id")?;
        parents.insert(id, BTreeSet::new());
        projects.insert(id, BTreeSet::new());
        if array(&row["tags"], &format!("节点 {id} 标签"))?
            .iter()
            .any(|tag| !tag.is_string())
        {
            return Err(error(format!("节点 {id} 标签无效")));
        }
        let content_id = number(row, "content_id")?;
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM contents WHERE id=?1)",
                [content_id],
                |r| r.get(0),
            )
            .map_err(error)?;
        if !exists {
            return Err(error(format!("节点 {id} 正文 {content_id} 不存在")));
        }
        let mut refs = BTreeSet::new();
        if let Some(kind) = row["ref_type"].as_str().filter(|v| !v.is_empty()) {
            refs.insert((kind.to_string(), number(row, "ref_id")?));
        }
        // 与 Node 端真值判断一致：非零即视为关联，负数等异常 ID 交给存在性校验去失败
        if row["is_card"].as_i64().unwrap_or(0) != 0 && row["card_id"].as_i64().unwrap_or(0) != 0 {
            refs.insert(("card".into(), number(row, "card_id")?));
        }
        if row["is_article"].as_i64().unwrap_or(0) != 0
            && row["article_id"].as_i64().unwrap_or(0) != 0
        {
            refs.insert(("article".into(), number(row, "article_id")?));
        }
        if refs.len() > 1 {
            return Err(error(format!("节点 {id} 关联冲突")));
        }
        if let Some((kind, ref_id)) = refs.first() {
            let (table, field) = match kind.as_str() {
                "card" => ("cards", "content_id"),
                "article" => ("articles", "content_id"),
                "content" => ("contents", "id"),
                _ => return Err(error(format!("节点 {id} 关联类型不支持"))),
            };
            let target: Option<i64> = conn
                .query_row(
                    &format!("SELECT {field} FROM {table} WHERE id=?1"),
                    [ref_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(error)?;
            if target != Some(content_id) {
                return Err(error(format!("节点 {id} 关联与正文不一致")));
            }
        }
    }
    for (&parent, list) in &children {
        if !reachable.contains(&parent) {
            continue;
        }
        for child in list {
            parents.get_mut(child).unwrap().insert(parent);
        }
    }
    // 拓扑检查不使用递归，且只覆盖可达子图；孤儿子树不经拓扑传播，其内部成环不阻塞收拢
    let mut remaining: BTreeMap<i64, usize> = parents
        .iter()
        .filter(|(id, _)| reachable.contains(id))
        .map(|(id, p)| (*id, p.len()))
        .collect();
    let mut ready: VecDeque<i64> = remaining
        .iter()
        .filter(|(_, n)| **n == 0)
        .map(|(id, _)| *id)
        .collect();
    let mut order = Vec::new();
    while let Some(id) = ready.pop_front() {
        order.push(id);
        for child in &children[&id] {
            let count = remaining.get_mut(child).unwrap();
            *count -= 1;
            if *count == 0 {
                ready.push_back(*child);
            }
        }
    }
    if order.len() != reachable_items.len() {
        return Err(error("文档树存在循环"));
    }
    for (root_id, list) in &root_children {
        for child in list {
            projects.get_mut(child).unwrap().insert(*root_id);
        }
    }
    for id in order {
        let inherited = projects[&id].clone();
        for child in &children[&id] {
            projects.get_mut(child).unwrap().extend(&inherited);
        }
    }
    if let Some(rescue) = rescue_project_id {
        for row in &orphan_items {
            projects.get_mut(&number(row, "id")?).unwrap().insert(rescue);
        }
    }
    let mut repaired = 0;
    for row in &reachable_items {
        let id = number(row, "id")?;
        for (field, expected) in [("parents", &parents[&id]), ("documents", &projects[&id])] {
            if ids(&row[field], field)?
                .into_iter()
                .collect::<BTreeSet<_>>()
                != *expected
            {
                repaired += 1;
            }
        }
    }
    Ok(Prepared {
        roots,
        items,
        mapping,
        children,
        root_children,
        projects,
        repaired,
        dangling,
        orphans,
        rescue_project_id,
    })
}

fn migrate_json(conn: &Connection, mapping: &Mapping) -> Result<(), String> {
    for (table, column) in [
        ("contents", "content"),
        ("project", "desc"),
        ("white_board_contents", "data"),
        ("questions", "question_content"),
        ("questions", "answers"),
        ("flashcards", "data"),
        ("data_tables", "rows"),
        ("data_tables", "columns"),
        ("chat_run", "request_payload"),
        ("chat_run", "tool_snapshot"),
        ("vibe_learning_resources", "source_meta_info"),
        ("chat_message", "messages"),
        ("pdf_chats", "messages"),
        ("video_note_chats", "messages"),
        ("audio_note_chats", "messages"),
        ("vibe_learning_chats", "messages"),
    ] {
        if !table_exists(conn, table)? {
            continue;
        }
        let info = rows(conn, &format!("PRAGMA table_info({table})"))?;
        if !info.iter().any(|row| row["name"] == column) {
            continue;
        }
        let key = if table == "chat_run" { "run_id" } else { "id" };
        for row in rows(conn, &format!("SELECT {key} AS id,{column} AS value FROM {table} WHERE {column} LIKE '%document-item%' OR {column} LIKE '%document-card-list%'"))? {
            let mut value: Value = serde_json::from_str(row["value"].as_str().unwrap_or("")).map_err(error)?;
            references(&mut value, mapping)?;
            if column == "messages" || table == "chat_run" || table == "flashcards" { citations_in_json(&mut value, mapping)?; }
            conn.execute(&format!("UPDATE {table} SET {column}=?1 WHERE {key}=?2"), params![value.to_string(), row["id"].as_str().map(str::to_string).unwrap_or_else(|| row["id"].to_string())]).map_err(error)?;
        }
    }
    for column in ["assistant_snapshot", "reasoning_snapshot"] {
        if !table_exists(conn, "chat_run")? {
            continue;
        }
        for row in rows(conn,&format!("SELECT run_id,{column} AS value FROM chat_run WHERE {column} LIKE '%document-item%'"))? {
            conn.execute(&format!("UPDATE chat_run SET {column}=?1 WHERE run_id=?2"),params![citations(row["value"].as_str().unwrap_or(""),mapping)?,row["run_id"].as_str()]).map_err(error)?;
        }
    }
    Ok(())
}

fn citations_in_json(value: &mut Value, mapping: &Mapping) -> Result<(), String> {
    match value {
        Value::String(text) => *text = citations(text, mapping)?,
        Value::Array(items) => {
            for item in items {
                citations_in_json(item, mapping)?;
            }
        }
        Value::Object(object) => {
            for item in object.values_mut() {
                citations_in_json(item, mapping)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn citations(text: &str, mapping: &Mapping) -> Result<String, String> {
    let mut output = String::new();
    let mut remaining = text;
    while !remaining.is_empty() {
        let first = remaining.as_bytes()[0];
        let run = remaining.bytes().take_while(|byte| *byte == first).count();
        let skip = if first == b'`' || (first == b'~' && run >= 3) {
            Some(&remaining[..run])
        } else {
            None
        };
        if let Some(delimiter) = skip {
            let length = remaining[delimiter.len()..]
                .find(delimiter)
                .map(|end| end + delimiter.len() * 2)
                .unwrap_or(remaining.len());
            output.push_str(&remaining[..length]);
            remaining = &remaining[length..];
            continue;
        }
        if remaining.starts_with(":ref[") {
            if let Some(split) = remaining.find("]{") {
                if let Some(end) = remaining[split + 2..].find('}') {
                    let length = split + 2 + end + 1;
                    let attributes = &remaining[split + 2..length - 1];
                    let parts: Vec<&str> = attributes.split_whitespace().collect();
                    // label 含 ']' 的文本不是合法引用，与 Node 端 [^\]\n]* 的正则语义一致
                    if parts.contains(&"type=document-item")
                        && !remaining[..length].contains('\n')
                        && !remaining[":ref[".len()..split].contains(']')
                    {
                        // 与 Node 端一致：取第一个全数字 id= 片段；越界数值在映射查询处失败
                        let id_part = parts.iter().copied().find(|part| {
                            part.strip_prefix("id=").is_some_and(|id| {
                                !id.is_empty() && id.bytes().all(|byte| byte.is_ascii_digit())
                            })
                        });
                        if let Some(id_part) = id_part {
                            let id: i64 = id_part["id=".len()..]
                                .parse()
                                .map_err(|_| error(format!("无法定位历史引用 {id_part}")))?;
                            output.push_str(&remaining[..split + 2]);
                            let target = mapped(&mapping.items, id)?;
                            let next = parts
                                .iter()
                                .map(|part| {
                                    if *part == id_part {
                                        format!("id={target}")
                                    } else if *part == "type=document-item" {
                                        "type=project-item".into()
                                    } else {
                                        part.to_string()
                                    }
                                })
                                .collect::<Vec<_>>()
                                .join(" ");
                            output.push_str(&next);
                            output.push('}');
                            remaining = &remaining[length..];
                            continue;
                        }
                    }
                }
            }
        }
        let character = remaining.chars().next().unwrap();
        output.push(character);
        remaining = &remaining[character.len_utf8()..];
    }
    Ok(output)
}

fn migrate_metadata(conn: &Connection, mapping: &Mapping) -> Result<(), String> {
    for (table, kind, key, before, after, map) in [
        (
            "operation",
            "operation_content_type",
            "operation_id",
            "document-item",
            "project-item",
            &mapping.items,
        ),
        (
            "operation",
            "operation_content_type",
            "operation_id",
            "document",
            "project",
            &mapping.projects,
        ),
        (
            "collaboration_bindings",
            "source_type",
            "source_id",
            "document-item",
            "project-item",
            &mapping.items,
        ),
    ] {
        if !table_exists(conn, table)? {
            continue;
        }
        for row in rows(
            conn,
            &format!("SELECT DISTINCT {key} AS id FROM {table} WHERE {kind}='{before}'"),
        )? {
            let id = number(&row, "id")?;
            if !map.contains_key(&id) {
                if table == "operation" {
                    conn.execute(
                        &format!("UPDATE {table} SET {kind}=?1 WHERE {kind}=?2 AND {key}=?3"),
                        params![format!("retired-{before}"), before, id],
                    )
                    .map_err(error)?;
                } else {
                    // 旧版本删除知识库节点时不清理协作绑定；正文仍在则降级为 retired 来源，
                    // 正文已删的行无法再恢复绑定，直接清除（与 Node 端一致）。
                    let alive: bool = conn
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM collaboration_bindings b JOIN contents c ON c.id=b.content_id AND c.create_time=b.content_created_at WHERE b.source_type=?1 AND b.source_id=?2)",
                            params![before, id],
                            |r| r.get(0),
                        )
                        .map_err(error)?;
                    if alive {
                        conn.execute(
                            "UPDATE collaboration_bindings SET source_type=?1 WHERE source_type=?2 AND source_id=?3",
                            params![format!("retired-{before}"), before, id],
                        )
                        .map_err(error)?;
                    } else {
                        conn.execute(
                            "DELETE FROM collaboration_bindings WHERE source_type=?1 AND source_id=?2",
                            params![before, id],
                        )
                        .map_err(error)?;
                    }
                }
            } else {
                conn.execute(
                    &format!("UPDATE {table} SET {kind}=?1,{key}=?2 WHERE {kind}=?3 AND {key}=?4"),
                    params![after, mapped(map, id)?, before, id],
                )
                .map_err(error)?;
            }
        }
    }
    if table_exists(conn, "todo_note_link")? {
        conn.execute(
            "UPDATE todo_note_link SET type='project-item' WHERE type='document-item'",
            [],
        )
        .map_err(error)?;
    }
    if table_exists(conn, "content_link")?
        && !rows(
            conn,
            "SELECT id FROM content_link WHERE source_type='document' LIMIT 1",
        )?
        .is_empty()
    {
        return Err(error(
            "content_link 含语义不明确的 document 来源，需先确认记录归属",
        ));
    }
    if table_exists(conn, "publish_selections")? {
        for row in rows(
            conn,
            "SELECT * FROM publish_selections WHERE content_type='document'",
        )? {
            // 指向已删除知识库的发布选择无迁移意义，直接清除（区别于 publish_history 的置空保留）
            if !mapping
                .projects
                .contains_key(&number(&row, "content_id").unwrap_or(0))
            {
                conn.execute("DELETE FROM publish_selections WHERE id=?1", params![number(&row, "id")?])
                    .map_err(error)?;
                continue;
            }
            let mut path = row["parent_path"].as_str().unwrap_or("").to_string();
            if !path.is_empty() {
                let mut scope: Value = serde_json::from_str(&path).map_err(error)?;
                if scope["mode"] != "partial" || !scope["nodes"].is_array() {
                    return Err(error("发布选择范围无法识别"));
                }
                for node in scope["nodes"].as_array_mut().unwrap() {
                    *node = json!(mapped(
                        &mapping.items,
                        node.as_i64().ok_or_else(|| error("发布节点 ID 无效"))?
                    )?);
                }
                path = scope.to_string();
            }
            conn.execute("UPDATE publish_selections SET content_type='project',content_id=?1,parent_path=?2 WHERE id=?3", params![mapped(&mapping.projects, number(&row,"content_id")?)?,path,number(&row,"id")?]).map_err(error)?;
        }
    }
    if table_exists(conn, "publish_history")? {
        for row in rows(
            conn,
            "SELECT id,source_id FROM publish_history WHERE source_type='document'",
        )? {
            conn.execute(
                "UPDATE publish_history SET source_type='project',source_id=?1 WHERE id=?2",
                params![
                    row["source_id"]
                        .as_i64()
                        .and_then(|id| mapping.projects.get(&id).copied()),
                    number(&row, "id")?
                ],
            )
            .map_err(error)?;
        }
    }
    if table_exists(conn, "statistic")? {
        let mut dates: BTreeMap<String, BTreeMap<String, Value>> = BTreeMap::new();
        for row in rows(conn,"SELECT * FROM statistic WHERE statistic_type IN ('project-item','document-item') ORDER BY date,id")? {
            let date = row["date"].as_str().ok_or_else(|| error("统计日期无效"))?.to_string();
            let kind = row["statistic_type"].as_str().unwrap().to_string();
            if dates.entry(date).or_default().insert(kind,row).is_some() { return Err(error("统计快照重复")); }
        }
        conn.execute(
            "DELETE FROM statistic WHERE statistic_type IN ('project-item','document-item')",
            [],
        )
        .map_err(error)?;
        let mut current = BTreeMap::from([
            (
                "project-item".to_string(),
                json!({"count":0,"wordsCount":0}),
            ),
            (
                "document-item".to_string(),
                json!({"count":0,"wordsCount":0}),
            ),
        ]);
        for (date, types) in dates {
            for (kind, row) in &types {
                let value: Value =
                    serde_json::from_str(row["content"].as_str().unwrap_or("")).map_err(error)?;
                // 与 Node 端一致：接受非负有限数（含浮点），整数结果按整数写出
                if ["count", "wordsCount"]
                    .iter()
                    .any(|key| value[key].as_f64().is_none_or(|n| !n.is_finite() || n < 0.0))
                {
                    return Err(error("统计快照无效"));
                }
                current.insert(kind.clone(), value);
            }
            let sum = |key: &str| {
                let total: f64 = current.values().map(|value| value[key].as_f64().unwrap()).sum();
                if total.fract() == 0.0 && total.abs() <= MAX_SAFE_ID as f64 {
                    json!(total as i64)
                } else {
                    json!(total)
                }
            };
            let id = types
                .values()
                .map(|row| number(row, "id"))
                .collect::<Result<Vec<_>, _>>()?
                .into_iter()
                .min()
                .unwrap();
            conn.execute("INSERT INTO statistic(id,date,statistic_type,content) VALUES(?1,?2,'project-item',?3)",params![id,date,json!({"count":sum("count"),"wordsCount":sum("wordsCount")}).to_string()]).map_err(error)?;
        }
    }
    Ok(())
}

/// 在调用方的升级事务内执行；调用前由 schema 层完成包含 WAL 的快照备份。
pub(crate) fn migrate(conn: &Connection) -> Result<Option<Value>, String> {
    if table_exists(conn, "migration_meta")? {
        let version = conn
            .query_row(
                "SELECT value FROM migration_meta WHERE key='data-model-version'",
                [],
                |r| r.get::<_, String>(0),
            )
            .optional()
            .map_err(error)?;
        if version.is_some_and(|v| v.parse::<u64>().map_or(true, |v| v > DATA_MODEL_VERSION)) {
            return Err(error("数据库模型版本不受支持，请升级全部客户端"));
        }
    }
    if read_mapping(conn)?.is_some() {
        if (table_exists(conn, "documents")? && has_rows(conn, "documents")?)
            || (table_exists(conn, "document_items")? && has_rows(conn, "document_items")?)
        {
            return Err(error("已迁移数据库再次出现旧数据"));
        }
        return Ok(None);
    }
    let prepared = prepare(conn)?;
    if !rows(conn, "PRAGMA table_info(project_item)")?
        .iter()
        .any(|row| row["name"] == "tags")
    {
        conn.execute_batch("ALTER TABLE project_item ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")
            .map_err(error)?;
    }
    let map = &prepared.mapping;
    for project in records(conn, "project")? {
        let raw = project["desc"].as_str().unwrap_or("");
        if !serde_json::from_str::<Value>(raw).is_ok_and(|value| value.is_array()) {
            let desc = if raw.is_empty() {
                json!([])
            } else {
                json!([{"type":"paragraph","children":[{"type":"formatted","text":raw}]}])
            };
            conn.execute(
                "UPDATE project SET desc=?1 WHERE id=?2",
                params![desc.to_string(), number(&project, "id")?],
            )
            .map_err(error)?;
        }
    }
    for root in &prepared.roots {
        let id = number(root, "id")?;
        let mut description = Vec::new();
        if let Some(text) = root["desc"].as_str().filter(|v| !v.is_empty()) {
            description
                .push(json!({"type":"paragraph","children":[{"type":"formatted","text":text}]}));
        }
        description.extend(array(&root["content"], "根正文")?);
        let children = prepared
            .root_children
            .get(&id)
            .map(|list| list.as_slice())
            .unwrap_or_default()
            .iter()
            .map(|child| mapped(&map.items, *child))
            .collect::<Result<Vec<_>, _>>()?;
        conn.execute("INSERT INTO project(id,create_time,update_time,title,desc,children,archived,pinned,project_type,data_table_id) VALUES(?1,?2,?3,?4,?5,?6,0,?7,'document-tree',0)",params![map.projects[&id],number(root,"create_time")?,number(root,"update_time")?,root["title"].as_str().ok_or_else(|| error("标题缺失"))?,json!(description).to_string(),json!(children).to_string(),i64::from(root["is_top"].as_i64().unwrap_or(0) != 0)]).map_err(error)?;
    }
    if let Some(rescue) = prepared.rescue_project_id {
        // 孤儿节点统一收拢，避免正文在新世界失去全部入口；时间戳取迁移时刻
        let now = now_millis();
        let children = prepared
            .orphans
            .iter()
            .map(|id| mapped(&map.items, *id))
            .collect::<Result<Vec<_>, _>>()?;
        conn.execute(
            "INSERT INTO project(id,create_time,update_time,title,desc,children,archived,pinned,project_type,data_table_id) VALUES(?1,?2,?3,'未挂载文档','[]',?4,0,0,'document-tree',0)",
            params![rescue, now, now, json!(children).to_string()],
        )
        .map_err(error)?;
    }
    let orphan_set: BTreeSet<i64> = prepared.orphans.iter().copied().collect();
    let mut item_parents: BTreeMap<i64, Vec<i64>> = prepared
        .items
        .iter()
        .map(|row| Ok((number(row, "id")?, Vec::new())))
        .collect::<Result<_, String>>()?;
    for row in &prepared.items {
        let id = number(row, "id")?;
        for child in &prepared.children[&id] {
            item_parents.get_mut(child).unwrap().push(map.items[&id]);
        }
    }
    for row in &prepared.items {
        let id = number(row, "id")?;
        let children: Vec<i64> = prepared.children[&id]
            .iter()
            .map(|id| map.items[id])
            .collect();
        let parents: Vec<i64> = item_parents[&id].clone();
        let projects: Vec<i64> = if orphan_set.contains(&id) {
            vec![prepared.rescue_project_id.unwrap()]
        } else {
            prepared.projects[&id]
                .iter()
                .map(|id| map.projects[id])
                .collect()
        };
        let (kind, ref_id) = if let Some(kind) = row["ref_type"].as_str().filter(|v| !v.is_empty())
        {
            (kind, number(row, "ref_id")?)
        } else if row["is_card"].as_i64().unwrap_or(0) != 0
            && row["card_id"].as_i64().unwrap_or(0) != 0
        {
            ("card", number(row, "card_id")?)
        } else if row["is_article"].as_i64().unwrap_or(0) != 0
            && row["article_id"].as_i64().unwrap_or(0) != 0
        {
            ("article", number(row, "article_id")?)
        } else {
            ("", 0)
        };
        conn.execute("INSERT INTO project_item(id,create_time,update_time,title,children,parents,projects,ref_type,ref_id,project_item_type,content_id,white_board_content_id,tags) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,'document',?10,0,?11)",params![map.items[&id],number(row,"create_time")?,number(row,"update_time")?,row["title"].as_str().ok_or_else(|| error("标题缺失"))?,json!(children).to_string(),json!(parents).to_string(),json!(projects).to_string(),kind,ref_id,number(row,"content_id")?,json!(array(&row["tags"],"标签")?).to_string()]).map_err(error)?;
    }
    migrate_json(conn, map)?;
    migrate_metadata(conn, map)?;
    conn.execute_batch("DROP TABLE IF EXISTS document_items; DROP TABLE IF EXISTS documents; CREATE TABLE IF NOT EXISTS migration_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);").map_err(error)?;
    let sequence: i64 = conn
        .query_row("SELECT COALESCE(MAX(id),0) FROM project", [], |row| {
            row.get(0)
        })
        .map_err(error)?;
    conn.execute("INSERT INTO migration_meta(key,value) VALUES('project:id-seq',?1) ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(value AS INTEGER),CAST(excluded.value AS INTEGER)) AS TEXT)",[sequence.to_string()]).map_err(error)?;
    let report = json!({"mapping":map,"projectCount":prepared.roots.len(),"itemCount":prepared.items.len(),"repairedRelations":prepared.repaired,"repairedDanglingRefs":prepared.dangling,"recoveredOrphans":prepared.orphans,"rescueProjectId":prepared.rescue_project_id});
    conn.execute(
        "INSERT INTO migration_meta(key,value) VALUES(?1,?2)",
        params![KEY, report.to_string()],
    )
    .map_err(error)?;
    conn.execute("INSERT INTO migration_meta(key,value) VALUES('data-model-version',?1) ON CONFLICT(key) DO UPDATE SET value=?1", params![DATA_MODEL_VERSION.to_string()]).map_err(error)?;
    Ok(Some(report))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn index_migration_preserves_vectors() {
        unsafe {
            rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
                sqlite_vec::sqlite3_vec_init as *const (),
            )));
        }
        let main = Connection::open_in_memory().unwrap();
        main.execute_batch(SCHEMA).unwrap();
        main.execute_batch(FIXTURE).unwrap();
        let tx = main.unchecked_transaction().unwrap();
        migrate(&tx).unwrap();
        tx.commit().unwrap();
        let index = Connection::open_in_memory().unwrap();
        index
            .execute_batch(include_str!(
                "../../../../../packages/db-schema/schema/index.sql"
            ))
            .unwrap();
        index
            .execute_batch(
                &include_str!("../../../../../packages/db-schema/schema/index/20_vec_template.sql")
                    .replace("__VEC_DIMENSION__", "3"),
            )
            .unwrap();
        let vector: Vec<u8> = [1.0f32, 0.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        index.execute("INSERT INTO vec_documents(prefixed_id,type,content,update_time,vec_embedding) VALUES('document-item:2','document-item','正文',18.0,?1)",params![vector]).unwrap();
        migrate_index(&main, &index).unwrap();
        migrate_index(&main, &index).unwrap();
        let result: (String, Vec<u8>) = index
            .query_row(
                "SELECT prefixed_id,vec_embedding FROM vec_documents",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(result.0, "project-item:6");
        assert_eq!(result.1, vector);
    }
    #[test]
    fn shared_reference_cases_match_typescript() {
        let cases: Value = serde_json::from_str(include_str!(
            "../../../../../packages/db-schema/fixtures/knowledge-reference-cases.json"
        ))
        .unwrap();
        let mapping: Mapping = serde_json::from_value(cases["mapping"].clone()).unwrap();
        for sample in cases["objects"].as_array().unwrap() {
            let mut input = sample["input"].clone();
            references(&mut input, &mapping).unwrap();
            assert_eq!(input, sample["expected"]);
        }
        for sample in cases["citations"].as_array().unwrap() {
            assert_eq!(
                citations(sample["input"].as_str().unwrap(), &mapping).unwrap(),
                sample["expected"].as_str().unwrap()
            );
        }
    }
    const SCHEMA: &str = include_str!("../../../../../packages/db-schema/schema/main.sql");
    const FIXTURE: &str =
        include_str!("../../../../../packages/db-schema/fixtures/knowledge-to-project.sql");

    #[test]
    fn dangling_refs_pruned_and_orphans_rescued() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        conn.execute_batch(FIXTURE).unwrap();
        // 根 1 的 children 清空使节点 1 成为孤儿；其 children 同时带一条悬空引用
        conn.execute_batch(
            "UPDATE documents SET children='[]' WHERE id=1;
             UPDATE document_items SET children='[999]' WHERE id=1;",
        )
        .unwrap();
        let tx = conn.transaction().unwrap();
        let report = migrate(&tx).unwrap().unwrap();
        tx.commit().unwrap();
        assert_eq!(report["recoveredOrphans"], json!([1]));
        assert_eq!(report["repairedDanglingRefs"], 1);
        assert_eq!(report["rescueProjectId"], json!(11));
        // 孤儿照常分配映射（1→6）并挂入收容项目；悬空 children 剔除
        assert_eq!(
            rows(&conn, "SELECT children,projects FROM project_item WHERE id=6").unwrap()[0],
            json!({"children":"[]","projects":"[11]"})
        );
        assert_eq!(
            rows(&conn, "SELECT title,children FROM project WHERE id=11").unwrap()[0],
            json!({"title":"未挂载文档","children":"[6]"})
        );
        // 根 1 迁移后的项目 children 为空；重复迁移幂等
        assert_eq!(
            rows(&conn, "SELECT children FROM project WHERE id=9").unwrap()[0],
            json!({"children":"[]"})
        );
        assert!(migrate(&conn).unwrap().is_none());
    }

    #[test]
    fn shared_fixture_preserves_data_and_repeats() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        conn.execute_batch(FIXTURE).unwrap();
        // 历史遗留的孤儿绑定是外键约束外写入的，schema 会打开外键，这里关闭以复现
        conn.execute_batch(
            "PRAGMA foreign_keys=OFF;
             INSERT INTO collaboration_bindings(content_id,content_created_at,server_url,document_id,source_type,source_id,source_title) VALUES
             (20,1,'https://s','d1','document-item',999,'已删节点'),
             (21,1,'https://s','d2','document-item',2,'共享文档'),
             (30,9,'https://s','d3','document-item',888,'孤儿');",
        )
        .unwrap();
        let tx = conn.transaction().unwrap();
        let report = migrate(&tx).unwrap().unwrap();
        assert_eq!(
            report["mapping"],
            json!({"projects":{"1":9,"2":10},"items":{"1":5,"2":6}})
        );
        assert_eq!(report["repairedRelations"], 1);
        tx.commit().unwrap();
        assert!(migrate(&conn).unwrap().is_none());
        assert_eq!(
            rows(
                &conn,
                "SELECT parents,projects FROM project_item WHERE id=6"
            )
            .unwrap()[0],
            json!({"parents":"[5]","projects":"[9,10]"})
        );
        assert_eq!(rows(&conn,"SELECT content_id,ref_count FROM contents JOIN project_item ON contents.id=project_item.content_id WHERE project_item.id=6").unwrap()[0],json!({"content_id":20,"ref_count":3}));
        assert_eq!(
            rows(&conn, "SELECT file_path FROM publish_history").unwrap()[0]["file_path"],
            "/docs/document/1/2.html"
        );
        assert_eq!(
            rows(
                &conn,
                "SELECT content_id,source_type,source_id FROM collaboration_bindings ORDER BY content_id"
            )
            .unwrap(),
            vec![
                json!({"content_id":20,"source_type":"retired-document-item","source_id":999}),
                json!({"content_id":21,"source_type":"project-item","source_id":6})
            ]
        );
        assert_eq!(
            rows(&conn, "SELECT content FROM statistic ORDER BY date")
                .unwrap()
                .iter()
                .map(|row| row["content"].as_str().unwrap().to_string())
                .collect::<Vec<_>>(),
            vec![
                r#"{"count":1,"wordsCount":4}"#.to_string(),
                r#"{"count":3,"wordsCount":10}"#.to_string(),
                r#"{"count":4,"wordsCount":14}"#.to_string(),
                r#"{"count":2.5,"wordsCount":9.5}"#.to_string(),
            ]
        );
    }

    #[test]
    fn broken_reference_rolls_back() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        conn.execute_batch(FIXTURE).unwrap();
        conn.execute_batch(
            "UPDATE publish_selections SET parent_path='{\"mode\":\"partial\",\"nodes\":[999]}'",
        )
        .unwrap();
        {
            let tx = conn.transaction().unwrap();
            assert!(migrate(&tx).is_err());
        }
        assert_eq!(records(&conn, "documents").unwrap().len(), 2);
        assert_eq!(records(&conn, "project").unwrap().len(), 1);
    }

    #[test]
    fn children_cycle_fails_without_partial_write() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        conn.execute_batch(FIXTURE).unwrap();
        // 节点 1 的 children 是 [2]，令 2 反向指向 1 形成环
        conn.execute_batch("UPDATE document_items SET children='[1]' WHERE id=2;")
            .unwrap();
        {
            let tx = conn.transaction().unwrap();
            let err = migrate(&tx).unwrap_err();
            assert!(err.contains("循环"), "unexpected error: {err}");
        }
        assert_eq!(records(&conn, "documents").unwrap().len(), 2);
        assert_eq!(records(&conn, "project").unwrap().len(), 1);
    }

    #[test]
    fn multi_parent_children_rebuild_parents() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        conn.execute_batch(FIXTURE).unwrap();
        // 节点 3 作为第二父：1 -> {2,3}、3 -> 2，节点 2 迁移后的 parents 应同时含两个映射父
        conn.execute_batch(
            "UPDATE document_items SET children='[2,3]' WHERE id=1;
             INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(22,1,2,'[]',0,1);
             INSERT INTO document_items(id,create_time,update_time,title,tags,children,parents,documents,content_id)
              VALUES(3,19,20,'第二父','[]','[2]','[1]','[1]',22);",
        )
        .unwrap();
        let tx = conn.transaction().unwrap();
        migrate(&tx).unwrap();
        tx.commit().unwrap();
        let parents: String = conn
            .query_row("SELECT parents FROM project_item WHERE id=6", [], |r| r.get(0))
            .unwrap();
        assert_eq!(parents, "[5,7]");
    }

    #[test]
    fn operation_history_retires_unmapped_legacy_ids() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        conn.execute_batch(FIXTURE).unwrap();
        conn.execute_batch(
            "INSERT INTO operation(operation_time,operation_id,operation_content_type,operation_action) VALUES
             (1,999,'document-item','create'),
             (2,888,'document','update'),
             (3,2,'document-item','delete');",
        )
        .unwrap();
        let tx = conn.transaction().unwrap();
        migrate(&tx).unwrap();
        tx.commit().unwrap();
        let types: Vec<(String, i64)> = conn
            .prepare("SELECT operation_content_type,COALESCE(operation_id,0) FROM operation ORDER BY operation_time")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            types,
            vec![
                ("retired-document-item".to_string(), 999),
                ("retired-document".to_string(), 888),
                ("project-item".to_string(), 6),
            ]
        );
    }
}
