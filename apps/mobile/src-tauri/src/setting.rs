use std::fs;
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{json, Value};
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
      "ttsProviders": [],
      "ttsUsageSettings": { "default": null },
      "transcription": {
        "currentModel": "faster-whisper-base",
        "downloadSource": "modelscope",
        "device": "cuda"
      },
      "embedding": {
        "active": null,
        "local": { "source": "modelscope", "devicePolicy": "auto", "batchSize": 8 },
        "plugins": {}
      },
      "integration": {
        "weread": {
          "enabled": false,
          "loginMethod": "qr",
          "cookies": [],
          "lastCookieTime": 0,
          "userInfo": { "name": "", "vid": "", "isConnected": false }
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
        "active": "local",
        "plugin": { "id": "", "configurations": {} },
        "local": { "basePath": "/" },
        "site": { "title": "", "publicUrl": "", "templateId": "", "fields": {} }
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

/// (指针, 期望类型, 是否必填)；父级在前，读取自愈按此顺序删除类型不符的字段。
const SHAPE: [(&str, &str, bool); 14] = [
    ("/database", "object", true),
    ("/database/active", "string", true),
    ("/database/databases", "array", true),
    ("/sync", "object", true),
    ("/sync/active", "string", true),
    ("/sync/plugin", "object", false),
    ("/sync/plugin/id", "string", false),
    ("/sync/plugin/configurations", "object", false),
    ("/imageBed", "object", false),
    ("/imageBed/active", "string", false),
    ("/imageBed/plugin", "object", false),
    ("/imageBed/plugin/id", "string", false),
    ("/imageBed/plugin/configurations", "object", false),
    ("/integration", "object", false),
];

fn validate_setting_shape(setting: &Value) -> Result<(), String> {
    if !setting.is_object() {
        return Err("SETTING_INVALID: setting.json 根节点必须是对象".to_string());
    }
    for (pointer, kind, required) in SHAPE {
        if required || setting.pointer(pointer).is_some() {
            validate_pointer_type(setting, pointer, kind)?;
        }
    }
    crate::provider_settings::assert_current(setting)?;
    crate::tts_settings::validate_shape(setting)?;

    Ok(())
}

/// 读取自愈：删除类型不符与已不支持的字段（随后由默认值补齐），返回被改动的字段指针。
fn heal_setting(setting: &mut Value) -> Vec<String> {
    let mut healed = Vec::new();
    for (pointer, kind, _) in SHAPE {
        if setting.pointer(pointer).is_some()
            && validate_pointer_type(setting, pointer, kind).is_err()
        {
            let (parent, key) = pointer.rsplit_once('/').expect("指针以 / 开头");
            if let Some(object) = setting.pointer_mut(parent).and_then(Value::as_object_mut) {
                object.remove(key);
            }
            healed.push(pointer.to_string());
        }
    }
    crate::provider_settings::heal(setting, &mut healed);
    crate::tts_settings::heal(setting, &mut healed);
    healed
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

pub fn normalize_setting(raw: Value) -> Value {
    let mut setting = if raw.is_object() { raw } else { json!({}) };
    if let Some(object) = setting.as_object_mut() {
        // 旧 embeddingProvider 已由桌面端升级为 embedding，读到旧键直接丢弃
        object.remove("embeddingProvider");
    }
    merge_defaults(&mut setting, &default_setting_value());
    normalize_database_section(&mut setting);
    setting
}

pub fn save_setting_value(app: &AppHandle, setting: &Value) -> Result<(), String> {
    validate_setting_shape(setting)?;
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
        let setting = normalize_setting(json!({}));
        save_setting_value(app, &setting)?;
        return Ok(setting);
    }

    let content =
        fs::read(&setting_path).map_err(|e| format!("Failed to read setting.json: {e}"))?;
    let (setting, healed) = repair_setting(&content);
    if !healed.is_empty() {
        backup_setting(&app_dir, &content)?;
        crate::logger::warn(format!(
            "[mobile-setting] setting.json 已备份并自愈: {}",
            healed.join(", ")
        ));
    }
    if healed.is_empty() && serde_json::from_slice::<Value>(&content).ok() == Some(setting.clone())
    {
        return Ok(setting);
    }
    save_setting_value(app, &setting)?;
    Ok(setting)
}

/// 设置读取不拒绝：解析失败或根节点不是对象时从默认值重建，其余不合规字段剔除后补默认值。
fn repair_setting(content: &[u8]) -> (Value, Vec<String>) {
    let mut healed = Vec::new();
    let mut current = match serde_json::from_slice::<Value>(content) {
        Ok(value) if value.is_object() => value,
        _ => {
            healed.push("/".to_string());
            json!({})
        }
    };
    healed.extend(heal_setting(&mut current));
    (normalize_setting(current), healed)
}

fn backup_setting(app_dir: &std::path::Path, content: &[u8]) -> Result<(), String> {
    let backup = app_dir.join(format!("setting.json.{}.bak", uuid::Uuid::new_v4()));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    options
        .open(&backup)
        .and_then(|mut file| file.write_all(content))
        .map_err(|e| format!("备份旧设置失败: {e}"))
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

    let mut normalized = normalize_setting(value);
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
        let setting = normalize_setting(json!({}));
        assert!(
            validate_setting_shape(&setting).is_ok(),
            "{:?}",
            validate_setting_shape(&setting)
        );
        assert_eq!(normalize_setting(setting.clone()), setting);
    }
    #[test]
    fn tts_defaults_and_shape_validation_are_safe() {
        let setting = normalize_setting(json!({}));
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
    fn fresh_setting_saves_uploads_locally() {
        let setting = normalize_setting(json!({}));
        assert_eq!(setting["imageBed"]["active"], json!("local"));
        assert_eq!(setting["imageBed"]["enableCompression"], json!(true));
    }

    #[test]
    fn embedding_defaults_and_legacy_key_removal() {
        let setting = normalize_setting(json!({}));
        assert_eq!(setting["embedding"]["active"], Value::Null);
        assert_eq!(
            setting["embedding"]["local"],
            json!({ "source": "modelscope", "devicePolicy": "auto", "batchSize": 8 })
        );
        assert_eq!(setting["embedding"]["plugins"], json!({}));
        assert!(setting.get("embeddingProvider").is_none());

        let legacy = normalize_setting(json!({
            "embeddingProvider": { "currentConfigId": "embedding-default-local", "configs": [] }
        }));
        assert!(legacy.get("embeddingProvider").is_none());
        assert_eq!(legacy["embedding"]["active"], Value::Null);
        assert!(validate_setting_shape(&legacy).is_ok());
    }

    #[test]
    fn current_settings_preserve_accounts_selection_and_compression() {
        let mut setting = normalize_setting(json!({}));
        setting["imageBed"]["enableCompression"] = json!(false);
        setting["sync"]["plugin"] = json!({
            "id": "test.sync", "configurations": { "test.sync": { "token": "keep" } }
        });
        setting["ttsProviders"] = json!([{
            "id": "voice", "name": "账号", "pluginId": "test.tts",
            "config": { "key": "keep" }, "models": [{ "id": "model" }]
        }]);
        assert!(validate_setting_shape(&setting).is_ok());
        assert_eq!(normalize_setting(setting.clone()), setting);
        assert!(setting["integration"].get("minimax").is_none());
        assert!(setting["integration"].get("podcastTTS").is_none());
        assert!(setting["publish"].get("github").is_none());
        assert!(setting.get("textToSpeech").is_none());
    }

    /// 0.2.9 读取后写回的设置：迁移已完成，但默认值合并又补回了空的旧键。
    fn setting_written_by_0_2_9() -> Value {
        let mut setting = normalize_setting(json!({}));
        setting["integration"]["minimax"] =
            json!({ "enabled": false, "apiKey": "", "userInfo": { "isConnected": false } });
        setting["integration"]["podcastTTS"] = json!({
            "active": "minimax",
            "currentVoiceId": "",
            "doubao": { "accessToken": "", "secretKey": "", "appid": "", "token": "" }
        });
        setting["publish"] = json!({
            "active": "github",
            "github": {
                "repo": "", "branch": "gh-pages", "basePath": "/",
                "useGitCli": true, "gitWorkingDir": ""
            },
            "s3": { "bucket": "", "region": "", "path": "", "basePath": "/" },
            "local": { "basePath": "/" },
            "site": { "title": "", "description": "" }
        });
        setting
    }

    fn repair(value: &Value) -> (Value, Vec<String>) {
        repair_setting(&serde_json::to_vec(value).unwrap())
    }

    #[test]
    fn retired_defaults_are_healed_on_read() {
        let mut setting = setting_written_by_0_2_9();
        setting["integration"]["bilibili"] = json!({
            "enabled": false,
            "credentials": { "SESSDATA": "", "bfe_id": "" },
            "userInfo": { "name": "", "avatar": "", "isLogin": false, "vipStatus": 0 }
        });
        setting["integration"]["youtube"] = json!({ "enabled": false, "proxy": "" });
        assert!(validate_setting_shape(&setting).is_err());
        let (healed, changes) = repair(&setting);
        assert!(validate_setting_shape(&healed).is_ok());
        for key in ["minimax", "podcastTTS", "bilibili", "youtube"] {
            assert!(healed["integration"].get(key).is_none(), "{key}");
        }
        assert!(changes.contains(&"/integration/bilibili".to_string()));
        assert!(healed["integration"].get("weread").is_some());
        assert_eq!(healed["publish"]["active"], json!("local"));
        assert_eq!(healed["publish"]["site"]["title"], json!(""));
        assert_eq!(healed["database"], setting["database"]);
        let (again, changes) = repair(&healed);
        assert!(changes.is_empty());
        assert_eq!(again, healed);
    }

    #[test]
    fn unsupported_services_fall_back_while_current_accounts_are_kept() {
        let mut setting = normalize_setting(json!({}));
        setting["database"] =
            json!({ "active": "B.db", "databases": [{ "name": "B.db", "version": 7 }] });
        setting["sync"] = json!({ "active": "s3", "s3": { "bucket": "old" },
            "plugin": { "id": "fixture.sync", "configurations": { "fixture.sync": { "token": "keep" } } } });
        setting["imageBed"]["active"] = json!("github");
        setting["imageBed"]["github"] = json!({ "cdn": "old" });
        setting["integration"]["s3"] = json!({ "bucket": "old" });
        setting["ttsProviders"] = json!([
            { "providerType": "minimax" },
            { "id": "a", "name": "账号", "pluginId": "tau.tts", "config": {}, "models": [{ "id": "m" }] }
        ]);
        let (healed, _) = repair(&setting);
        assert!(validate_setting_shape(&healed).is_ok());
        assert_eq!(healed["database"], setting["database"]);
        assert_eq!(healed["sync"]["active"], json!("plugin"));
        assert_eq!(healed["sync"]["plugin"], setting["sync"]["plugin"]);
        assert!(healed["sync"].get("s3").is_none());
        assert_eq!(healed["imageBed"]["active"], json!("local"));
        assert!(healed["imageBed"].get("github").is_none());
        assert!(healed["integration"].get("s3").is_none());
        assert_eq!(healed["ttsProviders"].as_array().unwrap().len(), 1);
        assert_eq!(healed["ttsProviders"][0]["id"], json!("a"));
    }

    #[test]
    fn malformed_fields_are_replaced_by_defaults() {
        let mut setting = normalize_setting(json!({}));
        setting["database"]["active"] = json!(1);
        setting["sync"] = json!("broken");
        setting["imageBed"]["plugin"] = json!([]);
        setting["integration"] = json!(null);
        setting["ttsProviders"] = json!({});
        setting["ttsUsageSettings"]["default"] = json!({ "providerId": "a", "modelId": "m" });
        let (healed, changes) = repair(&setting);
        assert!(
            validate_setting_shape(&healed).is_ok(),
            "{:?}",
            validate_setting_shape(&healed)
        );
        assert_eq!(healed["database"]["active"], json!(DEFAULT_DATABASE_NAME));
        assert_eq!(healed["sync"]["active"], json!("plugin"));
        assert_eq!(healed["ttsProviders"], json!([]));
        assert_eq!(healed["ttsUsageSettings"]["default"], Value::Null);
        assert!(!changes.is_empty());
    }

    #[test]
    fn unreadable_setting_is_rebuilt_from_defaults() {
        for content in [&b"{ not json"[..], b"[]", b"null"] {
            let (healed, changes) = repair_setting(content);
            assert_eq!(healed, normalize_setting(json!({})));
            assert_eq!(changes, vec!["/".to_string()]);
        }
    }

    #[test]
    fn writes_with_unsupported_settings_are_still_rejected() {
        for (section, value) in [
            ("sync", json!({ "active": "s3", "s3": { "bucket": "old" } })),
            (
                "imageBed",
                json!({ "active": "github", "github": { "cdn": "old" } }),
            ),
            (
                "publish",
                json!({ "active": "github", "github": { "repo": "old" } }),
            ),
            ("integration", json!({ "minimax": { "apiKey": "old" } })),
            ("ttsProviders", json!([{ "providerType": "minimax" }])),
        ] {
            let mut setting = normalize_setting(json!({}));
            setting[section] = value;
            assert!(validate_setting_shape(&setting).is_err(), "{section}");
        }
    }
}
