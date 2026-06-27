use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use aws_sdk_s3::config::{Credentials as S3Credentials, Region as S3Region};
use aws_sdk_s3::Client as S3Client;
use base64::Engine;
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::{json, Value};
use sha1::Sha1;
use tauri::{AppHandle, Manager};

use crate::database::{
    resolve_embedding_fingerprint_for_setting, trigger_reconcile_for_database,
};
use crate::models::{
    BootstrapResponse, DatabaseItem, GithubUserInfoResponse, SettingWriteResponse,
};

pub const APP_DIR_NAME: &str = ".editor";
pub const DEFAULT_DATABASE_NAME: &str = "data.db";
const S3_VERIFY_TIMEOUT_SECS: u64 = 12;

#[derive(Debug, Deserialize)]
struct GithubUserApiResponse {
    login: String,
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRepoApiResponse {
    name: String,
}

#[derive(Debug, Deserialize)]
struct GithubBranchApiResponse {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyS3Payload {
    access_key_id: String,
    secret_access_key: String,
    endpoint: String,
    url_style: String,
    bucket: String,
    region: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyWebDavPayload {
    url: String,
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyAliOssPayload {
    access_key_id: String,
    access_key_secret: String,
    bucket: String,
    region: String,
}

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
        "webClip": null,
        "podcastGeneration": null,
        "contentPolish": null,
        "flashcardGeneration": null,
        "aiJudgement": null,
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
    validate_pointer_type(setting, "/sync/github", "object")?;
    validate_pointer_type(setting, "/sync/s3", "object")?;

    validate_pointer_type(setting, "/integration", "object")?;
    validate_pointer_type(setting, "/integration/webdav", "object")?;
    validate_pointer_type(setting, "/integration/aliOSS", "object")?;
    validate_pointer_type(setting, "/integration/github", "object")?;
    validate_pointer_type(setting, "/integration/s3", "object")?;

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
    let active =
        normalize_database_name(active_raw).unwrap_or_else(|_| DEFAULT_DATABASE_NAME.to_string());

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
    let payload = serde_json::to_string_pretty(setting)
        .map_err(|e| format!("Failed to serialize setting: {e}"))?;
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

    let content = fs::read_to_string(&setting_path)
        .map_err(|e| format!("Failed to read setting.json: {e}"))?;
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
    let previous_fingerprint = load_or_init_setting(&app)
        .ok()
        .map(|setting| resolve_embedding_fingerprint_for_setting(&setting))
        .unwrap_or_default();

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
        eprintln!(
            "[mobile-setting] embedding fingerprint changed, trigger reconcile: db={}",
            db_name
        );
        trigger_reconcile_for_database(&app, &db_name);
    }

    SettingWriteResponse {
        ok: true,
        code: None,
        message: "设置保存成功".to_string(),
    }
}

#[tauri::command]
pub async fn verify_github_token(token: String) -> Result<GithubUserInfoResponse, String> {
    let trimmed = token.trim().to_string();
    if trimmed.is_empty() {
        return Err("GITHUB_TOKEN_INVALID:Github Token 不能为空".to_string());
    }

    let response = reqwest::Client::new()
        .get("https://api.github.com/user")
        .header("Authorization", format!("token {}", trimmed))
        .header("User-Agent", "tau-mobile")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("GITHUB_AUTH_FAILED:Github Token 校验请求失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GITHUB_AUTH_FAILED:Github Token 无效或权限不足（HTTP {}）",
            response.status()
        ));
    }

    let user_info = response
        .json::<GithubUserApiResponse>()
        .await
        .map_err(|e| format!("GITHUB_AUTH_FAILED:Github 用户信息解析失败: {e}"))?;

    Ok(GithubUserInfoResponse {
        name: user_info.login,
        email: user_info.email.unwrap_or_default(),
    })
}

#[tauri::command]
pub async fn list_github_repos(token: String, owner: String) -> Result<Vec<String>, String> {
    let token_trimmed = token.trim().to_string();
    let owner_trimmed = owner.trim().to_string();
    if token_trimmed.is_empty() || owner_trimmed.is_empty() {
        return Err("GITHUB_CONFIG_INVALID:Github Token 或用户名不能为空".to_string());
    }

    let response = reqwest::Client::new()
        .get(format!(
            "https://api.github.com/users/{owner_trimmed}/repos"
        ))
        .query(&[
            ("type", "owner"),
            ("sort", "updated"),
            ("direction", "desc"),
            ("per_page", "100"),
            ("page", "1"),
        ])
        .header("Authorization", format!("token {}", token_trimmed))
        .header("User-Agent", "tau-mobile")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("GITHUB_REPO_LIST_FAILED:Github 仓库列表请求失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GITHUB_REPO_LIST_FAILED:获取仓库列表失败（HTTP {}）",
            response.status()
        ));
    }

    let repos = response
        .json::<Vec<GithubRepoApiResponse>>()
        .await
        .map_err(|e| format!("GITHUB_REPO_LIST_FAILED:Github 仓库列表解析失败: {e}"))?;

    Ok(repos
        .into_iter()
        .map(|repo| repo.name)
        .filter(|name| !name.trim().is_empty())
        .collect())
}

