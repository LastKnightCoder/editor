use std::fs;
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::database::{resolve_embedding_fingerprint_for_setting, trigger_reconcile_for_database};
use crate::models::{BootstrapResponse, DatabaseItem, SettingWriteResponse};

static SETTING_WRITE_LOCK: Mutex<()> = Mutex::new(());

pub const APP_DIR_NAME: &str = ".editor";
pub const DEFAULT_DATABASE_NAME: &str = "data.db";

pub fn resolve_app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app_data_dir: {e}"))?;
    Ok(app_data_dir.join(APP_DIR_NAME))
}

pub fn resolve_setting_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_app_dir(app)?.join("setting.json"))
}

pub fn resolve_database_path(app: &AppHandle, db_name: &str) -> Result<PathBuf, String> {
    Ok(resolve_app_dir(app)?.join(db_name))
}

pub fn normalize_database_name(input: &str) -> Result<String, String> {
    let mut name = input.trim().to_string();
    if name.is_empty() {
        return Err("DB_NAME_INVALID".to_string());
    }
    if !name.ends_with(".db") {
        name.push_str(".db");
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("DB_NAME_INVALID".to_string());
    }
    let valid = name
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.');
    if !valid {
        return Err("DB_NAME_INVALID".to_string());
    }
    Ok(name)
}

fn default_setting_value() -> Value {
    json!({
      "darkMode": false,
      "fontSetting": {
        "chineseFont": "华文楷体",
        "englishFont": "American TypeWriter",
        "codeFont": "JetBrains Mono",
        "fontSize": 16
      },
      "appearance": {
        "backgroundType": "solid",
        "backgroundAnimation": false
      },
      "imageBed": {
        "active": "local", "enableCompression": true, "local": { "path": "resources" },
        "plugin": { "id": "", "configurations": {} }
      },
      "sync": {
        "active": "plugin", "version": 1, "autoSyncEnabled": false,
        "plugin": { "id": "", "configurations": {} }
      },
      "database": {
        "active": "data.db",
        "databases": [{ "name": "data.db", "version": 1 }]
      },
      "collaboration": {
        "enable": true,
        "serverUrl": "https://collab.taunote.app",
        "nickname": "Tau 用户"
      },
      "module": {
        "card": { "enable": true, "name": "卡片" },
        "flashcard": { "enable": true, "name": "闪卡中心" },
        "article": { "enable": true, "name": "文章" },
        "whiteBoard": { "enable": true, "name": "白板" },
        "project": { "enable": true, "name": "项目" },
        "dailyNote": { "enable": true, "name": "日记" },
        "pdf": { "enable": true, "name": "PDF" },
        "slides": { "enable": true, "name": "幻灯片" },
        "vecDocuments": { "enable": true, "name": "索引数据库" },
        "weread": { "enable": true, "name": "微信读书" },
        "webview": { "enable": true, "name": "网页浏览" },
        "dataView": { "enable": true, "name": "数据" },
        "pomodoro": { "enable": true, "name": "番茄专注" },
        "todo": { "enable": true, "name": "任务列表" },
        "calendar": { "enable": true, "name": "日历" },
        "chatManagement": { "enable": true, "name": "聊天管理" },
        "skillManagement": { "enable": true, "name": "Skill 管理" },
        "settings": { "enable": true, "name": "设置" }
      },
      "moduleOrder": [
        "card",
        "flashcard",
        "article",
        "whiteBoard",
        "project",
        "dailyNote",
        "pdf",
        "slides",
        "vecDocuments",
        "calendar",
        "chatManagement",
        "skillManagement",
        "pomodoro",
        "todo",
        "weread",
        "webview",
        "dataView",
        "settings"
      ],
      "textToSpeech": {
        "currentModel": "doubao",
        "doubao": {
          "accessToken": "",
          "secretKey": "",
          "appid": "",
          "token": "",
          "currentSpeakerId": ""
        }
      },
      "ttsProviders": [],
      "ttsUsageSettings": { "default": null },
      "transcription": {
        "currentModel": "faster-whisper-base",
        "downloadSource": "modelscope",
        "device": "cuda"
      },
      "embeddingProvider": {
        "currentConfigId": "",
        "configs": []
      },
      "integration": {
        "minimax": {
          "enabled": false,
          "apiKey": "",
          "userInfo": { "isConnected": false }
        },
        "weread": {
          "enabled": false,
          "loginMethod": "qr",
          "cookies": [],
          "lastCookieTime": 0,
          "userInfo": { "name": "", "vid": "", "isConnected": false }
        },
        "podcastTTS": {
          "active": "minimax",
          "currentVoiceId": "",
          "doubao": { "accessToken": "", "secretKey": "", "appid": "", "token": "" }
        }
      },
      "misc": {
        "webClip": { "translateToChinese": false },
        "video": { "autoCacheRemote": true },
        "image": { "autoCacheRemote": true },
        "audio": { "autoCacheRemote": true },
        "transcription": {
          "segmentationLevel": "sentence",
          "useLLMOptimization": false,
          "enableLongVideoSegmentation": true
        }
      },
      "publish": {
        "active": "github",
        "github": {
          "repo": "",
          "branch": "gh-pages",
          "basePath": "/",
          "useGitCli": true,
          "gitWorkingDir": ""
        },
        "s3": {
          "bucket": "",
          "region": "",
          "path": "",
          "basePath": "/"
        },
        "local": { "basePath": "/" },
        "site": { "title": "", "description": "" }
      }
    })
}

