use rusqlite::{params, OptionalExtension, Transaction};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};

fn fail(message: &str) -> String {
    format!("CONTENT_CONTRACT_INVALID: {message}")
}

pub(super) fn prepare_new(
    content: &Value,
    supplied: Option<&Value>,
) -> Result<(Value, Value), String> {
    let contracts = supplied.ok_or_else(|| fail("新建正文缺少契约"))?.clone();
    dictionary(&contracts)?;
    let mut content = content.clone();
    fn assign_identities(value: &mut Value, depth: usize) -> Result<(), String> {
        if depth > 64 {
            return Err(fail("正文层级过深"));
        }
        let nodes = value
            .as_array_mut()
            .ok_or_else(|| fail("正文必须是节点数组"))?;
        for node in nodes {
            if node.get("children").is_none() && node["text"].is_string() {
                continue;
            }
            node["collabId"] = Value::String(uuid::Uuid::new_v4().to_string());
            assign_identities(
                node.get_mut("children")
                    .ok_or_else(|| fail("节点缺少子节点"))?,
                depth + 1,
            )?;
        }
        Ok(())
    }
    assign_identities(&mut content, 0)?;
    Ok((content, contracts))
}
fn token(value: &Value) -> Result<&str, String> {
    value
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 256 && !s.chars().any(char::is_control))
        .ok_or_else(|| fail("身份字段无效"))
}
fn serialized(value: &Value) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| fail("JSON 数据无效"))
}
fn valid_field(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$')
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '$' | '-'))
        && !matches!(value, "__proto__" | "constructor" | "prototype")
}
fn data(value: &Value, depth: usize, count: &mut usize) -> Result<(), String> {
    *count += 1;
    if depth > 64 || *count > 500_000 {
        return Err(fail("数据结构超过容量"));
    }
    if let Some(values) = value.as_array() {
        for value in values {
            data(value, depth + 1, count)?;
        }
    }
    if let Some(values) = value.as_object() {
        for (key, value) in values {
            if matches!(key.as_str(), "__proto__" | "constructor" | "prototype") {
                return Err(fail("数据属性无效"));
            }
            data(value, depth + 1, count)?;
        }
    }
    Ok(())
}
fn dictionary(value: &Value) -> Result<(), String> {
    let entries = value.as_object().ok_or_else(|| fail("契约必须为字典"))?;
    if entries.len() > 1024 || serialized(value)?.len() > 1024 * 1024 {
        return Err(fail("契约超过容量"));
    }
    let mut versions = HashSet::new();
    for (id, contract) in entries {
        let properties = contract.as_object().ok_or_else(|| fail("节点契约无效"))?;
        if properties.len() != 10
            || properties.keys().any(|key| {
                ![
                    "format",
                    "domain",
                    "owner",
                    "type",
                    "dataVersion",
                    "textFields",
                    "structuredFields",
                    "resources",
                    "kind",
                    "isVoid",
                ]
                .contains(&key.as_str())
            })
            || serialized(contract)?.len() > 16 * 1024
        {
            return Err(fail("契约属性无效"));
        }
        if id != &format!("{:x}", Sha256::digest(serialized(contract)?.as_bytes())) {
            return Err(fail("契约摘要不匹配"));
        }
        if contract["format"] != 2
            || contract["domain"] != "editor-node"
            || !matches!(contract["kind"].as_str(), Some("block" | "inline"))
            || !contract["isVoid"].is_boolean()
            || contract["dataVersion"].as_u64().unwrap_or(0) == 0
        {
            return Err(fail("不支持该节点契约"));
        }
        let owner = token(&contract["owner"])?;
        let kind = token(&contract["type"])?;
        if [owner, kind]
            .iter()
            .any(|value| value.encode_utf16().count() > 128 || value.trim() != *value)
            || contract["dataVersion"].as_u64().unwrap_or(u64::MAX) > 9_007_199_254_740_991
        {
            return Err(fail("契约身份无效"));
        }
        if !versions.insert((owner, kind, contract["dataVersion"].as_u64())) {
            return Err(fail("节点数据版本重复"));
        }
        let fields = contract["textFields"]
            .as_array()
            .ok_or_else(|| fail("文本字段声明无效"))?;
        if fields.len() > 32 || contract["structuredFields"] != serde_json::json!([]) {
            return Err(fail("协作字段声明无效"));
        }
        let mut names = HashSet::new();
        for field in fields {
            let name = token(field)?;
            if name.len() > 128
                || !valid_field(name)
                || matches!(
                    name,
                    "type"
                        | "children"
                        | "text"
                        | "collabId"
                        | "tauContract"
                        | "__proto__"
                        | "constructor"
                        | "prototype"
                )
                || !names.insert(name)
            {
                return Err(fail("文本字段重复或占用结构"));
            }
        }
        let resources = contract["resources"]
            .as_array()
            .ok_or_else(|| fail("资源声明无效"))?;
        if resources.len() > 16 {
            return Err(fail("资源声明超过容量"));
        }
        let mut paths = HashSet::new();
        for resource in resources {
            let properties = resource.as_object().ok_or_else(|| fail("资源声明无效"))?;
            if properties
                .keys()
                .any(|key| !["path", "kind", "preview", "alt", "caption"].contains(&key.as_str()))
                || !matches!(
                    resource["kind"].as_str(),
                    Some("image" | "video" | "audio" | "file")
                )
            {
                return Err(fail("资源声明无效"));
            }
            let path = token(&resource["path"])?;
            let parts: Vec<&str> = path.split('.').collect();
            if path.len() > 128
                || !paths.insert(path)
                || parts.iter().enumerate().any(|(i, part)| {
                    !valid_field(part.strip_suffix("[]").unwrap_or(part))
                        || (i + 1 == parts.len() && part.ends_with("[]"))
                })
            {
                return Err(fail("资源路径无效"));
            }
            for alias in ["preview", "alt", "caption"] {
                if let Some(value) = resource.get(alias) {
                    if !valid_field(token(value)?) {
                        return Err(fail("资源别名无效"));
                    }
                }
            }
            let root = parts[0].strip_suffix("[]").unwrap_or(parts[0]);
            if names.contains(root)
                || matches!(
                    root,
                    "type" | "children" | "text" | "collabId" | "tauContract"
                )
                || (parts.len() == 1
                    && resource["preview"]
                        .as_str()
                        .map(|value| names.contains(value))
                        .unwrap_or(false))
            {
                return Err(fail("资源字段与协作或结构字段重叠"));
            }
        }
    }
    Ok(())
}

