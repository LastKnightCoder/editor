use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, io::Write, path::Path, sync::Mutex};
use tauri::{AppHandle, WebviewWindow};

static STORE_LOCK: Mutex<()> = Mutex::new(());
type Snapshot = BTreeMap<String, BTreeMap<String, Grant>>;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Grant {
    Granted,
    Blocked,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Store {
    version: u8,
    grants: BTreeMap<String, Snapshot>,
    #[serde(default)]
    usage: BTreeMap<String, BTreeMap<String, BTreeMap<String, Usage>>>,
}
fn read(path: &Path) -> Result<Store, String> {
    match fs::read(path) {
        Ok(bytes) => {
            let store: Store =
                serde_json::from_slice(&bytes).map_err(|_| "插件授权文件损坏，未授予任何权限")?;
            if store.version != 1 {
                return Err("插件授权文件版本不受支持".into());
            }
            Ok(store)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Store {
            version: 1,
            grants: BTreeMap::new(),
            usage: BTreeMap::new(),
        }),
        Err(error) => Err(error.to_string()),
    }
}
fn write(path: &Path, store: &Store) -> Result<(), String> {
    let parent = path.parent().ok_or("授权文件路径无效")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = parent.join(format!("plugin-permissions-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(&serde_json::to_vec(store).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        fs::rename(&temporary, path).map_err(|error| error.to_string())
    })();
    let _ = fs::remove_file(&temporary);
    result
}
fn supported(permission: &str) -> bool {
    matches!(
        permission,
        "cards:read"
            | "cards:write"
            | "cards:delete"
            | "articles:read"
            | "articles:write"
            | "articles:delete"
            | "projects:read"
            | "projects:write"
            | "projects:delete"
            | "documents:read"
            | "documents:write"
            | "documents:delete"
            | "todos:read"
            | "todos:write"
            | "todos:delete"
            | "calendar:read"
            | "calendar:write"
            | "calendar:delete"
            | "flashcards:read"
            | "flashcards:write"
    )
}
#[tauri::command]
pub fn plugin_permissions_read(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
) -> Result<Snapshot, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::plugin_transport::with_database(&token, &database, || {
        let _guard = STORE_LOCK.lock().map_err(|_| "插件授权存储不可用")?;
        let path = crate::setting::resolve_app_dir(&app)?.join("plugin-permissions.json");
        Ok(read(&path)?.grants.remove(&database).unwrap_or_default())
    })
}
#[tauri::command]
pub fn plugin_permissions_write(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
    permission: String,
    grant: Option<Grant>,
) -> Result<(), String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    if !supported(&permission) {
        return Err("当前移动宿主不支持此业务权限".into());
    }
    crate::plugin_transport::with_database(&token, &database, || {
        let _guard = STORE_LOCK.lock().map_err(|_| "插件授权存储不可用")?;
        let path = crate::setting::resolve_app_dir(&app)?.join("plugin-permissions.json");
        let mut store = read(&path)?;
        let permissions = store
            .grants
            .entry(database.clone())
            .or_default()
            .entry(plugin_id)
            .or_default();
        if let Some(grant) = grant {
            permissions.insert(permission, grant);
        } else {
            permissions.remove(&permission);
        }
        write(&path, &store)
    })
}
pub(crate) fn forget(app: &AppHandle, plugin_id: &str) -> Result<(), String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "插件授权存储不可用")?;
    let path = crate::setting::resolve_app_dir(app)?.join("plugin-permissions.json");
    let mut store = read(&path)?;
    for workspace in store.grants.values_mut() {
        workspace.remove(plugin_id);
    }
    for workspace in store.usage.values_mut() {
        workspace.remove(plugin_id);
    }
    write(&path, &store)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_permission_scope_matches_sdk() {
        let sdk = include_str!("../../../../packages/plugins/src/portable.ts");
        let declaration = sdk
            .split("export const MOBILE_DATA_PERMISSIONS = [")
            .nth(1)
            .unwrap()
            .split("] as const")
            .next()
            .unwrap();
        for permission in declaration.split('"').filter(|part| part.contains(':')) {
            assert!(supported(permission), "原生遗漏权限：{permission}");
        }
        for permission in [
            "whiteboards:read",
            "notebooks:read",
            "chats:read",
            "ai:chat",
        ] {
            assert!(!supported(permission));
        }
    }
    #[test]
    fn local_grants_roundtrip_and_corruption_does_not_grant() {
        let dir = std::env::temp_dir().join(format!("tau-permissions-{}", uuid::Uuid::new_v4()));
        let path = dir.join("permissions.json");
        let mut store = read(&path).unwrap();
        store
            .grants
            .entry("one.db".into())
            .or_default()
            .entry("example".into())
            .or_default()
            .insert("cards:read".into(), Grant::Granted);
        write(&path, &store).unwrap();
        let stored = read(&path).unwrap();
        assert!(stored.grants["one.db"]["example"].contains_key("cards:read"));
        assert!(!stored.grants.contains_key("two.db"));
        fs::write(&path, b"{broken").unwrap();
        assert!(read(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"{broken");
        fs::remove_dir_all(dir).unwrap();
    }
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct Usage {
    read: u64,
    write: u64,
    delete: u64,
}
#[tauri::command]
pub fn plugin_permissions_usage(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
    counts: Option<Usage>,
) -> Result<Usage, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    crate::plugin_transport::with_database(&token, &database, || {
        let _guard = STORE_LOCK.lock().map_err(|_| "插件授权存储不可用")?;
        let path = crate::setting::resolve_app_dir(&app)?.join("plugin-permissions.json");
        let mut store = read(&path)?;
        let days = store
            .usage
            .entry(database.clone())
            .or_default()
            .entry(plugin_id)
            .or_default();
        let now = chrono::Local::now();
        let first = (now - chrono::Duration::days(6))
            .format("%Y-%m-%d")
            .to_string();
        days.retain(|day, _| day >= &first);
        let mut total = Usage::default();
        if let Some(counts) = &counts {
            let day = days.entry(now.format("%Y-%m-%d").to_string()).or_default();
            day.read = day.read.checked_add(counts.read).ok_or("调用次数超限")?;
            day.write = day.write.checked_add(counts.write).ok_or("调用次数超限")?;
            day.delete = day
                .delete
                .checked_add(counts.delete)
                .ok_or("调用次数超限")?;
        }
        for day in days.values() {
            total.read = total.read.saturating_add(day.read);
            total.write = total.write.saturating_add(day.write);
            total.delete = total.delete.saturating_add(day.delete);
        }
        if counts.is_some() {
            write(&path, &store)?;
        }
        Ok(total)
    })
}

#[tauri::command]
pub fn plugin_permissions_reset(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
) -> Result<(), String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::plugin_transport::with_database(&token, &database, || {
        let _guard = STORE_LOCK.lock().map_err(|_| "插件授权存储不可用")?;
        let path = crate::setting::resolve_app_dir(&app)?.join("plugin-permissions.json");
        if read(&path).is_ok() {
            return Err("授权记录正常，无需重置".into());
        }
        fs::rename(
            &path,
            path.with_extension(format!("invalid-{}.json", uuid::Uuid::new_v4())),
        )
        .map_err(|e| e.to_string())?;
        write(
            &path,
            &Store {
                version: 1,
                grants: BTreeMap::new(),
                usage: BTreeMap::new(),
            },
        )
    })
}