fn merge_defaults(target: &mut Value, defaults: &Value) {
    match (target, defaults) {
        (Value::Object(target_map), Value::Object(default_map)) => {
            for (key, default_value) in default_map {
                if let Some(existing) = target_map.get_mut(key) {
                    merge_defaults(existing, default_value);
                } else {
                    target_map.insert(key.clone(), default_value.clone());
                }
            }
        }
        _ => {}
    }
}

fn validate_pointer_type(setting: &Value, pointer: &str, expected: &str) -> Result<(), String> {
    let value = setting
        .pointer(pointer)
        .ok_or_else(|| format!("SETTING_INVALID: 缺少字段 `{pointer}`"))?;

    let matched = match expected {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        _ => false,
    };
    if matched {
        Ok(())
    } else {
        Err(format!(
            "SETTING_INVALID: 字段 `{pointer}` 类型错误，期望 {expected}"
        ))
    }
}

fn validate_setting_shape(setting: &Value) -> Result<(), String> {
    if !setting.is_object() {
        return Err("SETTING_INVALID: setting.json 根节点必须是对象".to_string());
    }

    validate_pointer_type(setting, "/database", "object")?;
    validate_pointer_type(setting, "/database/active", "string")?;
    validate_pointer_type(setting, "/database/databases", "array")?;

    validate_pointer_type(setting, "/sync", "object")?;
    validate_pointer_type(setting, "/sync/active", "string")?;
    for section in ["sync", "imageBed"] {
        for (field, kind) in [
            ("", "object"),
            ("/active", "string"),
            ("/plugin", "object"),
            ("/plugin/id", "string"),
            ("/plugin/configurations", "object"),
        ] {
            let pointer = format!("/{section}{field}");
            if setting.pointer(&pointer).is_some() {
                validate_pointer_type(setting, &pointer, kind)?;
            }
        }
        for key in ["webdav", "aliOSS", "github", "s3"] {
            let pointer = format!("/{section}/{key}");
            if setting.pointer(&pointer).is_some() {
                validate_pointer_type(setting, &pointer, "object")?;
            }
        }
    }
    if setting.get("integration").is_some() {
        validate_pointer_type(setting, "/integration", "object")?;
    }
    crate::tts_settings::validate_shape(setting)?;

    Ok(())
}

fn database_items_from_setting(setting: &Value) -> Vec<DatabaseItem> {
    let mut items: Vec<DatabaseItem> = vec![];
    if let Some(array) = setting
        .get("database")
        .and_then(|v| v.get("databases"))
        .and_then(|v| v.as_array())
    {
        for item in array {
            let raw_name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let Ok(name) = normalize_database_name(raw_name) else {
                continue;
            };
            let version = item["version"]
                .as_u64()
                .filter(|value| *value <= 9_007_199_254_740_991)
                .unwrap_or(0);
            if items.iter().all(|db| db.name != name) {
                items.push(DatabaseItem { name, version });
            }
        }
    }
    items
}

fn normalize_database_section(setting: &mut Value) {
    let active_raw = setting
        .get("database")
        .and_then(|v| v.get("active"))
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_DATABASE_NAME);
    let active =
        normalize_database_name(active_raw).unwrap_or_else(|_| DEFAULT_DATABASE_NAME.to_string());

    let mut databases = database_items_from_setting(setting);
    if databases.is_empty() {
        databases.push(DatabaseItem {
            name: DEFAULT_DATABASE_NAME.to_string(),
            version: 0,
        });
    }
    if databases.iter().all(|db| db.name != active) {
        databases.push(DatabaseItem {
            name: active.clone(),
            version: 0,
        });
    }

    if let Some(database) = setting.get_mut("database") {
        database["active"] = Value::String(active);
        database["databases"] = serde_json::to_value(databases).unwrap_or_else(|_| json!([]));
    }
}

