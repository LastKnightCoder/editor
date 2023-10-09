extern crate font_loader as fonts;
use fonts::system_fonts;

#[tauri::command]
pub fn get_all_fonts() -> Vec<String>{
    system_fonts::query_all()
}