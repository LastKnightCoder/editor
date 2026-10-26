use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, WebviewWindow};

fn section(target: &str) -> Result<&'static str, String> {
    match target {
        "sync" => Ok("sync"),
        "upload" => Ok("imageBed"),
        "asr" => Ok("speechInput"),
        _ => Err("存储领域无效".into()),
    }
}
pub(crate) fn validate_plugin_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 128
        || !id.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'.' || byte == b'-'
        })
    {
        return Err("插件身份无效".into());
    }
    Ok(())
}
pub(crate) fn validate_plugin_config(config: &Value) -> Result<(), String> {
    if serde_json::to_vec(config)
        .map_err(|_| "插件配置无效")?
        .len()
        > 1024 * 1024
    {
        return Err("插件配置超过 1 MiB".into());
    }
    Ok(())
}
pub(crate) fn check_database(setting: &Value, database: &str) -> Result<(), String> {
    if crate::setting::get_active_database_name(setting) != database {
        return Err("插件工作区已失效".into());
    }
    Ok(())
}
#[tauri::command]
pub fn plugin_provider_save(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
    target: String,
    plugin_id: String,
    config: Value,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    validate_plugin_id(&plugin_id)?;
    validate_plugin_config(&config)?;
    let section = section(&target)?;
    if target == "asr"
        && (config.get("config").is_none()
            || config["modelId"]
                .as_str()
                .is_none_or(|id| id.trim().is_empty()))
    {
        return Err("识别模型配置无效".into());
    }
    crate::setting::mutate_setting_value(&app, |setting| {
        check_database(setting, &database)?;
        if target == "asr" && !setting["speechInput"].is_object() {
            setting["speechInput"] = json!({"active":"native","language":"zh-CN","plugin":{"id":"","configurations":{}}});
        }
        if !setting[section]["plugin"].is_object() {
            setting[section]["plugin"] = json!({ "id": "", "configurations": {} });
        }
        if !setting[section]["plugin"]["configurations"].is_object() {
            return Err("插件配置存储损坏".into());
        }
        setting[section]["plugin"]["configurations"][&plugin_id] = config;
        Ok(setting.clone())
    })
}
#[tauri::command]
pub fn plugin_provider_select(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
    target: String,
    plugin_id: String,
    expected_config: Value,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    let section = section(&target)?;
    crate::setting::mutate_setting_value(&app, |setting| {
        check_database(setting, &database)?;
        if target == "asr" && !setting["speechInput"].is_object() {
            setting["speechInput"] = json!({"active":"native","language":"zh-CN","plugin":{"id":"","configurations":{}}});
        }
        if target == "upload" && plugin_id == "local" {
            setting[section]["active"] = json!("local");
        } else if target == "asr" && plugin_id == "native" {
            setting[section]["active"] = json!("native");
        } else {
            validate_plugin_id(&plugin_id)?;
            if setting[section]["plugin"]["configurations"].get(&plugin_id)
                != Some(&expected_config)
            {
                return Err("配置已变化，请重新测试后再选用".into());
            }
            setting[section]["active"] = json!("plugin");
            setting[section]["plugin"]["id"] = json!(plugin_id);
        }
        Ok(setting.clone())
    })
}

/// 普通设置提交不回写原生管理的数据库状态和提供方配置。
pub(crate) fn preserve_managed_fields(next: &mut Value, current: &Value) {
    next["database"] = current["database"].clone();
    for field in ["speechInput", "ttsProviders", "ttsUsageSettings"] {
        if let Some(value) = current.get(field) {
            next[field] = value.clone();
        } else if let Some(object) = next.as_object_mut() {
            object.remove(field);
        }
    }
    for section in ["sync", "imageBed"] {
        next[section]["active"] = current[section]["active"].clone();
        next[section]["plugin"] = current[section]["plugin"].clone();
    }
}

