use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, WebviewWindow};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TtsModelInput {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TtsSelectionInput {
    provider_id: String,
    model_id: String,
    voice_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum PluginTtsMutation {
    Create {
        plugin_id: String,
        name: String,
    },
    SaveConfig {
        instance_id: String,
        plugin_id: String,
        config: Value,
        models: Vec<TtsModelInput>,
    },
    Rename {
        instance_id: String,
        name: String,
    },
    DeleteAccount {
        instance_id: String,
    },
    AddModel {
        instance_id: String,
        model: TtsModelInput,
    },
    DeleteModel {
        instance_id: String,
        model_id: String,
    },
    Select {
        selection: Option<TtsSelectionInput>,
    },
}

fn invalid_storage() -> String {
    "语音设置存储损坏".into()
}

fn providers(setting: &Value) -> Result<&Vec<Value>, String> {
    setting
        .get("ttsProviders")
        .and_then(Value::as_array)
        .ok_or_else(invalid_storage)
}

fn providers_mut(setting: &mut Value) -> Result<&mut Vec<Value>, String> {
    setting
        .get_mut("ttsProviders")
        .and_then(Value::as_array_mut)
        .ok_or_else(invalid_storage)
}

fn usage_settings_mut(setting: &mut Value) -> Result<&mut Map<String, Value>, String> {
    setting
        .get_mut("ttsUsageSettings")
        .and_then(Value::as_object_mut)
        .ok_or_else(invalid_storage)
}

fn provider_index(setting: &Value, instance_id: &str) -> Result<usize, String> {
    providers(setting)?
        .iter()
        .position(|provider| provider["id"].as_str() == Some(instance_id))
        .ok_or_else(|| "语音账号不存在或已删除".to_string())
}

fn selected_usage(setting: &Value) -> Option<&Value> {
    let selection = setting.get("ttsUsageSettings")?.get("default")?;
    (!selection.is_null()).then_some(selection)
}

fn set_selected_usage(setting: &mut Value, selection: Value) -> Result<(), String> {
    usage_settings_mut(setting)?.insert("default".into(), selection);
    Ok(())
}

fn validate_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("语音账号名称不能为空".into());
    }
    Ok(())
}

fn validate_model(model: &TtsModelInput) -> Result<(), String> {
    if model.id.trim().is_empty() {
        return Err("语音模型 ID 不能为空".into());
    }
    Ok(())
}

fn validate_models(models: &[TtsModelInput]) -> Result<(), String> {
    let mut ids = HashSet::new();
    for model in models {
        validate_model(model)?;
        if !ids.insert(&model.id) {
            return Err("语音模型 ID 不能重复".into());
        }
    }
    Ok(())
}

