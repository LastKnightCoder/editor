use simple_home_dir::home_dir;

#[tauri::command]
pub fn get_editor_dir() -> String {
    let home_dir = home_dir().unwrap();
    let editor_dir = home_dir.join(".editor");
    std::fs::create_dir_all(&editor_dir).unwrap();

    editor_dir.to_str().unwrap().to_string()
}

#[tauri::command]
pub fn get_database_path(database_name: &str) -> String {
    let home_dir = home_dir().unwrap();
    let editor_dir = home_dir.join(".editor");
    std::fs::create_dir_all(&editor_dir).unwrap();
    let db_path = editor_dir.join(database_name);

    db_path.to_str().unwrap().to_string()
}