fn text(value: &Value) -> &str {
    value.as_str().unwrap_or("")
}
fn short_hash(value: &str) -> String {
    format!("{:x}", Sha1::digest(value.as_bytes()))[..8].into()
}
fn plugin_id(key: &str, upload: bool) -> String {
    let suffix = if key == "aliOSS" { "oss" } else { key };
    // WebDAV 同包提供两个领域，配置仍分别存放。
    format!(
        "tau.{}-{suffix}",
        if upload && key != "webdav" {
            "upload"
        } else {
            "sync"
        }
    )
}
fn legacy_prefix<'a>(key: &str, upload: bool, target: &'a Value) -> &'a str {
    if key == "aliOSS" && !upload {
        let path = target.get("path").map(text).unwrap_or("/");
        if path.is_empty() {
            text(&target["pathPrefix"])
        } else {
            path
        }
    } else {
        text(&target["pathPrefix"])
    }
}

pub(crate) fn status_file_name(id: &str, config: &Value) -> String {
    let digest = Sha256::digest(serde_json::to_vec(&json!([id, config])).expect("配置可序列化"));
    format!("plugin-{}.json", &format!("{digest:x}")[..24])
}

/// 只在升级入口读取旧字段，运行时提供方不识别具体服务身份。
pub(crate) fn migrate(setting: &mut Value) -> Vec<(String, String)> {
    let source = setting.clone();
    let mut statuses = Vec::new();
    for (section, upload) in [("sync", false), ("imageBed", true)] {
        if !setting.get(section).is_some_and(Value::is_object) {
            continue;
        }
        let mut configurations = source[section]["plugin"]["configurations"]
            .as_object()
            .cloned()
            .unwrap_or_default();
        for key in ["s3", "aliOSS", "github", "webdav"] {
            if source[section].get(key).is_none() && text(&source[section]["active"]) != key {
                continue;
            }
            let id = plugin_id(key, upload);
            let account = &source["integration"][key];
            let target = &source[section][key];
            let config = if key == "github" {
                json!({ "token": text(&account["token"]), "owner": text(&account["user"]["name"]),
                    "email": text(&account["user"]["email"]), "repo": text(&target["repo"]),
                    "branch": text(&target["branch"]), "pathPrefix": legacy_prefix(key, upload, target).trim().trim_matches('/'),
                    "publicBaseUrl": "" })
            } else {
                let mut fields = account.as_object().cloned().unwrap_or_default();
                fields.remove("enabled");
                fields.extend(target.as_object().cloned().unwrap_or_default());
                let credentials: &[&str] = match key {
                    "s3" => &["accessKeyId", "secretAccessKey", "endpoint"],
                    "aliOSS" => &["accessKeyId", "accessKeySecret"],
                    "webdav" => &["url", "username", "password"],
                    _ => &[],
                };
                for field in credentials {
                    fields.insert((*field).into(), json!(text(&account[*field])));
                }
                if key == "s3" {
                    fields.insert(
                        "urlStyle".into(),
                        json!(if account["urlStyle"] == "virtualHosted" {
                            "virtualHosted"
                        } else {
                            "path"
                        }),
                    );
                }
                fields.insert(
                    if key == "aliOSS" && !upload {
                        "path"
                    } else {
                        "pathPrefix"
                    }
                    .into(),
                    json!(legacy_prefix(key, upload, target).trim().trim_matches('/')),
                );
                Value::Object(fields)
            };
            if !configurations.contains_key(&id) {
                if !upload {
                    let prefix = legacy_prefix(key, upload, target);
                    let old = match key {
                        "github" => format!(
                            "github-{}-{}.json",
                            text(&target["repo"]),
                            text(&target["branch"])
                        ),
                        "webdav" => {
                            let url = text(&account["url"]);
                            let host = url::Url::parse(url)
                                .ok()
                                .and_then(|url| url.host_str().map(str::to_string))
                                .unwrap_or_else(|| url.into());
                            format!("webdav-{}-{}.json", short_hash(&host), short_hash(prefix))
                        }
                        _ => format!(
                            "{}-{}-{}.json",
                            if key == "aliOSS" { "alioss" } else { key },
                            text(&target["bucket"]),
                            short_hash(prefix)
                        ),
                    };
                    statuses.push((old, status_file_name(&id, &config)));
                }
                configurations.insert(id.clone(), config);
            }
            if text(&source[section]["active"]) == key {
                setting[section]["active"] = json!("plugin");
                if !setting[section]["plugin"].is_object() {
                    setting[section]["plugin"] = json!({});
                }
                setting[section]["plugin"]["id"] = json!(id);
            }
            setting[section].as_object_mut().unwrap().remove(key);
        }
        if !configurations.is_empty()
            || setting
                .get(section)
                .and_then(|item| item.get("active"))
                .is_some_and(|active| active == "plugin")
        {
            if !setting[section]["plugin"].is_object() {
                setting[section]["plugin"] = json!({ "id": "" });
            }
            setting[section]["plugin"]["configurations"] = Value::Object(configurations);
        }
    }
    if let Some(integration) = setting
        .get_mut("integration")
        .and_then(Value::as_object_mut)
    {
        for key in ["s3", "aliOSS", "github", "webdav"] {
            integration.remove(key);
        }
    }
    statuses
}

