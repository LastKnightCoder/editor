use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::common::{
    db_err, decrement_or_delete_content, insert_content_record, now_millis, parse_id_array,
    serialize_id_array, trigger_reconcile, write_operation,
};
use super::schema;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub title: String,
    pub desc_text: String,
    pub children: Vec<i64>,
    pub archived: bool,
    pub pinned: bool,
    pub project_type: String,
    pub create_time: i64,
    pub update_time: i64,
    pub item_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListResponse {
    pub items: Vec<Project>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectItem {
    pub id: i64,
    pub title: String,
    pub children: Vec<i64>,
    pub parents: Vec<i64>,
    pub projects: Vec<i64>,
    pub project_item_type: String,
    pub ref_type: String,
    pub ref_id: i64,
    pub content_id: Option<i64>,
    pub count: i64,
    pub create_time: i64,
    pub update_time: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectPayload {
    pub title: String,
    pub desc: Option<String>,
    pub project_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectPayload {
    pub id: i64,
    pub title: Option<String>,
    pub desc: Option<String>,
    pub pinned: Option<bool>,
    pub archived: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectItemPayload {
    pub project_id: i64,
    pub parent_id: Option<i64>,
    pub title: String,
    pub item_type: Option<String>,
    pub ref_type: Option<String>,
    pub ref_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectItemPayload {
    pub id: i64,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIdPayload {
    pub id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListPayload {
    pub offset: Option<i64>,
    pub limit: Option<i64>,
}

fn parse_project_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        title: row.get(1)?,
        desc_text: super::common::json_content_plain_text(row.get::<_, Option<String>>(2)?),
        children: parse_id_array(row.get(3)?),
        archived: row.get::<_, i64>(4)? == 1,
        pinned: row.get::<_, i64>(5)? == 1,
        project_type: row
            .get::<_, Option<String>>(6)?
            .unwrap_or_else(|| "document-tree".to_string()),
        create_time: row.get(7)?,
        update_time: row.get(8)?,
        item_count: row.get(9)?,
    })
}

fn parse_item_row(row: &Row<'_>) -> rusqlite::Result<ProjectItem> {
    Ok(ProjectItem {
        id: row.get(0)?,
        title: row.get(1)?,
        children: parse_id_array(row.get(2)?),
        parents: parse_id_array(row.get(3)?),
        projects: parse_id_array(row.get(4)?),
        project_item_type: row
            .get::<_, Option<String>>(5)?
            .unwrap_or_else(|| "document".to_string()),
        ref_type: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
        ref_id: row.get::<_, Option<i64>>(7)?.unwrap_or(0),
        content_id: row.get(8)?,
        count: row.get::<_, Option<i64>>(9)?.unwrap_or(0),
        create_time: row.get(10)?,
        update_time: row.get(11)?,
    })
}

fn query_project_by_id(conn: &Connection, id: i64) -> Result<Option<Project>, String> {
    conn.query_row(
        "SELECT id, title, desc, children, archived, pinned, project_type, create_time, update_time FROM project WHERE id = ?1 LIMIT 1",
        params![id],
        parse_project_row,
    )
    .optional()
    .map_err(|e| db_err("PROJECT_QUERY_FAILED", "query project", e))
}

fn load_item_children(tx: &Connection, item_id: i64) -> Result<Vec<i64>, String> {
    let raw = tx
        .query_row(
            "SELECT children FROM project_item WHERE id = ?1 LIMIT 1",
            params![item_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| db_err("PROJECT_QUERY_FAILED", "query item children", e))?;
    Ok(parse_id_array(raw.flatten()))
}

/// 把 child 追加到 parent.children（parent 为 None 时挂到 project.children），并回写 parents/projects
fn attach_item(
    tx: &Connection,
    project_id: i64,
    parent_id: Option<i64>,
    child_id: i64,
) -> Result<(), String> {
    let now = now_millis();
    if let Some(pid) = parent_id {
        let mut children = load_item_children(tx, pid)?;
        if !children.contains(&child_id) {
            children.push(child_id);
        }
        tx.execute(
            "UPDATE project_item SET children = ?1, update_time = ?2 WHERE id = ?3",
            params![serialize_id_array(&children), now, pid],
        )
        .map_err(|e| db_err("PROJECT_UPDATE_FAILED", "attach to parent", e))?;
    } else {
        let raw = tx
            .query_row(
                "SELECT children FROM project WHERE id = ?1 LIMIT 1",
                params![project_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|e| db_err("PROJECT_QUERY_FAILED", "query project children", e))?;
        let mut children = parse_id_array(raw.flatten());
        if !children.contains(&child_id) {
            children.push(child_id);
        }
        tx.execute(
            "UPDATE project SET children = ?1, update_time = ?2 WHERE id = ?3",
            params![serialize_id_array(&children), now, project_id],
        )
        .map_err(|e| db_err("PROJECT_UPDATE_FAILED", "attach to project", e))?;
    }
    let (mut parents, mut projects) = {
        let row = tx
            .query_row(
                "SELECT parents, projects FROM project_item WHERE id = ?1 LIMIT 1",
                params![child_id],
                |row| {
                    Ok((
                        parse_id_array(row.get::<_, Option<String>>(0)?),
                        parse_id_array(row.get::<_, Option<String>>(1)?),
                    ))
                },
            )
            .optional()
            .map_err(|e| db_err("PROJECT_QUERY_FAILED", "query item parents", e))?;
        row.unwrap_or_else(|| (Vec::new(), Vec::new()))
    };
    if let Some(pid) = parent_id {
        if !parents.contains(&pid) {
            parents.push(pid);
        }
    }
    if !projects.contains(&project_id) {
        projects.push(project_id);
    }
    tx.execute(
        "UPDATE project_item SET parents = ?1, projects = ?2 WHERE id = ?3",
        params![
            serialize_id_array(&parents),
            serialize_id_array(&projects),
            child_id
        ],
    )
    .map_err(|e| db_err("PROJECT_UPDATE_FAILED", "update item parents", e))?;
    Ok(())
}

fn detach_item_from_parent(
    tx: &Connection,
    parent_id: Option<i64>,
    child_id: i64,
    project_id: i64,
) -> Result<(), String> {
    let now = now_millis();
    if let Some(pid) = parent_id {
        let children = load_item_children(tx, pid)?;
        let next: Vec<i64> = children.into_iter().filter(|id| *id != child_id).collect();
        tx.execute(
            "UPDATE project_item SET children = ?1, update_time = ?2 WHERE id = ?3",
            params![serialize_id_array(&next), now, pid],
        )
        .map_err(|e| db_err("PROJECT_DELETE_FAILED", "detach from parent", e))?;
    } else {
        let raw = tx
            .query_row(
                "SELECT children FROM project WHERE id = ?1 LIMIT 1",
                params![project_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|e| db_err("PROJECT_QUERY_FAILED", "query project children", e))?;
        let children = parse_id_array(raw.flatten());
        let next: Vec<i64> = children.into_iter().filter(|id| *id != child_id).collect();
        tx.execute(
            "UPDATE project SET children = ?1, update_time = ?2 WHERE id = ?3",
            params![serialize_id_array(&next), now, project_id],
        )
        .map_err(|e| db_err("PROJECT_DELETE_FAILED", "detach from project", e))?;
    }
    Ok(())
}

/// 收集 root_ids 及其全部后代（沿 children JSON 递归）
fn collect_subtree(tx: &Connection, root_ids: &[i64]) -> Result<Vec<i64>, String> {
    let mut seen = std::collections::HashSet::new();
    let mut queue: Vec<i64> = root_ids.to_vec();
    let mut order = Vec::new();
    while let Some(id) = queue.pop() {
        if !seen.insert(id) {
            continue;
        }
        order.push(id);
        for child in load_item_children(tx, id)? {
            if !seen.contains(&child) {
                queue.push(child);
            }
        }
    }
    Ok(order)
}

/// 删除子树：被其他项目/库外父节点引用的项只做脱离，其余连同 contents 一并删除
fn detach_or_delete_subtree(
    tx: &Connection,
    root_parent: Option<i64>,
    root_id: i64,
    owner_project_id: i64,
) -> Result<i64, String> {
    let subtree = collect_subtree(tx, &[root_id])?;
    let in_subtree = |id: i64| subtree.contains(&id);
    let mut deleted_ids: Vec<i64> = Vec::new();
    let mut deleted = 0i64;
    let now = now_millis();

    // 先脱离根节点与直接父级的连接
    detach_item_from_parent(tx, root_parent, root_id, owner_project_id)?;

    // 自底向上处理，保证父级 children 先清空
    for id in subtree.iter().rev().copied() {
        let row = tx
            .query_row(
                "SELECT parents, projects, content_id FROM project_item WHERE id = ?1 LIMIT 1",
                params![id],
                |row| {
                    Ok((
                        parse_id_array(row.get::<_, Option<String>>(0)?),
                        parse_id_array(row.get::<_, Option<String>>(1)?),
                        row.get::<_, Option<i64>>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| db_err("PROJECT_DELETE_FAILED", "query item refs", e))?;
        let Some((parents, projects, content_id)) = row else {
            continue;
        };
        // 子树外的父节点或其他项目仍在引用：从该节点移除指向子树内的父子关系与本项目引用，保留节点
        let external_parent = parents
            .iter()
            .any(|p| !in_subtree(*p) && Some(*p) != root_parent);
        let external_project = projects.iter().any(|p| *p != owner_project_id);
        if external_parent || external_project {
            let next_parents: Vec<i64> = parents
                .into_iter()
                .filter(|p| !in_subtree(*p) && Some(*p) != root_parent)
                .collect();
            let next_projects: Vec<i64> = projects
                .into_iter()
                .filter(|p| *p != owner_project_id)
                .collect();
            tx.execute(
                "UPDATE project_item SET parents = ?1, projects = ?2, update_time = ?3 WHERE id = ?4",
                params![serialize_id_array(&next_parents), serialize_id_array(&next_projects), now, id],
            )
            .map_err(|e| db_err("PROJECT_DELETE_FAILED", "detach external refs", e))?;
            continue;
        }
        tx.execute("DELETE FROM project_item WHERE id = ?1", params![id])
            .map_err(|e| db_err("PROJECT_DELETE_FAILED", "delete item", e))?;
        write_operation(tx, "project-item", "delete", id, now)?;
        if let Some(content_id) = content_id {
            decrement_or_delete_content(tx, content_id)?;
        }
        deleted_ids.push(id);
        deleted += 1;
    }
    // 清理保留节点 children 中指向已删除子节点的悬挂引用
    for id in subtree.iter().copied() {
        if deleted_ids.contains(&id) {
            continue;
        }
        let children = load_item_children(tx, id)?;
        if children.is_empty() {
            continue;
        }
        let filtered: Vec<i64> = children
            .iter()
            .copied()
            .filter(|c| !deleted_ids.contains(c))
            .collect();
        if filtered.len() != children.len() {
            tx.execute(
                "UPDATE project_item SET children = ?1, update_time = ?2 WHERE id = ?3",
                params![serialize_id_array(&filtered), now, id],
            )
            .map_err(|e| db_err("PROJECT_DELETE_FAILED", "prune dangling children", e))?;
        }
    }
    Ok(deleted)
}

#[tauri::command]
pub fn project_list(
    app: AppHandle,
    payload: Option<ProjectListPayload>,
) -> Result<ProjectListResponse, String> {
    let conn = schema::open_active_database(&app)?;
    let total: i64 = conn
        .query_row("SELECT COUNT(1) FROM project", [], |row| row.get(0))
        .map_err(|e| db_err("PROJECT_QUERY_FAILED", "count projects", e))?;
    let offset = payload.as_ref().and_then(|p| p.offset).unwrap_or(0).max(0);
    let limit = payload
        .as_ref()
        .and_then(|p| p.limit)
        .unwrap_or(40)
        .clamp(1, 200);
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.title, p.desc, p.children, p.archived, p.pinned, p.project_type,
                    p.create_time, p.update_time,
                    (SELECT COUNT(1) FROM project_item pi
                     WHERE EXISTS (SELECT 1 FROM json_each(COALESCE(pi.projects, '[]'))
                                   WHERE CAST(json_each.value AS INTEGER) = p.id)) AS item_count
             FROM project p
             ORDER BY p.pinned DESC, p.update_time DESC, p.id DESC LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| db_err("PROJECT_QUERY_FAILED", "prepare list query", e))?;
    let rows = stmt
        .query_map(params![limit, offset], parse_project_row)
        .map_err(|e| db_err("PROJECT_QUERY_FAILED", "query projects", e))?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| db_err("PROJECT_QUERY_FAILED", "parse project row", e))?);
    }
    Ok(ProjectListResponse { items, total })
}

#[tauri::command]
pub fn project_get(app: AppHandle, payload: ProjectIdPayload) -> Result<Project, String> {
    let conn = schema::open_active_database(&app)?;
    conn.query_row(
        "SELECT p.id, p.title, p.desc, p.children, p.archived, p.pinned, p.project_type,
                p.create_time, p.update_time,
                (SELECT COUNT(1) FROM project_item pi
                 WHERE EXISTS (SELECT 1 FROM json_each(COALESCE(pi.projects, '[]'))
                               WHERE CAST(json_each.value AS INTEGER) = p.id))
         FROM project p WHERE p.id = ?1",
        params![payload.id],
        parse_project_row,
    )
    .map_err(|e| db_err("PROJECT_QUERY_FAILED", "get project", e))
}

#[tauri::command]
pub fn project_item_list(app: AppHandle) -> Result<Vec<ProjectItem>, String> {
    let conn = schema::open_active_database(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT pi.id, pi.title, pi.children, pi.parents, pi.projects, pi.project_item_type,
                    pi.ref_type, pi.ref_id, pi.content_id, COALESCE(c.count, 0), pi.create_time, pi.update_time
             FROM project_item pi
             LEFT JOIN contents c ON c.id = pi.content_id
             ORDER BY pi.create_time ASC",
        )
        .map_err(|e| db_err("PROJECT_QUERY_FAILED", "prepare items query", e))?;
    let rows = stmt
        .query_map([], parse_item_row)
        .map_err(|e| db_err("PROJECT_QUERY_FAILED", "query items", e))?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| db_err("PROJECT_QUERY_FAILED", "parse item row", e))?);
    }
    Ok(items)
}

#[tauri::command]
pub fn project_create(app: AppHandle, payload: CreateProjectPayload) -> Result<Project, String> {
    let title = payload.title.trim().to_string();
    if title.is_empty() {
        return Err("PROJECT_INVALID: title must not be empty".to_string());
    }
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("PROJECT_CREATE_FAILED", "begin transaction", e))?;
    let now = now_millis();
    let project_type = payload
        .project_type
        .unwrap_or_else(|| "document-tree".to_string());
    tx.execute(
        "
        INSERT INTO project (title, desc, children, archived, pinned, project_type, data_table_id, create_time, update_time)
        VALUES (?1, ?2, '[]', 0, 0, ?3, 0, ?4, ?4)
        ",
        params![title, payload.desc.unwrap_or_default(), project_type, now],
    )
    .map_err(|e| db_err("PROJECT_CREATE_FAILED", "insert project", e))?;
    let project_id = tx.last_insert_rowid();
    write_operation(&tx, "project", "insert", project_id, now)?;
    let project = query_project_by_id(&tx, project_id)?
        .ok_or_else(|| "PROJECT_NOT_FOUND: project does not exist".to_string())?;
    tx.commit()
        .map_err(|e| db_err("PROJECT_CREATE_FAILED", "commit transaction", e))?;
    Ok(project)
}

#[tauri::command]
pub fn project_update(app: AppHandle, payload: UpdateProjectPayload) -> Result<Project, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("PROJECT_UPDATE_FAILED", "begin transaction", e))?;
    let current = query_project_by_id(&tx, payload.id)?
        .ok_or_else(|| "PROJECT_NOT_FOUND: project does not exist".to_string())?;
    let now = now_millis();
    let desc = match payload.desc {
        Some(desc) => desc,
        None => tx
            .query_row(
                "SELECT desc FROM project WHERE id = ?1 LIMIT 1",
                params![payload.id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|e| db_err("PROJECT_UPDATE_FAILED", "query desc", e))?
            .flatten()
            .unwrap_or_default(),
    };
    tx.execute(
        "
        UPDATE project SET title = ?1, desc = ?2, pinned = ?3, archived = ?4, update_time = ?5
        WHERE id = ?6
        ",
        params![
            payload.title.unwrap_or(current.title),
            desc,
            if payload.pinned.unwrap_or(current.pinned) {
                1
            } else {
                0
            },
            if payload.archived.unwrap_or(current.archived) {
                1
            } else {
                0
            },
            now,
            payload.id
        ],
    )
    .map_err(|e| db_err("PROJECT_UPDATE_FAILED", "update project", e))?;
    write_operation(&tx, "project", "update", payload.id, now)?;
    let project = query_project_by_id(&tx, payload.id)?
        .ok_or_else(|| "PROJECT_NOT_FOUND: project does not exist".to_string())?;
    tx.commit()
        .map_err(|e| db_err("PROJECT_UPDATE_FAILED", "commit transaction", e))?;
    Ok(project)
}

#[tauri::command]
pub fn project_delete(app: AppHandle, payload: ProjectIdPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("PROJECT_DELETE_FAILED", "begin transaction", e))?;
    let children_raw = tx
        .query_row(
            "SELECT children FROM project WHERE id = ?1 LIMIT 1",
            params![payload.id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| db_err("PROJECT_DELETE_FAILED", "query project", e))?
        .ok_or_else(|| "PROJECT_NOT_FOUND: project does not exist".to_string())?;
    let root_ids = parse_id_array(children_raw);
    let now = now_millis();
    let mut deleted = 0i64;
    for root_id in root_ids {
        deleted += detach_or_delete_subtree(&tx, None, root_id, payload.id)?;
    }
    tx.execute("DELETE FROM project WHERE id = ?1", params![payload.id])
        .map_err(|e| db_err("PROJECT_DELETE_FAILED", "delete project", e))?;
    write_operation(&tx, "project", "delete", payload.id, now)?;
    tx.commit()
        .map_err(|e| db_err("PROJECT_DELETE_FAILED", "commit transaction", e))?;
    trigger_reconcile(&app);
    Ok(deleted)
}

#[tauri::command]
pub fn project_item_create(
    app: AppHandle,
    payload: CreateProjectItemPayload,
) -> Result<ProjectItem, String> {
    let title = payload.title.trim().to_string();
    if title.is_empty() {
        return Err("PROJECT_ITEM_INVALID: title must not be empty".to_string());
    }
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("PROJECT_ITEM_CREATE_FAILED", "begin transaction", e))?;
    // 校验项目与父节点存在且属于同一棵树，避免跨项目污染冗余关系。
    query_project_by_id(&tx, payload.project_id)?
        .ok_or_else(|| "PROJECT_NOT_FOUND: project does not exist".to_string())?;
    if let Some(parent_id) = payload.parent_id {
        let parent_projects: Option<String> = tx
            .query_row(
                "SELECT projects FROM project_item WHERE id = ?1 LIMIT 1",
                params![parent_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| db_err("PROJECT_ITEM_CREATE_FAILED", "query parent", e))?;
        let Some(parent_projects) = parent_projects else {
            return Err("PROJECT_ITEM_NOT_FOUND: parent item does not exist".to_string());
        };
        if !parse_id_array(Some(parent_projects)).contains(&payload.project_id) {
            return Err("PROJECT_ITEM_INVALID: parent belongs to another project".to_string());
        }
    }
    let item_type = payload.item_type.unwrap_or_else(|| "document".to_string());
    let ref_type = payload.ref_type.clone().unwrap_or_default();
    let ref_id = payload.ref_id.unwrap_or(0);
    let now = now_millis();
    // document 类型自持正文，其余类型挂引用
    let content_id = if item_type == "document" && ref_type.is_empty() {
        Some(insert_content_record(
            &tx,
            &serde_json::json!([{ "type": "paragraph", "children": [{ "type": "formatted", "text": "" }] }]),
            0,
            now,
        )?)
    } else {
        None
    };
    tx.execute(
        "
        INSERT INTO project_item
        (title, children, parents, projects, project_item_type, ref_type, ref_id, content_id, white_board_content_id, create_time, update_time)
        VALUES (?1, '[]', '[]', '[]', ?2, ?3, ?4, ?5, NULL, ?6, ?6)
        ",
        params![title, item_type, ref_type, ref_id, content_id, now],
    )
    .map_err(|e| db_err("PROJECT_ITEM_CREATE_FAILED", "insert item", e))?;
    let item_id = tx.last_insert_rowid();
    write_operation(&tx, "project-item", "insert", item_id, now)?;
    attach_item(&tx, payload.project_id, payload.parent_id, item_id)?;
    tx.commit()
        .map_err(|e| db_err("PROJECT_ITEM_CREATE_FAILED", "commit transaction", e))?;
    trigger_reconcile(&app);
    Ok(ProjectItem {
        id: item_id,
        title,
        children: Vec::new(),
        parents: payload.parent_id.map(|p| vec![p]).unwrap_or_default(),
        projects: vec![payload.project_id],
        project_item_type: item_type,
        ref_type,
        ref_id,
        content_id,
        count: 0,
        create_time: now,
        update_time: now,
    })
}

#[tauri::command]
pub fn project_item_update(
    app: AppHandle,
    payload: UpdateProjectItemPayload,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("PROJECT_ITEM_UPDATE_FAILED", "begin transaction", e))?;
    let now = now_millis();
    let changed = tx
        .execute(
            "UPDATE project_item SET title = COALESCE(?1, title), update_time = ?2 WHERE id = ?3",
            params![payload.title, now, payload.id],
        )
        .map_err(|e| db_err("PROJECT_ITEM_UPDATE_FAILED", "update item", e))?;
    if changed > 0 {
        write_operation(&tx, "project-item", "update", payload.id, now)?;
    }
    tx.commit()
        .map_err(|e| db_err("PROJECT_ITEM_UPDATE_FAILED", "commit transaction", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn project_item_delete(app: AppHandle, payload: ProjectIdPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("PROJECT_ITEM_DELETE_FAILED", "begin transaction", e))?;
    let row = tx
        .query_row(
            "SELECT parents, projects FROM project_item WHERE id = ?1 LIMIT 1",
            params![payload.id],
            |row| {
                Ok((
                    parse_id_array(row.get::<_, Option<String>>(0)?),
                    parse_id_array(row.get::<_, Option<String>>(1)?),
                ))
            },
        )
        .optional()
        .map_err(|e| db_err("PROJECT_ITEM_DELETE_FAILED", "query item", e))?
        .ok_or_else(|| "PROJECT_ITEM_NOT_FOUND: item does not exist".to_string())?;
    let (parents, projects) = row;
    let owner_project = projects.first().copied().unwrap_or(0);
    let parent_id = parents.first().copied();
    let deleted = detach_or_delete_subtree(&tx, parent_id, payload.id, owner_project)?;
    tx.commit()
        .map_err(|e| db_err("PROJECT_ITEM_DELETE_FAILED", "commit transaction", e))?;
    trigger_reconcile(&app);
    Ok(deleted)
}
