use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};
use tauri::AppHandle;

const LIMIT: u64 = 32 * 1024 * 1024;
static STORE_LOCK: Mutex<()> = Mutex::new(());
static DOWNLOADS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
struct Download {
    id: String,
    cancelled: Arc<AtomicBool>,
}
impl Download {
    fn begin(id: &str) -> Result<Self, String> {
        let mut downloads = DOWNLOADS
            .get_or_init(Default::default)
            .lock()
            .map_err(fail)?;
        if downloads.contains_key(id) || downloads.len() >= 4 {
            return Err(fail("已有下载任务，请先等待或取消"));
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        downloads.insert(id.to_string(), cancelled.clone());
        Ok(Self {
            id: id.to_string(),
            cancelled,
        })
    }
    fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::SeqCst) {
            Err(fail("下载已取消"))
        } else {
            Ok(())
        }
    }
    async fn request<T>(
        &self,
        future: impl std::future::Future<Output = Result<T, reqwest::Error>>,
    ) -> Result<T, String> {
        self.check()?;
        tokio::pin!(future);
        loop {
            tokio::select! {
                result = &mut future => return result.map_err(fail),
                _ = tokio::time::sleep(std::time::Duration::from_millis(50)) => self.check()?,
            }
        }
    }
}
impl Drop for Download {
    fn drop(&mut self) {
        if let Ok(mut downloads) = DOWNLOADS.get_or_init(Default::default).lock() {
            downloads.remove(&self.id);
        }
    }
}

