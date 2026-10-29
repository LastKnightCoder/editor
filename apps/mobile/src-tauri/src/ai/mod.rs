pub(crate) mod install;
pub(crate) mod lifecycle;
mod network;
pub(crate) mod store;
pub(crate) mod sync;

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde_json::Value;
use tauri::{AppHandle, WebviewWindow};

use store::{CommitSession, CreateSession, SessionChunk, SessionInfo, Store};

fn window_allowed(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("AI_LIBRARY_CHANGED:窗口不可调用 AI 原生宿主".into());
    }
    Ok(())
}
fn with_store<T>(
    app: &AppHandle,
    lease_id: &str,
    apply: impl FnOnce(Store) -> Result<T, String>,
) -> Result<T, String> {
    lifecycle::with_lease(lease_id, |lease| {
        let store = Store {
            root: crate::setting::resolve_app_dir(app)?,
            database: lease.database_name.clone(),
        };
        store.recover()?;
        apply(store)
    })
}
fn with_session_store<T>(
    app: &AppHandle,
    lease_id: &str,
    session_id: &str,
    owner_can_write: bool,
    apply: impl FnOnce(Store) -> Result<T, String>,
) -> Result<T, String> {
    lifecycle::with_session(lease_id, session_id, owner_can_write, |lease| {
        let store = Store {
            root: crate::setting::resolve_app_dir(app)?,
            database: lease.database_name.clone(),
        };
        store.recover()?;
        apply(store)
    })
}
#[tauri::command]
pub fn ai_library_acquire(
    app: AppHandle,
    window: WebviewWindow,
    database_name: String,
) -> Result<lifecycle::LibraryLease, String> {
    window_allowed(&window)?;
    let name = crate::setting::normalize_database_name(&database_name)?;
    let setting = crate::setting::load_or_init_setting(&app)?;
    if !crate::setting::get_database_items(&setting)
        .iter()
        .any(|item| item.name == name)
    {
        return Err("AI_LIBRARY_CHANGED:数据库未登记".into());
    }
    let lease = lifecycle::acquire(&name)?;
    if let Err(error) = lifecycle::with_lease(&lease.lease_id, |_| {
        crate::database::ensure_database_file(&app, &name)
    }) {
        let _ = lifecycle::release(&lease.lease_id);
        return Err(error);
    }
    if let Err(error) = with_store(&app, &lease.lease_id, |_| Ok(())) {
        let _ = lifecycle::release(&lease.lease_id);
        return Err(error);
    }
    Ok(lease)
}
#[tauri::command]
pub fn ai_library_assert(
    window: WebviewWindow,
    lease_id: String,
) -> Result<lifecycle::LibraryLease, String> {
    window_allowed(&window)?;
    lifecycle::with_lease(&lease_id, |lease| Ok(lease.clone()))
}
#[tauri::command]
pub fn ai_library_release(window: WebviewWindow, lease_id: String) -> Result<(), String> {
    window_allowed(&window)?;
    lifecycle::release(&lease_id)?;
    network::release_leases(std::slice::from_ref(&lease_id));
    cleanup_uploads(std::slice::from_ref(&lease_id));
    Ok(())
}
#[tauri::command]
pub fn ai_run_active(
    window: WebviewWindow,
    lease_id: String,
    run_id: String,
    active: bool,
    session_id: Option<String>,
) -> Result<(), String> {
    window_allowed(&window)?;
    lifecycle::run(&lease_id, &run_id, active, session_id.as_deref())
}
#[tauri::command]
pub fn ai_session_create(
    app: AppHandle,
    window: WebviewWindow,
    lease_id: String,
    input: CreateSession,
) -> Result<SessionInfo, String> {
    window_allowed(&window)?;
    let session_id = input.id.clone();
    with_session_store(&app, &lease_id, &session_id, false, |store| {
        store.create(input)
    })
}
#[tauri::command]
pub fn ai_session_read(
    app: AppHandle,
    window: WebviewWindow,
    lease_id: String,
    session_id: String,
    offset: u64,
) -> Result<SessionChunk, String> {
    window_allowed(&window)?;
    with_store(&app, &lease_id, |store| store.read(&session_id, offset))
}
#[tauri::command]
pub fn ai_session_commit(
    app: AppHandle,
    window: WebviewWindow,
    lease_id: String,
    input: CommitSession,
) -> Result<SessionInfo, String> {
    window_allowed(&window)?;
    let session_id = input.session_id.clone();
    with_session_store(&app, &lease_id, &session_id, true, |store| {
        store.commit(input)
    })
}
#[tauri::command]
pub fn ai_session_patch(
    app: AppHandle,
    window: WebviewWindow,
    lease_id: String,
    session_id: String,
    expected_revision: String,
    patch: Value,
) -> Result<SessionInfo, String> {
    window_allowed(&window)?;
    with_session_store(&app, &lease_id, &session_id, false, |store| {
        store.patch(&session_id, &expected_revision, patch)
    })
}
#[tauri::command]
pub fn ai_session_remove(
    app: AppHandle,
    window: WebviewWindow,
    lease_id: String,
    session_id: String,
    expected_revision: String,
) -> Result<(), String> {
    window_allowed(&window)?;
    with_session_store(&app, &lease_id, &session_id, false, |store| {
        store.remove(&session_id, &expected_revision)
    })
}
#[tauri::command]
pub fn ai_session_list(
    app: AppHandle,
    window: WebviewWindow,
    lease_id: String,
    scope: Option<String>,
    domain_ref: Option<String>,
    filter_domain: bool,
    include_archived: bool,
    offset: u64,
    limit: u64,
) -> Result<Value, String> {
    window_allowed(&window)?;
    with_store(&app, &lease_id, |store| {
        store.list(
            scope.as_deref(),
            domain_ref.as_deref(),
            filter_domain,
            include_archived,
            offset,
            limit,
        )
    })
}

