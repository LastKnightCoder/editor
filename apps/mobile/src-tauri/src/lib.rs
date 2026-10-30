mod ai;
mod app_feedback;
mod app_update;
mod chunked_sync;
mod collaboration;
mod database;
mod incoming_file;
#[cfg(target_os = "ios")]
mod ios_input_accessory;
mod logger;
mod models;
mod plugin_ai;
mod plugin_ai_skills;
mod plugin_center;
mod plugin_fetch;
mod plugin_files;
mod plugin_permissions;
mod plugin_provider;
mod plugin_socket;
mod plugin_transport;
mod plugins;
mod provider_settings;
mod reading_font;
mod remote_resource_cache;
mod resource_upload;
mod setting;
mod sync;
mod tts_settings;

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
        .plugin(tauri_plugin_native_speech::init())
        .invoke_handler(tauri::generate_handler![
            ai::ai_library_acquire,
            ai::ai_library_assert,
            ai::ai_library_release,
            ai::ai_run_active,
            ai::ai_session_create,
            ai::ai_session_read,
            ai::ai_session_commit,
            ai::ai_session_patch,
            ai::ai_session_remove,
            ai::ai_session_list,
            ai::ai_session_stage_open,
            ai::ai_session_stage_write,
            ai::ai_session_stage_finish,
            ai::ai_model_config,
            ai::ai_http_context,
            ai::ai_mcp_context,
            ai::ai_http_dispose,
            ai::ai_http_open,
            ai::ai_http_upload,
            ai::ai_http_response,
            ai::ai_http_read,
            ai::ai_http_cancel,
            logger::app_log,
            app_feedback::app_feedback_image_write,
            app_feedback::app_feedback_image_discard,
            app_feedback::app_feedback_submit,
            app_update::app_update_check,
            app_update::app_update_download,
            app_update::app_update_install,
            reading_font::reading_font_catalog,
            reading_font::reading_font_installed,
            reading_font::reading_font_download,
            reading_font::reading_font_cancel_download,
            reading_font::reading_font_remove,
            reading_font::reading_font_read,
            plugin_center::plugin_center_refresh,
            plugin_center::plugin_center_config,
            plugin_center::plugin_center_request,
            plugin_center::plugin_center_stage,
            plugin_center::plugin_center_commit,
            provider_settings::plugin_provider_save,
            provider_settings::plugin_provider_select,
            tts_settings::plugin_tts_mutate,
            plugin_transport::plugin_transport_connect,
            plugin_transport::plugin_transport_disconnect,
            plugin_transport::plugin_transport_reply,
            plugin_socket::plugin_socket_open,
            plugin_socket::plugin_socket_send,
            plugin_socket::plugin_socket_receive,
            plugin_socket::plugin_socket_close,
            plugin_socket::plugin_socket_dispose,
            plugin_fetch::plugin_fetch_open,
            plugin_fetch::plugin_fetch_upload,
            plugin_fetch::plugin_fetch_response,
            plugin_fetch::plugin_fetch_read,
            plugin_fetch::plugin_fetch_buffer,
            plugin_files::plugin_file_read,
            plugin_files::plugin_file_write,
            plugin_fetch::plugin_fetch_cancel,
            plugin_permissions::plugin_permissions_read,
            plugin_permissions::plugin_permissions_reset,
            plugin_permissions::plugin_permissions_usage,
            plugin_permissions::plugin_permissions_write,
            plugin_ai::plugin_ai_register,
            plugin_ai::plugin_ai_unregister,
            plugin_ai::plugin_ai_prepare,
            plugin_ai::plugin_ai_begin,
            plugin_ai::plugin_ai_finish,
            plugin_ai::plugin_ai_status,
            plugin_ai::plugin_ai_info,
            plugin_ai::plugin_ai_configure,
            plugin_ai::plugin_ai_revoke,
            plugin_ai::plugin_ai_running,
            plugin_ai::plugin_ai_usage,
            plugin_ai::plugin_ai_cancel,
            plugin_ai_skills::plugin_ai_skill_sources,
            plugin_ai_skills::plugin_ai_skill_read,
            plugins::plugin_packages,
            plugins::plugin_apply_pending,
            plugins::plugin_stage,
            plugins::plugin_commit,
            plugins::plugin_cancel,
            plugins::plugin_restore,
            plugins::plugin_set_enabled,
            plugins::plugin_uninstall,
            database::plugin_data_read,
            database::plugin_flashcards,
            database::plugin_app_query,
            database::plugin_app_refs,
            database::plugin_entity_target,
            database::plugin_own_read,
            database::plugin_own_write,
            database::plugin_tasks_read,
            database::plugin_tasks_write,
            database::plugin_data_write,
            database::plugin_data_operations,
            database::plugin_kv_read,
            database::plugin_kv_write,
            database::plugin_kv_clear,
            setting::bootstrap_app,
            setting::read_setting_json,
            setting::write_setting_json,
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
            database::entity_context_get,
            database::entity_context_resolve_entities,
            database::entity_refs_pending,
            database::entity_refs_apply,
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
            database::todo_get_assistant_states,
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
            resource_upload::resource_upload_begin,
            resource_upload::resource_upload_write,
            resource_upload::resource_upload_cancel,
            resource_upload::upload_resource,
            resource_upload::resource_upload_test,
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
            collaboration::collab_input_draft,
            collaboration::collab_cache_read,
            collaboration::collab_cache_discard,
            collaboration::collab_cache_snapshot,
            collaboration::collab_cache_append,
            collaboration::collab_cache_list,
            collaboration::collab_node_views,
            collaboration::collab_update_node_view,
            database::collab_bind_content,
            database::collab_get_binding,
            database::collab_list_bindings,
            database::collab_unbind_content,
            database::collab_project_content,
            incoming_file::incoming_file_take,
            request_background
        ])
        .setup(|app| {
            // 最先打开日志文件，后续所有模块的启动输出才能落盘
            logger::init(app.handle());
            #[cfg(target_os = "ios")]
            {
                use tauri::Manager;
                app.manage(incoming_file::PendingIncomingFile::default());
                if let Some(main_webview) = app.get_webview_window("main") {
                    let _ = main_webview
                        .with_webview(|webview| ios_input_accessory::hide(webview.inner()));
                }
            }
            // 启动后后台补齐缺失的封面缩略图，避免列表打开时在关键路径现场解码全尺寸图
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                resource_upload::prewarm_resource_thumbs(handle).await;
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            #[cfg(target_os = "ios")]
            if let tauri::RunEvent::Opened { urls } = _event {
                incoming_file::receive_opened(_app, urls);
            }
        });
}