fn apply_mutation(
    setting: &mut Value,
    database: &str,
    mutation: PluginTtsMutation,
) -> Result<Value, String> {
    crate::provider_settings::check_database(setting, database)?;
    providers(setting)?;
    setting
        .get("ttsUsageSettings")
        .and_then(Value::as_object)
        .ok_or_else(invalid_storage)?;

    match mutation {
        PluginTtsMutation::Create { plugin_id, name } => {
            crate::provider_settings::validate_plugin_id(&plugin_id)?;
            validate_name(&name)?;
            let id = uuid::Uuid::new_v4().to_string();
            providers_mut(setting)?.push(json!({
                "id": id,
                "name": name,
                "pluginId": plugin_id,
                "config": {},
                "models": []
            }));
        }
        PluginTtsMutation::SaveConfig {
            instance_id,
            plugin_id,
            config,
            models,
        } => {
            crate::provider_settings::validate_plugin_id(&plugin_id)?;
            crate::provider_settings::validate_plugin_config(&config)?;
            validate_models(&models)?;
            let index = provider_index(setting, &instance_id)?;
            if setting["ttsProviders"][index]["pluginId"].as_str() != Some(plugin_id.as_str()) {
                return Err("语音账号已删除或归属已变化".into());
            }
            let fallback = selected_usage(setting).and_then(|selection| {
                if selection["providerId"].as_str() == Some(instance_id.as_str())
                    && !models
                        .iter()
                        .any(|model| Some(model.id.as_str()) == selection["modelId"].as_str())
                {
                    Some(match models.first() {
                        Some(model) => json!({
                            "providerId": selection["providerId"],
                            "modelId": model.id,
                            "voiceId": ""
                        }),
                        None => Value::Null,
                    })
                } else {
                    None
                }
            });
            let provider = &mut setting["ttsProviders"][index];
            provider["config"] = config;
            provider["models"] = serde_json::to_value(models).map_err(|_| "语音模型列表无效")?;
            if let Some(selection) = fallback {
                set_selected_usage(setting, selection)?;
            }
        }
        PluginTtsMutation::Rename { instance_id, name } => {
            validate_name(&name)?;
            let index = provider_index(setting, &instance_id)?;
            setting["ttsProviders"][index]["name"] = Value::String(name);
        }
        PluginTtsMutation::DeleteAccount { instance_id } => {
            let index = provider_index(setting, &instance_id)?;
            let clear_selection = selected_usage(setting).is_some_and(|selection| {
                selection["providerId"].as_str() == Some(instance_id.as_str())
            });
            if clear_selection {
                set_selected_usage(setting, Value::Null)?;
            }
            providers_mut(setting)?.remove(index);
        }
        PluginTtsMutation::AddModel { instance_id, model } => {
            validate_model(&model)?;
            let index = provider_index(setting, &instance_id)?;
            let provider = &mut setting["ttsProviders"][index];
            let models = provider["models"]
                .as_array_mut()
                .ok_or_else(invalid_storage)?;
            if models
                .iter()
                .any(|current| current["id"].as_str() == Some(model.id.as_str()))
            {
                return Err("语音模型 ID 不能重复".into());
            }
            models.push(serde_json::to_value(model).map_err(|_| "语音模型无效")?);
        }
        PluginTtsMutation::DeleteModel {
            instance_id,
            model_id,
        } => {
            let index = provider_index(setting, &instance_id)?;
            let provider = &mut setting["ttsProviders"][index];
            let models = provider["models"]
                .as_array_mut()
                .ok_or_else(invalid_storage)?;
            let model_index = models
                .iter()
                .position(|model| model["id"].as_str() == Some(model_id.as_str()))
                .ok_or_else(|| "语音模型不存在或已删除".to_string())?;
            models.remove(model_index);
            let first_model_id = models
                .first()
                .and_then(|model| model["id"].as_str())
                .map(str::to_string);
            let fallback = selected_usage(setting).and_then(|selection| {
                (selection["providerId"].as_str() == Some(instance_id.as_str())
                    && selection["modelId"].as_str() == Some(model_id.as_str()))
                .then(|| match first_model_id.as_deref() {
                    Some(first_model_id) => json!({
                        "providerId": instance_id,
                        "modelId": first_model_id,
                        "voiceId": ""
                    }),
                    None => Value::Null,
                })
            });
            if let Some(selection) = fallback {
                set_selected_usage(setting, selection)?;
            }
        }
        PluginTtsMutation::Select { selection } => {
            let selection = match selection {
                Some(selection) => {
                    let index = provider_index(setting, &selection.provider_id)?;
                    let models = setting["ttsProviders"][index]["models"]
                        .as_array()
                        .ok_or_else(invalid_storage)?;
                    if !models
                        .iter()
                        .any(|model| model["id"].as_str() == Some(selection.model_id.as_str()))
                    {
                        return Err("语音模型不属于该账号或已删除".into());
                    }
                    serde_json::to_value(selection).map_err(|_| "语音选择无效")?
                }
                None => Value::Null,
            };
            set_selected_usage(setting, selection)?;
        }
    }
    Ok(setting.clone())
}

#[tauri::command]
pub fn plugin_tts_mutate(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
    mutation: PluginTtsMutation,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::setting::mutate_setting_value(&app, |setting| {
        apply_mutation(setting, &database, mutation)
    })
}