type Relation = (String, String, String, String);
fn relations(content: &Value, contracts: &Value) -> Result<Vec<Relation>, String> {
    fn visit(
        node: &Value,
        contracts: &Value,
        ids: &mut HashSet<String>,
        result: &mut Vec<Relation>,
        depth: usize,
        count: &mut usize,
    ) -> Result<(), String> {
        *count += 1;
        if depth > 64 || *count > 150_000 {
            return Err(fail("正文结构超过容量"));
        }
        let object = node.as_object().ok_or_else(|| fail("正文节点无效"))?;
        if object.contains_key("__proto__")
            || object.contains_key("constructor")
            || object.contains_key("prototype")
        {
            return Err(fail("正文属性无效"));
        }
        if node["text"].is_string() && !object.contains_key("children") {
            if depth == 0 {
                return Err(fail("根节点必须为元素"));
            }
            return Ok(());
        }
        let node_id = token(&node["collabId"])?;
        if !ids.insert(node_id.to_owned()) {
            return Err(fail("节点身份重复"));
        }
        let contract = &contracts[token(&node["tauContract"])?];
        if contract.is_null() || contract["type"] != node["type"] {
            return Err(fail("正文缺少对应契约"));
        }
        for field in contract["textFields"]
            .as_array()
            .ok_or_else(|| fail("文本声明无效"))?
        {
            if !node[token(field)?].is_string() {
                return Err(fail("源码必须为字符串"));
            }
        }
        let kind = match (contract["owner"].as_str(), contract["type"].as_str()) {
            (Some("host.database"), Some("database")) => Some("data-table"),
            (Some("host.whiteboard"), Some("whiteboard")) => Some("whiteboard-content"),
            (Some("host.project-card-list"), Some("project-card-list")) => Some("project-item"),
            _ => None,
        };
        if let Some(kind) = kind {
            let reference = &node["entityRef"];
            if reference["kind"] != kind {
                return Err(fail("实体引用类型不匹配"));
            }
            result.push((
                node_id.to_owned(),
                token(&reference["sourceId"])?.to_owned(),
                kind.to_owned(),
                token(&reference["entityId"])?.to_owned(),
            ));
        }
        for child in node["children"]
            .as_array()
            .ok_or_else(|| fail("节点缺少子树"))?
        {
            visit(child, contracts, ids, result, depth + 1, count)?;
        }
        Ok(())
    }
    let mut result = Vec::new();
    let mut ids = HashSet::new();
    let mut count = 0;
    for node in content.as_array().ok_or_else(|| fail("正文必须为数组"))? {
        visit(node, contracts, &mut ids, &mut result, 0, &mut count)?;
    }
    Ok(result)
}