#[tauri::command]
pub async fn list_github_branches(
    token: String,
    owner: String,
    repo: String,
) -> Result<Vec<String>, String> {
    let token_trimmed = token.trim().to_string();
    let owner_trimmed = owner.trim().to_string();
    let repo_trimmed = repo.trim().to_string();
    if token_trimmed.is_empty() || owner_trimmed.is_empty() || repo_trimmed.is_empty() {
        return Err("GITHUB_CONFIG_INVALID:Github Token、用户名或仓库名不能为空".to_string());
    }

    let response = reqwest::Client::new()
        .get(format!(
            "https://api.github.com/repos/{owner_trimmed}/{repo_trimmed}/branches"
        ))
        .header("Authorization", format!("token {}", token_trimmed))
        .header("User-Agent", "tau-mobile")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("GITHUB_BRANCH_LIST_FAILED:Github 分支列表请求失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GITHUB_BRANCH_LIST_FAILED:获取分支列表失败（HTTP {}）",
            response.status()
        ));
    }

    let branches = response
        .json::<Vec<GithubBranchApiResponse>>()
        .await
        .map_err(|e| format!("GITHUB_BRANCH_LIST_FAILED:Github 分支列表解析失败: {e}"))?;

    Ok(branches
        .into_iter()
        .map(|branch| branch.name)
        .filter(|name| !name.trim().is_empty())
        .collect())
}

fn build_s3_client(payload: &VerifyS3Payload) -> S3Client {
    let credentials = S3Credentials::new(
        payload.access_key_id.clone(),
        payload.secret_access_key.clone(),
        None,
        None,
        "tau-mobile-setting",
    );

    let mut builder = aws_sdk_s3::config::Builder::new()
        .behavior_version_latest()
        .region(S3Region::new(payload.region.clone()))
        .credentials_provider(credentials);

    #[cfg(target_os = "android")]
    {
        builder.set_http_client(Some(build_android_s3_http_client()));
    }

    if !payload.endpoint.trim().is_empty() {
        builder = builder.endpoint_url(payload.endpoint.trim().to_string());
    }
    if payload.url_style.trim() != "virtualHosted" {
        builder = builder.force_path_style(true);
    }

    S3Client::from_conf(builder.build())
}

#[cfg(target_os = "android")]
fn build_android_s3_http_client() -> aws_sdk_s3::config::SharedHttpClient {
    use aws_smithy_http_client::hyper_014::HyperClientBuilder;
    use hyper_rustls::HttpsConnectorBuilder;

    let https_connector = HttpsConnectorBuilder::new()
        .with_webpki_roots()
        .https_or_http()
        .enable_http1()
        .enable_http2()
        .build();

    HyperClientBuilder::new().build(https_connector)
}

#[tauri::command]
pub async fn verify_s3_credentials(payload: VerifyS3Payload) -> Result<String, String> {
    if payload.access_key_id.trim().is_empty() || payload.secret_access_key.trim().is_empty() {
        return Err("S3_CONFIG_INVALID:S3 AccessKeyId 或 SecretAccessKey 不能为空".to_string());
    }
    if payload.bucket.trim().is_empty() || payload.region.trim().is_empty() {
        return Err(
            "S3_CONFIG_INVALID:请先在同步或资源设置中填写 S3 的 Bucket 与 Region".to_string(),
        );
    }
    if !payload.endpoint.trim().is_empty()
        && !payload.endpoint.starts_with("http://")
        && !payload.endpoint.starts_with("https://")
    {
        return Err("S3_CONFIG_INVALID:S3 Endpoint 必须以 http:// 或 https:// 开头".to_string());
    }
    let client = build_s3_client(&payload);
    let bucket = payload.bucket.trim().to_string();
    let verify_task = tokio::spawn(async move { client.head_bucket().bucket(bucket).send().await });

    match tokio::time::timeout(Duration::from_secs(S3_VERIFY_TIMEOUT_SECS), verify_task).await {
        Ok(Ok(Ok(_))) => {}
        Ok(Ok(Err(e))) => return Err(format!("S3_VERIFY_FAILED:S3 凭证验证失败: {e}")),
        Ok(Err(e)) => return Err(format!("S3_VERIFY_FAILED:S3 验证任务异常，请重试（{e}）")),
        Err(_) => {
            return Err(format!(
                "S3_VERIFY_FAILED:S3 验证超时（{} 秒），请检查 Endpoint、网络或 URL 风格",
                S3_VERIFY_TIMEOUT_SECS
            ))
        }
    }

    Ok("S3 连接验证成功".to_string())
}