fn fail(error: impl std::fmt::Display) -> String {
    format!("PLUGIN_PACKAGE: {error}")
}
fn identifier(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 128
        || id.starts_with('.')
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    {
        return Err(fail("插件身份无效"));
    }
    Ok(())
}
fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = crate::setting::resolve_app_dir(app)?.join("portable-plugins");
    fs::create_dir_all(&root).map_err(fail)?;
    Ok(root)
}
fn remove(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(fail)?;
    }
    Ok(())
}
fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let temporary = path.with_extension("tmp");
    let mut file = fs::File::create(&temporary).map_err(fail)?;
    file.write_all(serde_json::to_string(value).map_err(fail)?.as_bytes())
        .map_err(fail)?;
    file.sync_all().map_err(fail)?;
    fs::rename(temporary, path).map_err(fail)
}
fn read_json(path: &Path) -> Result<Value, String> {
    serde_json::from_slice(&fs::read(path).map_err(fail)?).map_err(fail)
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn safe_path(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.contains('\\')
        || name.contains(':')
        || name.starts_with('/')
        || name
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(fail("包路径越界"));
    }
    Ok(())
}
fn dev_only() -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err(fail("生产构建未开放跨端插件安装"));
    }
    Ok(())
}
fn recover(directory: &Path) -> Result<(), String> {
    if !directory.join("switch.json").exists() {
        return Ok(());
    }
    let current = directory.join("current");
    let next = directory.join("next");
    let backup = directory.join("backup");
    if next.exists() {
        if current.exists() {
            remove(&backup)?;
            fs::rename(&current, &backup).map_err(fail)?;
        }
        fs::rename(&next, &current).map_err(fail)?;
    } else if !current.exists() && backup.exists() {
        fs::rename(&backup, &current).map_err(fail)?;
    }
    fs::remove_file(directory.join("switch.json")).map_err(fail)?;
    Ok(())
}
fn switch(directory: &Path) -> Result<(), String> {
    write_json(&directory.join("switch.json"), &json!({"version":1}))?;
    recover(directory)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    manifest: Value,
    code: String,
    css: Option<String>,
}
fn artifact(directory: &Path) -> Result<Artifact, String> {
    let manifest = read_json(&directory.join("manifest.json"))?;
    if manifest["formatVersion"] != 3
        || manifest["platform"] != "portable"
        || manifest["profile"] != "web-v1"
        || !manifest["backend"].is_null()
    {
        return Err(fail("只接受 web-v1 跨端包"));
    }
    identifier(
        manifest["id"]
            .as_str()
            .ok_or_else(|| fail("缺少插件身份"))?,
    )?;
    let integrity = manifest["integrity"]
        .as_object()
        .ok_or_else(|| fail("缺少摘要清单"))?;
    for (name, expected) in integrity {
        safe_path(name)?;
        let metadata = fs::symlink_metadata(directory.join(name)).map_err(fail)?;
        if !metadata.is_file() || metadata.len() > LIMIT {
            return Err(fail("包文件无效"));
        }
        if Some(hash(&fs::read(directory.join(name)).map_err(fail)?).as_str()) != expected.as_str()
        {
            return Err(fail("包文件摘要不匹配"));
        }
    }
    let read_entry = |field: &str| -> Result<String, String> {
        let name = manifest[field].as_str().ok_or_else(|| fail("缺少入口"))?;
        safe_path(name)?;
        if !integrity.contains_key(name) {
            return Err(fail("入口未声明摘要"));
        }
        fs::read_to_string(directory.join(name)).map_err(fail)
    };
    let code = read_entry("main")?;
    let css = if manifest["styles"].is_string() {
        Some(read_entry("styles")?)
    } else {
        None
    };
    Ok(Artifact {
        manifest,
        code,
        css,
    })
}
fn extract(bytes: &[u8], destination: &Path) -> Result<Artifact, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(fail)?;
    if zip.len() > 2048 {
        return Err(fail("包文件过多"));
    }
    let mut paths = HashSet::new();
    let mut total = 0;
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(fail)?;
        let name = entry.name().trim_end_matches('/').to_string();
        safe_path(&name)?;
        if !paths.insert(name.clone())
            || entry
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(fail("重复路径或符号链接"));
        }
        if entry.is_dir() {
            continue;
        }
        if total + entry.size() > LIMIT || entry.size() > LIMIT {
            return Err(fail("解压体积过大"));
        }
        let target = destination.join(name);
        fs::create_dir_all(target.parent().unwrap()).map_err(fail)?;
        let mut output = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(target)
            .map_err(fail)?;
        let copied =
            std::io::copy(&mut entry.by_ref().take(LIMIT + 1), &mut output).map_err(fail)?;
        if copied > LIMIT || copied != entry.size() {
            return Err(fail("解压体积与声明不符"));
        }
        total += copied;
        output.sync_all().map_err(fail)?;
    }
    if !destination.join("manifest.json").exists() {
        let entries: Vec<_> = fs::read_dir(destination)
            .map_err(fail)?
            .collect::<Result<_, _>>()
            .map_err(fail)?;
        if entries.len() != 1 || !entries[0].file_type().map_err(fail)?.is_dir() {
            return Err(fail("压缩包必须只有一个插件根目录"));
        }
        let nested = entries[0].path();
        let value = artifact(&nested)?;
        if value.manifest["id"].as_str() != nested.file_name().and_then(|name| name.to_str()) {
            return Err(fail("压缩包根目录身份不匹配"));
        }
        for entry in fs::read_dir(&nested).map_err(fail)? {
            let entry = entry.map_err(fail)?;
            fs::rename(entry.path(), destination.join(entry.file_name())).map_err(fail)?;
        }
        fs::remove_dir(nested).map_err(fail)?;
    }
    artifact(destination)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstallSource {
    id: String,
    version: String,
    url: String,
    sha256: String,
    size: u64,
}

