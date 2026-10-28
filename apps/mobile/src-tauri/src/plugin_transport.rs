use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, WebviewWindow};
use tokio::sync::oneshot;

use crate::setting::{get_active_database_name, load_or_init_setting};

type Reply = Result<Value, String>;

struct Host {
    token: String,
    database: String,
}
#[derive(Default)]
struct Transport {
    host: Option<Host>,
    pending: HashMap<String, oneshot::Sender<Reply>>,
}
fn transport() -> &'static Mutex<Transport> {
    static STATE: OnceLock<Mutex<Transport>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(Transport::default()))
}

struct PendingRequest(String);
impl Drop for PendingRequest {
    fn drop(&mut self) {
        if let Ok(mut state) = transport().lock() {
            state.pending.remove(&self.0);
        }
    }
}
pub(crate) fn window_allowed(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("插件传输仅属于主窗口".into());
    }
    Ok(())
}
fn assert_host(state: &Transport, token: &str) -> Result<(), String> {
    if state.host.as_ref().is_none_or(|host| host.token != token) {
        return Err("插件宿主会话已结束".into());
    }
    Ok(())
}
pub(crate) fn with_host<T>(
    token: &str,
    run: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    assert_host(&state, token)?;
    run()
}
pub(crate) fn with_database<T>(
    token: &str,
    database: &str,
    run: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    assert_host(&state, token)?;
    if state
        .host
        .as_ref()
        .is_none_or(|host| host.database != database)
    {
        return Err("插件工作区已失效".into());
    }
    run()
}

fn release(state: &mut Transport) {
    state.host = None;
    for (_, pending) in state.pending.drain() {
        let _ = pending.send(Err("插件宿主会话已结束".into()));
    }
    crate::plugin_fetch::invalidate();
    crate::plugin_socket::invalidate();
    crate::plugin_files::invalidate();
    crate::resource_upload::invalidate_uploads();
}

pub(crate) fn replace_database<T>(
    database: &str,
    run: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    if state
        .host
        .as_ref()
        .is_some_and(|host| host.database == database)
    {
        release(&mut state);
    }
    run()
}

pub(crate) fn invalidate() {
    if let Ok(mut state) = transport().lock() {
        release(&mut state);
    }
}

#[tauri::command]
pub fn plugin_transport_connect(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
) -> Result<String, String> {
    window_allowed(&window)?;
    if get_active_database_name(&load_or_init_setting(&app)?) != database {
        return Err("插件工作区已失效".into());
    }
    let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    release(&mut state);
    let token = uuid::Uuid::new_v4().to_string();
    state.host = Some(Host {
        token: token.clone(),
        database,
    });
    Ok(token)
}

#[tauri::command]
pub fn plugin_transport_disconnect(window: WebviewWindow, token: String) -> Result<(), String> {
    window_allowed(&window)?;
    let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    if assert_host(&state, &token).is_ok() {
        release(&mut state);
    }
    Ok(())
}

#[tauri::command]
pub fn plugin_transport_reply(
    window: WebviewWindow,
    token: String,
    request_id: String,
    result: Option<Value>,
    error: Option<String>,
) -> Result<(), String> {
    window_allowed(&window)?;
    let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    assert_host(&state, &token)?;
    if let Some(pending) = state.pending.remove(&request_id) {
        let _ = pending.send(match error {
            Some(error) => Err(error),
            None => Ok(result.unwrap_or(Value::Null)),
        });
    }
    Ok(())
}

pub(crate) fn host_token(database: &str) -> Result<String, String> {
    let state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    let host = state.host.as_ref().ok_or("同步或上传插件尚未就绪")?;
    if host.database != database {
        return Err("插件工作区已失效".into());
    }
    Ok(host.token.clone())
}

pub(crate) async fn request(app: &AppHandle, token: &str, mut message: Value) -> Reply {
    let id = uuid::Uuid::new_v4().to_string();
    let (sender, receiver) = oneshot::channel();
    {
        let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
        assert_host(&state, token)?;
        if state.pending.len() >= 32 {
            return Err("插件传输任务过多，请稍后重试".into());
        }
        state.pending.insert(id.clone(), sender);
    }
    let _pending = PendingRequest(id.clone());
    message["requestId"] = json!(id);
    message["token"] = json!(token);
    let result = match app.emit_to("main", "plugin-provider-request", message) {
        Err(error) => Err(error.to_string()),
        Ok(()) => receiver
            .await
            .unwrap_or_else(|_| Err("插件宿主已断开".into())),
    };
    let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    state.pending.remove(&id);
    assert_host(&state, token)?;
    result
}

#[cfg(test)]
pub(crate) fn test_host(token: &str) -> std::sync::MutexGuard<'static, ()> {
    static TEST: Mutex<()> = Mutex::new(());
    let guard = TEST.lock().unwrap_or_else(|error| error.into_inner());
    let mut state = transport().lock().unwrap();
    release(&mut state);
    state.host = Some(Host {
        token: token.into(),
        database: "fixture.db".into(),
    });
    guard
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replacement_invalidates_same_named_workspace_even_on_failure() {
        let _guard = test_host("replacement");
        assert!(with_database("replacement", "other.db", || Ok(())).is_err());
        assert!(with_database("replacement", "fixture.db", || Ok(())).is_ok());
        let result: Result<(), String> = replace_database("fixture.db", || Err("安装失败".into()));
        assert!(result.is_err());
        assert!(with_database("replacement", "fixture.db", || Ok(())).is_err());
    }

    #[test]
    fn cancelled_wait_releases_its_request_slot() {
        let _guard = test_host("pending");
        let id = uuid::Uuid::new_v4().to_string();
        let (sender, _receiver) = oneshot::channel();
        transport()
            .lock()
            .unwrap()
            .pending
            .insert(id.clone(), sender);
        {
            let _pending = PendingRequest(id.clone());
        }
        assert!(!transport().lock().unwrap().pending.contains_key(&id));
    }
    #[tokio::test]
    async fn disconnect_rejects_pending() {
        let _guard = test_host("disconnect");
        let (sender, receiver) = oneshot::channel();
        let mut state = Transport::default();
        state.host = Some(Host {
            token: "old".into(),
            database: "data.db".into(),
        });
        state.pending.insert("operation".into(), sender);
        release(&mut state);
        assert!(receiver.await.unwrap().is_err());
        assert!(assert_host(&state, "old").is_err());
    }
}
