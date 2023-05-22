// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod file;

fn main() {
  tauri::Builder::default()
      .invoke_handler(tauri::generate_handler![file::read_from_file])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