#[tauri::command]
pub async fn plugin_stage(app: AppHandle, source: InstallSource) -> Result<Value, String> {
    stage_package(app, source, None).await
}
pub(crate) async fn stage_package(
    app: AppHandle,
    source: InstallSource,
    center: Option<Value>,
) -> Result<Value, String> {
    dev_only()?;
    identifier(&source.id)?;
    if source.size == 0 || source.size > LIMIT || source.sha256.len() != 64 {
        return Err(fail("下载描述无效"));
    }
    let url = url::Url::parse(&source.url).map_err(fail)?;
    if url.scheme() != "https"
        && !(url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")))
    {
        return Err(fail("开发来源只允许 HTTPS 或本机 HTTP"));
    }
    let download = Download::begin(&source.id)?;
    let request = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(fail)?
        .get(url)
        .send();
    let mut response = download
        .request(request)
        .await?
        .error_for_status()
        .map_err(fail)?;
    let mut bytes = Vec::new();
    while let Some(chunk) = download.request(response.chunk()).await? {
        download.check()?;
        if bytes.len() as u64 + chunk.len() as u64 > source.size {
            return Err(fail("下载大小不匹配"));
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.len() as u64 != source.size || hash(&bytes) != source.sha256 {
        return Err(fail("下载摘要或大小不匹配"));
    }
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    download.check()?;
    let directory = root(&app)?.join(&source.id);
    fs::create_dir_all(&directory).map_err(fail)?;
    recover(&directory)?;
    let current_source = directory.join("current/.source.json");
    if current_source.exists() {
        let previous = read_json(&current_source)?;
        let previous_url = url::Url::parse(
            previous["url"]
                .as_str()
                .ok_or_else(|| fail("来源记录无效"))?,
        )
        .map_err(fail)?;
        if previous_url.origin() != url::Url::parse(&source.url).map_err(fail)?.origin() {
            return Err(fail("同一插件不能跨来源接管，请先卸载"));
        }
    }
    let stage = directory.join("staging");
    remove(&stage)?;
    fs::create_dir(&stage).map_err(fail)?;
    let result = (|| {
        let value = extract(&bytes, &stage)?;
        if value.manifest["id"] != source.id || value.manifest["version"] != source.version {
            return Err(fail("下载身份不匹配"));
        }
        write_json(
            &stage.join(".source.json"),
            &json!({"id":source.id,"version":source.version,"url":source.url,"sha256":source.sha256,"size":source.size,"center":center}),
        )?;
        Ok(json!({"artifact":value,"sha256":source.sha256}))
    })();
    if result.is_err() {
        remove(&stage)?;
    }
    result
}

#[tauri::command]
pub fn plugin_commit(app: AppHandle, id: String, sha256: String) -> Result<(), String> {
    commit_package(app, id, sha256, None)
}
pub(crate) fn commit_center_package(
    app: AppHandle,
    id: String,
    sha256: String,
    origin: &str,
    release_id: &str,
) -> Result<(), String> {
    commit_package(app, id, sha256, Some((origin, release_id)))
}
fn commit_package(
    app: AppHandle,
    id: String,
    sha256: String,
    center: Option<(&str, &str)>,
) -> Result<(), String> {
    dev_only()?;
    identifier(&id)?;
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let directory = root(&app)?.join(id);
    recover(&directory)?;
    let stage = directory.join("staging");
    artifact(&stage)?;
    let source = read_json(&stage.join(".source.json"))?;
    if let Some((origin, release_id)) = center {
        if source["center"]["origin"] != origin || source["center"]["releaseId"] != release_id {
            return Err(fail("中心来源记录不匹配"));
        }
    } else if !source["center"].is_null() {
        return Err(fail("中心包必须重新核验发布状态后提交"));
    }
    if let Some(reason) = center_block_reason(&app, &source) {
        return Err(fail(reason));
    }
    if source["sha256"] != sha256 {
        return Err(fail("暂存版本已变化"));
    }
    remove(&directory.join("next"))?;
    fs::rename(stage, directory.join("next")).map_err(fail)?;
    write_json(&directory.join("pending.json"), &json!({"version":1}))
}

#[tauri::command]
pub fn plugin_cancel(app: AppHandle, id: String) -> Result<(), String> {
    identifier(&id)?;
    if let Some(cancelled) = DOWNLOADS
        .get_or_init(Default::default)
        .lock()
        .map_err(fail)?
        .get(&id)
    {
        cancelled.store(true, Ordering::SeqCst);
    }
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let directory = root(&app)?.join(id);
    recover(&directory)?;
    remove(&directory.join("staging"))?;
    remove(&directory.join("next"))?;
    if directory.join("pending.json").exists() {
        fs::remove_file(directory.join("pending.json")).map_err(fail)?;
    }
    Ok(())
}

#[tauri::command]
pub fn plugin_restore(app: AppHandle, id: String) -> Result<(), String> {
    dev_only()?;
    identifier(&id)?;
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let directory = root(&app)?.join(id);
    recover(&directory)?;
    let backup = directory.join("backup");
    artifact(&backup)?;
    let next = directory.join("next");
    remove(&next)?;
    fs::create_dir(&next).map_err(fail)?;
    fn copy_tree(from: &Path, to: &Path) -> Result<(), String> {
        for entry in fs::read_dir(from).map_err(fail)? {
            let entry = entry.map_err(fail)?;
            let target = to.join(entry.file_name());
            if entry.file_type().map_err(fail)?.is_dir() {
                fs::create_dir(&target).map_err(fail)?;
                copy_tree(&entry.path(), &target)?;
            } else {
                fs::copy(entry.path(), target).map_err(fail)?;
            }
        }
        Ok(())
    }
    copy_tree(&backup, &next)?;
    write_json(&directory.join("pending.json"), &json!({"version":1}))
}

#[tauri::command]
pub fn plugin_set_enabled(app: AppHandle, id: String, enabled: bool) -> Result<(), String> {
    dev_only()?;
    identifier(&id)?;
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let directory = root(&app)?.join(id);
    if enabled {
        artifact(&directory.join(if directory.join("current").exists() {
            "current"
        } else {
            "next"
        }))?;
    }
    write_json(&directory.join("enabled.json"), &json!(enabled))
}

#[tauri::command]
pub fn plugin_uninstall(app: AppHandle, id: String) -> Result<(), String> {
    dev_only()?;
    identifier(&id)?;
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    remove(&root(&app)?.join(id))
}

#[tauri::command]
pub fn plugin_packages(app: AppHandle) -> Result<Value, String> {
    let platform = if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else {
        "unknown"
    };
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let mut packages = Vec::new();
    for entry in fs::read_dir(root(&app)?).map_err(fail)? {
        let entry = entry.map_err(fail)?;
        if !entry.file_type().map_err(fail)?.is_dir() {
            continue;
        }
        let directory = entry.path();
        let id = entry.file_name().to_string_lossy().to_string();
        if identifier(&id).is_err() {
            continue;
        }
        let recovery = recover(&directory);
        let slot = directory.join(
            if directory.join("current").exists() || !directory.join("pending.json").exists() {
                "current"
            } else {
                "next"
            },
        );
        let source = read_json(&slot.join(".source.json")).unwrap_or(Value::Null);
        let blocked = center_block_reason(&app, &source);
        let manifest = read_json(&slot.join("manifest.json")).unwrap_or(Value::Null);
        let current_version = read_json(&directory.join("current/manifest.json"))
            .ok()
            .and_then(|value| value["version"].as_str().map(str::to_owned));
        let pending = directory.join("pending.json").exists();
        let pending_version = if pending {
            read_json(&directory.join("next/manifest.json"))
                .ok()
                .and_then(|value| value["version"].as_str().map(str::to_owned))
        } else {
            None
        };
        let revoked = center_cached_status(&app, &source).ok().flatten()
            .filter(|value| matches!(value["status"].as_str(), Some("revoked" | "disabled")))
            .map(|value| json!({"kind":value["status"],"reason":value["reason"].as_str().unwrap_or("中心已停止此版本")}));
        let result = recovery.and_then(|_| {
            if let Some(reason) = blocked.clone() {
                return Err(reason);
            }
            artifact(&slot)
        });
        let mut item = json!({
            "id":id,"name":manifest["name"].as_str(),"currentVersion":current_version,
            "pendingVersion":pending_version,"pending":pending,"hasBackup":directory.join("backup").exists(),
            "centerSource":source["center"],"blocked":blocked.is_some(),"revoked":revoked,
        });
        match result {
            Ok(value) => {
                item["artifact"] = serde_json::to_value(value).map_err(fail)?;
                item["enabled"] = json!(
                    read_json(&directory.join("enabled.json")).unwrap_or(json!(false)) == true
                );
                item["error"] = read_json(&directory.join("error.json")).unwrap_or(Value::Null);
            }
            Err(error) => {
                item["error"] = json!(error);
                item["enabled"] = json!(false);
            }
        }
        packages.push(item);
    }
    Ok(
        json!({"platform":platform,"appVersion":app.package_info().version.to_string(),"packages":packages,"development":cfg!(debug_assertions)}),
    )
}

pub(crate) fn center_installations(app: &AppHandle) -> Result<Vec<Value>, String> {
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let mut result = Vec::new();
    for entry in fs::read_dir(root(app)?).map_err(fail)? {
        let entry = entry.map_err(fail)?;
        if !entry.file_type().map_err(fail)?.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        if identifier(&id).is_err() {
            continue;
        }
        for slot in ["current", "next", "backup"] {
            if let Ok(source) = read_json(&entry.path().join(slot).join(".source.json")) {
                if source["center"].is_object() {
                    result.push(json!({"pluginId":id,"origin":source["center"]["origin"],"releaseId":source["center"]["releaseId"]}));
                }
            }
        }
    }
    Ok(result)
}
pub(crate) fn save_center_statuses(
    app: &AppHandle,
    origin: &str,
    items: &[Value],
) -> Result<(), String> {
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let path = root(app)?.join(".center-status.json");
    let mut records = if path.exists() {
        read_json(&path)?
    } else {
        json!({})
    };
    merge_center_statuses(&mut records, origin, items)?;
    write_json(&path, &records)?;
    Ok(())
}
fn merge_center_statuses(records: &mut Value, origin: &str, items: &[Value]) -> Result<(), String> {
    if !records.is_object() {
        return Err(fail("中心状态记录损坏"));
    }
    for item in items {
        let id = item["releaseId"]
            .as_str()
            .ok_or_else(|| fail("中心状态缺少版本"))?;
        identifier(id)?;
        let key = format!("{origin}|{id}");
        if records[&key]["status"] == "revoked" {
            continue;
        }
        if ["available", "revoked", "disabled"].contains(&item["status"].as_str().unwrap_or("")) {
            records[&key] = item.clone();
        }
    }
    Ok(())
}
fn center_cached_status(app: &AppHandle, source: &Value) -> Result<Option<Value>, String> {
    if source["center"].is_null() {
        return Ok(None);
    }
    let origin = source["center"]["origin"]
        .as_str()
        .ok_or_else(|| fail("中心来源记录损坏"))?;
    let release = source["center"]["releaseId"]
        .as_str()
        .ok_or_else(|| fail("中心来源记录损坏"))?;
    let path = root(app)?.join(".center-status.json");
    if !path.exists() {
        return Ok(None);
    }
    let records = match read_json(&path) {
        Ok(value) if value.is_object() => value,
        _ => return Err("中心状态记录损坏，无法核验版本".into()),
    };
    Ok(records.get(format!("{origin}|{release}")).cloned())
}
fn center_block_reason(app: &AppHandle, source: &Value) -> Option<String> {
    let record = match center_cached_status(app, source) {
        Ok(Some(record)) => record,
        Ok(None) => return None,
        Err(error) => return Some(error),
    };
    match record["status"].as_str() {
        Some("revoked" | "disabled") => Some(format!(
            "插件版本已撤回或禁用：{}",
            record["reason"].as_str().unwrap_or("中心已停止此版本")
        )),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn cancellation_interrupts_a_stalled_request() {
        let download = Download::begin("test.stalled").unwrap();
        let cancelled = download.cancelled.clone();
        let trigger = tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            cancelled.store(true, Ordering::SeqCst);
        });
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(1),
            download.request(std::future::pending::<Result<(), reqwest::Error>>()),
        )
        .await
        .unwrap();
        assert!(result.unwrap_err().contains("取消"));
        trigger.await.unwrap();
    }
    #[test]
    fn confirmed_revocation_survives_missing_or_available_responses() {
        let mut records = json!({});
        merge_center_statuses(
            &mut records,
            "https://center.test",
            &[json!({"releaseId":"r1","status":"revoked","reason":"test"})],
        )
        .unwrap();
        for status in ["available", "not_found"] {
            merge_center_statuses(
                &mut records,
                "https://center.test",
                &[json!({"releaseId":"r1","status":status})],
            )
            .unwrap();
            assert_eq!(records["https://center.test|r1"]["status"], "revoked");
        }
        assert!(merge_center_statuses(&mut json!([]), "https://center.test", &[]).is_err());
    }
    fn temp() -> PathBuf {
        let path = std::env::temp_dir().join(format!("tau-plugin-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        path
    }
    fn archive(name: &str, code: &str, expected: &str) -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(json!({"formatVersion":3,"platform":"portable","profile":"web-v1","id":"test.counter","main":name,"integrity":{name:expected}}).to_string().as_bytes()).unwrap();
        zip.start_file(name, options).unwrap();
        zip.write_all(code.as_bytes()).unwrap();
        zip.finish().unwrap().into_inner()
    }
    #[test]
    fn duplicate_download_cannot_reset_cancellation() {
        let first = Download::begin("test.cancel").unwrap();
        first.cancelled.store(true, Ordering::SeqCst);
        assert!(Download::begin("test.cancel").is_err());
        assert!(first.check().is_err());
        drop(first);
        assert!(Download::begin("test.cancel").unwrap().check().is_ok());
    }
    #[test]
    fn validates_entry_hash_and_rejects_traversal() {
        let root = temp();
        let good = root.join("good");
        fs::create_dir(&good).unwrap();
        assert!(extract(&archive("main.js", "code", &hash(b"code")), &good).is_ok());
        let bad = root.join("bad");
        fs::create_dir(&bad).unwrap();
        assert!(extract(&archive("main.js", "code", &hash(b"other")), &bad).is_err());
        let escaped = root.join("escaped");
        fs::create_dir(&escaped).unwrap();
        assert!(extract(&archive("../escape.js", "code", &hash(b"code")), &escaped).is_err());
        assert!(!root.join("escape.js").exists());
        remove(&root).unwrap();
    }
    #[test]
    fn recovers_between_backup_and_commit_and_keeps_device_intent() {
        let root = temp();
        fs::create_dir(root.join("current")).unwrap();
        fs::write(root.join("current/version"), "old").unwrap();
        fs::create_dir(root.join("next")).unwrap();
        fs::write(root.join("next/version"), "new").unwrap();
        write_json(&root.join("enabled.json"), &json!(true)).unwrap();
        write_json(&root.join("switch.json"), &json!({"version":1})).unwrap();
        fs::rename(root.join("current"), root.join("backup")).unwrap();
        recover(&root).unwrap();
        recover(&root).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("current/version")).unwrap(),
            "new"
        );
        assert_eq!(
            fs::read_to_string(root.join("backup/version")).unwrap(),
            "old"
        );
        assert_eq!(read_json(&root.join("enabled.json")).unwrap(), true);
        remove(&root).unwrap();
    }
    #[test]
    fn failed_switch_does_not_delete_current_package() {
        let root = temp();
        fs::create_dir(root.join("current")).unwrap();
        fs::write(root.join("current/version"), "old").unwrap();
        fs::create_dir(root.join("next")).unwrap();
        fs::write(root.join("next/version"), "new").unwrap();
        fs::write(root.join("backup"), "blocked").unwrap();
        assert!(switch(&root).is_err());
        assert_eq!(
            fs::read_to_string(root.join("current/version")).unwrap(),
            "old"
        );
        fs::remove_file(root.join("backup")).unwrap();
        recover(&root).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("current/version")).unwrap(),
            "new"
        );
        remove(&root).unwrap();
    }
}

#[tauri::command]
pub fn plugin_apply_pending(app: AppHandle) -> Result<(), String> {
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    for entry in fs::read_dir(root(&app)?).map_err(fail)? {
        let entry = entry.map_err(fail)?;
        if !entry.file_type().map_err(fail)?.is_dir() {
            continue;
        }
        let directory = entry.path();
        let result = (|| -> Result<(), String> {
            recover(&directory)?;
            if directory.join("pending.json").exists() {
                if directory.join("next").exists() {
                    artifact(&directory.join("next"))?;
                    switch(&directory)?;
                }
                fs::remove_file(directory.join("pending.json")).map_err(fail)?;
            }
            Ok(())
        })();
        if let Err(error) = result {
            write_json(&directory.join("error.json"), &json!(error))?;
        } else if directory.join("error.json").exists() {
            fs::remove_file(directory.join("error.json")).map_err(fail)?;
        }
    }
    Ok(())
}
