use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, WebviewWindow};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImageProviderConfig {
    id: String,
    name: String,
    plugin_id: String,
    model_id: String,
    config: Value,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ImageSettingsMutation {
    Save {
        provider: ImageProviderConfig,
    },
    Delete {
        id: String,
    },
    Select {
        id: String,
        expected_provider: Option<ImageProviderConfig>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageSettings {
    current_provider_id: String,
    providers: Vec<ImageProviderConfig>,
}

fn apply_mutation(
    setting: &mut Value,
    database: &str,
    mutation: ImageSettingsMutation,
) -> Result<Value, String> {
    crate::provider_settings::check_database(setting, database)?;
    let mut images: ImageSettings = serde_json::from_value(
        setting
            .get("imageGeneration")
            .cloned()
            .unwrap_or_else(|| json!({"currentProviderId":"","providers":[]})),
    )
    .map_err(|_| "图片生成设置存储损坏")?;
    match mutation {
        ImageSettingsMutation::Save { provider } => {
            if provider.id.trim().is_empty()
                || provider.name.trim().is_empty()
                || provider.model_id.trim().is_empty()
            {
                return Err("图片账号名称、身份与模型 ID 不能为空".into());
            }
            crate::provider_settings::validate_plugin_id(&provider.plugin_id)?;
            crate::provider_settings::validate_plugin_config(&provider.config)?;
            if let Some(existing) = images
                .providers
                .iter_mut()
                .find(|item| item.id == provider.id)
            {
                if existing.plugin_id != provider.plugin_id {
                    return Err("图片账号不属于该插件".into());
                }
                *existing = provider;
            } else {
                images.providers.push(provider);
            }
        }
        ImageSettingsMutation::Delete { id } => {
            let index = images
                .providers
                .iter()
                .position(|item| item.id == id)
                .ok_or("图片账号不存在或已删除")?;
            images.providers.remove(index);
            if images.current_provider_id == id {
                images.current_provider_id.clear();
            }
        }
        ImageSettingsMutation::Select {
            id,
            expected_provider,
        } => {
            if !id.is_empty() {
                let provider = images
                    .providers
                    .iter()
                    .find(|item| item.id == id)
                    .ok_or("图片账号不存在或已删除")?;
                if Some(provider) != expected_provider.as_ref() {
                    return Err("图片账号配置已变化，请重新选择".into());
                }
            }
            images.current_provider_id = id;
        }
    }
    setting["imageGeneration"] = serde_json::to_value(images).map_err(|_| "图片设置无效")?;
    Ok(crate::ai_settings::public_setting(setting))
}

#[tauri::command]
pub fn plugin_images_mutate(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
    mutation: ImageSettingsMutation,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::setting::mutate_setting_value(&app, |setting| {
        apply_mutation(setting, &database, mutation)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn base() -> Value {
        json!({"database":{"active":"data.db"},"imageGeneration":{"currentProviderId":"a","providers":[{"id":"a","name":"图片","pluginId":"test.images","modelId":"m","config":{"apiKey":"key"}}]}})
    }
    fn mutate(setting: &mut Value, mutation: Value) -> Result<Value, String> {
        apply_mutation(
            setting,
            "data.db",
            serde_json::from_value(mutation).unwrap(),
        )
    }
    #[test]
    fn save_preserves_selection_and_other_fields() {
        let mut setting = base();
        setting["appearance"] = json!({"readingFont":"system"});
        let mut provider = setting["imageGeneration"]["providers"][0].clone();
        provider["id"] = json!("b");
        provider["modelId"] = json!("new-model");
        mutate(&mut setting, json!({"type":"save","provider":provider})).unwrap();
        assert_eq!(setting["imageGeneration"]["currentProviderId"], "a");
        assert_eq!(
            setting["imageGeneration"]["providers"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(setting["appearance"]["readingFont"], "system");
    }
    #[test]
    fn select_rejects_stale_config_and_delete_clears_selection() {
        let mut setting = base();
        let mut expected = setting["imageGeneration"]["providers"][0].clone();
        expected["config"] = json!({});
        let before = setting.clone();
        assert!(mutate(
            &mut setting,
            json!({"type":"select","id":"a","expectedProvider":expected})
        )
        .is_err());
        assert_eq!(setting, before);
        mutate(&mut setting, json!({"type":"delete","id":"a"})).unwrap();
        assert_eq!(setting["imageGeneration"]["currentProviderId"], "");
    }
    #[test]
    fn rejects_cross_database_and_plugin_rebinding() {
        let mut setting = base();
        assert!(apply_mutation(
            &mut setting,
            "other.db",
            ImageSettingsMutation::Delete { id: "a".into() }
        )
        .is_err());
        let mut provider = setting["imageGeneration"]["providers"][0].clone();
        provider["pluginId"] = json!("other.images");
        assert!(mutate(&mut setting, json!({"type":"save","provider":provider})).is_err());
    }
}