fn validate_provider(provider_index: usize, provider: &Value) -> Result<(), String> {
    let provider = provider
        .as_object()
        .ok_or_else(|| format!("SETTING_INVALID: 语音账号 {provider_index} 必须是对象"))?;
    if provider.contains_key("providerType") {
        return Err("SETTING_INVALID: 语音只支持插件账号，请重新配置".into());
    }
    for field in ["id", "name", "pluginId"] {
        if !provider.get(field).is_some_and(Value::is_string) {
            return Err(format!(
                "SETTING_INVALID: 语音账号 {provider_index} 的 `{field}` 必须是字符串"
            ));
        }
    }
    if !provider.contains_key("config") {
        return Err(format!(
            "SETTING_INVALID: 语音账号 {provider_index} 缺少 `config`"
        ));
    }
    let models = provider
        .get("models")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            format!("SETTING_INVALID: 语音账号 {provider_index} 的 `models` 必须是数组")
        })?;
    for (model_index, model) in models.iter().enumerate() {
        let model = model.as_object().ok_or_else(|| {
            format!("SETTING_INVALID: 语音模型 {provider_index}/{model_index} 必须是对象")
        })?;
        if !model.get("id").is_some_and(Value::is_string) {
            return Err(format!(
                "SETTING_INVALID: 语音模型 {provider_index}/{model_index} 的 `id` 必须是字符串"
            ));
        }
        if model.get("label").is_some_and(|label| !label.is_string()) {
            return Err(format!(
                "SETTING_INVALID: 语音模型 {provider_index}/{model_index} 的 `label` 必须是字符串"
            ));
        }
    }
    Ok(())
}

fn validate_selection(selection: &Value) -> Result<(), String> {
    if selection.is_null() {
        return Ok(());
    }
    let selection = selection.as_object().ok_or_else(|| {
        "SETTING_INVALID: 字段 `/ttsUsageSettings/default` 必须是对象或 null".to_string()
    })?;
    for field in ["providerId", "modelId", "voiceId"] {
        if !selection.get(field).is_some_and(Value::is_string) {
            return Err(format!(
                "SETTING_INVALID: 当前语音选择的 `{field}` 必须是字符串"
            ));
        }
    }
    Ok(())
}

pub(crate) fn validate_shape(setting: &Value) -> Result<(), String> {
    if let Some(value) = setting.get("ttsProviders") {
        let providers = value.as_array().ok_or_else(|| {
            "SETTING_INVALID: 字段 `/ttsProviders` 类型错误，期望 array".to_string()
        })?;
        for (provider_index, provider) in providers.iter().enumerate() {
            validate_provider(provider_index, provider)?;
        }
    }
    if let Some(value) = setting.get("ttsUsageSettings") {
        let usage = value.as_object().ok_or_else(|| {
            "SETTING_INVALID: 字段 `/ttsUsageSettings` 类型错误，期望 object".to_string()
        })?;
        if let Some(selection) = usage.get("default") {
            validate_selection(selection)?;
        }
    }
    Ok(())
}

