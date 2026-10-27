use serde_json::{json, Value};
use sha2::{Digest, Sha256};
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

pub(crate) fn status_file_name(id: &str, config: &Value) -> String {
    let digest = Sha256::digest(serde_json::to_vec(&json!([id, config])).expect("配置可序列化"));
    format!("plugin-{}.json", &format!("{digest:x}")[..24])
}

/// 插件化之前的内置服务账号，移动端已无读取方。
const RETIRED_INTEGRATIONS: [&str; 8] = [
    "s3",
    "aliOSS",
    "github",
    "webdav",
    "minimax",
    "podcastTTS",
    "bilibili",
    "youtube",
];
const RETIRED_SERVICES: [&str; 5] = ["s3", "aliOSS", "github", "webdav", "githubCdn"];
const SERVICE_SECTIONS: [&str; 3] = ["sync", "imageBed", "publish"];

fn supported_active(section: &str, active: &Value) -> bool {
    active == "plugin" || (section != "sync" && active == "local")
}

pub(crate) fn assert_current(setting: &Value) -> Result<(), String> {
    if RETIRED_INTEGRATIONS
        .iter()
        .any(|key| setting["integration"].get(key).is_some())
    {
        return Err("SETTING_INVALID: 旧服务账号配置不受支持，请在插件设置中重新配置".into());
    }
    for section in SERVICE_SECTIONS {
        if let Some(active) = setting[section].get("active") {
            if !supported_active(section, active) {
                return Err("SETTING_INVALID: 不支持旧服务选择，请重新配置".into());
            }
        }
        if RETIRED_SERVICES
            .iter()
            .any(|key| setting[section].get(key).is_some())
        {
            return Err("SETTING_INVALID: 不支持旧服务配置，请重新配置".into());
        }
    }
    Ok(())
}

/// 剔除旧服务账号与配置，旧服务选择回落到插件（同步）或本地（上传、发布），使 `assert_current` 成立。
pub(crate) fn heal(setting: &mut Value, healed: &mut Vec<String>) {
    if let Some(integration) = setting
        .get_mut("integration")
        .and_then(Value::as_object_mut)
    {
        for key in RETIRED_INTEGRATIONS {
            if integration.remove(key).is_some() {
                healed.push(format!("/integration/{key}"));
            }
        }
    }
    for section in SERVICE_SECTIONS {
        let Some(object) = setting.get_mut(section).and_then(Value::as_object_mut) else {
            continue;
        };
        for key in RETIRED_SERVICES {
            if object.remove(key).is_some() {
                healed.push(format!("/{section}/{key}"));
            }
        }
        if object
            .get("active")
            .is_some_and(|active| !supported_active(section, active))
        {
            let fallback = if section == "sync" { "plugin" } else { "local" };
            object.insert("active".into(), json!(fallback));
            healed.push(format!("/{section}/active"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
}