pub fn ensure_setting_compat(raw: Value) -> Value {
    let mut setting = if raw.is_object() { raw } else { json!({}) };
    if let Some(object) = setting.as_object_mut() {
        object.remove("mobileSyncBases");
    }
    retire_image_bed_keys(&mut setting);
    crate::provider_settings::migrate(&mut setting);
    let defaults = default_setting_value();
    merge_defaults(&mut setting, &defaults);
    // 已退役的模块开关（问题管理迁为桌面插件，PS-046）
    const RETIRED_MODULES: [&str; 2] = ["resourceManagement", "question"];
    if let Some(modules) = setting.get_mut("module").and_then(Value::as_object_mut) {
        for key in RETIRED_MODULES {
            modules.remove(key);
        }
    }
    if let Some(order) = setting.get_mut("moduleOrder").and_then(Value::as_array_mut) {
        order.retain(|key| {
            !key.as_str()
                .is_some_and(|key| RETIRED_MODULES.contains(&key))
        });
    }
    retire_image_bed_keys(&mut setting);
    normalize_database_section(&mut setting);
    setting
}

/// 已退役的上传设置：GitHub CDN 改写不再提供。升级前 enableCompression 只管后端转 webp、
/// 前端始终预压缩，升级后它同时控制两端；旧版设置（带 github.cdn）首次升级时打开压缩，
/// 延续升级前的实际效果，之后按用户的选择保留。
fn retire_image_bed_keys(setting: &mut Value) {
    let Some(image_bed) = setting.get_mut("imageBed").and_then(Value::as_object_mut) else {
        return;
    };
    let legacy = image_bed
        .get_mut("github")
        .and_then(Value::as_object_mut)
        .and_then(|github| github.remove("cdn"))
        .is_some();
    if legacy {
        image_bed.insert("enableCompression".to_string(), Value::Bool(true));
    }
    image_bed.remove("githubCdn");
}

pub fn save_setting_value(app: &AppHandle, setting: &Value) -> Result<(), String> {
    let app_dir = resolve_app_dir(app)?;
    fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app dir: {e}"))?;
    let setting_path = resolve_setting_path(app)?;
    let payload = serde_json::to_string_pretty(setting)
        .map_err(|e| format!("Failed to serialize setting: {e}"))?;
    let temporary = setting_path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options
        .open(&temporary)
        .map_err(|e| format!("Failed to write setting.json: {e}"))?;
    file.write_all(payload.as_bytes())
        .map_err(|e| format!("Failed to write setting.json: {e}"))?;
    file.sync_all()
        .map_err(|e| format!("Failed to sync setting.json: {e}"))?;
    fs::rename(&temporary, &setting_path)
        .map_err(|e| format!("Failed to commit setting.json: {e}"))?;
    Ok(())
}

pub fn load_or_init_setting(app: &AppHandle) -> Result<Value, String> {
    let app_dir = resolve_app_dir(app)?;
    fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app dir: {e}"))?;

    let setting_path = resolve_setting_path(app)?;
    if !setting_path.exists() {
        let setting = ensure_setting_compat(json!({}));
        save_setting_value(app, &setting)?;
        return Ok(setting);
    }

    let content = fs::read_to_string(&setting_path)
        .map_err(|e| format!("Failed to read setting.json: {e}"))?;
    let parsed = serde_json::from_str::<Value>(&content)
        .map_err(|e| format!("SETTING_INVALID: setting.json 解析失败: {e}"))?;
    validate_setting_shape(&parsed)?;
    let mut upgraded = parsed.clone();
    retire_image_bed_keys(&mut upgraded);
    let statuses = crate::provider_settings::migrate(&mut upgraded);
    crate::tts_settings::migrate(&mut upgraded);
    if upgraded != parsed {
        let backup = app_dir.join(format!(
            "setting.storage-plugins-{:x}.bak",
            Sha256::digest(content.as_bytes())
        ));
        if !backup.exists() {
            fs::copy(&setting_path, &backup).map_err(|_| "备份旧存储配置失败")?;
        }
        #[cfg(unix)]
        fs::set_permissions(&backup, fs::Permissions::from_mode(0o600))
            .map_err(|_| "设置备份权限失败")?;
        crate::provider_settings::migrate_status_files(&app_dir, &statuses)?;
    }
    let setting = ensure_setting_compat(upgraded);
    if setting != parsed {
        save_setting_value(app, &setting)?;
    }
    Ok(setting)
}

