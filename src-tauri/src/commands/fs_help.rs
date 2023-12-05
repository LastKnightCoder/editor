use simple_home_dir::home_dir;

#[tauri::command]
pub fn get_database_path() -> String {
    let home_dir = home_dir().unwrap();
    let editor_dir = home_dir.join(".editor");
    std::fs::create_dir_all(&editor_dir).unwrap();
    let db_path = editor_dir.join("data.db");

    db_path.to_str().unwrap().to_string()
}