use std::collections::HashSet;

use serde::Deserialize;
use serde_json::{json, Map, Value};
use tauri::{AppHandle, WebviewWindow};

const SUPPORTED_APIS: [&str; 3] = [
    "openai-completions",
    "openai-responses",
    "anthropic-messages",
];
const FEATURES: [&str; 2] = ["chat", "speechInputRefinement"];
const REFINEMENT_STYLES: [&str; 2] = ["light", "paragraphs"];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelRef {
    provider_id: String,
    model_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum AiSettingsMutation {
    UpsertProvider {
        provider: Value,
        api_key: Option<String>,
    },
    RemoveProvider {
        provider_id: String,
    },
    Assign {
        feature: String,
        model: Option<ModelRef>,
    },
    SetSpeechRefinement {
        style: String,
    },
}

fn key_hint(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    // 短 Key 露出末 4 位等于泄露大半
    if chars.len() < 8 {
        return String::new();
    }
    chars[chars.len() - 4..].iter().collect()
}

/// 返回给页面的整份设置快照：凡是把设置交给 WebView 的命令都经过这里（去掉 Key 与请求头）。
pub(crate) fn public_setting(setting: &Value) -> Value {
    let mut public = setting.clone();
    if public.get("llmProviders").is_some() {
        public["llmProviders"] = public_llm_providers(setting);
    }
    if public.get("mcpServers").is_some() {
        public["mcpServers"] = crate::mcp_settings::public_servers(setting);
    }
    public
}

/// 页面可见的服务商列表：去掉 Key 与 headers，只给出是否已配置和末 4 位提示。
pub(crate) fn public_llm_providers(setting: &Value) -> Value {
    let mut providers = setting["llmProviders"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    for provider in &mut providers {
        let Some(object) = provider.as_object_mut() else {
            continue;
        };
        let key = object
            .remove("apiKey")
            .and_then(|value| value.as_str().map(str::to_string))
            .unwrap_or_default();
        object.remove("headers");
        object.insert("configured".into(), Value::Bool(!key.is_empty()));
        object.insert("keyHint".into(), Value::String(key_hint(&key)));
        if let Some(models) = object.get_mut("models").and_then(Value::as_array_mut) {
            for model in models.iter_mut().filter_map(Value::as_object_mut) {
                model.remove("apiKey");
                model.remove("headers");
            }
        }
    }
    Value::Array(providers)
}

fn public_view(setting: &Value) -> Value {
    json!({
        "llmProviders": public_llm_providers(setting),
        "llmUsageSettings": setting["llmUsageSettings"],
        "speechInput": setting["speechInput"],
    })
}

fn providers_mut(setting: &mut Value) -> &mut Vec<Value> {
    if !setting["llmProviders"].is_array() {
        setting["llmProviders"] = json!([]);
    }
    setting["llmProviders"]
        .as_array_mut()
        .expect("llmProviders 已确保为数组")
}

fn usage_mut(setting: &mut Value) -> &mut Map<String, Value> {
    if !setting["llmUsageSettings"].is_object() {
        setting["llmUsageSettings"] = json!({});
    }
    setting["llmUsageSettings"]
        .as_object_mut()
        .expect("llmUsageSettings 已确保为对象")
}

fn find_provider<'a>(setting: &'a Value, provider_id: &str) -> Option<&'a Value> {
    setting["llmProviders"]
        .as_array()?
        .iter()
        .find(|provider| provider["id"].as_str() == Some(provider_id))
}

fn required_text<'a>(
    provider: &'a Map<String, Value>,
    field: &str,
    label: &str,
    max: usize,
) -> Result<&'a str, String> {
    let value = provider
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    if value.is_empty() {
        return Err(format!("{label}不能为空"));
    }
    if value.chars().count() > max {
        return Err(format!("{label}不能超过 {max} 个字符"));
    }
    Ok(value)
}

