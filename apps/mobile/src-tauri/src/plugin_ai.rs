use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, WebviewWindow};

const MAX_SAFE: u64 = 9_007_199_254_740_991;
const MAX_SESSIONS: usize = 128;
const MAX_ACTIVE: usize = 128;
const MAX_STORE_BYTES: u64 = 32 * 1024 * 1024;
const CAPABILITIES: &[(&str, &str)] = &[("chat", "对话功能"), ("flashcardGeneration", "闪卡制作")];

pub(crate) fn is_capability(value: &str) -> bool {
    CAPABILITIES.iter().any(|(id, _)| *id == value)
}
fn fail(code: &str, message: &str) -> String {
    format!("{code}:{message}")
}
fn safe_text(value: &str, maximum: usize) -> bool {
    !value.trim().is_empty() && value.len() <= maximum && !value.chars().any(char::is_control)
}
fn feature_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginIdentity {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Feature {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelRef {
    pub provider_id: String,
    pub model_id: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub enabled: bool,
    pub daily_requests: u64,
    pub daily_tokens: u64,
    pub concurrency: u64,
    pub assignments: BTreeMap<String, Option<ModelRef>>,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            enabled: false,
            daily_requests: 100,
            daily_tokens: 1_000_000,
            concurrency: 2,
            assignments: BTreeMap::new(),
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub features: Vec<Feature>,
    pub host_features: Vec<String>,
    pub config: Config,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Reference {
    pub model: ModelRef,
    pub revision: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BeginInput {
    pub feature: String,
    pub max_output_tokens: Option<u64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Capacity {
    pub context_window: u64,
    pub max_tokens: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Authorized {
    pub model: ModelRef,
    pub model_revision: String,
    pub max_output_tokens: u64,
    pub reserved_tokens: u64,
    pub started_at: i64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FinishStatus {
    Ok,
    Error,
    Aborted,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishResult {
    pub accepted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub configured: bool,
    pub enabled: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Running {
    pub request_id: String,
    pub plugin_id: String,
    pub plugin_name: String,
    pub feature_name: String,
    pub started_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host_feature: Option<String>,
}
#[derive(Clone)]
struct Binding {
    token: String,
    database: String,
    plugin: PluginIdentity,
    features: Vec<Feature>,
    host_feature: Option<String>,
    manifest: String,
    package_revision: String,
}
#[derive(Clone)]
struct Active {
    binding: Binding,
    session: String,
    running: Running,
    cancelled: bool,
}
#[derive(Default, Serialize, Deserialize)]
struct Quota {
    requests: u64,
    tokens: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Audit {
    request_id: String,
    session: String,
    database: String,
    plugin_id: String,
    feature: String,
    plugin_name: String,
    feature_name: String,
    host_feature: Option<String>,
    model: ModelRef,
    revision: String,
    day: String,
    started_at: i64,
    reserved_tokens: u64,
    status: String,
    usage: Option<TokenUsage>,
    result: Option<FinishResult>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Store {
    version: u8,
    plugins: BTreeMap<String, PluginInfo>,
    quota: BTreeMap<String, BTreeMap<String, Quota>>,
    requests: BTreeMap<String, Audit>,
}
impl Default for Store {
    fn default() -> Self {
        Self {
            version: 1,
            plugins: BTreeMap::new(),
            quota: BTreeMap::new(),
            requests: BTreeMap::new(),
        }
    }
}

fn prune(store: &mut Store) -> bool {
    let cutoff = (chrono::Local::now() - chrono::Duration::days(30))
        .format("%Y-%m-%d")
        .to_string();
    let mut completed: Vec<_> = store
        .requests
        .iter()
        .filter(|(_, request)| request.status != "running")
        .map(|(id, request)| (id.clone(), request.started_at, request.day.clone()))
        .collect();
    completed.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| right.0.cmp(&left.0)));
    let keep: std::collections::BTreeSet<_> = completed
        .into_iter()
        .filter(|(_, _, day)| day >= &cutoff)
        .take(1000)
        .map(|(id, _, _)| id)
        .collect();
    let count = store.requests.len();
    store
        .requests
        .retain(|id, request| request.status == "running" || keep.contains(id));
    let pending: std::collections::BTreeSet<_> = store
        .requests
        .values()
        .filter(|request| request.status == "running")
        .map(|request| (request.plugin_id.clone(), request.day.clone()))
        .collect();
    let mut changed = count != store.requests.len();
    for (plugin, days) in &mut store.quota {
        let previous = days.len();
        days.retain(|day, _| day >= &cutoff || pending.contains(&(plugin.clone(), day.clone())));
        changed |= previous != days.len();
    }
    changed
}

fn disk_read(root: &Path) -> Result<Store, String> {
    let path = root.join("plugin-ai.json");
    match fs::metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Store::default()),
        Err(_) => return Err(fail("AI_STORAGE_FAILED", "无法读取插件 AI 账本")),
        Ok(metadata) if !metadata.is_file() || metadata.len() > MAX_STORE_BYTES => {
            return Err(fail("AI_STORAGE_FAILED", "插件 AI 账本超过读取预算"))
        }
        _ => {}
    }
    let store: Store = serde_json::from_slice(
        &fs::read(&path).map_err(|_| fail("AI_STORAGE_FAILED", "无法读取插件 AI 账本"))?,
    )
    .map_err(|_| fail("AI_STORAGE_FAILED", "插件 AI 账本损坏，未授予调用"))?;
    if store.version != 1 {
        return Err(fail("AI_STORAGE_FAILED", "插件 AI 账本版本不受支持"));
    }
    Ok(store)
}
fn disk_write(root: &Path, store: &Store) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|_| fail("AI_STORAGE_FAILED", "无法创建插件 AI 存储"))?;
    let bytes =
        serde_json::to_vec(store).map_err(|_| fail("AI_STORAGE_FAILED", "插件 AI 账本无效"))?;
    if bytes.len() as u64 > MAX_STORE_BYTES {
        return Err(fail("AI_STORAGE_FAILED", "插件 AI 账本超过存储预算"));
    }
    let temporary = root.join(format!("plugin-ai-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary)
            .map_err(|_| fail("AI_STORAGE_FAILED", "无法写入插件 AI 账本"))?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| fail("AI_STORAGE_FAILED", "无法保存插件 AI 账本"))?;
        fs::rename(&temporary, root.join("plugin-ai.json"))
            .map_err(|_| fail("AI_STORAGE_FAILED", "无法提交插件 AI 账本"))
    })();
    let _ = fs::remove_file(temporary);
    result
}
fn digest(value: &impl Serialize) -> Result<String, String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(value).map_err(|_| fail("AI_INVALID_REQUEST", "配置快照无效"))?
        )
    ))
}
fn manifest(root: &Path, plugin: &str) -> Result<(Value, String), String> {
    crate::provider_settings::validate_plugin_id(plugin)?;
    let directory = root.join("portable-plugins").join(plugin);
    if directory.join("enabled.json").exists()
        && serde_json::from_slice::<bool>(
            &fs::read(directory.join("enabled.json"))
                .map_err(|_| fail("AI_DISABLED", "无法读取插件启用状态"))?,
        )
        .ok()
            != Some(true)
    {
        return Err(fail("AI_DISABLED", "插件已停用"));
    }
    let path = directory.join("current/manifest.json");
    let metadata =
        fs::symlink_metadata(&path).map_err(|_| fail("AI_UNKNOWN_PLUGIN", "插件尚未安装"))?;
    if !metadata.is_file() || metadata.len() > 4 * 1024 * 1024 {
        return Err(fail("AI_INVALID_DECLARATION", "插件清单无效"));
    }
    let bytes = fs::read(path).map_err(|_| fail("AI_UNKNOWN_PLUGIN", "无法读取插件清单"))?;
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| fail("AI_INVALID_DECLARATION", "插件清单无效"))?;
    if value["id"] != plugin
        || value["formatVersion"] != 3
        || value["platform"] != "portable"
        || value["profile"] != "web-v1"
    {
        return Err(fail("AI_INVALID_DECLARATION", "插件清单身份不匹配"));
    }
    Ok((value, format!("{:x}", Sha256::digest(bytes))))
}
fn configured(setting: &Value, model: &ModelRef) -> bool {
    setting["llmProviders"].as_array().is_some_and(|providers| {
        providers.iter().any(|provider| {
            provider["id"] == model.provider_id
                && provider["models"]
                    .as_array()
                    .is_some_and(|models| models.iter().any(|item| item["id"] == model.model_id))
        })
    })
}
fn feature_name(binding: &Binding, feature: &str) -> Result<String, String> {
    if let Some(host) = &binding.host_feature {
        if host == feature {
            return Ok(CAPABILITIES
                .iter()
                .find(|(id, _)| *id == feature)
                .map(|(_, name)| (*name).into())
                .unwrap_or_else(|| feature.into()));
        }
    } else if let Some(declared) = binding.features.iter().find(|item| item.id == feature) {
        return Ok(declared.name.clone());
    }
    Err(fail("AI_UNDECLARED_FEATURE", "插件未声明此 AI 功能"))
}
fn selected(
    setting: &Value,
    info: &PluginInfo,
    binding: &Binding,
    feature: &str,
) -> Result<Option<ModelRef>, String> {
    let _ = feature_name(binding, feature)?;
    if binding.host_feature.is_some() {
        let value = &setting["llmUsageSettings"][feature];
        if value.is_null() {
            return Ok(None);
        }
        serde_json::from_value(value.clone())
            .map(Some)
            .map_err(|_| fail("AI_NOT_CONFIGURED", "宿主模型分配无效"))
    } else {
        Ok(info.config.assignments.get(feature).cloned().flatten())
    }
}