struct Upload {
    lease_id: String,
    path: PathBuf,
    size: usize,
}
fn uploads() -> &'static Mutex<HashMap<String, Upload>> {
    static VALUE: OnceLock<Mutex<HashMap<String, Upload>>> = OnceLock::new();
    VALUE.get_or_init(|| Mutex::new(HashMap::new()))
}
fn cleanup_uploads(leases: &[String]) {
    if let Ok(mut state) = uploads().lock() {
        state.retain(|_, upload| {
            if leases.contains(&upload.lease_id) {
                let _ = fs::remove_file(&upload.path);
                false
            } else {
                true
            }
        });
    }
}
#[tauri::command]
pub fn ai_session_stage_open(
    app: AppHandle,
    window: WebviewWindow,
    lease_id: String,
) -> Result<String, String> {
    window_allowed(&window)?;
    lifecycle::with_lease(&lease_id, |_| Ok(()))?;
    let directory = crate::setting::resolve_app_dir(&app)?.join("ai-transfers");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let path = directory.join(&id);
    OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    let mut state = uploads()
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:上传状态不可用")?;
    if state.len() >= 8 {
        let _ = fs::remove_file(path);
        return Err("AI_STORAGE_FAILED:会话上传过多".into());
    }
    state.insert(
        id.clone(),
        Upload {
            lease_id,
            path,
            size: 0,
        },
    );
    Ok(id)
}
#[tauri::command]
pub fn ai_session_stage_write(
    window: WebviewWindow,
    lease_id: String,
    id: String,
    offset: usize,
    data: String,
) -> Result<(), String> {
    window_allowed(&window)?;
    lifecycle::with_lease(&lease_id, |_| Ok(()))?;
    let bytes = crate::plugin_files::decode_chunk(&data)?;
    let mut state = uploads()
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:上传状态不可用")?;
    let upload = state
        .get_mut(&id)
        .filter(|upload| upload.lease_id == lease_id)
        .ok_or("AI_STORAGE_FAILED:上传已失效")?;
    if offset != upload.size || upload.size + bytes.len() > 32 * 1024 * 1024 {
        return Err("AI_STORAGE_FAILED:上传位置无效或单次提交超过 32 MiB".into());
    }
    OpenOptions::new()
        .append(true)
        .open(&upload.path)
        .and_then(|mut file| file.write_all(&bytes))
        .map_err(|error| error.to_string())?;
    upload.size += bytes.len();
    Ok(())
}
#[tauri::command]
pub fn ai_session_stage_finish(
    app: AppHandle,
    window: WebviewWindow,
    lease_id: String,
    id: String,
    discard: bool,
) -> Result<Option<SessionInfo>, String> {
    window_allowed(&window)?;
    let mut state = uploads()
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:上传状态不可用")?;
    if state
        .get(&id)
        .is_some_and(|upload| upload.lease_id != lease_id)
    {
        return Err("AI_LIBRARY_CHANGED:上传不属于当前租约".into());
    }
    let upload = state.remove(&id).ok_or("AI_STORAGE_FAILED:上传已失效")?;
    drop(state);
    let result = if discard {
        Ok(None)
    } else {
        (serde_json::from_reader(
            std::fs::File::open(&upload.path).map_err(|error| error.to_string())?,
        )
        .map_err(|error| format!("AI_SESSION_INVALID:{error}")))
        .and_then(|input: CommitSession| {
            let session_id = input.session_id.clone();
            with_session_store(&app, &lease_id, &session_id, true, |store| {
                store.commit(input)
            })
        })
        .map(Some)
    };
    let _ = fs::remove_file(upload.path);
    result
}
#[tauri::command]
pub fn ai_model_config(app: AppHandle, window: WebviewWindow) -> Result<Value, String> {
    window_allowed(&window)?;
    Ok(network::public_config(
        &crate::setting::load_or_init_setting(&app)?,
    ))
}
#[tauri::command]
pub fn ai_http_context(
    app: AppHandle,
    window: WebviewWindow,
    lease_id: String,
    provider_id: String,
    model_id: Option<String>,
    expected_model_revision: Option<String>,
) -> Result<Value, String> {
    window_allowed(&window)?;
    let setting = crate::setting::load_or_init_setting(&app)?;
    network::assert_model_revision(&setting, &provider_id, expected_model_revision.as_deref())?;
    let context_id = network::context(&lease_id, &setting, &provider_id, model_id.as_deref())?;
    Ok(serde_json::json!({"contextId":context_id,"config":network::public_config(&setting)}))
}
#[tauri::command]
pub fn ai_mcp_context(
    window: WebviewWindow,
    lease_id: String,
    url: String,
    headers: HashMap<String, String>,
) -> Result<String, String> {
    window_allowed(&window)?;
    network::mcp_context(&lease_id, &url, headers)
}
#[tauri::command]
pub fn ai_http_dispose(window: WebviewWindow, context_id: String) -> Result<(), String> {
    window_allowed(&window)?;
    network::dispose(&context_id)
}
#[tauri::command]
pub fn ai_http_open(
    window: WebviewWindow,
    context_id: String,
    request: network::HttpRequest,
) -> Result<String, String> {
    window_allowed(&window)?;
    network::open(&context_id, request)
}
#[tauri::command]
pub async fn ai_http_upload(
    window: WebviewWindow,
    id: String,
    chunk: Option<String>,
) -> Result<(), String> {
    window_allowed(&window)?;
    network::upload(&id, chunk).await
}
#[tauri::command]
pub async fn ai_http_response(
    window: WebviewWindow,
    id: String,
) -> Result<network::HttpResponse, String> {
    window_allowed(&window)?;
    let result = network::response(&id).await;
    if result.is_err() {
        let _ = network::cancel(&id);
    }
    result
}
#[tauri::command]
pub async fn ai_http_read(window: WebviewWindow, id: String) -> Result<Option<String>, String> {
    window_allowed(&window)?;
    let result = network::read(&id).await;
    if result.is_err() {
        let _ = network::cancel(&id);
    }
    result
}
#[tauri::command]
pub fn ai_http_cancel(window: WebviewWindow, id: String) -> Result<(), String> {
    window_allowed(&window)?;
    network::cancel(&id)
}