pub fn update_setting_value(
    app: &AppHandle,
    update: impl FnOnce(&mut Value),
) -> Result<(), String> {
    mutate_setting_value(app, |setting| {
        update(setting);
        Ok(())
    })
}

pub fn mutate_setting_value<T>(
    app: &AppHandle,
    update: impl FnOnce(&mut Value) -> Result<T, String>,
) -> Result<T, String> {
    let _guard = SETTING_WRITE_LOCK
        .lock()
        .map_err(|_| "设置写入状态不可用")?;
    let mut setting = load_or_init_setting(app)?;
    let result = update(&mut setting)?;
    save_setting_value(app, &setting)?;
    Ok(result)
}

pub fn get_active_database_name(setting: &Value) -> String {
    let raw = setting
        .get("database")
        .and_then(|v| v.get("active"))
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_DATABASE_NAME);
    normalize_database_name(raw).unwrap_or_else(|_| DEFAULT_DATABASE_NAME.to_string())
}

pub fn get_database_items(setting: &Value) -> Vec<DatabaseItem> {
    let active = get_active_database_name(setting);
    let mut items = database_items_from_setting(setting);
    if items.iter().all(|db| db.name != active) {
        items.push(DatabaseItem {
            name: active,
            version: 0,
        });
    }
    items
}

pub fn get_database_version(setting: &Value, db_name: &str) -> u64 {
    get_database_items(setting)
        .into_iter()
        .find(|db| db.name == db_name)
        .map(|db| db.version)
        .unwrap_or(0)
}

pub fn ensure_database_entry(setting: &mut Value, db_name: &str) -> bool {
    let mut items = get_database_items(setting);
    let exists = items.iter().any(|db| db.name == db_name);
    if !exists {
        items.push(DatabaseItem {
            name: db_name.to_string(),
            version: 0,
        });
    }
    if let Some(database) = setting.get_mut("database") {
        database["databases"] = serde_json::to_value(items).unwrap_or_else(|_| json!([]));
    }
    !exists
}

pub fn set_database_version(setting: &mut Value, db_name: &str, version: u64) {
    let mut items = get_database_items(setting);
    if let Some(db) = items.iter_mut().find(|db| db.name == db_name) {
        db.version = version;
    } else {
        items.push(DatabaseItem {
            name: db_name.to_string(),
            version,
        });
    }
    if let Some(database) = setting.get_mut("database") {
        database["databases"] = serde_json::to_value(items).unwrap_or_else(|_| json!([]));
    }
}

pub fn set_active_database_name(setting: &mut Value, db_name: &str) {
    if let Some(database) = setting.get_mut("database") {
        database["active"] = Value::String(db_name.to_string());
    }
}

#[tauri::command]
pub fn read_setting_json(app: AppHandle) -> Result<String, String> {
    let setting = load_or_init_setting(&app)?;
    serde_json::to_string_pretty(&setting).map_err(|e| format!("Failed to serialize setting: {e}"))
}

#[tauri::command]
pub fn write_setting_json(app: AppHandle, payload: String) -> SettingWriteResponse {
    let Ok(_guard) = SETTING_WRITE_LOCK.lock() else {
        return SettingWriteResponse {
            ok: false,
            code: Some("SETTING_INVALID".into()),
            message: "设置写入状态不可用".into(),
        };
    };
    let parsed = serde_json::from_str::<Value>(&payload);
    let Ok(value) = parsed else {
        return SettingWriteResponse {
            ok: false,
            code: Some("SETTING_INVALID".to_string()),
            message: "setting.json 不是合法 JSON".to_string(),
        };
    };

    if let Err(err) = validate_setting_shape(&value) {
        return SettingWriteResponse {
            ok: false,
            code: Some("SETTING_INVALID".to_string()),
            message: err,
        };
    }

    if let Err(err) = crate::provider_settings::assert_current(&value) {
        return SettingWriteResponse {
            ok: false,
            code: Some("SETTING_INVALID".into()),
            message: err,
        };
    }
    let mut normalized = ensure_setting_compat(value);
    let current = match load_or_init_setting(&app) {
        Ok(value) => value,
        Err(error) => {
            return SettingWriteResponse {
                ok: false,
                code: Some("SETTING_INVALID".into()),
                message: error,
            }
        }
    };
    let previous_fingerprint = resolve_embedding_fingerprint_for_setting(&current);
    crate::provider_settings::preserve_managed_fields(&mut normalized, &current);

    if let Err(err) = save_setting_value(&app, &normalized) {
        return SettingWriteResponse {
            ok: false,
            code: Some("SETTING_INVALID".to_string()),
            message: err,
        };
    }

    let next_fingerprint = resolve_embedding_fingerprint_for_setting(&normalized);
    if previous_fingerprint != next_fingerprint {
        let db_name = get_active_database_name(&normalized);
        crate::logger::info(format!(
            "[mobile-setting] embedding fingerprint changed, trigger reconcile: db={}",
            db_name
        ));
        trigger_reconcile_for_database(&app, &db_name);
    }

    SettingWriteResponse {
        ok: true,
        code: None,
        message: "设置保存成功".to_string(),
    }
}

