use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Serialize, Deserialize};
use rusqlite::{Connection, params, Result, Row};
use super::operation::insert_operation;

#[derive(Serialize, Deserialize, Debug)]
pub struct Project {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub title: String,
    pub children: Vec<i64>,
    pub desc: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ProjectItem {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub title: String,
    pub content: String,
    pub children: Vec<i64>,
    pub parents: Vec<i64>,
    pub projects: Vec<i64>,
    pub ref_type: String,
    pub ref_id: i64,
}

pub fn init_project_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS project (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            title TEXT NOT NULL,
            desc TEXT,
            children TEXT
        )",
        [],
    )?;

    Ok(())
}

pub fn init_project_item_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS project_item (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT,
            children TEXT,
            parents TEXT,
            projects TEXT,
            ref_type TEXT,
            ref_id INTEGER
        )",
        [],
    )?;

    Ok(())
}

pub fn get_project_from_query_result(row: &Row) -> Project {
    Project {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        title: row.get(3).unwrap(),
        desc: row.get(4).unwrap(),
        children: serde_json::from_str(&row.get::<usize, String>(5).unwrap()).unwrap(),
    }
}

pub fn get_project_item_from_query_result(row: &Row) -> ProjectItem {

    ProjectItem {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        title: row.get(3).unwrap(),
        content: row.get(4).unwrap(),
        children: serde_json::from_str(&row.get::<usize, String>(5).unwrap()).unwrap(),
        parents: serde_json::from_str(&row.get::<usize, String>(6).unwrap()).unwrap(),
        projects: serde_json::from_str(&row.get::<usize, String>(7).unwrap()).unwrap(),
        ref_type: row.get(8).unwrap(),
        ref_id: row.get(9).unwrap(),
    }
}

pub fn create_project(conn: &Connection, title: String, desc: String, children: Vec<i64>) -> Result<Project> {
    let create_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let update_time = create_time;
    let mut stmt = conn.prepare("INSERT INTO project (create_time, update_time, title, desc, children) VALUES (?1, ?2, ?3, ?4, ?5)")?;

    let res = stmt.insert(params![create_time, update_time, title, desc, serde_json::to_string(&children).unwrap()])?;

    insert_operation(conn, res as i64, "project".to_string(), "insert".to_string())?;

    let project = get_project_by_id(conn, res).unwrap();
    Ok(project)
}

pub fn delete_project(conn: &Connection, id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("DELETE FROM project WHERE id = ?1")?;
    let res = stmt.execute(params![id])?;
    insert_operation(conn, id, "project".to_string(), "delete".to_string())?;
    Ok(res)
}

pub fn get_project_list(conn: &Connection) -> Result<Vec<Project>> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, desc, children FROM project ORDER BY update_time DESC")?;
    let mut rows = stmt.query(params![])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_project_from_query_result(&row));
    }
    Ok(res)
}

pub fn get_project_by_id(conn: &Connection, id: i64) -> Result<Project> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, desc, children FROM project WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_project_from_query_result(&row))
}

pub fn update_project(conn: &Connection, id: i64, title: String, desc: String, children: Vec<i64>) -> Result<Project> {
    let update_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let mut stmt = conn.prepare("UPDATE project SET update_time = ?1, title = ?2, desc = ?3, children = ?4 WHERE id = ?5")?;
    stmt.execute(params![update_time, title, desc, serde_json::to_string(&children).unwrap(), id])?;
    let update_project = get_project_by_id(conn, id).unwrap();
    insert_operation(conn, id, "project".to_string(), "update".to_string())?;
    Ok(update_project)
}

pub fn get_project_item_count_in_project(conn: &Connection, project_id: i64) -> Result<i64> {
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM project_item WHERE projects LIKE ?1")?;
    let mut rows = stmt.query(params![format!("%\"{}\"%", project_id)])?;
    let row = rows.next()?.unwrap();
    Ok(row.get(0).unwrap())
}

pub fn create_project_item(conn: &Connection, title: String, content: String, children: Vec<i64>, parents: Vec<i64>, projects: Vec<i64>, ref_type: String, ref_id: i64) -> Result<ProjectItem> {
    let create_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let update_time = create_time;
    let mut stmt = conn.prepare("INSERT INTO project_item (create_time, update_time, title, content, children, parents, projects, ref_type, ref_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")?;
    let res = stmt.insert(params![create_time, update_time, title, content, serde_json::to_string(&children).unwrap(), serde_json::to_string(&parents).unwrap(), serde_json::to_string(&projects).unwrap(), ref_type, ref_id])?;
    insert_operation(conn, res as i64, "project_item".to_string(), "insert".to_string())?;

    let project_item = get_project_item_by_id(conn, res).unwrap();
    Ok(project_item)
}

pub fn delete_project_item(conn: &Connection, id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("DELETE FROM project_item WHERE id = ?1")?;
    let res = stmt.execute(params![id])?;
    insert_operation(conn, id, "project_item".to_string(), "delete".to_string())?;
    Ok(res)
}