fn validate_positive_integer(model: &Map<String, Value>, field: &str) -> Result<(), String> {
    match model.get(field) {
        None => Ok(()),
        Some(value) if value.as_u64().is_some_and(|number| number > 0) => Ok(()),
        Some(_) => Err(format!("模型的 {field} 必须是正整数")),
    }
}

fn validate_provider(provider: &Value) -> Result<&Map<String, Value>, String> {
    let object = provider.as_object().ok_or("服务商配置必须是对象")?;
    if object.contains_key("apiKey") {
        return Err("API Key 必须单独提交".into());
    }
    required_text(object, "id", "服务商 ID", 128)?;
    required_text(object, "name", "服务商名称", 64)?;
    let base_url = required_text(object, "baseUrl", "服务地址", usize::MAX)?;
    let parsed = url::Url::parse(base_url).map_err(|_| "服务地址格式无效".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("服务地址只支持 http 或 https".into());
    }
    if !object
        .get("api")
        .and_then(Value::as_str)
        .is_some_and(|api| SUPPORTED_APIS.contains(&api))
    {
        return Err("不支持的接口协议".into());
    }
    let models = object
        .get("models")
        .and_then(Value::as_array)
        .ok_or("模型列表必须是数组")?;
    let mut ids = HashSet::new();
    for model in models {
        let model = model.as_object().ok_or("模型配置必须是对象")?;
        let id = model
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default();
        if id.is_empty() {
            return Err("模型 ID 不能为空".into());
        }
        if !ids.insert(id) {
            return Err(format!("模型 ID「{id}」重复"));
        }
        validate_positive_integer(model, "contextWindow")?;
        validate_positive_integer(model, "maxTokens")?;
    }
    Ok(object)
}

/// 页面拿不到 headers，回写时缺失即沿用原值，避免整份保存抹掉。
fn restore_headers(next: &mut Map<String, Value>, previous: &Value) {
    if !next.contains_key("headers") {
        if let Some(headers) = previous.get("headers") {
            next.insert("headers".into(), headers.clone());
        }
    }
    let Some(models) = next.get_mut("models").and_then(Value::as_array_mut) else {
        return;
    };
    for model in models.iter_mut().filter_map(Value::as_object_mut) {
        if model.contains_key("headers") {
            continue;
        }
        let headers = previous["models"].as_array().and_then(|old| {
            old.iter()
                .find(|old| old["id"] == model["id"])
                .and_then(|old| old.get("headers"))
        });
        if let Some(headers) = headers {
            model.insert("headers".into(), headers.clone());
        }
    }
}

/// 把指向不存在服务商或模型的分配置空。
fn clear_dangling_usage(setting: &mut Value) {
    let Some(usage) = setting["llmUsageSettings"].as_object() else {
        return;
    };
    let dangling: Vec<String> = usage
        .iter()
        .filter(|(_, selection)| !selection.is_null())
        .filter(|(_, selection)| {
            let provider_id = selection["providerId"].as_str().unwrap_or_default();
            let model_id = selection["modelId"].as_str();
            !find_provider(setting, provider_id).is_some_and(|provider| {
                provider["models"].as_array().is_some_and(|models| {
                    models.iter().any(|model| model["id"].as_str() == model_id)
                })
            })
        })
        .map(|(feature, _)| feature.clone())
        .collect();
    let usage = usage_mut(setting);
    for feature in dangling {
        usage.insert(feature, Value::Null);
    }
}

fn upsert_provider(
    setting: &mut Value,
    provider: Value,
    api_key: Option<String>,
) -> Result<(), String> {
    let mut next = validate_provider(&provider)?.clone();
    // configured / keyHint 只是给页面看的派生值，不落盘
    next.remove("configured");
    next.remove("keyHint");
    let provider_id = next["id"].as_str().unwrap_or_default().trim().to_string();
    next.insert("id".into(), Value::String(provider_id.clone()));
    let providers = providers_mut(setting);
    let index = providers
        .iter()
        .position(|item| item["id"].as_str() == Some(provider_id.as_str()));
    let previous = index.map(|index| providers[index].clone());
    let key = match api_key {
        Some(key) => key.trim().to_string(),
        None => previous
            .as_ref()
            .and_then(|previous| previous["apiKey"].as_str())
            .unwrap_or_default()
            .to_string(),
    };
    if let Some(previous) = &previous {
        restore_headers(&mut next, previous);
    }
    next.insert("apiKey".into(), Value::String(key));
    match index {
        Some(index) => providers[index] = Value::Object(next),
        None => providers.push(Value::Object(next)),
    }
    clear_dangling_usage(setting);
    Ok(())
}

