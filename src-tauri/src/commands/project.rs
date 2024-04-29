use crate::state;
use crate::database::project::{self, Project, ProjectItem};

#[tauri::command]
pub fn create_project(title: String, desc: String, children: Vec<i64>, app_state: tauri::State<state::AppState>) -> Result<Project, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = project::create_project(&conn, title, desc, children).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_project(id: i64, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            project::delete_project(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_project_list(app_state: tauri::State<state::AppState>) -> Result<Vec<Project>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            project::get_project_list(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_project_by_id(id: i64, app_state: tauri::State<state::AppState>) -> Result<Project, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            project::get_project_by_id(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_project(id: i64, title: String, desc: String, children: Vec<i64>, app_state: tauri::State<state::AppState>) -> Result<Project, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            project::update_project(&conn, id, title, desc, children).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_project_item_count_in_project(id: i64, app_state: tauri::State<state::AppState>) -> Result<i64, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            project::get_project_item_count_in_project(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn create_project_item(title: String, content: String, children: Vec<i64>, parents: Vec<i64>, projects: Vec<i64>, ref_type: String, ref_id: i64, app_state: tauri::State<state::AppState>) -> Result<ProjectItem, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = project::create_project_item(&conn, title, content, children, parents, projects, ref_type, ref_id).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_project_item(id: i64, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = project::delete_project_item(&conn, id).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_project_item(id: i64, title: String, content: String, children: Vec<i64>, parents: Vec<i64>, projects: Vec<i64>, ref_type: String, ref_id: i64, app_state: tauri::State<state::AppState>) -> Result<ProjectItem, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = project::update_project_item(&conn, id, title, content, children, parents, projects, ref_type, ref_id).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_project_item_by_id(id: i64, app_state: tauri::State<state::AppState>) -> Result<ProjectItem, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            project::get_project_item_by_id(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_project_items_by_ref(ref_type: String, ref_id: i64, app_state: tauri::State<state::AppState>) -> Result<Vec<ProjectItem>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            project::get_project_items_by_ref(&conn, ref_type, ref_id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_all_project_items_not_in_project(project_id: i64, app_state: tauri::State<state::AppState>) -> Result<Vec<ProjectItem>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            project::get_all_project_items_not_in_project(&conn, project_id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_all_project_items_not_in_project(project_id: i64, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = project::delete_all_project_items_not_in_project(&conn, project_id).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn is_project_item_not_in_any_project(id: i64, app_state: tauri::State<state::AppState>) -> Result<bool, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            project::is_project_item_not_in_any_project(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_project_items_not_in_any_project(app_state: tauri::State<state::AppState>) -> Result<Vec<ProjectItem>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            project::get_project_items_not_in_any_project(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_project_items_not_in_any_project(app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = project::delete_project_items_not_in_any_project(&conn).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}