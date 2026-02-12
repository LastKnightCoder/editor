use std::fs;
use std::path::PathBuf;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::models::{BootstrapResponse, DatabaseItem, SettingWriteResponse};

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
        "active": "github",
        "enableCompression": false,
        "github": { "repo": "", "branch": "", "cdn": null, "pathPrefix": "" },
        "aliOSS": { "bucket": "", "region": "", "pathPrefix": "" },
        "local": { "path": "resources" },
        "s3": { "bucket": "", "region": "", "pathPrefix": "" },
        "webdav": { "pathPrefix": "" }
      },
      "sync": {
        "active": "aliOSS",
        "version": 1,
        "autoSyncEnabled": false,
        "aliOSS": { "bucket": "", "region": "", "path": "/" },
        "s3": { "bucket": "", "region": "", "pathPrefix": "" },
        "webdav": { "pathPrefix": "" },
        "github": { "repo": "", "branch": "", "pathPrefix": "" }
      },
      "database": {
        "active": "data.db",
        "databases": [{ "name": "data.db", "version": 1 }]
      },
      "module": {
        "card": { "enable": true, "name": "卡片" },
        "flashcard": { "enable": true, "name": "闪卡中心" },
        "article": { "enable": true, "name": "文章" },
        "whiteBoard": { "enable": true, "name": "白板" },
        "project": { "enable": true, "name": "项目" },
        "document": { "enable": true, "name": "知识库" },
        "dailyNote": { "enable": true, "name": "日记" },
        "pdf": { "enable": true, "name": "PDF" },
        "slides": { "enable": true, "name": "幻灯片" },
        "vecDocuments": { "enable": true, "name": "索引数据库" },
        "resourceManagement": { "enable": true, "name": "资源管理" },
        "weread": { "enable": true, "name": "微信读书" },
        "webview": { "enable": true, "name": "网页浏览" },
        "dataView": { "enable": true, "name": "数据" },
        "pomodoro": { "enable": true, "name": "番茄专注" },
        "todo": { "enable": true, "name": "任务列表" },
        "question": { "enable": true, "name": "问题管理" },
        "calendar": { "enable": true, "name": "日历" },
        "chatManagement": { "enable": true, "name": "聊天管理" },
        "promptManagement": { "enable": true, "name": "Prompt 管理" },
        "skillManagement": { "enable": true, "name": "Skill 管理" },
        "settings": { "enable": true, "name": "设置" }
      },
      "moduleOrder": [
        "card",
        "flashcard",
        "article",
        "whiteBoard",
        "project",
        "document",
        "dailyNote",
        "pdf",
        "slides",
        "vecDocuments",
        "calendar",
        "chatManagement",
        "promptManagement",
        "skillManagement",
        "resourceManagement",
        "pomodoro",
        "todo",
        "question",
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
      "transcription": {
        "currentModel": "faster-whisper-base",
        "downloadSource": "modelscope",
        "device": "cuda"
      },
      "llmConfigs": [],
      "llmUsageSettings": {
        "chat": null,
        "titleSummary": null,
        "aiContinueWrite": null,
        "webClip": null,
        "podcastGeneration": null,
        "contentPolish": null,
        "flashcardGeneration": null,
        "aiJudgement": null,
        "autoTagging": null,
        "transcriptionOptimization": null,
        "videoSummary": null,
        "vibeLearningImageDescription": null,
        "vibeLearningDocSummary": null
      },
      "embeddingProvider": {
        "currentConfigId": "",
        "configs": []
      },
      "integration": {
        "bilibili": {
          "enabled": false,
          "credentials": { "SESSDATA": "", "bfe_id": "" },
          "userInfo": { "name": "", "avatar": "", "isLogin": false, "vipStatus": 0 }
        },
        "youtube": {
          "enabled": false,
          "proxy": ""
        },
        "notion": {
          "enabled": false,
          "token": "",
          "userInfo": { "name": "", "email": "", "avatar": "", "isConnected": false }
        },
        "minimax": {
          "enabled": false,
          "apiKey": "",
          "userInfo": { "isConnected": false }
        },
        "github": {
          "enabled": false,
          "token": "",
          "user": { "name": "", "email": "" }
        },
        "s3": {
          "enabled": false,
          "accessKeyId": "",
          "secretAccessKey": "",
          "endpoint": "",
          "urlStyle": "path"
        },
        "webdav": {
          "enabled": false,
          "url": "",
          "username": "",
          "password": ""
        },
        "aliOSS": {
          "enabled": false,
          "accessKeyId": "",
          "accessKeySecret": ""
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
    validate_pointer_type(setting, "/sync/webdav", "object")?;
    validate_pointer_type(setting, "/sync/aliOSS", "object")?;

    validate_pointer_type(setting, "/integration", "object")?;
    validate_pointer_type(setting, "/integration/webdav", "object")?;
    validate_pointer_type(setting, "/integration/aliOSS", "object")?;

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
            let version = item.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
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
    let active = normalize_database_name(active_raw).unwrap_or_else(|_| DEFAULT_DATABASE_NAME.to_string());

    let mut databases = database_items_from_setting(setting);
    if databases.is_empty() {
        databases.push(DatabaseItem {
            name: DEFAULT_DATABASE_NAME.to_string(),
            version: 1,
        });
    }
    if databases.iter().all(|db| db.name != active) {
        databases.push(DatabaseItem {
            name: active.clone(),
            version: 1,
        });
    }

    if let Some(database) = setting.get_mut("database") {
        database["active"] = Value::String(active);
        database["databases"] = serde_json::to_value(databases).unwrap_or_else(|_| json!([]));
    }
}

pub fn ensure_setting_compat(raw: Value) -> Value {
    let mut setting = if raw.is_object() { raw } else { json!({}) };
    let defaults = default_setting_value();
    merge_defaults(&mut setting, &defaults);
    normalize_database_section(&mut setting);
    setting
}

pub fn save_setting_value(app: &AppHandle, setting: &Value) -> Result<(), String> {
    let app_dir = resolve_app_dir(app)?;
    fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app dir: {e}"))?;
    let setting_path = resolve_setting_path(app)?;
    let payload = serde_json::to_string_pretty(setting).map_err(|e| format!("Failed to serialize setting: {e}"))?;
    fs::write(&setting_path, payload).map_err(|e| format!("Failed to write setting.json: {e}"))?;
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

    let content = fs::read_to_string(&setting_path).map_err(|e| format!("Failed to read setting.json: {e}"))?;
    let parsed = serde_json::from_str::<Value>(&content)
        .map_err(|e| format!("SETTING_INVALID: setting.json 解析失败: {e}"))?;
    validate_setting_shape(&parsed)?;
    let setting = ensure_setting_compat(parsed);
    save_setting_value(app, &setting)?;
    Ok(setting)
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
            version: 1,
        });
    }
    items
}

pub fn get_database_version(setting: &Value, db_name: &str) -> u64 {
    get_database_items(setting)
        .into_iter()
        .find(|db| db.name == db_name)
        .map(|db| db.version)
        .unwrap_or(1)
}

pub fn ensure_database_entry(setting: &mut Value, db_name: &str) -> bool {
    let mut items = get_database_items(setting);
    let exists = items.iter().any(|db| db.name == db_name);
    if !exists {
        items.push(DatabaseItem {
            name: db_name.to_string(),
            version: 1,
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

    let normalized = ensure_setting_compat(value);
    if let Err(err) = save_setting_value(&app, &normalized) {
        return SettingWriteResponse {
            ok: false,
            code: Some("SETTING_INVALID".to_string()),
            message: err,
        };
    }

    SettingWriteResponse {
        ok: true,
        code: None,
        message: "setting.json 写入成功".to_string(),
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