#[derive(Default)]
struct Engine {
    sessions: BTreeMap<String, Binding>,
    active: BTreeMap<String, Active>,
}
impl Engine {
    fn store(&self, root: &Path) -> Result<Store, String> {
        let mut store = disk_read(root)?;
        let mut changed = false;
        for (id, request) in &mut store.requests {
            if request.status == "running" && !self.active.contains_key(id) {
                request.status = "interrupted".into();
                request.result = Some(FinishResult {
                    accepted: false,
                    error: Some(fail("AI_ABORTED", "上次宿主会话已中断，用量未知保留预占")),
                });
                changed = true;
            }
        }
        changed |= prune(&mut store);
        if changed {
            disk_write(root, &store)?;
        }
        Ok(store)
    }
    fn binding(&self, token: &str, database: &str, session: &str) -> Result<Binding, String> {
        self.sessions
            .get(session)
            .filter(|binding| binding.token == token && binding.database == database)
            .cloned()
            .ok_or_else(|| fail("AI_DISABLED", "插件会话已停用或不属于当前工作区"))
    }
    fn register(
        &mut self,
        root: &Path,
        token: &str,
        database: &str,
        mut plugin: PluginIdentity,
        features: Vec<Feature>,
        host_feature: Option<String>,
    ) -> Result<String, String> {
        if self.sessions.len() >= MAX_SESSIONS {
            return Err(fail("AI_CONCURRENCY_LIMIT", "插件 AI 会话过多"));
        }
        if !safe_text(&plugin.name, 512)
            || features.len() > 32
            || host_feature
                .as_ref()
                .is_some_and(|feature| !is_capability(feature))
            || (host_feature.is_some() && !features.is_empty())
        {
            return Err(fail("AI_INVALID_DECLARATION", "插件 AI 声明无效"));
        }
        let mut ids = std::collections::BTreeSet::new();
        for feature in &features {
            if !feature_id(&feature.id)
                || !safe_text(&feature.name, 512)
                || !ids.insert(feature.id.clone())
                || feature
                    .description
                    .as_ref()
                    .is_some_and(|value| value.len() > 2048)
            {
                return Err(fail("AI_INVALID_DECLARATION", "插件 AI 功能身份或名称无效"));
            }
        }
        let (declared, revision) = manifest(root, &plugin.id)?;
        if let Some(capability) = &host_feature {
            let permission = format!("ai:{capability}");
            if !declared["permissions"]
                .as_array()
                .is_some_and(|items| items.iter().any(|item| item == &permission))
            {
                return Err(fail("AI_UNDECLARED_FEATURE", "插件未声明宿主 AI 能力权限"));
            }
        }
        plugin.name = declared["name"]
            .as_str()
            .filter(|name| safe_text(name, 512))
            .unwrap_or(&plugin.name)
            .into();
        let mut store = self.store(root)?;
        let info = store
            .plugins
            .entry(plugin.id.clone())
            .or_insert_with(|| PluginInfo {
                id: plugin.id.clone(),
                name: plugin.name.clone(),
                features: vec![],
                host_features: vec![],
                config: Config::default(),
            });
        info.name = plugin.name.clone();
        if let Some(capability) = &host_feature {
            if !info.host_features.contains(capability) {
                info.host_features.push(capability.clone());
            }
        } else {
            info.features = features.clone();
            info.config.assignments.retain(|id, _| ids.contains(id));
        }
        disk_write(root, &store)?;
        let session = uuid::Uuid::new_v4().to_string();
        self.sessions.insert(
            session.clone(),
            Binding {
                token: token.into(),
                database: database.into(),
                plugin,
                features,
                host_feature,
                manifest: revision,
                package_revision: String::new(),
            },
        );
        Ok(session)
    }
    fn resolve(
        &self,
        root: &Path,
        setting: &Value,
        binding: &Binding,
        feature: &str,
        store: &Store,
    ) -> Result<Reference, String> {
        let (_, manifest_revision) = manifest(root, &binding.plugin.id)?;
        if manifest_revision != binding.manifest {
            return Err(fail("AI_CONFIG_CHANGED", "插件包已改变，请重新激活"));
        }
        let info = store
            .plugins
            .get(&binding.plugin.id)
            .ok_or_else(|| fail("AI_UNKNOWN_PLUGIN", "插件尚未登记"))?;
        if binding.host_feature.is_none() && !info.config.enabled {
            return Err(fail("AI_DISABLED", "用户未授权插件 AI 调用"));
        }
        let model = selected(setting, info, binding, feature)?
            .filter(|model| configured(setting, model))
            .ok_or_else(|| fail("AI_NOT_CONFIGURED", "请先分配可用模型"))?;
        let provider = setting["llmProviders"]
            .as_array()
            .and_then(|providers| {
                providers
                    .iter()
                    .find(|provider| provider["id"] == model.provider_id)
            })
            .ok_or_else(|| fail("AI_NOT_CONFIGURED", "模型提供方已删除"))?;
        let revision = digest(
            &json!({ "config":info.config, "model":model, "provider":provider, "manifest":manifest_revision, "package":binding.package_revision, "feature":feature }),
        )?;
        Ok(Reference { model, revision })
    }
    fn prepare(
        &self,
        root: &Path,
        setting: &Value,
        token: &str,
        database: &str,
        session: &str,
        feature: &str,
    ) -> Result<Reference, String> {
        let binding = self.binding(token, database, session)?;
        self.resolve(root, setting, &binding, feature, &self.store(root)?)
    }
    fn status(
        &self,
        root: &Path,
        setting: &Value,
        token: &str,
        database: &str,
        session: &str,
        feature: &str,
    ) -> Result<Status, String> {
        let binding = self.binding(token, database, session)?;
        let (_, current) = manifest(root, &binding.plugin.id)?;
        if current != binding.manifest {
            return Err(fail("AI_CONFIG_CHANGED", "插件包已改变"));
        }
        let store = self.store(root)?;
        let info = store
            .plugins
            .get(&binding.plugin.id)
            .ok_or_else(|| fail("AI_UNKNOWN_PLUGIN", "插件尚未登记"))?;
        let assignment = selected(setting, info, &binding, feature)?;
        Ok(Status {
            configured: assignment.is_some_and(|model| configured(setting, &model)),
            enabled: binding.host_feature.is_some() || info.config.enabled,
        })
    }
    fn configure(&mut self, root: &Path, plugin: &str, mut config: Config) -> Result<(), String> {
        if config.daily_requests == 0
            || config.daily_requests > MAX_SAFE
            || config.daily_tokens == 0
            || config.daily_tokens > MAX_SAFE
            || config.concurrency == 0
            || config.concurrency > 16
        {
            return Err(fail("AI_INVALID_CONFIG", "额度须为正整数，并发数最多 16"));
        }
        let mut store = self.store(root)?;
        let info = store
            .plugins
            .get_mut(plugin)
            .ok_or_else(|| fail("AI_UNKNOWN_PLUGIN", "插件尚未登记"))?;
        for model in config.assignments.values().flatten() {
            if !safe_text(&model.provider_id, 512) || !safe_text(&model.model_id, 1024) {
                return Err(fail("AI_INVALID_CONFIG", "模型分配无效"));
            }
        }
        config
            .assignments
            .retain(|id, _| info.features.iter().any(|feature| feature.id == *id));
        info.config = config;
        disk_write(root, &store)?;
        for request in self
            .active
            .values_mut()
            .filter(|request| request.binding.plugin.id == plugin)
        {
            request.cancelled = true;
        }
        Ok(())
    }
    fn begin(
        &mut self,
        root: &Path,
        setting: &Value,
        token: &str,
        database: &str,
        session: &str,
        request_id: &str,
        input: BeginInput,
        reference: Reference,
        capacity: Capacity,
        day: &str,
        now: i64,
    ) -> Result<Authorized, String> {
        let binding = self.binding(token, database, session)?;
        if !safe_text(request_id, 256) {
            return Err(fail("AI_INVALID_REQUEST", "请求身份无效"));
        }
        if self.active.len() >= MAX_ACTIVE {
            return Err(fail("AI_CONCURRENCY_LIMIT", "宿主并发已满"));
        }
        let mut store = self.store(root)?;
        if store.requests.contains_key(request_id) {
            return Err(fail("AI_INVALID_REQUEST", "请求标识已使用，不可重复执行"));
        }
        let current = self.resolve(root, setting, &binding, &input.feature, &store)?;
        if current != reference {
            return Err(fail("AI_CONFIG_CHANGED", "模型或授权配置已改变，请重试"));
        }
        let config = &store.plugins[&binding.plugin.id].config;
        if self
            .active
            .values()
            .filter(|request| request.binding.plugin.id == binding.plugin.id)
            .count() as u64
            >= config.concurrency
        {
            return Err(fail("AI_CONCURRENCY_LIMIT", "并发额度已满"));
        }
        if capacity.context_window == 0
            || capacity.context_window > MAX_SAFE
            || capacity.max_tokens == 0
            || capacity.max_tokens > MAX_SAFE
        {
            return Err(fail("AI_INVALID_REQUEST", "模型容量无效"));
        }
        let output = input
            .max_output_tokens
            .unwrap_or(capacity.max_tokens.min(4096));
        if output == 0 || output > capacity.max_tokens {
            return Err(fail("AI_INVALID_REQUEST", "输出上限无效"));
        }
        let reserved = capacity
            .context_window
            .checked_add(output)
            .filter(|value| *value <= MAX_SAFE)
            .ok_or_else(|| fail("AI_INVALID_REQUEST", "模型容量超限"))?;
        let quota = store
            .quota
            .entry(binding.plugin.id.clone())
            .or_default()
            .entry(day.into())
            .or_default();
        let tokens = quota
            .tokens
            .checked_add(reserved)
            .ok_or_else(|| fail("AI_QUOTA_EXCEEDED", "今日额度不足"))?;
        if quota.requests >= config.daily_requests || tokens > config.daily_tokens {
            return Err(fail("AI_QUOTA_EXCEEDED", "今日额度不足，包含运行中预占"));
        }
        quota.requests += 1;
        quota.tokens = tokens;
        let feature = feature_name(&binding, &input.feature)?;
        store.requests.insert(
            request_id.into(),
            Audit {
                request_id: request_id.into(),
                session: session.into(),
                database: database.into(),
                plugin_id: binding.plugin.id.clone(),
                plugin_name: binding.plugin.name.clone(),
                feature_name: feature.clone(),
                host_feature: binding.host_feature.clone(),
                feature: input.feature,
                model: current.model.clone(),
                revision: current.revision,
                day: day.into(),
                started_at: now,
                reserved_tokens: reserved,
                status: "running".into(),
                usage: None,
                result: None,
            },
        );
        disk_write(root, &store)?;
        self.active.insert(
            request_id.into(),
            Active {
                session: session.into(),
                binding: binding.clone(),
                cancelled: false,
                running: Running {
                    request_id: request_id.into(),
                    plugin_id: binding.plugin.id,
                    plugin_name: binding.plugin.name,
                    feature_name: feature,
                    started_at: now,
                    host_feature: binding.host_feature,
                },
            },
        );
        Ok(Authorized {
            model_revision: digest(
                setting["llmProviders"]
                    .as_array()
                    .and_then(|providers| {
                        providers
                            .iter()
                            .find(|provider| provider["id"] == current.model.provider_id)
                    })
                    .ok_or_else(|| fail("AI_CONFIG_CHANGED", "模型提供方已变化"))?,
            )?,
            model: current.model,
            max_output_tokens: output,
            reserved_tokens: reserved,
            started_at: now,
        })
    }
    fn finish(
        &mut self,
        root: &Path,
        setting: &Value,
        token: &str,
        database: &str,
        session: &str,
        request_id: &str,
        status: FinishStatus,
        usage: Option<TokenUsage>,
    ) -> Result<FinishResult, String> {
        let active = self
            .active
            .get(request_id)
            .cloned()
            .filter(|active| {
                active.session == session
                    && active.binding.token == token
                    && active.binding.database == database
            })
            .ok_or_else(|| fail("AI_ABORTED", "请求已结束或不属于当前会话"))?;
        if let Some(value) = &usage {
            if value.input_tokens > MAX_SAFE
                || value.output_tokens > MAX_SAFE
                || value.input_tokens.checked_add(value.output_tokens) != Some(value.total_tokens)
                || value.total_tokens > MAX_SAFE
            {
                return Err(fail("AI_INVALID_REQUEST", "用量统计无效"));
            }
        }
        let mut store = self.store(root)?;
        let record = store
            .requests
            .get(request_id)
            .ok_or_else(|| fail("AI_STORAGE_FAILED", "请求预占记录缺失"))?;
        let unchanged = self
            .sessions
            .get(session)
            .is_some_and(|binding| binding.token == token && binding.database == database)
            && self
                .resolve(root, setting, &active.binding, &record.feature, &store)
                .is_ok_and(|reference| {
                    reference.model == record.model && reference.revision == record.revision
                });
        let error = if active.cancelled
            || !self.sessions.contains_key(session)
            || matches!(status, FinishStatus::Aborted)
        {
            Some(fail("AI_ABORTED", "请求已取消或插件已停用"))
        } else if !unchanged {
            Some(fail("AI_CONFIG_CHANGED", "请求期间模型或授权配置已改变"))
        } else if matches!(status, FinishStatus::Error) {
            Some(fail("AI_REQUEST_FAILED", "模型调用未成功完成"))
        } else {
            None
        };
        let result = FinishResult {
            accepted: error.is_none(),
            error,
        };
        if let Some(usage) = &usage {
            let quota = store
                .quota
                .get_mut(&record.plugin_id)
                .and_then(|days| days.get_mut(&record.day))
                .ok_or_else(|| fail("AI_STORAGE_FAILED", "请求额度账本缺失"))?;
            quota.tokens = quota
                .tokens
                .checked_sub(record.reserved_tokens)
                .and_then(|value| value.checked_add(usage.total_tokens))
                .ok_or_else(|| fail("AI_STORAGE_FAILED", "请求额度结算无效"))?;
        }
        let record = store.requests.get_mut(request_id).unwrap();
        record.status = if result.accepted {
            "ok"
        } else if active.cancelled || matches!(status, FinishStatus::Aborted) {
            "aborted"
        } else {
            "error"
        }
        .into();
        record.usage = usage;
        record.result = Some(result.clone());
        disk_write(root, &store)?;
        self.active.remove(request_id);
        Ok(result)
    }
    fn unregister(&mut self, token: &str, database: &str, session: &str) {
        if self
            .sessions
            .get(session)
            .is_some_and(|binding| binding.token == token && binding.database == database)
        {
            self.sessions.remove(session);
            for active in self
                .active
                .values_mut()
                .filter(|active| active.session == session)
            {
                active.cancelled = true;
            }
        }
    }
}

