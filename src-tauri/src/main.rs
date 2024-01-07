// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod state;
mod commands;

use tauri::{Manager, State, SystemTray, CustomMenuItem, SystemTrayMenu, SystemTrayMenuItem, AppHandle, Wry};
use tauri::GlobalShortcutManager;
use database::init_database;
use state::AppState;
use commands::{
    insert_one_card,
    find_one_card,
    find_all_cards,
    delete_one_card,
    update_one_card,
    get_tags_by_id,
    get_cards_group_by_tag,
    get_card_history_list,
    get_article_history_list,
    get_operation_list,
    get_operation_records_by_year,
    insert_daily_note,
    update_daily_note,
    delete_daily_note,
    find_daily_note_by_id,
    find_daily_note_by_date,
    find_all_daily_notes,
    create_article,
    update_article,
    update_article_banner_bg,
    update_article_is_top,
    delete_article,
    find_article,
    find_all_articles,
    write_setting,
    read_setting,
    get_all_fonts,
    create_document,
    delete_document,
    update_document,
    get_document_list,
    get_document,
    create_document_item,
    delete_document_item,
    update_document_item,
    get_document_item,
    get_document_items_by_ids,
    get_all_document_items,
    is_document_item_child_of,
    get_document_item_all_parents,
    init_all_document_item_parents,
    init_document_item_parents_by_ids,
    get_ali_oss_buckets,
    get_database_path,
    reconnect_database,
    create_time_record,
    update_time_record,
    delete_time_record,
    get_time_record_by_id,
    get_time_records_by_date,
    get_all_time_records,
    get_time_records_by_time_range,
    get_all_event_types,
    get_all_time_types,
};

fn create_or_show_quick_window(app: &AppHandle<Wry>, label: &str, url: &str) {
    let quick_window = app.get_window(label);
    // 如果不存在，则创建
    if quick_window.is_none() {
        tauri::WindowBuilder::new(app, label, tauri::WindowUrl::App(url.into()))
            .title(label)
            .decorations(false)
            .inner_size(500.0, 400.0)
            .fullscreen(false)
            .resizable(true)
            .always_on_top(true)
            .transparent(true)
            .disable_file_drop_handler()
            .build()
            .unwrap();
    } else {
        // 如果存在且是最小化状态，则取消最小化
        let quick_window = quick_window.unwrap();
        if quick_window.is_minimized().unwrap() {
            quick_window.unminimize().unwrap();
        }
    }
}

fn main() {
    let quit = CustomMenuItem::new("quick_card_note".to_string(), "快捷卡片");
    let hide = CustomMenuItem::new("quick_time_record".to_string(), "快捷记录");
    let tray_menu = SystemTrayMenu::new()
        .add_item(quit)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(hide);
    let tray = SystemTray::new().with_menu(tray_menu);
    tauri::Builder::default()
        .system_tray(tray)
        .on_system_tray_event(|app, event| {
            match event {
                tauri::SystemTrayEvent::MenuItemClick { id, .. } => {
                    if id == "quick_card_note" {
                        create_or_show_quick_window(app, "quick-card", "/quick-card");
                    } else if id == "quick_time_record" {
                        create_or_show_quick_window(app, "quick-time-record", "/quick-time-record");
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
            let conn = init_database().unwrap();
            let app_state: State<AppState> = handle.state();
            *app_state.db.lock().unwrap() = Some(conn);

            let handle_clone = handle.clone();
            let handel_clone2 = handle.clone();

            app.global_shortcut_manager()
                .register("CommandOrControl+Shift+D", move || {
                    create_or_show_quick_window(&handle_clone, "quick-card", "/quick-card");
                })
                .expect("failed to register shortcut");
            app.global_shortcut_manager()
                .register("CommandOrControl+Shift+T", move || {
                    create_or_show_quick_window(&handel_clone2, "quick-time-record", "/quick-time-record");
                })
                .expect("failed to register shortcut");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            insert_one_card,
            find_one_card,
            find_all_cards,
            delete_one_card,
            update_one_card,
            get_tags_by_id,
            get_cards_group_by_tag,
            get_card_history_list,
            get_article_history_list,
            get_operation_list,
            get_operation_records_by_year,
            insert_daily_note,
            update_daily_note,
            delete_daily_note,
            find_daily_note_by_id,
            find_daily_note_by_date,
            find_all_daily_notes,
            create_article,
            update_article,
            update_article_banner_bg,
            update_article_is_top,
            delete_article,
            find_article,
            find_all_articles,
            write_setting,
            read_setting,
            get_all_fonts,
            create_document,
            delete_document,
            update_document,
            get_document_list,
            get_document,
            create_document_item,
            delete_document_item,
            update_document_item,
            get_document_item,
            get_document_items_by_ids,
            get_all_document_items,
            is_document_item_child_of,
            get_document_item_all_parents,
            init_all_document_item_parents,
            init_document_item_parents_by_ids,
            get_ali_oss_buckets,
            get_database_path,
            reconnect_database,
            create_time_record,
            update_time_record,
            delete_time_record,
            get_time_record_by_id,
            get_time_records_by_date,
            get_all_time_records,
            get_time_records_by_time_range,
            get_all_event_types,
            get_all_time_types,
        ])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
}
