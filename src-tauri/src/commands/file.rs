#[tauri::command]
pub fn read_from_file(path: String) -> Result<String, String> {
  println!("Reading from file: {}", path);
  let contents = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
  Ok(contents)
}

#[tauri::command]
pub fn get_app_data_path(app_handle: tauri::AppHandle<tauri::Wry>) -> Result<String, String> {
  let app_dir = app_handle.path_resolver().app_data_dir().unwrap();
  let db_path = app_dir.join("test.db");
  Ok(db_path.to_str().unwrap().to_string())
}