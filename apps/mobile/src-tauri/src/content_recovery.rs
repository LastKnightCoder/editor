//! 移动端只保全原始材料及接收桌面转换结果，不解释旧实体结构。
use crate::setting::{
    get_database_items, load_or_init_setting, normalize_database_name, resolve_app_dir,
};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize)]
struct RecoveryFile {
    name: String,
    bytes: u64,
    hash: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Manifest {
    version: u32,
    pub id: String,
    pub workspace_id: String,
    reason: String,
    provenance: Value,
    files: Vec<RecoveryFile>,
    pub missing: Vec<String>,
}
fn digest(path: &Path) -> Result<(u64, String), String> {
    let info = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !info.is_file() || info.file_type().is_symlink() {
        return Err("恢复材料必须是普通文件".into());
    }
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    let mut size = 0;
    loop {
        let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
        size += count as u64;
    }
    if size != info.len() {
        return Err("恢复材料在读取中变化".into());
    }
    Ok((size, format!("{:x}", hash.finalize())))
}
fn flush(path: &Path) -> Result<(), String> {
    File::open(path)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())
}
fn copy(source: &Path, target: &Path) -> Result<(), String> {
    let before = digest(source)?;
    fs::copy(source, target).map_err(|e| e.to_string())?;
    flush(target)?;
    if digest(source)? != before || digest(target)? != before {
        return Err("恢复文件复制校验失败".into());
    }
    Ok(())
}
fn root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_app_dir(app)?.join("collaboration/content-recoveries"))
}
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() < 200
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        && name != "."
        && name != ".."
}
fn verify(directory: &Path) -> Result<Manifest, String> {
    let metadata = fs::symlink_metadata(directory).map_err(|e| e.to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("恢复目录无效".into());
    }
    let path = directory.join("manifest.json");
    let (size, _) = digest(&path)?;
    if size > 16 * 1024 * 1024 {
        return Err("恢复清单过大".into());
    }
    let manifest: Manifest = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if manifest.version != 1
        || uuid::Uuid::parse_str(&manifest.id).is_err()
        || directory.file_name().and_then(|v| v.to_str()) != Some(&manifest.id)
        || manifest.files.len() > 100_000
    {
        return Err("恢复清单无效".into());
    }
    let mut names = std::collections::HashSet::new();
    for entry in &manifest.files {
        if !valid_name(&entry.name)
            || entry.name == "manifest.json"
            || !names.insert(&entry.name)
            || digest(&directory.join(&entry.name))? != (entry.bytes, entry.hash.clone())
        {
            return Err("恢复材料缺失或损坏".into());
        }
    }
    Ok(manifest)
}
fn snapshot(conn: &Connection, path: &Path) -> Result<(), String> {
    conn.execute("VACUUM INTO ?1", [path.to_string_lossy().as_ref()])
        .map_err(|e| e.to_string())?;
    flush(path)
}

fn local_references(value: &Value, app_dir: &Path, references: &mut BTreeSet<String>) {
    match value {
        Value::String(value) => {
            let path = url::Url::parse(value)
                .ok()
                .filter(|url| url.scheme() == "file")
                .and_then(|url| url.to_file_path().ok())
                .unwrap_or_else(|| PathBuf::from(value));
            if value.starts_with("~/.editor/") || path.starts_with(app_dir) {
                references.insert(value.clone());
            }
        }
        Value::Array(values) => values
            .iter()
            .for_each(|value| local_references(value, app_dir, references)),
        Value::Object(values) => values
            .values()
            .for_each(|value| local_references(value, app_dir, references)),
        _ => {}
    }
}