/// 丢弃不符合当前结构的语音账号与选择，使 `validate_shape` 成立。
pub(crate) fn heal(setting: &mut Value, healed: &mut Vec<String>) {
    let Some(object) = setting.as_object_mut() else {
        return;
    };
    match object.get_mut("ttsProviders") {
        Some(Value::Array(providers)) => {
            let before = providers.len();
            let mut index = 0;
            providers.retain(|provider| {
                index += 1;
                validate_provider(index - 1, provider).is_ok()
            });
            if providers.len() != before {
                healed.push("/ttsProviders".into());
            }
        }
        Some(_) => {
            object.insert("ttsProviders".into(), json!([]));
            healed.push("/ttsProviders".into());
        }
        None => {}
    }
    match object.get_mut("ttsUsageSettings") {
        Some(Value::Object(usage)) => {
            if usage
                .get("default")
                .is_some_and(|selection| validate_selection(selection).is_err())
            {
                usage.insert("default".into(), Value::Null);
                healed.push("/ttsUsageSettings/default".into());
            }
        }
        Some(_) => {
            object.insert("ttsUsageSettings".into(), json!({ "default": null }));
            healed.push("/ttsUsageSettings".into());
        }
        None => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_setting() -> Value {
        crate::setting::normalize_setting(json!({
            "ttsProviders": [
                {
                    "id": "a",
                    "name": "账号 A",
                    "pluginId": "tau.tts-minimax",
                    "config": { "apiKey": "old" },
                    "models": [{ "id": "m1" }, { "id": "m2", "label": "模型二" }]
                },
                {
                    "id": "b",
                    "name": "账号 B",
                    "pluginId": "tau.tts-qwen",
                    "config": {},
                    "models": [{ "id": "shared" }]
                }
            ],
            "ttsUsageSettings": {
                "default": { "providerId": "a", "modelId": "m2", "voiceId": "voice" }
            }
        }))
    }

    fn account<'a>(setting: &'a Value, id: &str) -> &'a Value {
        setting["ttsProviders"]
            .as_array()
            .unwrap()
            .iter()
            .find(|provider| provider["id"].as_str() == Some(id))
            .unwrap()
    }

    fn mutate(setting: &mut Value, mutation: Value) -> Result<Value, String> {
        let mutation = serde_json::from_value(mutation).expect("测试 mutation 应符合 schema");
        apply_mutation(setting, "data.db", mutation)
    }

    #[test]
    fn mutation_json_uses_camel_case_and_rejects_unknown_fields() {
        let parsed: PluginTtsMutation = serde_json::from_value(json!({
            "type": "saveConfig",
            "instanceId": "a",
            "pluginId": "tau.tts-minimax",
            "config": { "apiKey": "new" },
            "models": [{ "id": "m1", "label": "一" }]
        }))
        .unwrap();
        match parsed {
            PluginTtsMutation::SaveConfig {
                instance_id,
                plugin_id,
                models,
                ..
            } => {
                assert_eq!(instance_id, "a");
                assert_eq!(plugin_id, "tau.tts-minimax");
                assert_eq!(models[0].label.as_deref(), Some("一"));
            }
            _ => panic!("应解析为 saveConfig"),
        }
        assert!(serde_json::from_value::<PluginTtsMutation>(json!({
            "type": "deleteModel",
            "instanceId": "a",
            "modelId": "m1",
            "unexpected": true
        }))
        .is_err());
    }

    #[test]
    fn create_save_and_rename_validate_account_identity() {
        let mut setting = crate::setting::normalize_setting(json!({}));
        let snapshot = mutate(
            &mut setting,
            json!({ "type": "create", "pluginId": "tau.tts-minimax", "name": "个人" }),
        )
        .unwrap();
        assert_eq!(snapshot["ttsProviders"].as_array().unwrap().len(), 1);
        assert_eq!(snapshot["ttsProviders"][0]["config"], json!({}));
        assert_eq!(snapshot["ttsProviders"][0]["models"], json!([]));
        assert_eq!(snapshot["ttsUsageSettings"]["default"], Value::Null);
        let id = snapshot["ttsProviders"][0]["id"]
            .as_str()
            .unwrap()
            .to_string();
        setting = snapshot;

        let before = setting.clone();
        assert!(mutate(
            &mut setting,
            json!({
                "type": "saveConfig",
                "instanceId": id,
                "pluginId": "tau.tts-qwen",
                "config": {},
                "models": []
            })
        )
        .unwrap_err()
        .contains("归属"));
        assert_eq!(setting, before);

        let mut snapshot = mutate(
            &mut setting,
            json!({
                "type": "saveConfig",
                "instanceId": id,
                "pluginId": "tau.tts-minimax",
                "config": { "apiKey": "new" },
                "models": [{ "id": "m1" }]
            }),
        )
        .unwrap();
        assert_eq!(account(&snapshot, &id)["config"]["apiKey"], "new");
        assert_eq!(account(&snapshot, &id)["models"], json!([{ "id": "m1" }]));
        setting = mutate(
            &mut snapshot,
            json!({ "type": "rename", "instanceId": id, "name": "工作" }),
        )
        .unwrap();
        assert_eq!(account(&setting, &id)["name"], "工作");

        let before = setting.clone();
        let mutation = serde_json::from_value(json!({
            "type": "rename",
            "instanceId": id,
            "name": "不应写入"
        }))
        .unwrap();
        assert!(apply_mutation(&mut setting, "other.db", mutation).is_err());
        assert_eq!(setting, before);
    }

    #[test]
    fn invalid_changes_do_not_publish_partial_values() {
        let mut setting = base_setting();
        for mutation in [
            json!({ "type": "create", "pluginId": "Tau.Invalid", "name": "无效" }),
            json!({ "type": "create", "pluginId": "tau.tts-minimax", "name": "  " }),
            json!({
                "type": "saveConfig",
                "instanceId": "a",
                "pluginId": "tau.tts-minimax",
                "config": {},
                "models": [{ "id": "duplicate" }, { "id": "duplicate" }]
            }),
            json!({
                "type": "saveConfig",
                "instanceId": "a",
                "pluginId": "tau.tts-minimax",
                "config": { "payload": "x".repeat(1024 * 1024) },
                "models": []
            }),
        ] {
            let before = setting.clone();
            assert!(mutate(&mut setting, mutation).is_err());
            assert_eq!(setting, before);
        }
    }

    #[test]
    fn model_selection_and_account_deletion_keep_usage_consistent() {
        let mut setting = base_setting();
        setting = mutate(
            &mut setting,
            json!({
                "type": "addModel",
                "instanceId": "a",
                "model": { "id": "m3", "label": "三" }
            }),
        )
        .unwrap();
        assert_eq!(account(&setting, "a")["models"][2]["label"], "三");
        setting = mutate(
            &mut setting,
            json!({
                "type": "select",
                "selection": { "providerId": "a", "modelId": "m3", "voiceId": "voice-3" }
            }),
        )
        .unwrap();
        assert_eq!(setting["ttsUsageSettings"]["default"]["modelId"], "m3");

        let before = setting.clone();
        assert!(mutate(
            &mut setting,
            json!({
                "type": "addModel",
                "instanceId": "a",
                "model": { "id": "m3" }
            })
        )
        .is_err());
        assert_eq!(setting, before);
        assert!(mutate(
            &mut setting,
            json!({
                "type": "select",
                "selection": { "providerId": "a", "modelId": "shared", "voiceId": "wrong" }
            })
        )
        .is_err());
        assert_eq!(setting, before);

        setting = mutate(
            &mut setting,
            json!({ "type": "deleteModel", "instanceId": "a", "modelId": "m3" }),
        )
        .unwrap();
        assert_eq!(setting["ttsUsageSettings"]["default"]["modelId"], "m1");
        assert_eq!(setting["ttsUsageSettings"]["default"]["voiceId"], "");

        setting = mutate(
            &mut setting,
            json!({
                "type": "select",
                "selection": { "providerId": "a", "modelId": "m2", "voiceId": "voice-2" }
            }),
        )
        .unwrap();
        setting = mutate(&mut setting, json!({ "type": "select", "selection": null })).unwrap();
        assert_eq!(setting["ttsUsageSettings"]["default"], Value::Null);
        setting = mutate(
            &mut setting,
            json!({
                "type": "select",
                "selection": { "providerId": "a", "modelId": "m2", "voiceId": "voice-2" }
            }),
        )
        .unwrap();
        setting = mutate(
            &mut setting,
            json!({ "type": "deleteAccount", "instanceId": "b" }),
        )
        .unwrap();
        assert_eq!(setting["ttsUsageSettings"]["default"]["providerId"], "a");
        setting = mutate(
            &mut setting,
            json!({ "type": "deleteAccount", "instanceId": "a" }),
        )
        .unwrap();
        assert_eq!(setting["ttsUsageSettings"]["default"], Value::Null);
        assert_eq!(setting["ttsProviders"].as_array().unwrap().len(), 0);

        let before = setting.clone();
        assert!(mutate(
            &mut setting,
            json!({ "type": "deleteAccount", "instanceId": "missing" })
        )
        .is_err());
        assert_eq!(setting, before);
    }

    #[test]
    fn save_config_falls_back_when_the_selected_model_disappears() {
        let mut setting = base_setting();
        setting = mutate(
            &mut setting,
            json!({
                "type": "saveConfig",
                "instanceId": "a",
                "pluginId": "tau.tts-minimax",
                "config": { "apiKey": "changed" },
                "models": [{ "id": "replacement" }]
            }),
        )
        .unwrap();
        assert_eq!(
            setting["ttsUsageSettings"]["default"],
            json!({ "providerId": "a", "modelId": "replacement", "voiceId": "" })
        );
        setting = mutate(
            &mut setting,
            json!({
                "type": "saveConfig",
                "instanceId": "a",
                "pluginId": "tau.tts-minimax",
                "config": {},
                "models": []
            }),
        )
        .unwrap();
        assert!(account(&setting, "a")["models"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(setting["ttsUsageSettings"]["default"], Value::Null);
    }

    #[test]
    fn delete_last_selected_model_clears_usage_instead_of_leaving_empty_model_id() {
        let mut setting = base_setting();
        setting["ttsProviders"][0]["models"] = json!([{ "id": "m2" }]);
        setting = mutate(
            &mut setting,
            json!({ "type": "deleteModel", "instanceId": "a", "modelId": "m2" }),
        )
        .unwrap();
        assert!(account(&setting, "a")["models"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(setting["ttsUsageSettings"]["default"], Value::Null);
    }
}