fn remove_provider(setting: &mut Value, provider_id: &str) -> Result<(), String> {
    let providers = providers_mut(setting);
    let before = providers.len();
    providers.retain(|provider| provider["id"].as_str() != Some(provider_id));
    if providers.len() == before {
        return Err("服务商不存在或已删除".into());
    }
    clear_dangling_usage(setting);
    Ok(())
}

fn assign(setting: &mut Value, feature: &str, model: Option<ModelRef>) -> Result<(), String> {
    if !FEATURES.contains(&feature) {
        return Err("不支持的 AI 功能".into());
    }
    let selection = match model {
        None => Value::Null,
        Some(model) => {
            let provider =
                find_provider(setting, &model.provider_id).ok_or("服务商不存在或已删除")?;
            if !provider["models"].as_array().is_some_and(|models| {
                models
                    .iter()
                    .any(|item| item["id"].as_str() == Some(model.model_id.as_str()))
            }) {
                return Err("模型不存在或已删除".into());
            }
            json!({ "providerId": model.provider_id, "modelId": model.model_id })
        }
    };
    usage_mut(setting).insert(feature.into(), selection);
    Ok(())
}

fn set_speech_refinement(setting: &mut Value, style: &str) -> Result<(), String> {
    if !REFINEMENT_STYLES.contains(&style) {
        return Err("不支持的语音整理风格".into());
    }
    if !setting["speechInput"].is_object() {
        setting["speechInput"] = crate::provider_settings::default_speech_input();
    }
    let instructions = setting["speechInput"]["refinement"]["instructions"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let refinement = &mut setting["speechInput"]["refinement"];
    if !refinement.is_object() {
        *refinement = json!({});
    }
    refinement["style"] = json!(style);
    refinement["instructions"] = json!(instructions);
    Ok(())
}

fn apply(setting: &mut Value, mutation: AiSettingsMutation) -> Result<Value, String> {
    match mutation {
        AiSettingsMutation::UpsertProvider { provider, api_key } => {
            upsert_provider(setting, provider, api_key)?
        }
        AiSettingsMutation::RemoveProvider { provider_id } => {
            remove_provider(setting, &provider_id)?
        }
        AiSettingsMutation::Assign { feature, model } => assign(setting, &feature, model)?,
        AiSettingsMutation::SetSpeechRefinement { style } => {
            set_speech_refinement(setting, &style)?
        }
    }
    Ok(public_view(setting))
}

#[tauri::command]
pub fn ai_settings_mutate(
    app: AppHandle,
    window: WebviewWindow,
    mutation: AiSettingsMutation,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::setting::mutate_setting_value(&app, |setting| apply(setting, mutation))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_setting() -> Value {
        json!({
            "llmProviders": [{
                "id": "p",
                "name": "服务商",
                "baseUrl": "https://api.example.test/v1",
                "apiKey": "sk-original-1234",
                "api": "openai-completions",
                "headers": { "X-Org": "org" },
                "models": [
                    { "id": "m1", "reasoning": false, "input": ["text"], "headers": { "X-Model": "m1" } },
                    { "id": "m2", "reasoning": true, "input": ["text"] }
                ]
            }],
            "llmUsageSettings": {
                "chat": { "providerId": "p", "modelId": "m1" },
                "speechInputRefinement": { "providerId": "p", "modelId": "m2" }
            },
            "speechInput": { "active": "native", "refinement": { "style": "light", "instructions": "保留术语" } }
        })
    }

    fn provider_input() -> Value {
        json!({
            "id": "p",
            "name": "服务商",
            "baseUrl": "https://api.example.test/v1",
            "api": "openai-completions",
            "models": [
                { "id": "m1", "reasoning": false, "input": ["text"] },
                { "id": "m2", "reasoning": true, "input": ["text"], "contextWindow": 128000 }
            ]
        })
    }

    fn mutate(setting: &mut Value, mutation: Value) -> Result<Value, String> {
        let mutation = serde_json::from_value(mutation).expect("测试 mutation 应符合 schema");
        apply(setting, mutation)
    }

    fn upsert(setting: &mut Value, provider: Value, api_key: Value) -> Result<Value, String> {
        mutate(
            setting,
            json!({ "kind": "upsertProvider", "provider": provider, "apiKey": api_key }),
        )
    }

    #[test]
    fn upsert_keeps_or_clears_or_sets_key() {
        let mut setting = base_setting();
        upsert(&mut setting, provider_input(), Value::Null).unwrap();
        assert_eq!(setting["llmProviders"][0]["apiKey"], "sk-original-1234");
        upsert(&mut setting, provider_input(), json!("  sk-new-key-5678 ")).unwrap();
        assert_eq!(setting["llmProviders"][0]["apiKey"], "sk-new-key-5678");
        upsert(&mut setting, provider_input(), json!("")).unwrap();
        assert_eq!(setting["llmProviders"][0]["apiKey"], "");

        let mut added = provider_input();
        added["id"] = json!("q");
        upsert(&mut setting, added, Value::Null).unwrap();
        assert_eq!(setting["llmProviders"][1]["apiKey"], "");
    }

    #[test]
    fn upsert_rejects_invalid_provider() {
        let mut setting = base_setting();
        let cases = [
            ("baseUrl", json!("ftp://api.example.test")),
            ("baseUrl", json!("not a url")),
            ("api", json!("google-gemini")),
            ("name", json!("  ")),
            ("id", json!("")),
            ("apiKey", json!("secret")),
            ("models", json!({})),
            ("models", json!([{ "id": "m" }, { "id": "m" }])),
            ("models", json!([{ "id": "m", "maxTokens": 0 }])),
            ("models", json!([{ "id": "m", "contextWindow": 1.5 }])),
            ("models", json!([{ "id": " " }])),
        ];
        for (field, value) in cases {
            let mut provider = provider_input();
            provider[field] = value;
            assert!(
                upsert(&mut setting, provider, Value::Null).is_err(),
                "{field} 应被拒绝"
            );
        }
        assert_eq!(setting, base_setting());
    }

    #[test]
    fn upsert_drops_public_only_fields() {
        let mut setting = base_setting();
        let mut provider = provider_input();
        provider["configured"] = json!(true);
        provider["keyHint"] = json!("abcd");
        upsert(&mut setting, provider, Value::Null).unwrap();
        assert!(setting["llmProviders"][0].get("configured").is_none());
        assert!(setting["llmProviders"][0].get("keyHint").is_none());
    }

    #[test]
    fn upsert_preserves_headers_and_unknown_fields() {
        let mut setting = base_setting();
        let mut provider = provider_input();
        provider["compat"] = json!({ "supportsStore": false });
        upsert(&mut setting, provider, Value::Null).unwrap();
        let saved = &setting["llmProviders"][0];
        assert_eq!(saved["headers"], json!({ "X-Org": "org" }));
        assert_eq!(saved["models"][0]["headers"], json!({ "X-Model": "m1" }));
        assert_eq!(saved["compat"], json!({ "supportsStore": false }));
        assert_eq!(saved["models"][1]["contextWindow"], 128000);
    }

    #[test]
    fn removing_model_or_provider_clears_assignments() {
        let mut setting = base_setting();
        let mut provider = provider_input();
        provider["models"] = json!([{ "id": "m2", "reasoning": true, "input": ["text"] }]);
        upsert(&mut setting, provider, Value::Null).unwrap();
        assert!(setting["llmUsageSettings"]["chat"].is_null());
        assert_eq!(
            setting["llmUsageSettings"]["speechInputRefinement"]["modelId"],
            "m2"
        );

        let remove = json!({ "kind": "removeProvider", "providerId": "p" });
        let view = mutate(&mut setting, remove.clone()).unwrap();
        assert!(setting["llmUsageSettings"]["speechInputRefinement"].is_null());
        assert_eq!(view["llmProviders"], json!([]));
        assert!(mutate(&mut setting, remove).is_err());
    }

    #[test]
    fn assign_validates_feature_and_target() {
        let mut setting = base_setting();
        let assign = |feature: &str, model: Value| json!({ "kind": "assign", "feature": feature, "model": model });
        let model =
            |provider: &str, model: &str| json!({ "providerId": provider, "modelId": model });
        assert!(mutate(&mut setting, assign("summary", Value::Null)).is_err());
        assert!(mutate(&mut setting, assign("chat", model("x", "m1"))).is_err());
        assert!(mutate(&mut setting, assign("chat", model("p", "x"))).is_err());
        mutate(&mut setting, assign("chat", model("p", "m2"))).unwrap();
        assert_eq!(setting["llmUsageSettings"]["chat"], model("p", "m2"));
        mutate(&mut setting, assign("chat", Value::Null)).unwrap();
        assert!(setting["llmUsageSettings"]["chat"].is_null());

        let mut empty = json!({ "llmUsageSettings": [] });
        assert!(mutate(&mut empty, assign("chat", model("p", "m1"))).is_err());
        mutate(&mut empty, assign("speechInputRefinement", Value::Null)).unwrap();
        assert_eq!(
            empty["llmUsageSettings"],
            json!({ "speechInputRefinement": null })
        );
    }

    #[test]
    fn speech_refinement_keeps_instructions() {
        let mut setting = base_setting();
        let style = |style: &str| json!({ "kind": "setSpeechRefinement", "style": style });
        mutate(&mut setting, style("paragraphs")).unwrap();
        assert_eq!(
            setting["speechInput"]["refinement"],
            json!({ "style": "paragraphs", "instructions": "保留术语" })
        );
        assert_eq!(setting["speechInput"]["active"], "native");
        assert!(mutate(&mut setting, style("heavy")).is_err());

        let mut fresh = json!({});
        let view = mutate(&mut fresh, style("light")).unwrap();
        assert_eq!(view["speechInput"]["language"], "zh-CN");
        assert_eq!(
            view["speechInput"]["refinement"],
            json!({ "style": "light", "instructions": "" })
        );
        assert_eq!(view["llmProviders"], json!([]));
    }

    #[test]
    fn public_setting_hides_keys_and_keeps_other_fields() {
        let setting = base_setting();
        let public = public_setting(&setting);
        assert!(!serde_json::to_string(&public)
            .unwrap()
            .contains("sk-original"));
        assert_eq!(public["llmUsageSettings"], setting["llmUsageSettings"]);
        assert_eq!(public["speechInput"], setting["speechInput"]);
        assert!(public_setting(&json!({ "sync": {} }))
            .get("llmProviders")
            .is_none());
    }

    #[test]
    fn public_providers_hide_credentials() {
        let mut setting = base_setting();
        let providers = setting["llmProviders"].as_array_mut().unwrap();
        providers.push(json!({ "id": "short", "apiKey": "abc1234", "models": [] }));
        providers.push(json!({ "id": "none", "models": [] }));
        let providers = public_llm_providers(&setting);
        let text = providers.to_string();
        assert!(!text.contains("apiKey"));
        assert!(!text.contains("sk-original"));
        assert!(!text.contains("headers"));
        assert_eq!(providers[0]["configured"], true);
        assert_eq!(providers[0]["keyHint"], "1234");
        assert_eq!(providers[1]["configured"], true);
        assert_eq!(providers[1]["keyHint"], "");
        assert_eq!(providers[2]["configured"], false);
        assert_eq!(providers[2]["keyHint"], "");
        assert_eq!(public_llm_providers(&json!({})), json!([]));
    }
}