pub(crate) fn preserve_at(
    app_dir: &Path,
    directory: &Path,
    main: &Connection,
    cache: &Connection,
    workspace: &str,
    reason: &str,
    document: &str,
) -> Result<String, String> {
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let pending = directory.join(format!(".pending-{id}"));
    fs::create_dir(&pending).map_err(|e| e.to_string())?;
    let result = (|| {
        snapshot(cache, &pending.join("collaboration.db"))?;
        let saved =
            Connection::open(pending.join("collaboration.db")).map_err(|e| e.to_string())?;
        saved
            .pragma_update(None, "secure_delete", "ON")
            .map_err(|e| e.to_string())?;
        let has_identity: bool = main
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='library_identity')",
                [],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let source_id: Option<String> = if has_identity {
            main.query_row(
                "SELECT source_id FROM library_identity WHERE id=1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
        } else {
            None
        };
        let mut files = vec!["collaboration.db".to_string()];
        let mut references = BTreeSet::new();
        {
            let metadata: String = saved
                .query_row(
                    "SELECT metadata FROM sessions WHERE id=?1",
                    [document],
                    |row| row.get(0),
                )
                .map_err(|_| "目标文档缓存不存在")?;
            let metadata: Value = serde_json::from_str(&metadata).map_err(|e| e.to_string())?;
            if let Some(source) = metadata.get("source").filter(|source| !source.is_null()) {
                let belongs = if let Some(expected) = source["librarySourceId"].as_str() {
                    source_id.as_deref() == Some(expected)
                } else {
                    source["databaseName"].as_str().is_some_and(|name| {
                        name.trim_end_matches(".db") == workspace.trim_end_matches(".db")
                    })
                };
                if !belongs {
                    return Err("目标文档不属于当前资料库，停止保全与替换".into());
                }
                let content_id = source["contentId"].as_i64().ok_or("正文来源身份无效")?;
                let (content, created): (String, i64) = main
                    .query_row(
                        "SELECT content,create_time FROM contents WHERE id=?1",
                        [content_id],
                        |row| Ok((row.get(0)?, row.get(1)?)),
                    )
                    .map_err(|e| e.to_string())?;
                if source["contentCreatedAt"].as_i64() != Some(created) {
                    return Err("原正文身份已变化，停止保全与替换".into());
                }
                let content: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
                local_references(&content, app_dir, &mut references);
                let has_contracts: bool = main
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='content_documents')",
                        [],
                        |row| row.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                if let Some(expected) = source["contentDocumentId"].as_str() {
                    if !has_contracts {
                        return Err("原正文契约身份缺失，停止保全与替换".into());
                    }
                    let actual: Option<String> = main
                        .query_row(
                            "SELECT document_id FROM content_documents WHERE content_id=?1",
                            [content_id],
                            |row| row.get(0),
                        )
                        .optional()
                        .map_err(|e| e.to_string())?;
                    if actual.as_deref() != Some(expected) {
                        return Err("原正文身份已变化，停止保全与替换".into());
                    }
                }
                let contracts: Option<String> = if has_contracts {
                    main.query_row(
                        "SELECT contracts FROM content_documents WHERE content_id=?1",
                        [content_id],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|e| e.to_string())?
                } else {
                    None
                };
                let projection = json!({"source":source,"content":content,"contracts":contracts.map(|value|serde_json::from_str::<Value>(&value)).transpose().map_err(|e|e.to_string())?});
                fs::write(
                    pending.join("source-projection.json"),
                    serde_json::to_vec(&projection).map_err(|e| e.to_string())?,
                )
                .map_err(|e| e.to_string())?;
                flush(&pending.join("source-projection.json"))?;
                files.push("source-projection.json".into());
            }
            saved
                .execute("DELETE FROM sessions WHERE id<>?1", [document])
                .map_err(|e| e.to_string())?;
        }
        for table in [
            "updates",
            "resources",
            "input_drafts",
            "document_drafts",
            "migrations",
        ] {
            saved
                .execute(
                    &format!(
                        "DELETE FROM {table} WHERE document_id NOT IN (SELECT id FROM sessions)"
                    ),
                    [],
                )
                .map_err(|e| e.to_string())?;
        }
        saved.execute_batch("DELETE FROM settings; DELETE FROM recoveries;
            DELETE FROM node_views WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE node_views.document_id=coalesce(json_extract(metadata,'$.source.contentDocumentId'),id) AND node_views.workspace_id=coalesce(json_extract(metadata,'$.source.librarySourceId'),'application'));
            DELETE FROM entity_holds WHERE holder NOT IN (SELECT 'document:' || id FROM sessions);
            VACUUM;").map_err(|e|e.to_string())?;
        flush(&pending.join("collaboration.db"))?;
        let mut missing = Vec::new();
        let mut resources = Vec::new();
        let mut statement = saved
            .prepare("SELECT metadata FROM sessions")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let canonical_root = app_dir.canonicalize().map_err(|e| e.to_string())?;
        for row in rows {
            let metadata: Value = serde_json::from_str(&row.map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            if let Some(paths) = metadata["resourcePaths"].as_object() {
                for (reference, value) in paths {
                    let Some(value) = value.as_str() else {
                        continue;
                    };
                    let path = if let Some(relative) = value.strip_prefix("~/.editor/") {
                        app_dir.join(relative)
                    } else if value.starts_with("file:") {
                        url::Url::parse(value)
                            .ok()
                            .and_then(|url| url.to_file_path().ok())
                            .unwrap_or_else(|| PathBuf::from(value))
                    } else {
                        let path = PathBuf::from(value);
                        if path.is_absolute() {
                            path
                        } else {
                            app_dir.join(path)
                        }
                    };
                    if let Ok(path) = path.canonicalize() {
                        if !path.starts_with(&canonical_root) {
                            missing.push(reference.clone());
                            continue;
                        }
                        let name = format!("asset-{}", resources.len());
                        copy(&path, &pending.join(&name))?;
                        resources.push(json!({"documentId":metadata["id"],"reference":reference,"original":value,"file":name}));
                        files.push(name);
                    } else {
                        missing.push(reference.clone());
                    }
                }
            }
            if let Some(references) = metadata["resources"].as_array() {
                for value in references {
                    if let Some(value) = value.as_str() {
                        if value.starts_with("tau-collab-asset:") {
                            missing.push(value.to_string());
                        }
                    }
                }
            }
            local_references(&metadata["resources"], app_dir, &mut references);
        }
        let has_private: bool = saved.query_row("SELECT EXISTS(SELECT 1 FROM pragma_table_info('sessions') WHERE name='private_nodes')", [], |row|row.get(0)).map_err(|e|e.to_string())?;
        if has_private {
            let mut statement = saved
                .prepare("SELECT private_nodes FROM sessions")
                .map_err(|e| e.to_string())?;
            for row in statement
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?
            {
                local_references(
                    &serde_json::from_str::<Value>(&row.map_err(|e| e.to_string())?)
                        .map_err(|e| e.to_string())?,
                    app_dir,
                    &mut references,
                );
            }
        }
        for reference in references {
            if resources.iter().any(|resource| {
                resource["reference"].as_str() == Some(&reference)
                    || resource["original"].as_str() == Some(&reference)
            }) {
                continue;
            }
            let path = if let Some(relative) = reference.strip_prefix("~/.editor/") {
                app_dir.join(relative)
            } else {
                url::Url::parse(&reference)
                    .ok()
                    .and_then(|url| url.to_file_path().ok())
                    .unwrap_or_else(|| PathBuf::from(&reference))
            };
            let Ok(path) = path.canonicalize() else {
                missing.push(reference);
                continue;
            };
            if !path.starts_with(&canonical_root) {
                missing.push(reference);
                continue;
            }
            // 正文文字里提到的目录路径不是附件
            if path.is_dir() {
                continue;
            }
            let name = format!("asset-{}", resources.len());
            copy(&path, &pending.join(&name))?;
            resources.push(json!({"reference":reference,"file":name}));
            files.push(name);
        }
        let resources_file = pending.join("resources.json");
        fs::write(
            &resources_file,
            serde_json::to_vec(&resources).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        flush(&resources_file)?;
        files.push("resources.json".into());
        let records = files
            .iter()
            .map(|name| {
                let (bytes, hash) = digest(&pending.join(name))?;
                Ok(RecoveryFile {
                    name: name.clone(),
                    bytes,
                    hash,
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        let manifest = Manifest {
            version: 1,
            id: id.clone(),
            workspace_id: workspace.into(),
            reason: reason.into(),
            provenance: json!({"platform":"mobile","documentId":document,"scope":"document"}),
            files: records,
            missing,
        };
        fs::write(
            pending.join("manifest.json"),
            serde_json::to_vec(&manifest).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        flush(&pending.join("manifest.json"))?;
        flush(&pending)?;
        let destination = directory.join(&id);
        fs::rename(&pending, &destination).map_err(|e| e.to_string())?;
        flush(directory)?;
        verify(&destination)?;
        let (_, hash) = digest(&destination.join("manifest.json"))?;
        cache
            .execute(
                "INSERT INTO recoveries(id,manifest_hash,manifest_path) VALUES (?1,?2,?3)",
                rusqlite::params![
                    id,
                    hash,
                    destination.join("manifest.json").to_string_lossy()
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(id.clone())
    })();
    // 未完成的临时快照不保留其他库的数据；原缓存和已安装的完整副本不动。
    if result.is_err() {
        let _ = fs::remove_dir_all(&pending);
    }
    result
}

pub(crate) fn preserve(
    app: &AppHandle,
    cache: &Connection,
    reason: &str,
    document: Option<&str>,
) -> Result<String, String> {
    let document = document.ok_or("单文档保全必须指定文档")?;
    let metadata: String = cache
        .query_row(
            "SELECT metadata FROM sessions WHERE id=?1",
            [document],
            |row| row.get(0),
        )
        .map_err(|_| "目标文档缓存不存在")?;
    let metadata: Value = serde_json::from_str(&metadata).map_err(|e| e.to_string())?;
    let app_dir = resolve_app_dir(app)?;
    let names = get_database_items(&load_or_init_setting(app)?)
        .into_iter()
        .map(|item| item.name)
        .collect::<Vec<_>>();
    let (workspace, main) = source_database(&app_dir, &names, &metadata)?;
    let snapshot = main.unchecked_transaction().map_err(|e| e.to_string())?;
    preserve_at(
        &app_dir,
        &root(app)?,
        &snapshot,
        cache,
        &workspace,
        reason,
        document,
    )
}

fn source_database(
    app_dir: &Path,
    names: &[String],
    metadata: &Value,
) -> Result<(String, Connection), String> {
    let Some(source) = metadata.get("source").filter(|source| !source.is_null()) else {
        return Ok((
            "application".into(),
            Connection::open_in_memory().map_err(|e| e.to_string())?,
        ));
    };
    let expected = source["librarySourceId"].as_str();
    let hint = source["databaseName"]
        .as_str()
        .and_then(|name| normalize_database_name(name).ok());
    if expected.is_none() && hint.is_none() {
        return Err("文档来源身份缺失，停止保全与替换".into());
    }
    let mut matches = Vec::new();
    let mut visited = BTreeSet::new();
    for name in names {
        let name = normalize_database_name(name)?;
        if !visited.insert(name.clone()) || (expected.is_none() && hint.as_deref() != Some(&name)) {
            continue;
        }
        let path = app_dir.join(&name);
        if !path.exists() {
            continue;
        }
        let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| e.to_string())?;
        if let Some(expected) = expected {
            let has_identity: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='library_identity')",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            if !has_identity {
                continue;
            }
            let actual: Option<String> = conn
                .query_row(
                    "SELECT source_id FROM library_identity WHERE id=1",
                    [],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if actual.as_deref() != Some(expected) {
                continue;
            }
        }
        matches.push((name, conn));
    }
    if let Some(index) = matches
        .iter()
        .position(|(name, _)| Some(name.as_str()) == hint.as_deref())
    {
        return Ok(matches.swap_remove(index));
    }
    if matches.len() == 1 {
        return Ok(matches.remove(0));
    }
    Err("原资料库不存在或来源不唯一，停止保全与替换".into())
}
#[tauri::command]
pub fn content_recovery_preserve(app: AppHandle, document_id: String) -> Result<String, String> {
    let _lock = crate::collaboration::CACHE_WRITE_LOCK
        .lock()
        .map_err(|_| "缓存保存锁不可用")?;
    preserve(
        &app,
        &crate::collaboration::session_store(&app)?,
        "offline-edit",
        Some(&document_id),
    )
}
#[tauri::command]
pub fn content_recovery_list(app: AppHandle) -> Result<Vec<Value>, String> {
    let directory = root(&app)?;
    if !directory.exists() {
        return Ok(vec![]);
    }
    let cache = crate::collaboration::session_store(&app)?;
    let mut result = Vec::new();
    for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let id = entry.file_name().to_string_lossy().into_owned();
        if uuid::Uuid::parse_str(&id).is_err() {
            continue;
        }
        match verify_registered(&cache, &entry.path()) {
            Ok(value) => result.push(
                json!({"id":value.id,"workspace":value.workspace_id,"missing":value.missing}),
            ),
            Err(error) => result.push(json!({"id":id,"error":error})),
        }
    }
    result.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    Ok(result)
}
fn verify_registered(cache: &Connection, directory: &Path) -> Result<Manifest, String> {
    use rusqlite::OptionalExtension;
    let manifest = verify(directory)?;
    let hash = digest(&directory.join("manifest.json"))?.1;
    let saved: Option<String> = cache
        .query_row(
            "SELECT manifest_hash FROM recoveries WHERE id=?1",
            [&manifest.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if saved.as_deref().is_some_and(|saved| saved != hash) {
        return Err("恢复清单摘要不匹配".into());
    }
    if saved.is_none() {
        cache
            .execute(
                "INSERT INTO recoveries VALUES (?1,?2,?3)",
                rusqlite::params![
                    manifest.id,
                    hash,
                    directory.join("manifest.json").to_string_lossy()
                ],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(manifest)
}
fn export_zip(directory: &Path, target: &Path) -> Result<(), String> {
    let manifest = verify(directory)?;
    let output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(output);
    for name in manifest
        .files
        .iter()
        .map(|entry| entry.name.as_str())
        .chain(std::iter::once("manifest.json"))
    {
        zip.start_file(
            name,
            zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated),
        )
        .map_err(|e| e.to_string())?;
        std::io::copy(
            &mut File::open(directory.join(name)).map_err(|e| e.to_string())?,
            &mut zip,
        )
        .map_err(|e| e.to_string())?;
    }
    zip.finish()
        .and_then(|file| file.sync_all().map_err(Into::into))
        .map_err(|e| e.to_string())?;
    // 压缩后再检查源，复制期间变化不能报告成功。
    verify(directory)?;
    Ok(())
}
#[tauri::command]
pub async fn content_recovery_export(app: AppHandle, id: String) -> Result<String, String> {
    if uuid::Uuid::parse_str(&id).is_err() {
        return Err("恢复副本身份无效".into());
    }
    let directory = root(&app)?.join(&id);
    verify_registered(&crate::collaboration::session_store(&app)?, &directory)?;
    let export_dir = resolve_app_dir(&app)?.join("recovery-exports");
    fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;
    let name = format!("tau-recovery-{id}-{}.zip", uuid::Uuid::new_v4());
    let path = export_dir.join(&name);
    export_zip(&directory, &path)?;
    export_to_system(&app, &path, &name).await
}
#[cfg(not(target_os = "android"))]
async fn export_to_system(app: &AppHandle, path: &Path, name: &str) -> Result<String, String> {
    let parent = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("Tau Recoveries");
    fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
    let target = parent.join(name);
    copy(path, &target)?;
    flush(&parent)?;
    Ok(target.to_string_lossy().into_owned())
}
#[cfg(target_os = "android")]
async fn export_to_system(app: &AppHandle, path: &Path, name: &str) -> Result<String, String> {
    use jni::objects::{JString, JValue};
    let window = app.get_webview_window("main").ok_or("主窗口不可用")?;
    let path = path.to_string_lossy().into_owned();
    let name = name.to_string();
    let (tx, rx) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| {
            webview.jni_handle().exec(move |env, activity, _| {
                let context = env
                    .new_global_ref(activity)
                    .and_then(|activity| env.get_java_vm().map(|vm| (activity, vm)));
                match context {
                    Err(error) => {
                        let _ = env.exception_clear();
                        let _ = tx.send(Err(error.to_string()));
                    }
                    Ok((activity, vm)) => {
                        std::thread::spawn(move || {
                            let result = (|| {
                                let mut env = vm.attach_current_thread()?;
                                let path = env.new_string(path)?;
                                let name = env.new_string(name)?;
                                let value = env.call_method(
                                    activity.as_obj(),
                                    "exportRecovery",
                                    "(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;",
                                    &[JValue::Object(&path), JValue::Object(&name)],
                                );
                                if value.is_err() {
                                    let _ = env.exception_clear();
                                }
                                let value = JString::from(value?.l()?);
                                let output: String = env.get_string(&value)?.into();
                                Ok::<String, jni::errors::Error>(output)
                            })();
                            let _ = tx.send(result.map_err(|e| e.to_string()));
                        });
                    }
                }
            });
        })
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preservation_uses_saved_source_and_never_falls_back_to_active_library() {
        let dir = std::env::temp_dir().join(format!("tau-source-binding-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        for (name, source) in [
            ("a.db", "source-a"),
            ("b.db", "source-b"),
            ("copy.db", "source-a"),
        ] {
            let db = Connection::open(dir.join(name)).unwrap();
            db.execute_batch("CREATE TABLE library_identity(id INTEGER,source_id TEXT)")
                .unwrap();
            db.execute("INSERT INTO library_identity VALUES (1,?1)", [source])
                .unwrap();
        }
        let names = vec!["b.db".into(), "a.db".into()];
        let source = json!({"source":{"librarySourceId":"source-a","databaseName":"source-a"}});
        let (name, conn) = source_database(&dir, &names, &source).unwrap();
        assert_eq!(name, "a.db");
        drop(conn);
        assert!(source_database(
            &dir,
            &names,
            &json!({"source":{"librarySourceId":"missing","databaseName":"b.db"}})
        )
        .is_err());
        let copies = vec!["a.db".into(), "copy.db".into()];
        assert!(source_database(&dir, &copies, &source).is_err());
        let (name, conn) = source_database(
            &dir,
            &copies,
            &json!({"source":{"librarySourceId":"source-a","databaseName":"a.db"}}),
        )
        .unwrap();
        assert_eq!(name, "a.db");
        drop(conn);
        let (name, conn) = source_database(&dir, &names, &json!({"id":"room"})).unwrap();
        assert_eq!(name, "application");
        drop(conn);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn preserves_raw_private_data_drafts_and_files_and_exports_after_restart() {
        let dir =
            std::env::temp_dir().join(format!("tau-mobile-recovery-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(dir.join("resources")).unwrap();
        fs::write(dir.join("resources/image.png"), [1, 2, 3]).unwrap();
        let main = Connection::open_in_memory().unwrap();
        main.execute_batch("CREATE TABLE contents(id INTEGER,content TEXT,create_time INTEGER); INSERT INTO contents VALUES (1,'[{\"private\":\"旧私有真身\"}]',1);").unwrap();
        let cache = Connection::open_in_memory().unwrap();
        cache
            .execute_batch(include_str!(
                "../../../../packages/db-schema/schema/collaboration.sql"
            ))
            .unwrap();
        cache
            .execute("INSERT INTO settings VALUES ('identity:test','secret')", [])
            .unwrap();
        cache.execute("INSERT INTO sessions VALUES ('doc',?1,?2,'hash')",rusqlite::params![json!({"id":"doc","source":{"databaseName":"library","contentId":1,"contentCreatedAt":1},"resources":["tau-collab-asset:missing"],"resourcePaths":{"tau-local-asset:image":"~/.editor/resources/image.png"}}).to_string(),[1u8].as_slice()]).unwrap();
        cache.execute("INSERT INTO sessions VALUES ('unrelated',?1,?2,'hash')",rusqlite::params![json!({"id":"unrelated","source":{"databaseName":"other"},"resourcePaths":{"other":"~/.editor/resources/absent.png"}}).to_string(),[2u8].as_slice()]).unwrap();
        fs::write(dir.join("resources/unrelated.png"), [9]).unwrap();
        cache.execute_batch("INSERT INTO input_drafts VALUES ('lib','doc','base',0,'view','node','source','未确认输入','rev',1,0,1)").unwrap();
        cache.execute_batch("INSERT INTO input_drafts VALUES ('other','unrelated','base',0,'other-view','node','source','其他库草稿','rev',1,0,1)").unwrap();
        let recovery = root_test(&dir, &main, &cache);
        let manifest = verify_registered(&cache, &recovery).unwrap();
        assert_eq!(manifest.missing, vec!["tau-collab-asset:missing"]);
        assert!(!recovery.join("main.db").exists());
        let projection: Value =
            serde_json::from_slice(&fs::read(recovery.join("source-projection.json")).unwrap())
                .unwrap();
        assert_eq!(projection["content"][0]["private"], "旧私有真身");
        let saved = Connection::open(recovery.join("collaboration.db")).unwrap();
        assert_eq!(
            saved
                .query_row("SELECT value FROM input_drafts", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "未确认输入"
        );
        assert_eq!(
            saved
                .query_row("SELECT count(*) FROM settings", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            saved
                .query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            saved
                .query_row("SELECT count(*) FROM input_drafts", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        drop(saved);
        assert_eq!(
            manifest
                .files
                .iter()
                .filter(|file| file.name.starts_with("asset-"))
                .count(),
            1
        );
        assert_eq!(
            cache
                .query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
        cache.execute("DELETE FROM recoveries", []).unwrap();
        verify_registered(&cache, &recovery).unwrap();
        let target = dir.join("export.zip");
        export_zip(&recovery, &target).unwrap();
        let mut zip = zip::ZipArchive::new(File::open(target).unwrap()).unwrap();
        assert!(zip.by_name("main.db").is_err());
        assert!(zip.by_name("source-projection.json").is_ok());
        assert!(zip.by_name("resources.json").is_ok());
        drop(zip);
        fs::write(recovery.join("asset-0"), b"broken").unwrap();
        assert!(verify_registered(&cache, &recovery).is_err());
        assert!(export_zip(&recovery, &dir.join("bad.zip")).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    fn root_test(dir: &Path, main: &Connection, cache: &Connection) -> PathBuf {
        let root = dir.join("content-recoveries");
        let id = preserve_at(dir, &root, main, cache, "library", "migration", "doc").unwrap();
        root.join(id)
    }
    #[test]
    fn missing_file_or_changed_manifest_never_grants_installation() {
        let dir =
            std::env::temp_dir().join(format!("tau-recovery-failure-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let main = Connection::open_in_memory().unwrap();
        main.execute_batch("CREATE TABLE contents(id INTEGER)")
            .unwrap();
        let cache = Connection::open_in_memory().unwrap();
        cache
            .execute_batch(include_str!(
                "../../../../packages/db-schema/schema/collaboration.sql"
            ))
            .unwrap();
        cache
            .execute(
                "INSERT INTO sessions VALUES ('doc','{\"id\":\"doc\"}',?1,'hash')",
                [[1u8].as_slice()],
            )
            .unwrap();
        let recovery = root_test(&dir, &main, &cache);
        let mut manifest: Value =
            serde_json::from_slice(&fs::read(recovery.join("manifest.json")).unwrap()).unwrap();
        manifest["reason"] = json!("offline-edit");
        fs::write(
            recovery.join("manifest.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        assert!(verify_registered(&cache, &recovery).is_err());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn uncertain_source_does_not_expand_to_other_libraries() {
        let dir = std::env::temp_dir().join(format!("tau-source-scope-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let main = Connection::open_in_memory().unwrap();
        main.execute_batch("CREATE TABLE library_identity(id INTEGER,source_id TEXT); INSERT INTO library_identity VALUES(1,'current');").unwrap();
        let cache = Connection::open_in_memory().unwrap();
        cache
            .execute_batch(include_str!(
                "../../../../packages/db-schema/schema/collaboration.sql"
            ))
            .unwrap();
        cache
            .execute(
                "INSERT INTO sessions VALUES ('doc',?1,?2,'hash')",
                rusqlite::params![
                    json!({"id":"doc","source":{"librarySourceId":"other"}}).to_string(),
                    [1u8].as_slice()
                ],
            )
            .unwrap();
        let directory = dir.join("recoveries");
        assert!(preserve_at(
            &dir,
            &directory,
            &main,
            &cache,
            "current.db",
            "migration",
            "doc"
        )
        .unwrap_err()
        .contains("不属于当前资料库"));
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 0);
        assert_eq!(
            cache
                .query_row("SELECT count(*) FROM recoveries", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            cache
                .query_row("SELECT count(*) FROM sessions", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