#[tauri::command]
pub fn bootstrap_app(app: AppHandle) -> Result<BootstrapResponse, String> {
    let mut setting = load_or_init_setting(&app)?;
    let active_database = get_active_database_name(&setting);
    let _ = ensure_database_entry(&mut setting, &active_database);
    save_setting_value(&app, &setting)?;

    crate::database::ensure_database_file(&app, &active_database)?;
    crate::database::trigger_reconcile_for_database(&app, &active_database);

    Ok(BootstrapResponse {
        app_dir: resolve_app_dir(&app)?.to_string_lossy().to_string(),
        setting_path: resolve_setting_path(&app)?.to_string_lossy().to_string(),
        active_database,
        databases: get_database_items(&setting),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_settings_remain_valid_after_another_load() {
        let setting = ensure_setting_compat(json!({}));
        assert!(
            validate_setting_shape(&setting).is_ok(),
            "{:?}",
            validate_setting_shape(&setting)
        );
        assert_eq!(ensure_setting_compat(setting.clone()), setting);
    }
    #[test]
    fn tts_defaults_and_shape_validation_are_safe() {
        let setting = ensure_setting_compat(json!({}));
        assert_eq!(setting["ttsProviders"], json!([]));
        assert_eq!(setting["ttsUsageSettings"]["default"], Value::Null);
        assert!(validate_setting_shape(&setting).is_ok());

        let mut invalid = setting.clone();
        invalid["ttsProviders"] = json!({});
        assert!(validate_setting_shape(&invalid).is_err());
        invalid = setting.clone();
        invalid["ttsProviders"] = json!([{
            "id": "a",
            "name": "账号",
            "pluginId": "tau.tts-minimax",
            "config": {},
            "models": [{ "id": 1 }]
        }]);
        assert!(validate_setting_shape(&invalid).is_err());
        invalid = setting;
        invalid["ttsUsageSettings"]["default"] = json!({
            "providerId": "a",
            "modelId": "m"
        });
        assert!(validate_setting_shape(&invalid).is_err());
    }

    #[test]
    fn retired_modules_are_removed() {
        let setting = ensure_setting_compat(json!({
            "module": { "question": { "enable": true, "name": "问题管理" }, "todo": { "enable": false, "name": "任务列表" } },
            "moduleOrder": ["question", "todo", "resourceManagement"]
        }));
        assert!(setting["module"].get("question").is_none());
        assert_eq!(setting["module"]["todo"]["enable"], json!(false));
        let order = setting["moduleOrder"].as_array().unwrap();
        assert!(!order
            .iter()
            .any(|key| key == "question" || key == "resourceManagement"));
        assert!(order.iter().any(|key| key == "todo"));
    }

    #[test]
    fn legacy_setting_turns_compression_on_once() {
        let setting = ensure_setting_compat(json!({
            "imageBed": {
                "active": "github",
                "enableCompression": false,
                "githubCdn": "jsdelivr",
                "github": { "repo": "assets", "branch": "main", "cdn": "jsdelivr", "pathPrefix": "" }
            }
        }));
        let image_bed = &setting["imageBed"];
        assert!(image_bed["github"].get("cdn").is_none());
        assert!(image_bed.get("githubCdn").is_none());
        assert_eq!(image_bed["enableCompression"], json!(true));
        assert_eq!(
            image_bed["plugin"]["configurations"]["tau.upload-github"]["repo"],
            json!("assets")
        );

        // 升级后用户关掉压缩，再次加载保持关闭
        let mut upgraded = setting.clone();
        upgraded["imageBed"]["enableCompression"] = json!(false);
        let reloaded = ensure_setting_compat(upgraded);
        assert_eq!(reloaded["imageBed"]["enableCompression"], json!(false));
    }

    #[test]
    fn fresh_setting_saves_uploads_locally() {
        let setting = ensure_setting_compat(json!({}));
        assert_eq!(setting["imageBed"]["active"], json!("local"));
        assert_eq!(setting["imageBed"]["enableCompression"], json!(true));
    }
}