pub fn update_project_item(conn: &Connection, id: i64, title: String, content: String, children: Vec<i64>, parents: Vec<i64>, projects: Vec<i64>, ref_type: String, ref_id: i64) -> Result<ProjectItem> {
    let update_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let mut stmt = conn.prepare("UPDATE project_item SET update_time = ?1, title = ?2, content = ?3, children = ?4, parents = ?5, projects = ?6, ref_type = ?7, ref_id = ?8 WHERE id = ?9")?;
    stmt.execute(params![update_time, title, content, serde_json::to_string(&children).unwrap(), serde_json::to_string(&parents).unwrap(), serde_json::to_string(&projects).unwrap(), ref_type, ref_id, id])?;
    let update_project_item = get_project_item_by_id(conn, id.clone()).unwrap();
    insert_operation(conn, id.clone(), "project_item".to_string(), "update".to_string())?;

    // 如果 ref_type 和 ref_id 存在，更新关联的项目，并更新其它 project_item
    // ref_type 可能是 card，article，分别更新 cards 和 articles 的行
    // 如果是 cards 就更新 content、update_time，如果是 article 就更新 content、update_time 和 title
    if ref_type == "card" {
        let mut stmt = conn.prepare(&format!("UPDATE cards SET content = ?1, update_time = ?2 WHERE id = ?3"))?;
        stmt.execute(params![content, update_time, ref_id])?;
    } else if ref_type == "article" {
        let mut stmt = conn.prepare(&format!("UPDATE articles SET content = ?1, update_time = ?2, title = ?3 WHERE id = ?4"))?;
        stmt.execute(params![content, update_time, title, ref_id])?;
    }

    if ref_type != "" && ref_id != 0 {
        let project_items = get_project_items_by_ref(conn, ref_type.clone(), ref_id).unwrap();
        let mut project_item_stmt = conn.prepare("UPDATE project_item SET title = ?1, content = ?2, update_time = ?3 WHERE id = ?4")?;
        for project_item in project_items {
            // 本 id 不用更新
            if project_item.id == id {
                continue;
            }
            project_item_stmt.execute(params![title, content, update_time, project_item.id])?;
        }
    }

    Ok(update_project_item)
}

pub fn get_project_item_by_id(conn: &Connection, id: i64) -> Result<ProjectItem> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, content, children, parents, projects, ref_type, ref_id FROM project_item WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_project_item_from_query_result(&row))
}

pub fn get_project_items_by_ref(conn: &Connection, ref_type: String, ref_id: i64) -> Result<Vec<ProjectItem>> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, content, children, parents, projects, ref_type, ref_id FROM project_item WHERE ref_type = ?1 AND ref_id = ?2")?;
    let mut rows = stmt.query(params![ref_type, ref_id])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_project_item_from_query_result(&row));
    }
    Ok(res)
}

pub fn get_all_project_items_not_in_project(conn: &Connection, project_id: i64) -> Result<Vec<ProjectItem>> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, content, children, parents, projects, ref_type, ref_id FROM project_item WHERE projects NOT LIKE ?1")?;
    let mut rows = stmt.query(params![format!("%\"{}\"%", project_id)])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_project_item_from_query_result(&row));
    }
    Ok(res)
}

pub fn delete_all_project_items_not_in_project(conn: &Connection, project_id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("SELECT id FROM project_item WHERE projects NOT LIKE ?1")?;
    let mut rows = stmt.query(params![format!("%\"{}\"%", project_id)])?;
    let mut count: usize = 0;
    while let Some(row) = rows.next()? {
        let id = row.get(0).unwrap();
        delete_project_item(conn, id)?;
        count += 1;
    }

    // 删除的个数
    Ok(count)
}

pub fn is_project_item_not_in_any_project(conn: &Connection, id: i64) -> Result<bool> {
    let mut stmt = conn.prepare("SELECT projects FROM project_item WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    let projects: String = row.get(0).unwrap();
    Ok(projects == "[]")
}

pub fn get_project_items_not_in_any_project(conn: &Connection) -> Result<Vec<ProjectItem>> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, content, children, parents, projects, ref_type, ref_id FROM project_item WHERE projects = '[]'")?;
    let mut rows = stmt.query(params![])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_project_item_from_query_result(&row));
    }
    Ok(res)
}

pub fn delete_project_items_not_in_any_project(conn: &Connection) -> Result<usize> {
    let mut stmt = conn.prepare("SELECT id FROM project_item WHERE projects = '[]'")?;
    let mut rows = stmt.query(params![])?;
    let mut count: usize = 0;
    while let Some(row) = rows.next()? {
        let id = row.get(0).unwrap();
        delete_project_item(conn, id)?;
        count += 1;
    }

    // 删除的个数
    Ok(count)
}
