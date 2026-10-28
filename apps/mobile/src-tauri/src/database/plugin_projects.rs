use super::common::{
    insert_content_record, now_millis, release_content_reference, write_operation,
};
use super::plugin_data::{get, insert_snapshot, row_snapshot, sql_error, string, table};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap, HashSet};

const MAX_TREE_NODES: usize = 5000;
const MAX_TREE_DEPTH: usize = 256;

pub(super) fn id(value: &Value, key: &str) -> Result<i64, String> {
    let id = string(value, key)?
        .parse::<i64>()
        .map_err(|_| "内容身份无效")?;
    if id <= 0 || id > 9_007_199_254_740_991 {
        return Err("内容身份无效".into());
    }
    Ok(id)
}
fn optional_id(value: &Value, key: &str) -> Result<Option<i64>, String> {
    if value.get(key).is_none_or(Value::is_null) {
        Ok(None)
    } else {
        id(value, key).map(Some)
    }
}
fn ids(row: &Value, key: &str) -> Result<Vec<i64>, String> {
    let raw = row
        .get(key)
        .filter(|value| !value.is_null())
        .and_then(Value::as_str)
        .unwrap_or("[]");
    let values: Vec<i64> = serde_json::from_str(raw).map_err(|_| "项目目录结构损坏")?;
    if values.iter().any(|id| *id <= 0)
        || values.iter().copied().collect::<HashSet<_>>().len() != values.len()
    {
        return Err("项目目录身份无效或重复".into());
    }
    Ok(values)
}
fn load(conn: &Connection, table: &str, id: i64) -> Result<Option<Value>, String> {
    let exists = conn
        .query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1)"),
            [id],
            |row| row.get::<_, bool>(0),
        )
        .map_err(sql_error)?;
    if exists {
        row_snapshot(conn, table, id).map(Some)
    } else {
        Ok(None)
    }
}
fn item(conn: &Connection, id: i64) -> Result<Value, String> {
    load(conn, "project_item", id)?.ok_or_else(|| "项目文档不存在".into())
}
fn project(conn: &Connection, id: i64) -> Result<Value, String> {
    load(conn, "project", id)?.ok_or_else(|| "项目不存在".into())
}
fn revision(row: &Value, expected: &str) -> Result<(), String> {
    if row["update_time"]
        .as_i64()
        .map(|value| value.to_string())
        .as_deref()
        != Some(expected)
    {
        return Err("PLUGIN_CONFLICT: 内容已变化，请重新读取".into());
    }
    Ok(())
}
fn descendants(conn: &Connection, roots: &[i64]) -> Result<Vec<i64>, String> {
    let mut pending = roots.to_vec();
    let mut seen = HashSet::new();
    let mut result = vec![];
    while let Some(id) = pending.pop() {
        if !seen.insert(id) {
            continue;
        }
        if seen.len() > MAX_TREE_NODES {
            return Err("项目目录超过单次操作预算".into());
        }
        if let Some(row) = load(conn, "project_item", id)? {
            pending.extend(ids(&row, "children")?);
            result.push(id);
        }
    }
    Ok(result)
}
fn assert_in_project(conn: &Connection, project_id: i64, item_id: i64) -> Result<(), String> {
    let roots = ids(&project(conn, project_id)?, "children")?;
    if !descendants(conn, &roots)?.contains(&item_id) {
        return Err("父文档不在该项目中".into());
    }
    Ok(())
}
fn containers(conn: &Connection, table: &str, id: i64) -> Result<Vec<i64>, String> {
    let mut statement=conn.prepare(&format!("SELECT id FROM {table} WHERE EXISTS(SELECT 1 FROM json_each(COALESCE(children,'[]')) WHERE value=?1) ORDER BY id")).map_err(sql_error)?;
    let values = statement
        .query_map([id], |row| row.get(0))
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    Ok(values)
}
fn project_memberships(
    conn: &Connection,
    id: i64,
    path: &mut HashSet<i64>,
    cache: &mut HashMap<i64, BTreeSet<i64>>,
) -> Result<BTreeSet<i64>, String> {
    if let Some(found) = cache.get(&id) {
        return Ok(found.clone());
    }
    if path.len() >= MAX_TREE_DEPTH || !path.insert(id) {
        return Err("项目目录存在环或层级过深".into());
    }
    if cache.len() >= MAX_TREE_NODES {
        return Err("项目归属超过单次操作预算".into());
    }
    let row = item(conn, id)?;
    let mut projects = containers(conn, "project", id)?
        .into_iter()
        .collect::<BTreeSet<_>>();
    for parent in ids(&row, "parents")? {
        if let Some(row) = load(conn, "project_item", parent)? {
            if ids(&row, "children")?.contains(&id) {
                projects.extend(project_memberships(conn, parent, path, cache)?);
            }
        }
    }
    path.remove(&id);
    cache.insert(id, projects.clone());
    Ok(projects)
}
fn projects_for(conn: &Connection, id: i64) -> Result<BTreeSet<i64>, String> {
    project_memberships(conn, id, &mut HashSet::new(), &mut HashMap::new())
}
fn touch_projects(conn: &Connection, projects: &BTreeSet<i64>) -> Result<(), String> {
    super::project::touch_projects(conn, projects)
}
fn set_children(conn: &Connection, table: &str, id: i64, children: &[i64]) -> Result<(), String> {
    conn.execute(
        &format!("UPDATE {table} SET children=?1,update_time=MAX(update_time+1,?2) WHERE id=?3"),
        params![json!(children).to_string(), now_millis(), id],
    )
    .map_err(sql_error)?;
    write_operation(
        conn,
        if table == "project" {
            "project"
        } else {
            "project-item"
        },
        "update",
        id,
        now_millis(),
    )
}
fn children_of(
    conn: &Connection,
    project_id: i64,
    parent: Option<i64>,
) -> Result<Vec<i64>, String> {
    match parent {
        Some(id) => {
            assert_in_project(conn, project_id, id)?;
            ids(&item(conn, id)?, "children")
        }
        None => ids(&project(conn, project_id)?, "children"),
    }
}
fn set_at(
    conn: &Connection,
    project_id: i64,
    parent: Option<i64>,
    children: &[i64],
) -> Result<(), String> {
    set_children(
        conn,
        if parent.is_some() {
            "project_item"
        } else {
            "project"
        },
        parent.unwrap_or(project_id),
        children,
    )
}
fn refresh_memberships(conn: &Connection, root: i64) -> Result<BTreeSet<i64>, String> {
    let mut touched = BTreeSet::new();
    let mut cache = HashMap::new();
    for id in descendants(conn, &[root])? {
        let row = item(conn, id)?;
        touched.extend(ids(&row, "projects")?);
        let projects = project_memberships(conn, id, &mut HashSet::new(), &mut cache)?;
        touched.extend(&projects);
        let next = projects.into_iter().collect::<Vec<_>>();
        if ids(&row, "projects")? != next {
            conn.execute(
                "UPDATE project_item SET projects=?1,update_time=MAX(update_time+1,?2) WHERE id=?3",
                params![json!(next).to_string(), now_millis(), id],
            )
            .map_err(sql_error)?;
            write_operation(conn, "project-item", "update", id, now_millis())?;
        }
    }
    Ok(touched)
}

