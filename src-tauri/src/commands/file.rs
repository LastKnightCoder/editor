#[tauri::command]
pub fn read_from_file(path: String) -> Result<String, String> {
  println!("Reading from file: {}", path);
  let contents = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
  Ok(contents)
}