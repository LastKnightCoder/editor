mod collaboration;
mod database;
mod models;
mod network_policy;
mod provider_config;
mod remote_resource_cache;
mod resource_upload;
mod setting;
mod sync;

use rusqlite::ffi::sqlite3_auto_extension;
use sqlite_vec::sqlite3_vec_init;
use std::sync::Once;

static SQLITE_VEC_INIT: Once = Once::new();

fn init_sqlite_extensions() {
    SQLITE_VEC_INIT.call_once(|| unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
    });
}

#[tauri::command]
fn request_background(app: tauri::AppHandle) {
    #[cfg(target_os = "android")]
    {
        use jni::objects::JValue;
        use tauri::Manager;

        if let Some(main_webview) = app.get_webview_window("main") {
            let _ = main_webview.with_webview(|webview| {
                webview.jni_handle().exec(|env, activity, _webview| {
                    let _ =
                        env.call_method(activity, "moveTaskToBack", "(Z)Z", &[JValue::from(true)]);
                });
            });
            return;
        }
    }

    #[cfg(target_os = "ios")]
    {
        return;
    }

    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_sqlite_extensions();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            setting::bootstrap_app,
            setting::read_setting_json,
            setting::write_setting_json,
            setting::verify_github_token,
            setting::list_github_repos,
            setting::list_github_branches,
            setting::verify_s3_credentials,
            setting::verify_webdav_credentials,
            setting::verify_alioss_credentials,
            database::list_databases,
            database::get_active_database_size,
            database::create_database,
            database::set_active_database,
            database::get_home_stats,
            database::get_cards_overview,
            database::search_all_content,
            database::get_card_detail,
            database::get_content_detail,
            database::create_quick_card,
            database::update_content,
            database::update_card_tags,
            database::update_card_links,
            database::get_cards_by_ids,
            database::delete_card,
            database::get_database_schema_status,
            database::create_content,
            database::diary_list_entries,
            database::diary_get_entry,
            database::diary_upsert_entry,
            database::diary_delete_entry,
            database::diary_delete_segment,
            database::diary_get_tag_settings,
            database::diary_upsert_tag_setting,
            database::diary_rename_tag_setting,
            database::diary_delete_tag_setting,
            database::diary_update_tags,
            database::todo_list_groups,
            database::todo_get_system_groups,
            database::todo_create_group,
            database::todo_update_group,
            database::todo_archive_group,
            database::todo_reorder_groups,
            database::todo_get_group_stats,
            database::todo_get_system_group_stats,
            database::todo_list_items,
            database::todo_list_items_by_type,
            database::todo_create_item,
            database::todo_create_item_relative,
            database::todo_update_item,
            database::todo_toggle_complete_cascade,
            database::todo_move_and_reorder,
            database::todo_archive_item,
            database::todo_delete_item,
            database::todo_delete_item_cascade,
            database::todo_get_recurrence,
            database::todo_get_recurrence_by_item,
            database::todo_create_recurrence,
            database::todo_update_recurrence,
            database::todo_delete_recurrence,
            database::todo_delete_recurrence_by_item,
            database::todo_get_recurrence_completions,
            database::todo_get_recurrence_completion,
            database::todo_complete_recurrence,
            database::todo_uncomplete_recurrence,
            database::todo_skip_recurrence,
            database::article_list,
            database::article_get,
            database::article_create,
            database::article_update,
            database::article_delete,
            database::project_list,
            database::project_get,
            database::project_item_list,
            database::project_create,
            database::project_update,
            database::project_delete,
            database::project_item_create,
            database::project_item_update,
            database::project_item_delete,
            database::pomodoro_list_presets,
            database::pomodoro_create_preset,
            database::pomodoro_update_preset,
            database::pomodoro_archive_preset,
            database::pomodoro_reorder_presets,
            database::pomodoro_delete_preset,
            database::pomodoro_get_active_session,
            database::pomodoro_start_session,
            database::pomodoro_pause_session,
            database::pomodoro_resume_session,
            database::pomodoro_stop_session,
            database::pomodoro_list_sessions,
            database::pomodoro_update_session,
            database::pomodoro_delete_session,
            database::pomodoro_delete_sessions,
            database::calendar_get_all,
            database::calendar_create,
            database::calendar_update,
            database::calendar_delete,
            database::calendar_group_get_all,
            database::calendar_event_get_by_id,
            database::calendar_event_get_by_date_range,
            database::calendar_event_create,
            database::calendar_event_update,
            database::calendar_event_delete,
            database::pomodoro_summary_today,
            database::pomodoro_summary_total,
            database::pomodoro_summary_daily,
            database::flashcard_list_decks,
            database::flashcard_create_deck,
            database::flashcard_update_deck,
            database::flashcard_delete_deck,
            database::flashcard_list_cards,
            database::flashcard_get_card,
            database::flashcard_create_card,
            database::flashcard_update_card,
            database::flashcard_delete_card,
            database::flashcard_get_review_queue,
            database::flashcard_submit_review,
            database::flashcard_review_stats,
            resource_upload::upload_resource,
            resource_upload::read_resource_bytes,
            resource_upload::read_resource_thumb,
            remote_resource_cache::remote_resource_to_local,
            sync::sync_check_versions,
            sync::sync_upload_database,
            sync::sync_download_database,
            sync::resource_sync_refresh,
            sync::resource_sync_start,
            sync::resource_sync_retry_failed,
            sync::resource_sync_cancel,
            sync::resource_sync_get_progress,
            sync::resource_sync_get_status,
            collaboration::collab_get_identity,
            collaboration::collab_update_nickname,
            collaboration::collab_request,
            database::collab_bind_content,
            database::collab_get_binding,
            database::collab_list_bindings,
            database::collab_unbind_content,
            database::collab_project_content,
            database::collab_knowledge_mapping,
            request_background
        ])
        .setup(|app| {
            // 启动后后台补齐缺失的封面缩略图，避免列表打开时在关键路径现场解码全尺寸图
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                resource_upload::prewarm_resource_thumbs(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