pub(super) fn tree(conn: &Connection, project_id: i64) -> Result<Value, String> {
    let Some(project) = load(conn, "project", project_id)? else {
        return Ok(Value::Null);
    };
    fn build(
        conn: &Connection,
        values: Vec<i64>,
        path: &mut HashSet<i64>,
        budget: &mut usize,
        cache: &mut HashMap<i64, Option<Value>>,
    ) -> Result<Vec<Value>, String> {
        if path.len() > MAX_TREE_DEPTH {
            return Err("项目目录层级过深".into());
        }
        let mut result = vec![];
        for id in values {
            if !path.insert(id) {
                return Err("项目目录存在环".into());
            }
            if *budget == 0 {
                return Err("项目目录超过单次读取预算".into());
            }
            *budget -= 1;
            if !cache.contains_key(&id) {
                cache.insert(id, load(conn, "project_item", id)?);
            }
            if let Some(row) = cache[&id].clone() {
                let mut node = json!({"documentId":id.to_string(),"revision":row["update_time"].as_i64().ok_or("目录版本无效")?.to_string(),"title":row["title"],"kind":row["project_item_type"].as_str().unwrap_or("document"),"children":build(conn,ids(&row,"children")?,path,budget,cache)?});
                if matches!(row["ref_type"].as_str(), Some("card" | "article")) {
                    if let Some(reference) = row["ref_id"].as_i64().filter(|id| *id > 0) {
                        node["ref"] = json!({"kind":row["ref_type"],"id":reference.to_string()});
                    }
                }
                result.push(node);
            }
            path.remove(&id);
        }
        Ok(result)
    }
    let mut budget = MAX_TREE_NODES;
    Ok(json!(build(
        conn,
        ids(&project, "children")?,
        &mut HashSet::new(),
        &mut budget,
        &mut HashMap::new()
    )?))
}
fn grant(
    conn: &Connection,
    plugin_id: &str,
    entity: &str,
    id: i64,
    created: i64,
) -> Result<(), String> {
    conn.execute("INSERT OR REPLACE INTO plugin_ref_grants(plugin_id,kind,ref_id,target_created_at,create_time) VALUES(?1,?2,?3,?4,?4)",params![plugin_id,entity,id.to_string(),created]).map_err(sql_error)?;
    Ok(())
}
fn next_document_id(conn: &Connection) -> Result<i64, String> {
    let key = "plugin:project-item-id-seq";
    let id:i64=conn.query_row("SELECT MAX(COALESCE((SELECT MAX(id) FROM project_item),0),COALESCE((SELECT MAX(CAST(entity_id AS INTEGER)) FROM plugin_operations WHERE entity='document'),0),COALESCE((SELECT CAST(value AS INTEGER) FROM migration_meta WHERE key=?1),0))+1",[key],|row|row.get(0)).map_err(sql_error)?;
    if id > 9_007_199_254_740_991 {
        return Err("项目文档 ID 超出安全范围".into());
    }
    conn.execute("INSERT INTO migration_meta(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,id.to_string()]).map_err(sql_error)?;
    Ok(id)
}
fn create_document(
    tx: &rusqlite::Transaction<'_>,
    plugin_id: &str,
    request: &Value,
) -> Result<Value, String> {
    let conn: &Connection = tx;
    let input = &request["input"];
    let project_id = id(input, "projectId")?;
    project(conn, project_id)?;
    let parent = optional_id(input, "parentId")?;
    let mut siblings = children_of(conn, project_id, parent)?;
    let content = &request["content"];
    let count = content["count"]
        .as_i64()
        .filter(|count| *count >= 0)
        .ok_or("正文字数无效")?;
    let now = now_millis();
    let content_id =
        insert_content_record(tx, &content["nodes"], content.get("contracts"), count, now)?;
    let document_id = next_document_id(conn)?;
    let parents = parent.into_iter().collect::<Vec<_>>();
    conn.execute("INSERT INTO project_item(id,title,tags,children,parents,projects,project_item_type,ref_type,ref_id,content_id,create_time,update_time) VALUES(?1,?2,?3,'[]',?4,'[]','document','',0,?5,?6,?6)",params![document_id,string(input,"title")?,input.get("tags").unwrap_or(&json!([])).to_string(),json!(parents).to_string(),content_id,now]).map_err(sql_error)?;
    siblings.push(document_id);
    set_at(conn, project_id, parent, &siblings)?;
    let mut projects = refresh_memberships(conn, document_id)?;
    projects.insert(project_id);
    touch_projects(conn, &projects)?;
    write_operation(conn, "project-item", "insert", document_id, now)?;
    grant(conn, plugin_id, "document", document_id, now)?;
    get(conn, "document", document_id)?.ok_or_else(|| "新建文档读取失败".into())
}
fn move_document(conn: &Connection, request: &Value) -> Result<Value, String> {
    let document_id = id(request, "id")?;
    let row = item(conn, document_id)?;
    revision(&row, string(request, "expectedRevision")?)?;
    let movement = &request["move"];
    let project_id = id(movement, "projectId")?;
    let from = optional_id(movement, "from")?;
    let to = optional_id(movement, "to")?;
    let mut source = children_of(conn, project_id, from)?;
    if !source.contains(&document_id) {
        return Err("文档不在 from 指定的位置".into());
    }
    let mut target = children_of(conn, project_id, to)?;
    if let Some(target) = to {
        if descendants(conn, &[document_id])?.contains(&target) {
            return Err("不能移到子文档下".into());
        }
    }
    if from != to && target.contains(&document_id) {
        return Err("目标位置已经包含此文档".into());
    }
    let mut projects = projects_for(conn, document_id)?;
    source.retain(|id| *id != document_id);
    if from == to {
        target = source.clone();
    }
    let index = match movement.get("index") {
        None => target.len(),
        Some(value) => value
            .as_u64()
            .and_then(|value| usize::try_from(value).ok())
            .ok_or("移动序号无效")?
            .min(target.len()),
    };
    target.insert(index, document_id);
    if from != to {
        set_at(conn, project_id, from, &source)?;
    }
    set_at(conn, project_id, to, &target)?;
    let mut parents = ids(&row, "parents")?;
    if let Some(from) = from {
        parents.retain(|id| *id != from);
    }
    if let Some(to) = to {
        if !parents.contains(&to) {
            parents.push(to);
        }
    }
    conn.execute(
        "UPDATE project_item SET parents=?1,update_time=MAX(update_time+1,?2) WHERE id=?3",
        params![json!(parents).to_string(), now_millis(), document_id],
    )
    .map_err(sql_error)?;
    projects.extend(refresh_memberships(conn, document_id)?);
    projects.insert(project_id);
    touch_projects(conn, &projects)?;
    write_operation(conn, "project-item", "update", document_id, now_millis())?;
    Ok(
        json!({"revision":item(conn,document_id)?["update_time"].as_i64().ok_or("文档版本无效")?.to_string()}),
    )
}
fn placements(conn: &Connection, id: i64) -> Result<Vec<Value>, String> {
    let mut result = vec![];
    for table in ["project", "project_item"] {
        for container_id in containers(conn, table, id)? {
            let row = load(conn, table, container_id)?.ok_or("原位置不存在")?;
            let index = ids(&row, "children")?
                .iter()
                .position(|child| *child == id)
                .ok_or("原位置不存在")?;
            result.push(if table=="project" {json!({"projectId":container_id,"parentId":null,"index":index,"createdAt":row["create_time"]})} else {json!({"projectId":null,"parentId":container_id,"index":index,"createdAt":row["create_time"]})});
        }
    }
    Ok(result)
}
fn remove(
    conn: &Connection,
    entity: &str,
    plugin_id: &str,
    id: i64,
    row: &Value,
) -> Result<(), String> {
    if !ids(row, "children")?.is_empty() {
        return Err(if entity == "project" {
            "项目里还有文档，不能删除"
        } else {
            "有子文档时不能删除"
        }
        .into());
    }
    if entity == "document" && row["project_item_type"] == "video-note" {
        return Err("视频笔记不能由插件删除".into());
    }
    let mut payload = json!({"row":row});
    let mut touched = BTreeSet::new();
    if entity == "document" {
        touched.extend(projects_for(conn, id)?);
        let positions = placements(conn, id)?;
        for position in &positions {
            let parent = position["parentId"].as_i64();
            let container = parent
                .or(position["projectId"].as_i64())
                .ok_or("目录位置无效")?;
            let table = if parent.is_some() {
                "project_item"
            } else {
                "project"
            };
            let mut children = ids(
                &load(conn, table, container)?.ok_or("原位置不存在")?,
                "children",
            )?;
            children.retain(|child| *child != id);
            set_children(conn, table, container, &children)?;
        }
        payload["placements"] = json!(positions);
        if let Some(content) = row["content_id"].as_i64().filter(|id| *id > 0) {
            super::collaboration::assert_content_local(conn, content)?;
            payload["contentCreatedAt"] = json!(conn
                .query_row(
                    "SELECT create_time FROM contents WHERE id=?1",
                    [content],
                    |row| row.get::<_, i64>(0)
                )
                .map_err(sql_error)?);
            release_content_reference(conn, content)?;
        }
        if let Some(page) = row["white_board_content_id"].as_i64().filter(|id| *id > 0) {
            payload["pageCreatedAt"] = json!(conn
                .query_row(
                    "SELECT create_time FROM white_board_contents WHERE id=?1",
                    [page],
                    |row| row.get::<_, i64>(0)
                )
                .map_err(sql_error)?);
            if conn.execute("UPDATE white_board_contents SET ref_count=ref_count-1 WHERE id=?1 AND ref_count>0",[page]).map_err(sql_error)?==0{return Err("白板页引用无效".into());}
            conn.execute("INSERT OR IGNORE INTO white_board_content_pending_releases(content_id,released_at) SELECT id,?2 FROM white_board_contents WHERE id=?1 AND ref_count=0",params![page,now_millis()]).map_err(sql_error)?;
        }
    }
    conn.execute(&format!("DELETE FROM {} WHERE id=?1", table(entity)?), [id])
        .map_err(sql_error)?;
    write_operation(
        conn,
        if entity == "document" {
            "project-item"
        } else {
            "project"
        },
        "delete",
        id,
        now_millis(),
    )?;
    conn.execute("INSERT INTO plugin_operations(plugin_id,action,entity,entity_id,title,payload,create_time) VALUES(?1,'delete',?2,?3,?4,?5,?6)",params![plugin_id,entity,id.to_string(),row["title"].as_str().unwrap_or(""),payload.to_string(),now_millis()]).map_err(sql_error)?;
    touch_projects(conn, &touched)
}
pub(super) fn change(
    conn: &mut Connection,
    plugin_id: &str,
    request: &Value,
) -> Result<Value, String> {
    let entity = string(request, "entity")?;
    let method = string(request, "method")?;
    let tx = conn.transaction().map_err(sql_error)?;
    let result = match (entity, method) {
        ("project", "create") => {
            let id = super::project::next_project_id(&tx)?;
            let now = now_millis();
            tx.execute("INSERT INTO project(id,title,desc,children,archived,pinned,create_time,update_time) VALUES(?1,?2,'[]','[]',0,0,?3,?3)",params![id,string(&request["input"],"title")?,now]).map_err(sql_error)?;
            write_operation(&tx, "project", "insert", id, now)?;
            grant(&tx, plugin_id, "project", id, now)?;
            get(&tx, "project", id)?.ok_or("项目读取失败")?
        }
        ("document", "create") => create_document(&tx, plugin_id, request)?,
        ("document", "move") => move_document(&tx, request)?,
        (_, "update" | "delete") => {
            let id = id(request, "id")?;
            let row = load(&tx, table(entity)?, id)?.ok_or("内容不存在")?;
            if entity == "document" && !row["ref_type"].as_str().unwrap_or("").is_empty() {
                return Err("引用项请通过原对象接口操作".into());
            }
            revision(&row, string(request, "expectedRevision")?)?;
            if method == "delete" {
                remove(&tx, entity, plugin_id, id, &row)?;
                Value::Null
            } else {
                let patch = &request["patch"];
                let title = patch["title"]
                    .as_str()
                    .unwrap_or(row["title"].as_str().unwrap_or(""));
                if entity == "project" {
                    tx.execute("UPDATE project SET title=?1,pinned=?2,archived=?3,update_time=MAX(update_time+1,?4) WHERE id=?5",params![title,patch["pinned"].as_bool().unwrap_or(row["pinned"].as_i64()==Some(1)),patch["archived"].as_bool().unwrap_or(row["archived"].as_i64()==Some(1)),now_millis(),id]).map_err(sql_error)?;
                } else {
                    let tags = patch
                        .get("tags")
                        .map(Value::to_string)
                        .unwrap_or(row["tags"].as_str().unwrap_or("[]").to_owned());
                    tx.execute("UPDATE project_item SET title=?1,tags=?2,update_time=MAX(update_time+1,?3) WHERE id=?4",params![title,tags,now_millis(),id]).map_err(sql_error)?;
                }
                write_operation(
                    &tx,
                    if entity == "project" {
                        "project"
                    } else {
                        "project-item"
                    },
                    "update",
                    id,
                    now_millis(),
                )?;
                get(&tx, entity, id)?.ok_or("内容读取失败")?
            }
        }
        _ => return Err("不支持的项目操作".into()),
    };
    tx.commit().map_err(sql_error)?;
    Ok(result)
}

pub(super) fn restore(conn: &Connection, entity: &str, payload: &Value) -> Result<i64, String> {
    let mut row = payload["row"].clone();
    let id = row["id"].as_i64().ok_or("恢复快照无效")?;
    if entity == "project" {
        if !ids(&row, "children")?.is_empty() {
            return Err("不能恢复包含子项的项目快照".into());
        }
        if conn.query_row("SELECT EXISTS(SELECT 1 FROM database_item WHERE id=?1 UNION ALL SELECT 1 FROM vibe_learning_project WHERE id=?1)",[id],|row|row.get::<_,bool>(0)).map_err(sql_error)?{return Err("项目编号已被其他模块占用".into());}
        let id = insert_snapshot(conn, "project", &row)?;
        write_operation(conn, "project", "insert", id, now_millis())?;
        return Ok(id);
    }
    let positions = payload["placements"]
        .as_array()
        .ok_or("恢复快照缺少原位置")?;
    let mut live = vec![];
    let mut parents = vec![];
    let mut touched = BTreeSet::new();
    for position in positions {
        let parent = position["parentId"].as_i64();
        let Some(container) = parent.or(position["projectId"].as_i64()) else {
            continue;
        };
        let table = if parent.is_some() {
            "project_item"
        } else {
            "project"
        };
        if let Some(target) = load(conn, table, container)? {
            if position
                .get("createdAt")
                .is_some_and(|created| created != &target["create_time"])
            {
                continue;
            }
            let projects = if parent.is_some() {
                projects_for(conn, container)?
            } else {
                BTreeSet::from([container])
            };
            if projects.is_empty() {
                continue;
            }
            touched.extend(projects);
            if parent.is_some() {
                parents.push(container);
            }
            live.push((
                table,
                container,
                position["index"].as_u64().unwrap_or(0) as usize,
            ));
        }
    }
    if live.is_empty() {
        return Err("原来的位置都已不存在，无法恢复".into());
    }
    if !ids(&row, "children")?.is_empty() {
        return Err("不能恢复包含子文档的快照".into());
    }
    if let Some(content) = row["content_id"].as_i64().filter(|id| *id > 0) {
        let expected = payload["contentCreatedAt"]
            .as_i64()
            .ok_or("恢复快照缺少正文身份")?;
        if conn
            .execute(
                "UPDATE contents SET ref_count=ref_count+1 WHERE id=?1 AND create_time=?2",
                params![content, expected],
            )
            .map_err(sql_error)?
            == 0
        {
            return Err("原正文已清理，无法恢复".into());
        }
        conn.execute(
            "DELETE FROM content_pending_releases WHERE content_id=?1",
            [content],
        )
        .map_err(sql_error)?;
        write_operation(conn, "content", "update", content, now_millis())?;
    }
    if let Some(page) = row["white_board_content_id"].as_i64().filter(|id| *id > 0) {
        let created: Option<i64> = conn
            .query_row(
                "SELECT create_time FROM white_board_contents WHERE id=?1",
                [page],
                |row| row.get(0),
            )
            .optional()
            .map_err(sql_error)?;
        if created.is_none()
            || payload
                .get("pageCreatedAt")
                .is_some_and(|value| value.as_i64() != created)
        {
            return Err("原白板页已清理，无法恢复".into());
        }
        conn.execute(
            "UPDATE white_board_contents SET ref_count=ref_count+1 WHERE id=?1",
            [page],
        )
        .map_err(sql_error)?;
        conn.execute(
            "DELETE FROM white_board_content_pending_releases WHERE content_id=?1",
            [page],
        )
        .map_err(sql_error)?;
    }
    row["parents"] = json!(json!(parents).to_string());
    row["projects"] = json!(json!(touched.iter().collect::<Vec<_>>()).to_string());
    let id = insert_snapshot(conn, "project_item", &row)?;
    for (table, container, index) in live {
        let mut children = ids(
            &load(conn, table, container)?.ok_or("原位置不存在")?,
            "children",
        )?;
        children.retain(|child| *child != id);
        children.insert(index.min(children.len()), id);
        set_children(conn, table, container, &children)?;
    }
    touch_projects(conn, &touched)?;
    write_operation(conn, "project-item", "insert", id, now_millis())?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&db).unwrap();
        db
    }
    fn create_project(db: &mut Connection, title: &str) -> i64 {
        change(
            db,
            "fixture",
            &json!({"entity":"project","method":"create","input":{"title":title}}),
        )
        .unwrap()["id"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap()
    }
    fn create_document(
        db: &mut Connection,
        project_id: i64,
        parent: Option<i64>,
        title: &str,
    ) -> i64 {
        let contract = json!({"format":2,"domain":"editor-node","owner":"host.paragraph","type":"paragraph","dataVersion":1,"kind":"block","isVoid":false,"textFields":[],"structuredFields":[],"resources":[]});
        let digest = format!("{:x}", Sha256::digest(contract.to_string().as_bytes()));
        let request = json!({"entity":"document","method":"create","input":{"projectId":project_id.to_string(),"parentId":parent.map(|id|id.to_string()),"title":title,"tags":["学习/项目"]},"content":{"nodes":[{"type":"paragraph","tauContract":digest,"children":[{"type":"formatted","text":"正文"}]}],"contracts":{digest:contract},"count":2}});
        change(db, "fixture", &request).unwrap()["id"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap()
    }
    fn command(db: &Connection, entity: &str, id: i64, method: &str) -> Value {
        json!({"entity":entity,"method":method,"id":id.to_string(),"expectedRevision":load(db,table(entity).unwrap(),id).unwrap().unwrap()["update_time"].as_i64().unwrap().to_string()})
    }
    fn movement(
        db: &Connection,
        id: i64,
        project: i64,
        from: Option<i64>,
        to: Option<i64>,
        index: usize,
    ) -> Value {
        let mut request = command(db, "document", id, "move");
        request["move"] = json!({"projectId":project.to_string(),"from":from.map(|id|id.to_string()),"to":to.map(|id|id.to_string()),"index":index});
        request
    }
    fn delete(db: &mut Connection, entity: &str, id: i64) -> i64 {
        let request = command(db, entity, id, "delete");
        change(db, "fixture", &request).unwrap();
        db.query_row("SELECT MAX(id) FROM plugin_operations", [], |row| {
            row.get(0)
        })
        .unwrap()
    }
    fn restore(db: &mut Connection, operation: i64) -> Result<Value, String> {
        super::super::plugin_data::restore(db, "fixture", operation)
    }

    #[test]
    fn project_crud_uses_global_ids_and_stale_revision_is_rejected() {
        let mut db = database();
        db.execute(
            "INSERT INTO migration_meta(key,value) VALUES('project:id-seq','100')",
            [],
        )
        .unwrap();
        let project = create_project(&mut db, "项目");
        assert_eq!(project, 101);
        let value = get(&db, "project", project).unwrap().unwrap();
        assert_eq!(value["documentCount"], 0);
        assert!(value.get("contentRef").is_none());
        let mut request = command(&db, "project", project, "update");
        request["patch"] = json!({"title":"新标题","pinned":true,"archived":true});
        let updated = change(&mut db, "fixture", &request).unwrap();
        assert_eq!(updated["title"], "新标题");
        assert_eq!(updated["archived"], true);
        assert!(change(&mut db, "fixture", &request)
            .unwrap_err()
            .starts_with("PLUGIN_CONFLICT:"));
        let operation = delete(&mut db, "project", project);
        assert!(get(&db, "project", project).unwrap().is_none());
        restore(&mut db, operation).unwrap();
        assert_eq!(
            get(&db, "project", project).unwrap().unwrap()["pinned"],
            true
        );
    }
    #[test]
    fn document_creation_updates_tree_body_grants_and_project_revision() {
        let mut db = database();
        let project = create_project(&mut db, "项目");
        let before = get(&db, "project", project).unwrap().unwrap()["revision"].clone();
        let parent = create_document(&mut db, project, None, "父文档");
        let child = create_document(&mut db, project, Some(parent), "子文档");
        let document = get(&db, "document", child).unwrap().unwrap();
        assert_eq!(document["projectIds"], json!([project.to_string()]));
        assert_eq!(document["tags"], json!(["学习/项目"]));
        assert_ne!(
            get(&db, "project", project).unwrap().unwrap()["revision"],
            before
        );
        assert_eq!(
            get(&db, "project", project).unwrap().unwrap()["documentCount"],
            1
        );
        let tree = tree(&db, project).unwrap();
        assert_eq!(tree[0]["children"][0]["documentId"], child.to_string());
        let content = item(&db, child).unwrap()["content_id"].as_i64().unwrap();
        assert!(document["contentRef"]
            .as_str()
            .unwrap()
            .starts_with(&format!("{content}:")));
        assert_eq!(db.query_row("SELECT COUNT(*) FROM plugin_ref_grants WHERE plugin_id='fixture' AND kind='document'",[],|row|row.get::<_,i64>(0)).unwrap(),2);
    }
    #[test]
    fn move_uses_post_move_index_and_prevents_cycles_and_cross_project_targets() {
        let mut db = database();
        let project = create_project(&mut db, "项目");
        let other = create_project(&mut db, "其他");
        let a = create_document(&mut db, project, None, "甲");
        let b = create_document(&mut db, project, None, "乙");
        let c = create_document(&mut db, project, None, "丙");
        let outside = create_document(&mut db, other, None, "外部");
        let request = movement(&db, a, project, None, None, 2);
        change(&mut db, "fixture", &request).unwrap();
        assert_eq!(
            ids(&super::project(&db, project).unwrap(), "children").unwrap(),
            vec![b, c, a]
        );
        assert!(change(&mut db, "fixture", &request)
            .unwrap_err()
            .starts_with("PLUGIN_CONFLICT:"));
        let request = movement(&db, a, project, None, Some(b), 0);
        change(&mut db, "fixture", &request).unwrap();
        let cycle = movement(&db, b, project, None, Some(a), 0);
        assert!(change(&mut db, "fixture", &cycle).is_err());
        let cross = movement(&db, a, project, Some(b), Some(outside), 0);
        assert!(change(&mut db, "fixture", &cross).is_err());
        assert_eq!(ids(&item(&db, b).unwrap(), "children").unwrap(), vec![a]);
    }
    #[test]
    fn moving_shared_parent_edge_updates_descendant_memberships_and_other_project_revision() {
        let mut db = database();
        let a = create_project(&mut db, "甲");
        let b = create_project(&mut db, "乙");
        let parent = create_document(&mut db, a, None, "共有父文档");
        set_children(&db, "project", b, &[parent]).unwrap();
        refresh_memberships(&db, parent).unwrap();
        let child = create_document(&mut db, a, Some(parent), "子文档");
        let grandchild = create_document(&mut db, a, Some(child), "孙文档");
        assert_eq!(
            ids(&item(&db, child).unwrap(), "projects").unwrap(),
            vec![a, b]
        );
        let old_b = get(&db, "project", b).unwrap().unwrap()["revision"].clone();
        let request = movement(&db, child, a, Some(parent), None, 1);
        change(&mut db, "fixture", &request).unwrap();
        assert_eq!(
            ids(&item(&db, child).unwrap(), "projects").unwrap(),
            vec![a]
        );
        assert_eq!(
            ids(&item(&db, grandchild).unwrap(), "projects").unwrap(),
            vec![a]
        );
        assert_ne!(get(&db, "project", b).unwrap().unwrap()["revision"], old_b);
        assert_eq!(tree(&db, b).unwrap()[0]["children"], json!([]));
    }
    #[test]
    fn move_preserves_other_parent_and_root_edges() {
        let mut db = database();
        let a = create_project(&mut db, "甲");
        let b = create_project(&mut db, "乙");
        let parent = create_document(&mut db, a, None, "父");
        let other_parent = create_document(&mut db, b, None, "另父");
        let child = create_document(&mut db, a, Some(parent), "子");
        set_children(&db, "project_item", other_parent, &[child]).unwrap();
        db.execute(
            "UPDATE project_item SET parents=?1 WHERE id=?2",
            params![json!([parent, other_parent]).to_string(), child],
        )
        .unwrap();
        refresh_memberships(&db, child).unwrap();
        let request = movement(&db, child, a, Some(parent), None, 1);
        change(&mut db, "fixture", &request).unwrap();
        assert_eq!(
            ids(&item(&db, child).unwrap(), "parents").unwrap(),
            vec![other_parent]
        );
        assert_eq!(
            ids(&item(&db, child).unwrap(), "projects").unwrap(),
            vec![a, b]
        );
        assert_eq!(
            tree(&db, b).unwrap()[0]["children"][0]["documentId"],
            child.to_string()
        );
    }
    #[test]
    fn references_are_visible_in_tree_and_movable_but_not_documents() {
        let mut db = database();
        let project = create_project(&mut db, "项目");
        let reference = create_document(&mut db, project, None, "卡片引用");
        let parent = create_document(&mut db, project, None, "父");
        db.execute(
            "UPDATE project_item SET ref_type='card',ref_id=123,content_id=NULL WHERE id=?1",
            [reference],
        )
        .unwrap();
        assert!(get(&db, "document", reference).unwrap().is_none());
        assert_eq!(
            tree(&db, project).unwrap()[0]["ref"],
            json!({"kind":"card","id":"123"})
        );
        let request = movement(&db, reference, project, None, Some(parent), 0);
        change(&mut db, "fixture", &request).unwrap();
        let request = command(&db, "document", reference, "delete");
        assert!(change(&mut db, "fixture", &request).is_err());
    }
    #[test]
    fn duplicate_target_and_cyclic_tree_are_rejected() {
        let mut db = database();
        let project = create_project(&mut db, "项目");
        let a = create_document(&mut db, project, None, "甲");
        let b = create_document(&mut db, project, None, "乙");
        set_children(&db, "project_item", b, &[a]).unwrap();
        db.execute(
            "UPDATE project_item SET parents=?1 WHERE id=?2",
            params![json!([b]).to_string(), a],
        )
        .unwrap();
        let request = movement(&db, a, project, None, Some(b), 0);
        assert!(change(&mut db, "fixture", &request)
            .unwrap_err()
            .contains("已经包含"));
        assert_eq!(
            ids(&super::project(&db, project).unwrap(), "children").unwrap(),
            vec![a, b]
        );
        set_children(&db, "project_item", a, &[b]).unwrap();
        assert!(tree(&db, project).unwrap_err().contains("环"));
    }
    #[test]
    fn whiteboard_document_deletion_and_restore_preserve_page_references() {
        let mut db = database();
        let project = create_project(&mut db, "项目");
        let document = create_document(&mut db, project, None, "画板");
        db.execute("INSERT INTO white_board_contents(id,create_time,update_time,data,ref_count) VALUES(7,1,1,'{}',1)",[]).unwrap();
        db.execute("UPDATE project_item SET project_item_type='white-board',white_board_content_id=7 WHERE id=?1",[document]).unwrap();
        let operation = delete(&mut db, "document", document);
        assert_eq!(
            db.query_row(
                "SELECT ref_count FROM white_board_contents WHERE id=7",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        restore(&mut db, operation).unwrap();
        assert_eq!(
            db.query_row(
                "SELECT ref_count FROM white_board_contents WHERE id=7",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM white_board_content_pending_releases WHERE content_id=7",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }
    #[test]
    fn project_and_document_events_follow_committed_origin() {
        let _guard = crate::plugin_transport::test_host("project-events");
        let mut db = database();
        let before = super::super::plugin_data::last_operation(&db).unwrap();
        let project = create_project(&mut db, "项目");
        let document = create_document(&mut db, project, None, "文档");
        super::super::plugin_data::remember_origin(&db, "project-events", "fixture", before)
            .unwrap();
        let events =
            super::super::plugin_data::changes(&db, "project-events", Some(before)).unwrap();
        let events = events["events"].as_array().unwrap();
        assert!(events
            .iter()
            .any(|event| event["type"] == "project.created" && event["id"] == project.to_string()));
        assert!(events.iter().any(
            |event| event["type"] == "document.created" && event["id"] == document.to_string()
        ));
        assert!(events.iter().any(
            |event| event["type"] == "document.updated" && event["id"] == document.to_string()
        ));
        assert!(events
            .iter()
            .all(|event| event["origin"] == json!({"kind":"plugin","pluginId":"fixture"})));
    }
    #[test]
    fn invalid_parent_rolls_back_creation_without_orphan_body() {
        let mut db = database();
        let project = create_project(&mut db, "项目");
        let before = db
            .query_row("SELECT COUNT(*) FROM contents", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        let request = json!({"entity":"document","method":"create","input":{"projectId":project.to_string(),"parentId":"999","title":"不能建立"},"content":{"nodes":[],"contracts":{},"count":0}});
        assert!(change(&mut db, "fixture", &request).is_err());
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM contents", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            before
        );
        assert_eq!(tree(&db, project).unwrap(), json!([]));
    }
    #[test]
    fn delete_restores_all_surviving_placements_and_shared_content() {
        let mut db = database();
        let a = create_project(&mut db, "甲");
        let b = create_project(&mut db, "乙");
        let parent = create_document(&mut db, a, None, "父");
        let child = create_document(&mut db, a, Some(parent), "子");
        let tail = create_document(&mut db, b, None, "原尾项");
        set_children(&db, "project", b, &[child, tail]).unwrap();
        refresh_memberships(&db, child).unwrap();
        let content = item(&db, child).unwrap()["content_id"].as_i64().unwrap();
        db.execute("INSERT INTO cards(create_time,update_time,tags,content_id,is_top) VALUES(1,1,'[]',?1,0)",[content]).unwrap();
        db.execute(
            "UPDATE contents SET ref_count=ref_count+1 WHERE id=?1",
            [content],
        )
        .unwrap();
        let operation = delete(&mut db, "document", child);
        assert_eq!(tree(&db, a).unwrap()[0]["children"], json!([]));
        assert_eq!(
            ids(&super::project(&db, b).unwrap(), "children").unwrap(),
            vec![tail]
        );
        assert_eq!(
            db.query_row(
                "SELECT ref_count FROM contents WHERE id=?1",
                [content],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        restore(&mut db, operation).unwrap();
        assert_eq!(
            ids(&super::project(&db, b).unwrap(), "children").unwrap(),
            vec![child, tail]
        );
        assert_eq!(
            ids(&item(&db, child).unwrap(), "projects").unwrap(),
            vec![a, b]
        );
        assert_eq!(
            db.query_row(
                "SELECT ref_count FROM contents WHERE id=?1",
                [content],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            2
        );
        assert!(restore(&mut db, operation).is_err());
    }
    #[test]
    fn restore_skips_deleted_or_reused_parent_and_fails_when_no_location_survives() {
        let mut db = database();
        let a = create_project(&mut db, "甲");
        let b = create_project(&mut db, "乙");
        let parent = create_document(&mut db, a, None, "父");
        let child = create_document(&mut db, a, Some(parent), "子");
        set_children(&db, "project", b, &[child]).unwrap();
        refresh_memberships(&db, child).unwrap();
        let operation = delete(&mut db, "document", child);
        db.execute(
            "UPDATE project_item SET create_time=create_time+1 WHERE id=?1",
            [parent],
        )
        .unwrap();
        restore(&mut db, operation).unwrap();
        assert!(ids(&item(&db, child).unwrap(), "parents")
            .unwrap()
            .is_empty());
        assert_eq!(
            ids(&item(&db, child).unwrap(), "projects").unwrap(),
            vec![b]
        );
        let operation = delete(&mut db, "document", child);
        delete(&mut db, "project", b);
        assert!(restore(&mut db, operation).is_err());
        assert!(get(&db, "document", child).unwrap().is_none());
        assert!(db
            .query_row(
                "SELECT restored_time IS NULL FROM plugin_operations WHERE id=?1",
                [operation],
                |row| row.get::<_, bool>(0)
            )
            .unwrap());
    }
    #[test]
    fn unsafe_deletes_and_restore_collisions_leave_everything_unchanged() {
        let mut db = database();
        let project = create_project(&mut db, "项目");
        let parent = create_document(&mut db, project, None, "父");
        let child = create_document(&mut db, project, Some(parent), "子");
        for (entity, id) in [("project", project), ("document", parent)] {
            let request = command(&db, entity, id, "delete");
            assert!(change(&mut db, "fixture", &request).is_err());
        }
        db.execute(
            "UPDATE project_item SET project_item_type='video-note' WHERE id=?1",
            [child],
        )
        .unwrap();
        let request = command(&db, "document", child, "delete");
        assert!(change(&mut db, "fixture", &request).is_err());
        db.execute(
            "UPDATE project_item SET project_item_type='document' WHERE id=?1",
            [child],
        )
        .unwrap();
        let operation = delete(&mut db, "document", child);
        db.execute("INSERT INTO project_item(id,title,create_time,update_time,children,parents,projects,tags) VALUES(?1,'新内容',99,99,'[]','[]','[]','[]')",[child]).unwrap();
        assert!(restore(&mut db, operation).is_err());
        assert_eq!(
            ids(&item(&db, parent).unwrap(), "children").unwrap(),
            Vec::<i64>::new()
        );
        assert_eq!(item(&db, child).unwrap()["title"], "新内容");
    }
}
