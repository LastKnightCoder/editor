use std::fs;
use simple_home_dir::home_dir;

#[tauri::command]
pub fn write_setting(setting: String) -> Result<(), String> {
  let home_dir = home_dir().unwrap();
  let setting_path = home_dir.join(".editor").join("setting.json");
  match fs::write(setting_path, setting) {
    Ok(_) => Ok(()),
    Err(_) => Err("写入配置失败".to_string()),
  }
}

#[tauri::command]
pub fn read_setting() -> Result<String, String> {
  let home_dir = home_dir().unwrap();
  let setting_path = home_dir.join(".editor").join("setting.json");
  match fs::read_to_string(setting_path) {
    Ok(setting) => Ok(setting),
    Err(_) => Ok("读取配置文件失败".to_string()),
  }
}