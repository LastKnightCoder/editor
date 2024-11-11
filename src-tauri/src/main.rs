// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod state;
mod commands;
mod plugins;

use window_shadows::set_shadow;
use tauri::{AppHandle, CustomMenuItem, Manager, State, SystemTray, SystemTrayMenu, SystemTrayMenuItem, Wry};
use database::init_database;
use state::AppState;
use plugins::{
    article,
    card,
    daily_note,
    document,
    pdf,
    project,
    time_record,
    white_board,
    voice_copy,
    llm,
};

use commands::{
    connect_database_by_name,
    get_ali_oss_buckets,
    get_all_fonts,
    get_article_history_list,
    get_card_history_list,
    get_database_path,
    get_editor_dir,
    get_operation_list,
    get_operation_records_by_year,
    read_setting,
    reconnect_database,
    show_in_folder,
    write_setting,
    html_to_markdown,
};

fn create_or_show_quick_window(app: &AppHandle<Wry>, label: &str, url: &str) {
    let quick_window = app.get_window(label);
    // 如果不存在，则创建
    if quick_window.is_none() {
        #[cfg(target_os="windows")]
        tauri::WindowBuilder::new(app, label, tauri::WindowUrl::App(url.into()))
            .title(label)
            .decorations(false)
            .inner_size(800.0, 1000.0)
            .transparent(true)
            .fullscreen(false)
            .resizable(true)
            .always_on_top(true)
            .disable_file_drop_handler()
            .build()
            .unwrap();

        #[cfg(target_os="macos")]
        tauri::WindowBuilder::new(app, label, tauri::WindowUrl::App(url.into()))
            .title(label)
            .decorations(false)
            .inner_size(400.0, 800.0)
            .fullscreen(false)
            .resizable(true)
            .always_on_top(true)
            .disable_file_drop_handler()
            .build()
            .unwrap();

        let window = app.get_window(label).unwrap();
        set_shadow(&window, true).expect("Unsupported platform!");
    } else {
        // 如果存在且是最小化状态，则取消最小化
        let quick_window = quick_window.unwrap();
        if quick_window.is_minimized().unwrap() {
            quick_window.unminimize().unwrap();
        }
    }
}

fn main() {
    let quick_card_note = CustomMenuItem::new("quick_card_note".to_string(), "快捷卡片");
    let quick_time_record = CustomMenuItem::new("quick_time_record".to_string(), "快捷记录");
    let white_board = CustomMenuItem::new("white_board".to_string(), "白板");
    let tray_menu = SystemTrayMenu::new()
        .add_item(quick_card_note)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quick_time_record)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(white_board);
    let tray = SystemTray::new().with_menu(tray_menu);
    tauri::Builder::default()
        .plugin(card::init())
        .plugin(article::init())
        .plugin(document::init())
        .plugin(pdf::init())
        .plugin(project::init())
        .plugin(daily_note::init())
        .plugin(time_record::init())
        .plugin(white_board::init())
        .plugin(voice_copy::init())
        .plugin(llm::init())
        .system_tray(tray)
        .on_system_tray_event(|app, event| {
            match event {
                tauri::SystemTrayEvent::MenuItemClick { id, .. } => {
                    if id == "quick_card_note" {
                        create_or_show_quick_window(app, "quick-card", "/quick-card");
                    } else if id == "quick_time_record" {
                        create_or_show_quick_window(app, "quick-time-record", "/quick-time-record");
                    } else if id == "white_board" {
                        create_or_show_quick_window(app, "white-board", "/white-board");
                    }
                }
                _ => {}
            }
        })
        .manage(state::AppState {
            db: std::sync::Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle();
            let conn = init_database("data.db").unwrap();
            let app_state: State<AppState> = handle.state();
            *app_state.db.lock().unwrap() = Some(conn);

            let window = app.get_window("main").unwrap();
            set_shadow(&window, true).expect("Unsupported platform!");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_card_history_list,
            get_article_history_list,
            get_operation_list,
            get_operation_records_by_year,
            write_setting,
            read_setting,
            get_all_fonts,
            get_ali_oss_buckets,
            get_database_path,
            reconnect_database,
            connect_database_by_name,
            show_in_folder,
            get_editor_dir,
            html_to_markdown,
        ])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
}