#[tauri::command]
pub async fn verify_webdav_credentials(payload: VerifyWebDavPayload) -> Result<String, String> {
    let url = payload.url.trim().to_string();
    let username = payload.username.trim().to_string();
    let password = payload.password.trim().to_string();
    if url.is_empty() || username.is_empty() || password.is_empty() {
        return Err("WEBDAV_CONFIG_INVALID:WebDAV 地址、用户名、密码不能为空".to_string());
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("WEBDAV_CONFIG_INVALID:WebDAV URL 必须以 http:// 或 https:// 开头".to_string());
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("WEBDAV_VERIFY_FAILED:WebDAV 客户端初始化失败: {e}"))?;
    let propfind_method = reqwest::Method::from_bytes(b"PROPFIND")
        .map_err(|e| format!("WEBDAV_VERIFY_FAILED:WebDAV 方法初始化失败: {e}"))?;
    let propfind_body = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype />
    <d:getcontentlength />
  </d:prop>
</d:propfind>"#;

    let attempts = vec![
        ("PROPFIND", propfind_method),
        ("OPTIONS", reqwest::Method::OPTIONS),
    ];
    let mut saw_auth_failure = false;
    let mut last_status: Option<u16> = None;

    for (name, method) in attempts {
        let mut request = client
            .request(method, &url)
            .basic_auth(&username, Some(&password));
        if name == "PROPFIND" {
            request = request
                .header("Depth", "0")
                .header("Content-Type", "application/xml")
                .body(propfind_body.to_string());
        }
        let response = request
            .send()
            .await
            .map_err(|e| format!("WEBDAV_VERIFY_FAILED:WebDAV 连接失败: {e}"))?;
        let status = response.status().as_u16();
        let auth_header = response
            .headers()
            .get("www-authenticate")
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string();
        last_status = Some(status);

        if (200..=399).contains(&status) || status == 405 {
            return Ok("WebDAV 连接验证成功".to_string());
        }

        let response_preview = response
            .text()
            .await
            .unwrap_or_default()
            .chars()
            .take(180)
            .collect::<String>();
        println!(
            "[webdav-verify] method={} url={} status={} authHeader={} body={}",
            name, url, status, auth_header, response_preview
        );

        if status == 401 || status == 403 {
            saw_auth_failure = true;
        }
    }

    if saw_auth_failure {
        Err("WEBDAV_VERIFY_FAILED:WebDAV 认证失败，请检查用户名或密码".to_string())
    } else {
        match last_status {
            Some(status) => Err(format!(
                "WEBDAV_VERIFY_FAILED:WebDAV 验证失败，HTTP {status}"
            )),
            None => Err("WEBDAV_VERIFY_FAILED:WebDAV 验证失败，请检查地址和网络".to_string()),
        }
    }
}

fn alioss_signature(
    date: &str,
    canonical_resource: &str,
    access_key_secret: &str,
) -> Result<String, String> {
    let string_to_sign = format!("HEAD\n\n\n{date}\n{canonical_resource}");
    let mut mac = Hmac::<Sha1>::new_from_slice(access_key_secret.as_bytes())
        .map_err(|_| "ALIOSS_CONFIG_INVALID:AliOSS 密钥初始化失败".to_string())?;
    mac.update(string_to_sign.as_bytes());
    Ok(base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes()))
}

#[tauri::command]
pub async fn verify_alioss_credentials(payload: VerifyAliOssPayload) -> Result<String, String> {
    if payload.access_key_id.trim().is_empty() || payload.access_key_secret.trim().is_empty() {
        return Err(
            "ALIOSS_CONFIG_INVALID:AliOSS AccessKeyId 或 AccessKeySecret 不能为空".to_string(),
        );
    }
    if payload.bucket.trim().is_empty() || payload.region.trim().is_empty() {
        return Err(
            "ALIOSS_CONFIG_INVALID:请先在同步或资源设置中填写 AliOSS 的 Bucket 与 Region"
                .to_string(),
        );
    }

    let canonical_resource = format!("/{}/", payload.bucket.trim());
    let date = httpdate::fmt_http_date(SystemTime::now());
    let signature = alioss_signature(&date, &canonical_resource, payload.access_key_secret.trim())?;
    let authorization = format!("OSS {}:{}", payload.access_key_id.trim(), signature);
    let url = format!(
        "https://{}.{}.aliyuncs.com/",
        payload.bucket.trim(),
        payload.region.trim()
    );

    let response = reqwest::Client::new()
        .head(url)
        .header("Date", date)
        .header("Authorization", authorization)
        .send()
        .await
        .map_err(|e| format!("ALIOSS_VERIFY_FAILED:AliOSS 连接失败: {e}"))?;

    if response.status().is_success() {
        return Ok("AliOSS 连接验证成功".to_string());
    }

    Err(format!(
        "ALIOSS_VERIFY_FAILED:AliOSS 验证失败，HTTP {}",
        response.status()
    ))
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