fn table_contents(tx: &Transaction, id: i64, delta: i64, now: i64) -> Result<(), String> {
    let (columns, rows): (String, String) = tx
        .query_row(
            "SELECT columns,rows FROM data_tables WHERE id=?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| fail(&e.to_string()))?;
    let columns: Value = serde_json::from_str(&columns).map_err(|_| fail("数据表字段无效"))?;
    let rows: Value = serde_json::from_str(&rows).map_err(|_| fail("数据表行无效"))?;
    let mut counts = BTreeMap::<i64, i64>::new();
    for row in rows.as_array().ok_or_else(|| fail("数据表行无效"))? {
        if let Some(id) = row["detailContentId"].as_i64().filter(|id| *id > 0) {
            *counts.entry(id).or_default() += delta;
        }
        for column in columns.as_array().ok_or_else(|| fail("数据表字段无效"))? {
            if column["type"] != "rich-text" {
                continue;
            }
            if let Some(values) = row[column["id"]
                .as_str()
                .ok_or_else(|| fail("数据表字段身份无效"))?]
            .as_array()
            {
                for value in values {
                    if let Some(id) = value["contentId"].as_i64().filter(|id| *id > 0) {
                        *counts.entry(id).or_default() += delta;
                    }
                }
            }
        }
    }
    for (id, delta) in counts {
        let changed = tx
            .execute(
                "UPDATE contents SET ref_count=ref_count+?1 WHERE id=?2 AND ref_count+?1>=0",
                params![delta, id],
            )
            .map_err(|e| fail(&e.to_string()))?;
        if changed != 1 {
            return Err(fail("数据表引用的正文已缺失或计数无效"));
        }
        tx.execute("INSERT OR IGNORE INTO content_pending_releases SELECT id,?1 FROM contents WHERE id=?2 AND ref_count<=0", params![now, id]).map_err(|e| fail(&e.to_string()))?;
        tx.execute("DELETE FROM content_pending_releases WHERE content_id=?1 AND EXISTS(SELECT 1 FROM contents WHERE id=?1 AND ref_count>0)", [id]).map_err(|e| fail(&e.to_string()))?;
    }
    Ok(())
}

/// 契约、正文关系和引用差集由调用方的同一主库事务提交。
pub(super) fn write(
    tx: &Transaction,
    content_id: i64,
    content: &Value,
    supplied: Option<&Value>,
    expected: Option<&str>,
    expected_document: Option<&str>,
    expected_source: Option<&str>,
    now: i64,
) -> Result<(), String> {
    let previous: Option<(String, String, String)> = tx
        .query_row(
            "SELECT document_id,contracts,revision FROM content_documents WHERE content_id=?1",
            [content_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| fail(&e.to_string()))?;
    if previous.is_none() && supplied.is_none() {
        return Ok(());
    }
    if let Some((id, _, revision)) = &previous {
        let source: Option<String> = tx
            .query_row(
                "SELECT source_id FROM library_identity WHERE id=1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| fail(&e.to_string()))?;
        if expected_source != source.as_deref() || source.is_none() {
            return Err("CONTENT_SOURCE_CONFLICT: 资料库来源已变化".into());
        }
        if expected_document != Some(id.as_str()) {
            return Err("CONTENT_REVISION_CONFLICT: 正文身份已变化".into());
        }
        if expected != Some(revision.as_str()) {
            let current: String = tx
                .query_row(
                    "SELECT content FROM contents WHERE id=?1",
                    [content_id],
                    |row| row.get(0),
                )
                .map_err(|e| fail(&e.to_string()))?;
            let same_content = serde_json::from_str::<Value>(&current)
                .map_err(|_| fail("原正文损坏"))?
                == *content;
            let old_contracts: Value = serde_json::from_str(&previous.as_ref().unwrap().1)
                .map_err(|_| fail("原契约损坏"))?;
            if same_content && supplied == Some(&old_contracts) {
                return Ok(());
            }
            return Err("CONTENT_REVISION_CONFLICT: 正文修订已变化，请保留输入后重新读取".into());
        }
    }
    let contracts = supplied.ok_or_else(|| fail("带契约正文不能通过旧快照入口覆盖"))?;
    dictionary(contracts)?;
    if let Some((_, old, _)) = &previous {
        let old: Value = serde_json::from_str(old).map_err(|_| fail("原契约损坏"))?;
        for (id, value) in old.as_object().ok_or_else(|| fail("原契约损坏"))? {
            if &contracts[id] != value {
                return Err(fail("普通保存不能删除或修改已有契约"));
            }
        }
    }
    if serialized(content)?.len() > 8 * 1024 * 1024 {
        return Err(fail("正文超过容量"));
    }
    data(content, 0, &mut 0)?;
    let next = relations(content, contracts)?;
    let document_id = previous
        .as_ref()
        .map(|value| value.0.clone())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let mut deltas = BTreeMap::<(String, String, String), i64>::new();
    let mut statement = tx.prepare("SELECT source_id,entity_kind,entity_id FROM content_entity_relations WHERE document_id=?1").map_err(|e| fail(&e.to_string()))?;
    let old = statement
        .query_map([&document_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| fail(&e.to_string()))?;
    for reference in old {
        *deltas
            .entry(reference.map_err(|e| fail(&e.to_string()))?)
            .or_default() -= 1;
    }
    for (_, source, kind, entity) in &next {
        *deltas
            .entry((source.clone(), kind.clone(), entity.clone()))
            .or_default() += 1;
    }
    let mut source: Option<String> = tx
        .query_row(
            "SELECT source_id FROM library_identity WHERE id=1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| fail(&e.to_string()))?;
    if source.is_none() {
        let id = uuid::Uuid::new_v4().to_string();
        tx.execute("INSERT INTO library_identity(id,source_id,baseline_id,create_time) VALUES (1,?1,?2,?3)", params![id, uuid::Uuid::new_v4().to_string(), now]).map_err(|e| fail(&e.to_string()))?;
        for (kind, table) in [
            ("whiteboard-content", "white_board_contents"),
            ("data-table", "data_tables"),
            ("project-item", "project_item"),
            ("card", "cards"),
            ("article", "articles"),
            ("diary-moment", "diary_segments"),
            ("whiteboard", "white_boards"),
            ("content", "contents"),
            ("video-note", "video_notes"),
        ] {
            let mut rows = tx
                .prepare(&format!("SELECT id,create_time FROM {table}"))
                .map_err(|e| fail(&e.to_string()))?;
            let identities = rows
                .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
                .map_err(|e| fail(&e.to_string()))?;
            for identity in identities {
                let (local_id, created_at) = identity.map_err(|e| fail(&e.to_string()))?;
                tx.execute("INSERT INTO entity_identities(entity_kind,entity_id,local_id,created_at) VALUES (?1,?2,?3,?4)", params![kind, uuid::Uuid::new_v4().to_string(), local_id, created_at]).map_err(|e| fail(&e.to_string()))?;
            }
        }
        source = Some(id);
    }
    for ((origin, kind, entity), delta) in deltas {
        if delta == 0 || source.as_ref() != Some(&origin) {
            continue;
        }
        let (table, pending, key) = match kind.as_str() {
            "data-table" => ("data_tables", "data_table_pending_releases", "table_id"),
            "whiteboard-content" => (
                "white_board_contents",
                "white_board_content_pending_releases",
                "content_id",
            ),
            _ => continue,
        };
        let target: Option<(i64, i64)> = tx.query_row(&format!("SELECT e.local_id,coalesce(t.ref_count,0) FROM entity_identities e JOIN {table} t ON t.id=e.local_id AND t.create_time=e.created_at WHERE e.entity_kind=?1 AND e.entity_id=?2 AND e.retired_at IS NULL"), params![kind, entity], |row| Ok((row.get(0)?, row.get(1)?))).optional().map_err(|e| fail(&e.to_string()))?;
        let Some((id, before)) = target else {
            continue;
        };
        let after = before
            .checked_add(delta)
            .filter(|value| *value >= 0)
            .ok_or_else(|| fail("实体引用数无效"))?;
        tx.execute(
            &format!("UPDATE {table} SET ref_count=?1 WHERE id=?2"),
            params![after, id],
        )
        .map_err(|e| fail(&e.to_string()))?;
        if kind == "data-table" && (before == 0) != (after == 0) {
            table_contents(tx, id, if after == 0 { -1 } else { 1 }, now)?;
        }
        if after == 0 {
            tx.execute(
                &format!("INSERT OR IGNORE INTO {pending}({key},released_at) VALUES (?1,?2)"),
                params![id, now],
            )
            .map_err(|e| fail(&e.to_string()))?;
        } else {
            tx.execute(&format!("DELETE FROM {pending} WHERE {key}=?1"), [id])
                .map_err(|e| fail(&e.to_string()))?;
        }
    }
    let content_json = serialized(content)?;
    let contracts_json = serialized(contracts)?;
    let revision = format!(
        "{:x}",
        Sha256::digest(format!("{content_json}\n{contracts_json}").as_bytes())
    );
    tx.execute("INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES (?1,?2,2,?3,?4) ON CONFLICT(content_id) DO UPDATE SET contracts=excluded.contracts,revision=excluded.revision", params![content_id, document_id, contracts_json, revision]).map_err(|e| fail(&e.to_string()))?;
    tx.execute(
        "DELETE FROM content_entity_relations WHERE document_id=?1",
        [&document_id],
    )
    .map_err(|e| fail(&e.to_string()))?;
    for (node, source, kind, entity) in next {
        tx.execute(
            "INSERT INTO content_entity_relations VALUES (?1,?2,'entityRef',?3,?4,?5)",
            params![document_id, node, source, kind, entity],
        )
        .map_err(|e| fail(&e.to_string()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use serde_json::json;

    fn fixture() -> (Connection, Value, Value) {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!(
            "../../../../../packages/db-schema/schema/main.sql"
        ))
        .unwrap();
        db.execute(
            "INSERT INTO library_identity VALUES (1,'library','baseline',NULL,1)",
            [],
        )
        .unwrap();
        db.execute("INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (1,1,1,'[]',0,1)", []).unwrap();
        db.execute("INSERT INTO white_board_contents(id,create_time,update_time,data,ref_count) VALUES (7,1,1,'{}',0)", []).unwrap();
        db.execute("INSERT INTO entity_identities(entity_kind,entity_id,local_id,created_at) VALUES ('whiteboard-content','board',7,1)", []).unwrap();
        let contract = json!({"format":2,"domain":"editor-node","owner":"host.whiteboard","type":"whiteboard","dataVersion":1,"kind":"block","isVoid":true,"textFields":[],"structuredFields":[],"resources":[]});
        let id = format!(
            "{:x}",
            Sha256::digest(serialized(&contract).unwrap().as_bytes())
        );
        let contracts = json!({id.clone(): contract});
        let content = json!([{"type":"whiteboard","collabId":"node","tauContract":id,"entityRef":{"sourceId":"library","kind":"whiteboard-content","entityId":"board"},"children":[{"text":""}]}]);
        (db, content, contracts)
    }

    #[test]
    fn body_contracts_and_relations_commit_together() {
        let (mut db, content, contracts) = fixture();
        let tx = db.transaction().unwrap();
        super::super::write_content_snapshot(
            &tx,
            1,
            &content,
            0,
            1,
            "TEST",
            Some(&contracts),
            None,
            None,
            None,
        )
        .unwrap();
        tx.commit().unwrap();
        let (document, revision): (String, String) = db
            .query_row(
                "SELECT document_id,revision FROM content_documents WHERE content_id=1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            db.query_row(
                "SELECT ref_count FROM white_board_contents WHERE id=7",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        let tx = db.transaction().unwrap();
        super::super::write_content_snapshot(
            &tx,
            1,
            &json!([]),
            0,
            2,
            "TEST",
            Some(&contracts),
            Some(&revision),
            Some(&document),
            Some("library"),
        )
        .unwrap();
        tx.commit().unwrap();
        assert_eq!(
            db.query_row(
                "SELECT ref_count FROM white_board_contents WHERE id=7",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        assert_eq!(
            db.query_row(
                "SELECT count(*) FROM white_board_content_pending_releases WHERE content_id=7",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
    }

    #[test]
    fn native_creation_preserves_supplied_versions_and_rejects_missing_contracts_atomically() {
        let (mut db, content, contracts) = fixture();
        let tx = db.transaction().unwrap();
        let copy =
            super::super::common::insert_content_record(&tx, &content, Some(&contracts), 0, 10)
                .unwrap();
        let stored: String = tx
            .query_row("SELECT content FROM contents WHERE id=?1", [copy], |row| {
                row.get(0)
            })
            .unwrap();
        let stored: Value = serde_json::from_str(&stored).unwrap();
        assert_eq!(stored[0]["tauContract"], content[0]["tauContract"]);
        assert_ne!(stored[0]["collabId"], content[0]["collabId"]);
        assert_eq!(tx.query_row("SELECT count(*) FROM content_entity_relations WHERE document_id=(SELECT document_id FROM content_documents WHERE content_id=?1)",[copy],|row|row.get::<_,i64>(0)).unwrap(),1);
        tx.commit().unwrap();
        let before: i64 = db
            .query_row("SELECT count(*) FROM contents", [], |row| row.get(0))
            .unwrap();
        let tx = db.transaction().unwrap();
        assert!(super::super::common::insert_content_record(
            &tx,
            &json!([{"type":"paragraph","children":[{"text":"未声明"}]}]),
            None,
            0,
            11
        )
        .is_err());
        assert!(super::super::common::insert_content_record(
            &tx,
            &json!([{"type":"unknown","children":[]}]),
            None,
            0,
            11
        )
        .is_err());
        assert!(super::super::common::insert_content_record(
            &tx,
            &json!([{"type":"paragraph","children":[{"text":"未声明"}]}]),
            Some(&json!({})),
            0,
            11
        )
        .is_err());
        drop(tx);
        assert_eq!(
            db.query_row("SELECT count(*) FROM contents", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            before
        );
    }

    #[test]
    fn stale_or_unversioned_writes_cannot_overwrite_a_contract_document() {
        let (mut db, content, contracts) = fixture();
        let tx = db.transaction().unwrap();
        super::super::write_content_snapshot(
            &tx,
            1,
            &content,
            0,
            1,
            "TEST",
            Some(&contracts),
            None,
            None,
            None,
        )
        .unwrap();
        tx.commit().unwrap();
        let before: String = db
            .query_row("SELECT content FROM contents WHERE id=1", [], |row| {
                row.get(0)
            })
            .unwrap();
        {
            let tx = db.transaction().unwrap();
            assert!(super::super::write_content_snapshot(
                &tx,
                1,
                &json!([]),
                0,
                2,
                "TEST",
                None,
                None,
                None,
                None
            )
            .unwrap_err()
            .contains("CONFLICT"));
        }
        assert_eq!(
            db.query_row("SELECT content FROM contents WHERE id=1", [], |row| row
                .get::<_, String>(
                0
            ))
            .unwrap(),
            before
        );
        assert_eq!(
            db.query_row(
                "SELECT ref_count FROM white_board_contents WHERE id=7",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
    }

    #[test]
    fn malformed_contract_does_not_create_metadata_or_relations() {
        let (mut db, content, mut contracts) = fixture();
        contracts
            .as_object_mut()
            .unwrap()
            .values_mut()
            .next()
            .unwrap()["dataVersion"] = json!(2);
        let tx = db.transaction().unwrap();
        assert!(super::super::write_content_snapshot(
            &tx,
            1,
            &content,
            0,
            1,
            "TEST",
            Some(&contracts),
            None,
            None,
            None
        )
        .unwrap_err()
        .contains("摘要"));
        drop(tx);
        assert_eq!(
            db.query_row("SELECT count(*) FROM content_documents", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            db.query_row(
                "SELECT ref_count FROM white_board_contents WHERE id=7",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }
}