fn engine() -> &'static Mutex<Engine> {
    static STATE: OnceLock<Mutex<Engine>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(Engine::default()))
}
pub(crate) fn invalidate() {
    if let Ok(mut state) = engine().lock() {
        state.sessions.clear();
        state.active.clear();
    }
}
pub(crate) fn forget(app: &AppHandle, plugin: &str) -> Result<(), String> {
    let root = crate::setting::resolve_app_dir(app)?;
    let mut engine = engine()
        .lock()
        .map_err(|_| fail("AI_STORAGE_FAILED", "插件 AI 宿主不可用"))?;
    let mut store = engine.store(&root)?;
    store.plugins.remove(plugin);
    disk_write(&root, &store)?;
    engine
        .sessions
        .retain(|_, binding| binding.plugin.id != plugin);
    for active in engine
        .active
        .values_mut()
        .filter(|active| active.binding.plugin.id == plugin)
    {
        active.cancelled = true;
    }
    Ok(())
}
fn with_context<T>(
    app: &AppHandle,
    window: &WebviewWindow,
    token: &str,
    database: &str,
    run: impl FnOnce(&mut Engine, &Path, &Value) -> Result<T, String>,
) -> Result<T, String> {
    crate::plugin_transport::window_allowed(window)?;
    crate::plugin_transport::with_database(token, database, || {
        let root = crate::setting::resolve_app_dir(app)?;
        let setting = crate::setting::load_or_init_setting(app)?;
        let mut engine = engine()
            .lock()
            .map_err(|_| fail("AI_STORAGE_FAILED", "插件 AI 宿主不可用"))?;
        run(&mut engine, &root, &setting)
    })
}
fn preflight_binding(
    app: &AppHandle,
    window: &WebviewWindow,
    token: &str,
    database: &str,
    session: &str,
) -> Result<(), String> {
    crate::plugin_transport::window_allowed(window)?;
    let binding = crate::plugin_transport::with_database(token, database, || {
        engine()
            .lock()
            .map_err(|_| fail("AI_STORAGE_FAILED", "插件 AI 宿主不可用"))?
            .binding(token, database, session)
    })?;
    let (_, revision) = crate::plugins::installed_for_ai(app, &binding.plugin.id)
        .map_err(|_| fail("AI_DISABLED", "插件当前不可用"))?;
    if revision != binding.package_revision {
        return Err(fail("AI_CONFIG_CHANGED", "插件安装代次已变化"));
    }
    Ok(())
}
fn check_permission(app: &AppHandle, database: &str, binding: &Binding) -> Result<(), String> {
    if let Some(capability) = &binding.host_feature {
        if crate::plugin_permissions::ai_blocked(
            app,
            database,
            &binding.plugin.id,
            &format!("ai:{capability}"),
        )? {
            return Err(fail("AI_DISABLED", "用户已阻止此 AI 能力"));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn plugin_ai_register(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin: PluginIdentity,
    features: Vec<Feature>,
    host_feature: Option<String>,
) -> Result<String, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::plugin_transport::with_database(&token, &database, || Ok(()))?;
    let (_, revision) = crate::plugins::installed_for_ai(&app, &plugin.id)
        .map_err(|_| fail("AI_DISABLED", "插件当前不可用"))?;
    with_context(&app, &window, &token, &database, |engine, root, _| {
        let session = engine.register(root, &token, &database, plugin, features, host_feature)?;
        if let Some(binding) = engine.sessions.get_mut(&session) {
            binding.package_revision = revision;
        }
        if let Err(error) = check_permission(
            &app,
            &database,
            &engine.binding(&token, &database, &session)?,
        ) {
            engine.unregister(&token, &database, &session);
            return Err(error);
        }
        Ok(session)
    })
}
#[tauri::command]
pub fn plugin_ai_status(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    session: String,
    feature: String,
) -> Result<Status, String> {
    preflight_binding(&app, &window, &token, &database, &session)?;
    with_context(&app, &window, &token, &database, |engine, root, setting| {
        check_permission(
            &app,
            &database,
            &engine.binding(&token, &database, &session)?,
        )?;
        engine.status(root, setting, &token, &database, &session, &feature)
    })
}
#[tauri::command]
pub fn plugin_ai_prepare(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    session: String,
    feature: String,
) -> Result<Reference, String> {
    preflight_binding(&app, &window, &token, &database, &session)?;
    with_context(&app, &window, &token, &database, |engine, root, setting| {
        check_permission(
            &app,
            &database,
            &engine.binding(&token, &database, &session)?,
        )?;
        engine.prepare(root, setting, &token, &database, &session, &feature)
    })
}
#[tauri::command]
pub fn plugin_ai_begin(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    session: String,
    request_id: String,
    input: BeginInput,
    reference: Reference,
    capacity: Capacity,
) -> Result<Authorized, String> {
    preflight_binding(&app, &window, &token, &database, &session)?;
    with_context(&app, &window, &token, &database, |engine, root, setting| {
        check_permission(
            &app,
            &database,
            &engine.binding(&token, &database, &session)?,
        )?;
        engine.begin(
            root,
            setting,
            &token,
            &database,
            &session,
            &request_id,
            input,
            reference,
            capacity,
            &chrono::Local::now().format("%Y-%m-%d").to_string(),
            chrono::Utc::now().timestamp_millis(),
        )
    })
}
#[tauri::command]
pub fn plugin_ai_finish(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    session: String,
    request_id: String,
    status: FinishStatus,
    usage: Option<TokenUsage>,
) -> Result<FinishResult, String> {
    crate::plugin_transport::window_allowed(&window)?;
    let binding = crate::plugin_transport::with_database(&token, &database, || {
        Ok(engine()
            .lock()
            .map_err(|_| fail("AI_STORAGE_FAILED", "插件 AI 宿主不可用"))?
            .active
            .get(&request_id)
            .map(|request| request.binding.clone()))
    })?;
    let package_current = binding.as_ref().is_some_and(|binding| {
        crate::plugins::installed_for_ai(&app, &binding.plugin.id)
            .is_ok_and(|(_, revision)| revision == binding.package_revision)
    });
    with_context(&app, &window, &token, &database, |engine, root, setting| {
        if !package_current
            || engine
                .active
                .get(&request_id)
                .is_some_and(|active| check_permission(&app, &database, &active.binding).is_err())
        {
            if let Some(active) = engine.active.get_mut(&request_id) {
                active.cancelled = true;
            }
        }
        engine.finish(
            root,
            setting,
            &token,
            &database,
            &session,
            &request_id,
            status,
            usage,
        )
    })
}
#[tauri::command]
pub fn plugin_ai_unregister(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    session: String,
) -> Result<(), String> {
    with_context(&app, &window, &token, &database, |engine, _, _| {
        engine.unregister(&token, &database, &session);
        Ok(())
    })
}
#[tauri::command]
pub fn plugin_ai_info(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
) -> Result<Option<PluginInfo>, String> {
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    with_context(&app, &window, &token, &database, |engine, root, _| {
        Ok(engine.store(root)?.plugins.remove(&plugin_id))
    })
}
#[tauri::command]
pub fn plugin_ai_configure(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
    config: Config,
) -> Result<(), String> {
    with_context(&app, &window, &token, &database, |engine, root, _| {
        engine.configure(root, &plugin_id, config)
    })
}
#[tauri::command]
pub fn plugin_ai_running(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
) -> Result<Vec<Running>, String> {
    with_context(&app, &window, &token, &database, |engine, _, _| {
        Ok(engine
            .active
            .values()
            .filter(|active| active.binding.token == token && active.binding.database == database)
            .map(|active| active.running.clone())
            .collect())
    })
}
#[tauri::command]
pub fn plugin_ai_cancel(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    request_id: Option<String>,
    plugin_id: Option<String>,
) -> Result<(), String> {
    if request_id.is_none() && plugin_id.is_none() {
        return Err(fail("AI_INVALID_REQUEST", "请指定待取消请求或插件"));
    }
    with_context(&app, &window, &token, &database, |engine, _, _| {
        for (id, active) in &mut engine.active {
            if active.binding.token == token
                && active.binding.database == database
                && request_id.as_ref().is_none_or(|request| request == id)
                && plugin_id
                    .as_ref()
                    .is_none_or(|plugin| plugin == &active.binding.plugin.id)
            {
                active.cancelled = true;
            }
        }
        Ok(())
    })
}
#[tauri::command]
pub fn plugin_ai_revoke(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
) -> Result<(), String> {
    with_context(&app, &window, &token, &database, |engine, root, _| {
        let mut store = engine.store(root)?;
        if let Some(info) = store.plugins.get_mut(&plugin_id) {
            info.config.enabled = false;
        }
        disk_write(root, &store)?;
        for active in engine
            .active
            .values_mut()
            .filter(|active| active.binding.plugin.id == plugin_id)
        {
            active.cancelled = true;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn plugin_ai_usage(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Value, String> {
    with_context(&app, &window, &token, &database, |engine, root, _| {
        usage_page(engine, root, &plugin_id, offset, limit)
    })
}

fn usage_page(
    engine: &Engine,
    root: &Path,
    plugin_id: &str,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Value, String> {
    crate::provider_settings::validate_plugin_id(plugin_id)?;
    let limit = limit.unwrap_or(30);
    if !(1..=100).contains(&limit) || offset.is_some_and(|value| value as u64 > MAX_SAFE) {
        return Err(fail("AI_INVALID_REQUEST", "审计分页参数无效"));
    }
    let store = engine.store(root)?;
    let day = chrono::Local::now().format("%Y-%m-%d").to_string();
    let quota = store.quota.get(plugin_id).and_then(|days| days.get(&day));
    let mut requests: Vec<_> = store
        .requests
        .values()
        .filter(|request| request.plugin_id == plugin_id)
        .collect();
    requests.sort_by(|left, right| {
        right
            .started_at
            .cmp(&left.started_at)
            .then_with(|| right.request_id.cmp(&left.request_id))
    });
    let total = requests.len();
    let offset = offset.unwrap_or(0).min(total);
    let page: Vec<_> = requests.into_iter().skip(offset).take(limit).map(|request| json!({
            "requestId":request.request_id,"pluginId":request.plugin_id,"pluginName":request.plugin_name,
            "feature":request.feature,"featureName":request.feature_name,"hostFeature":request.host_feature,
            "database":request.database,"providerId":request.model.provider_id,"modelId":request.model.model_id,
            "startedAt":request.started_at,"status":request.status,"usage":request.usage,
            "usageKnown":request.usage.is_some(),"reservedTokens":request.reserved_tokens,
            "chargedTokens":request.usage.as_ref().map(|usage|usage.total_tokens).unwrap_or(request.reserved_tokens),
            "error":request.result.as_ref().and_then(|result|result.error.as_ref()),
        })).collect();
    let next = offset + page.len();
    Ok(
        json!({ "quota": {"day":day,"requests":quota.map(|value|value.requests).unwrap_or(0),"tokens":quota.map(|value|value.tokens).unwrap_or(0)}, "requests":page, "total":total, "nextOffset":next, "hasMore":next < total }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct Fixture {
        root: PathBuf,
        engine: Engine,
        setting: Value,
        session: String,
        feature: String,
    }
    impl Fixture {
        fn new(host: Option<&str>) -> Self {
            let root = std::env::temp_dir().join(format!("tau-plugin-ai-{}", uuid::Uuid::new_v4()));
            let current = root.join("portable-plugins/test.ai/current");
            fs::create_dir_all(&current).unwrap();
            fs::write(current.join("manifest.json"), serde_json::to_vec(&json!({"id":"test.ai","name":"测试插件","version":"1.0.0","formatVersion":3,"platform":"portable","profile":"web-v1","permissions":["ai:chat","ai:flashcardGeneration"]})).unwrap()).unwrap();
            let setting = json!({"llmProviders":[{"id":"p","apiKey":"fixture-provider-key","baseUrl":"https://test.invalid/v1","api":"openai-completions","models":[{"id":"one"},{"id":"two"}]}],"llmUsageSettings":{"chat":{"providerId":"p","modelId":"two"}}});
            let mut engine = Engine::default();
            let session = engine
                .register(
                    &root,
                    "token-A",
                    "one.db",
                    PluginIdentity {
                        id: "test.ai".into(),
                        name: "测试插件".into(),
                    },
                    if host.is_none() {
                        vec![Feature {
                            id: "summary".into(),
                            name: "整理功能".into(),
                            description: None,
                        }]
                    } else {
                        vec![]
                    },
                    host.map(str::to_owned),
                )
                .unwrap();
            Self {
                root,
                engine,
                setting,
                session,
                feature: host.unwrap_or("summary").into(),
            }
        }
        fn enabled(&mut self) {
            let config = Config {
                enabled: true,
                daily_tokens: 1000,
                assignments: BTreeMap::from([(
                    "summary".into(),
                    Some(ModelRef {
                        provider_id: "p".into(),
                        model_id: "one".into(),
                    }),
                )]),
                ..Config::default()
            };
            self.engine
                .configure(&self.root, "test.ai", config)
                .unwrap();
        }
        fn begin(&mut self, id: &str) -> Result<Authorized, String> {
            let reference = self.engine.prepare(
                &self.root,
                &self.setting,
                "token-A",
                "one.db",
                &self.session,
                &self.feature,
            )?;
            self.engine.begin(
                &self.root,
                &self.setting,
                "token-A",
                "one.db",
                &self.session,
                id,
                BeginInput {
                    feature: self.feature.clone(),
                    max_output_tokens: None,
                },
                reference,
                Capacity {
                    context_window: 100,
                    max_tokens: 32,
                },
                &day(),
                chrono::Utc::now().timestamp_millis(),
            )
        }
        fn finish(
            &mut self,
            id: &str,
            status: FinishStatus,
            usage: Option<TokenUsage>,
        ) -> FinishResult {
            self.engine
                .finish(
                    &self.root,
                    &self.setting,
                    "token-A",
                    "one.db",
                    &self.session,
                    id,
                    status,
                    usage,
                )
                .unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    fn day() -> String {
        chrono::Local::now().format("%Y-%m-%d").to_string()
    }
    fn usage() -> Option<TokenUsage> {
        Some(TokenUsage {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
        })
    }

    #[test]
    fn custom_features_default_disabled_and_host_selects_assignment() {
        let mut f = Fixture::new(None);
        assert!(
            !f.engine
                .status(&f.root, &f.setting, "token-A", "one.db", &f.session, "summary")
                .unwrap()
                .enabled
        );
        assert!(f
            .begin("disabled")
            .err()
            .unwrap()
            .starts_with("AI_DISABLED:"));
        f.enabled();
        assert_eq!(f.begin("allowed").unwrap().model.model_id, "one");
        assert!(f.finish("allowed", FinishStatus::Ok, usage()).accepted);
        assert!(f
            .engine
            .prepare(&f.root, &f.setting, "token-A", "one.db", &f.session, "other")
            .is_err());
    }

    #[test]
    fn host_capability_uses_host_slot_with_chinese_name() {
        let mut f = Fixture::new(Some("chat"));
        let status = f
            .engine
            .status(&f.root, &f.setting, "token-A", "one.db", &f.session, "chat")
            .unwrap();
        assert!(status.enabled && status.configured);
        assert_eq!(f.begin("host").unwrap().model.model_id, "two");
        assert_eq!(f.engine.active["host"].running.feature_name, "对话功能");
        assert!(
            !f.engine.store(&f.root).unwrap().plugins["test.ai"]
                .config
                .enabled
        );
    }

    #[test]
    fn native_capabilities_and_mobile_permission_support_match_sdk() {
        let sdk = include_str!("../../../../packages/plugins/src/ai.ts");
        assert_eq!(CAPABILITIES.len(), 2);
        for (capability, name) in CAPABILITIES {
            assert!(sdk.contains(&format!("{capability}: {{ name: \"{name}\" }}")));
            assert!(is_capability(capability));
        }
        assert!(!is_capability("unknown"));
        assert!(!is_capability("titleSummary"));
        assert!(!is_capability("contentInsights"));
    }

    #[test]
    fn workspace_owner_and_declared_capability_cannot_be_forged() {
        let f = Fixture::new(None);
        assert!(f
            .engine
            .prepare(&f.root, &f.setting, "token-B", "one.db", &f.session, "summary")
            .is_err());
        assert!(f
            .engine
            .prepare(&f.root, &f.setting, "token-A", "two.db", &f.session, "summary")
            .is_err());
        let mut engine = Engine::default();
        assert!(engine
            .register(
                &f.root,
                "token-A",
                "one.db",
                PluginIdentity {
                    id: "test.ai".into(),
                    name: "test".into()
                },
                vec![],
                Some("videoSummary".into())
            )
            .is_err());
        assert!(engine
            .register(
                &f.root,
                "token-A",
                "one.db",
                PluginIdentity {
                    id: "test.ai".into(),
                    name: "test".into()
                },
                vec![Feature {
                    id: "bad/path".into(),
                    name: "test".into(),
                    description: None
                }],
                None
            )
            .is_err());
    }

    #[test]
    fn begin_rechecks_reference_and_does_not_accept_plugin_model_selection() {
        let mut f = Fixture::new(None);
        f.enabled();
        let mut reference = f
            .engine
            .prepare(
                &f.root, &f.setting, "token-A", "one.db", &f.session, "summary",
            )
            .unwrap();
        reference.model.model_id = "two".into();
        assert!(f
            .engine
            .begin(
                &f.root,
                &f.setting,
                "token-A",
                "one.db",
                &f.session,
                "forged",
                BeginInput {
                    feature: "summary".into(),
                    max_output_tokens: None
                },
                reference,
                Capacity {
                    context_window: 100,
                    max_tokens: 32
                },
                &day(),
                1
            )
            .err()
            .unwrap()
            .starts_with("AI_CONFIG_CHANGED:"));
        assert!(f.engine.store(&f.root).unwrap().requests.is_empty());
        let reference = f
            .engine
            .prepare(
                &f.root, &f.setting, "token-A", "one.db", &f.session, "summary",
            )
            .unwrap();
        f.setting["llmProviders"][0]["apiKey"] = json!("changed-fixture-key");
        assert!(f
            .engine
            .begin(
                &f.root,
                &f.setting,
                "token-A",
                "one.db",
                &f.session,
                "changed",
                BeginInput {
                    feature: "summary".into(),
                    max_output_tokens: None
                },
                reference,
                Capacity {
                    context_window: 100,
                    max_tokens: 32
                },
                &day(),
                1
            )
            .is_err());
    }

    #[test]
    fn quota_is_preoccupied_and_known_usage_settles_on_original_day() {
        let mut f = Fixture::new(None);
        f.enabled();
        let authorized = f.begin("known").unwrap();
        assert_eq!(authorized.reserved_tokens, 132);
        assert_eq!(
            authorized.model_revision,
            digest(&f.setting["llmProviders"][0]).unwrap()
        );
        assert_eq!(
            f.engine.store(&f.root).unwrap().quota["test.ai"][&day()].tokens,
            132
        );
        assert!(f.finish("known", FinishStatus::Ok, usage()).accepted);
        let store = f.engine.store(&f.root).unwrap();
        assert_eq!(store.quota["test.ai"][&day()].requests, 1);
        assert_eq!(store.quota["test.ai"][&day()].tokens, 15);
        let bytes = fs::read_to_string(f.root.join("plugin-ai.json")).unwrap();
        assert!(!bytes.contains("fixture-provider-key"));
        assert!(!bytes.contains("token-A"));
    }

    #[test]
    fn unknown_usage_keeps_reservation_and_blocks_excess_requests() {
        let mut f = Fixture::new(None);
        f.enabled();
        let mut config = f.engine.store(&f.root).unwrap().plugins["test.ai"]
            .config
            .clone();
        config.daily_tokens = 250;
        f.engine.configure(&f.root, "test.ai", config).unwrap();
        f.begin("unknown").unwrap();
        assert!(f
            .begin("over")
            .err()
            .unwrap()
            .starts_with("AI_QUOTA_EXCEEDED:"));
        assert!(f.finish("unknown", FinishStatus::Ok, None).accepted);
        assert_eq!(
            f.engine.store(&f.root).unwrap().quota["test.ai"][&day()].tokens,
            132
        );
        assert!(f.begin("after-unknown").is_err());
    }

    #[test]
    fn concurrency_is_plugin_global_across_workspaces() {
        let mut f = Fixture::new(None);
        f.enabled();
        let mut config = f.engine.store(&f.root).unwrap().plugins["test.ai"]
            .config
            .clone();
        config.concurrency = 1;
        f.engine.configure(&f.root, "test.ai", config).unwrap();
        f.begin("one").unwrap();
        let session = f
            .engine
            .register(
                &f.root,
                "token-B",
                "two.db",
                PluginIdentity {
                    id: "test.ai".into(),
                    name: "test".into(),
                },
                vec![Feature {
                    id: "summary".into(),
                    name: "summary".into(),
                    description: None,
                }],
                None,
            )
            .unwrap();
        let reference = f
            .engine
            .prepare(
                &f.root, &f.setting, "token-B", "two.db", &session, "summary",
            )
            .unwrap();
        assert!(f
            .engine
            .begin(
                &f.root,
                &f.setting,
                "token-B",
                "two.db",
                &session,
                "two",
                BeginInput {
                    feature: "summary".into(),
                    max_output_tokens: None
                },
                reference,
                Capacity {
                    context_window: 100,
                    max_tokens: 32
                },
                &day(),
                2
            )
            .err()
            .unwrap()
            .starts_with("AI_CONCURRENCY_LIMIT:"));
        assert!(f
            .engine
            .finish(
                &f.root,
                &f.setting,
                "token-B",
                "two.db",
                &session,
                "one",
                FinishStatus::Ok,
                usage()
            )
            .is_err());
        assert!(f.finish("one", FinishStatus::Ok, usage()).accepted);
    }

    #[test]
    fn unregister_rejects_result_but_still_accounts_known_usage() {
        let mut f = Fixture::new(None);
        f.enabled();
        f.begin("closing").unwrap();
        f.engine.unregister("token-A", "one.db", &f.session);
        assert!(!f.finish("closing", FinishStatus::Ok, usage()).accepted);
        assert!(f.engine.active.is_empty());
        assert_eq!(
            f.engine.store(&f.root).unwrap().quota["test.ai"][&day()].tokens,
            15
        );
    }

    #[test]
    fn configuration_changes_and_cancellation_reject_late_success() {
        let mut f = Fixture::new(None);
        f.enabled();
        f.begin("changed").unwrap();
        let mut config = f.engine.store(&f.root).unwrap().plugins["test.ai"]
            .config
            .clone();
        config.enabled = false;
        f.engine.configure(&f.root, "test.ai", config).unwrap();
        assert!(!f.finish("changed", FinishStatus::Ok, usage()).accepted);
        f.enabled();
        f.begin("cancelled").unwrap();
        f.engine.active.get_mut("cancelled").unwrap().cancelled = true;
        assert!(!f.finish("cancelled", FinishStatus::Ok, None).accepted);
        assert_eq!(
            f.engine.store(&f.root).unwrap().quota["test.ai"][&day()].tokens,
            147
        );
    }

    #[test]
    fn interrupted_host_recovers_audit_without_refunding_unknown_usage() {
        let mut f = Fixture::new(None);
        f.enabled();
        f.begin("interrupted").unwrap();
        let restarted = Engine::default();
        let store = restarted.store(&f.root).unwrap();
        assert_eq!(store.requests["interrupted"].status, "interrupted");
        assert_eq!(store.quota["test.ai"][&day()].tokens, 132);
    }

    #[test]
    fn bounded_audit_retains_live_records_and_daily_quota() {
        let mut f = Fixture::new(None);
        f.enabled();
        f.begin("live").unwrap();
        let mut store = f.engine.store(&f.root).unwrap();
        let template = store.requests["live"].clone();
        for index in 0..1100 {
            let mut record = template.clone();
            record.status = "ok".into();
            record.request_id = format!("past-{index}");
            record.started_at = index;
            store.requests.insert(record.request_id.clone(), record);
        }
        assert!(prune(&mut store));
        assert_eq!(store.requests.len(), 1001);
        assert!(store.requests.contains_key("live"));
        assert_eq!(store.quota["test.ai"][&day()].requests, 1);
        disk_write(&f.root, &store).unwrap();
        let page = usage_page(&f.engine, &f.root, "test.ai", Some(0), Some(2)).unwrap();
        assert_eq!(page["requests"].as_array().unwrap().len(), 2);
        assert_eq!(page["hasMore"], true);
        assert!(page["requests"][0].get("session").is_none());
        assert!(page["requests"][0].get("revision").is_none());
        assert!(usage_page(&f.engine, &f.root, "test.ai", None, Some(101)).is_err());
    }

    #[test]
    fn corrupt_ledger_is_not_replaced_with_fresh_authority() {
        let f = Fixture::new(None);
        fs::write(f.root.join("plugin-ai.json"), b"{broken").unwrap();
        assert!(f.engine.store(&f.root).is_err());
        assert_eq!(fs::read(f.root.join("plugin-ai.json")).unwrap(), b"{broken");
    }

    #[test]
    fn registration_budget_bounds_unreleased_bindings() {
        let mut f = Fixture::new(Some("chat"));
        for _ in 1..MAX_SESSIONS {
            f.engine
                .register(
                    &f.root,
                    "token-A",
                    "one.db",
                    PluginIdentity {
                        id: "test.ai".into(),
                        name: "test".into(),
                    },
                    vec![],
                    Some("chat".into()),
                )
                .unwrap();
        }
        assert!(f
            .engine
            .register(
                &f.root,
                "token-A",
                "one.db",
                PluginIdentity {
                    id: "test.ai".into(),
                    name: "test".into()
                },
                vec![],
                Some("chat".into())
            )
            .is_err());
    }
}