pub(crate) fn migrate_status_files(
    directory: &Path,
    entries: &[(String, String)],
) -> Result<(), String> {
    let directory = directory.join("sync-status");
    for (old, next) in entries {
        let old = directory.join(old);
        let next = directory.join(next);
        if !old.exists() || next.exists() {
            continue;
        }
        let mut value: Value =
            serde_json::from_slice(&fs::read(&old).map_err(|_| "读取旧资源账本失败")?)
                .map_err(|_| "旧资源账本损坏，请恢复备份后重试升级")?;
        value["provider"] = json!("plugin");
        value["config"] = json!({});
        let temporary = next.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        fs::write(
            &temporary,
            serde_json::to_vec(&value).map_err(|_| "资源账本无法序列化")?,
        )
        .map_err(|_| "写入资源账本失败")?;
        fs::rename(temporary, next).map_err(|_| "提交资源账本失败")?;
    }
    Ok(())
}

pub(crate) fn assert_current(setting: &Value) -> Result<(), String> {
    if ["s3", "aliOSS", "github", "webdav"]
        .iter()
        .any(|key| setting["integration"].get(key).is_some())
    {
        return Err("SETTING_INVALID:旧账号配置已升级，请重新加载设置".into());
    }
    for section in ["sync", "imageBed"] {
        if let Some(active) = setting[section].get("active") {
            if active != "plugin" && !(section == "imageBed" && active == "local") {
                return Err("SETTING_INVALID:旧存储选择已升级，请重新加载设置".into());
            }
        }
        if ["s3", "aliOSS", "github", "webdav"]
            .iter()
            .any(|key| setting[section].get(key).is_some())
        {
            return Err("SETTING_INVALID:旧存储配置已升级，请重新加载设置".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_paths_preserve_effective_object_names_and_old_ledger_identity() {
        let mut value = json!({ "sync": { "active": "s3", "s3": { "bucket": "fixture", "pathPrefix": " ///notes//archive/// " } },
            "imageBed": { "active": "github", "github": { "pathPrefix": " /photos/ " } } });
        let statuses = migrate(&mut value);
        assert_eq!(
            value["sync"]["plugin"]["configurations"]["tau.sync-s3"]["pathPrefix"],
            "notes//archive"
        );
        assert_eq!(
            value["imageBed"]["plugin"]["configurations"]["tau.upload-github"]["pathPrefix"],
            "photos"
        );
        assert_eq!(
            statuses[0].0,
            format!("s3-fixture-{}.json", short_hash(" ///notes//archive/// "))
        );
    }
    #[test]
    fn migration_uses_actual_mobile_credential_and_oss_path_semantics() {
        let mut value = json!({ "integration": { "s3": { "accessKeyId": "current", "secretAccessKey": "current", "urlStyle": "" }, "aliOSS": { "accessKeyId": "oss", "accessKeySecret": "oss" } },
            "sync": { "active": "s3", "s3": { "accessKeyId": "stale", "bucket": "notes" }, "aliOSS": { "path": "", "pathPrefix": "effective-prefix" } } });
        migrate(&mut value);
        assert_eq!(
            value["sync"]["plugin"]["configurations"]["tau.sync-s3"]["accessKeyId"],
            "current"
        );
        assert_eq!(
            value["sync"]["plugin"]["configurations"]["tau.sync-s3"]["urlStyle"],
            "path"
        );
        assert_eq!(
            value["sync"]["plugin"]["configurations"]["tau.sync-oss"]["path"],
            "effective-prefix"
        );
    }
    #[test]
    fn stale_general_settings_cannot_overwrite_provider_settings() {
        let current = json!({ "database": { "active": "B.db", "databases": [{ "name": "B.db", "version": 7 }] },
            "sync": { "active": "plugin", "plugin": { "id": "fixture.sync", "configurations": { "fixture.sync": { "token": "new" } } } },
            "imageBed": { "active": "local", "plugin": { "id": "", "configurations": {} } },
            "speechInput": { "active": "plugin", "plugin": { "id": "fixture.asr", "configurations": {} } },
            "ttsProviders": [{ "id": "a", "name": "账号", "pluginId": "tau.tts-minimax", "config": { "apiKey": "new" }, "models": [{ "id": "m1" }] }],
            "ttsUsageSettings": { "default": { "providerId": "a", "modelId": "m1", "voiceId": "voice" } } });
        let mut stale = json!({ "database": {}, "sync": {}, "imageBed": { "enableCompression": false },
            "speechInput": { "active": "native" }, "ttsProviders": [], "ttsUsageSettings": { "default": null } });
        preserve_managed_fields(&mut stale, &current);
        assert_eq!(stale["sync"], current["sync"]);
        assert_eq!(stale["database"], current["database"]);
        assert_eq!(stale["speechInput"], current["speechInput"]);
        assert_eq!(stale["ttsProviders"], current["ttsProviders"]);
        assert_eq!(stale["ttsUsageSettings"], current["ttsUsageSettings"]);
        assert_eq!(stale["imageBed"]["enableCompression"], false);
        assert!(check_database(&current, "A.db").is_err());
    }
    #[test]
    fn shared_legacy_account_becomes_independent_configs_and_keeps_paths() {
        let mut value = json!({ "integration": { "github": { "token": "fixture-token", "user": { "name": "fixture" } } },
            "sync": { "active": "github", "github": { "repo": "notes", "branch": "main", "pathPrefix": "private" } },
            "imageBed": { "active": "github", "github": { "repo": "assets", "branch": "images", "pathPrefix": "photos" } } });
        let statuses = migrate(&mut value);
        assert_eq!(statuses.len(), 1);
        assert_eq!(value["sync"]["plugin"]["id"], "tau.sync-github");
        assert_eq!(value["imageBed"]["plugin"]["id"], "tau.upload-github");
        assert_eq!(
            value["imageBed"]["plugin"]["configurations"]["tau.upload-github"]["pathPrefix"],
            "photos"
        );
        value["sync"]["plugin"]["configurations"]["tau.sync-github"]["token"] = json!("changed");
        assert_eq!(
            value["imageBed"]["plugin"]["configurations"]["tau.upload-github"]["token"],
            "fixture-token"
        );
        assert!(migrate(&mut value).is_empty());
        assert!(assert_current(&value).is_ok());
    }
    #[test]
    fn plugin_config_wins_and_webdav_upload_has_a_provider() {
        let mut value = json!({ "sync": { "active": "s3", "s3": {}, "plugin": { "configurations": { "tau.sync-s3": { "bucket": "existing" } } } },
            "imageBed": { "active": "webdav", "webdav": { "pathPrefix": "files" } },
            "integration": { "webdav": { "url": "https://example.com", "username": "fixture", "password": "fixture" } } });
        migrate(&mut value);
        assert_eq!(
            value["sync"]["plugin"]["configurations"]["tau.sync-s3"]["bucket"],
            "existing"
        );
        assert_eq!(value["imageBed"]["plugin"]["id"], "tau.sync-webdav");
    }
}
