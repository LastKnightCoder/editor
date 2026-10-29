use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};
use tauri::AppHandle;

const LIMIT: u64 = 32 * 1024 * 1024;
static STORE_LOCK: Mutex<()> = Mutex::new(());
static DOWNLOADS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
struct Download {
    id: String,
    cancelled: Arc<AtomicBool>,
}
impl Download {
    fn begin(id: &str) -> Result<Self, String> {
        let mut downloads = DOWNLOADS
            .get_or_init(Default::default)
            .lock()
            .map_err(fail)?;
        if downloads.contains_key(id) || downloads.len() >= 4 {
            return Err(fail("已有下载任务，请先等待或取消"));
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        downloads.insert(id.to_string(), cancelled.clone());
        Ok(Self {
            id: id.to_string(),
            cancelled,
        })
    }
    fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::SeqCst) {
            Err(fail("下载已取消"))
        } else {
            Ok(())
        }
    }
    async fn request<T>(
        &self,
        future: impl std::future::Future<Output = Result<T, reqwest::Error>>,
    ) -> Result<T, String> {
        self.check()?;
        tokio::pin!(future);
        loop {
            tokio::select! {
                result = &mut future => return result.map_err(fail),
                _ = tokio::time::sleep(std::time::Duration::from_millis(50)) => self.check()?,
            }
        }
    }
}
impl Drop for Download {
    fn drop(&mut self) {
        if let Ok(mut downloads) = DOWNLOADS.get_or_init(Default::default).lock() {
            downloads.remove(&self.id);
        }
    }
}

fn fail(error: impl std::fmt::Display) -> String {
    format!("PLUGIN_PACKAGE: {error}")
}
fn identifier(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 128
        || id.starts_with('.')
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    {
        return Err(fail("插件身份无效"));
    }
    Ok(())
}
fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = crate::setting::resolve_app_dir(app)?.join("portable-plugins");
    fs::create_dir_all(&root).map_err(fail)?;
    Ok(root)
}
fn remove(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(fail)?;
    }
    Ok(())
}
fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let temporary = path.with_extension("tmp");
    let mut file = fs::File::create(&temporary).map_err(fail)?;
    file.write_all(serde_json::to_string(value).map_err(fail)?.as_bytes())
        .map_err(fail)?;
    file.sync_all().map_err(fail)?;
    fs::rename(temporary, path).map_err(fail)
}
fn read_json(path: &Path) -> Result<Value, String> {
    serde_json::from_slice(&fs::read(path).map_err(fail)?).map_err(fail)
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn safe_path(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.contains('\\')
        || name.contains(':')
        || name.starts_with('/')
        || name
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(fail("包路径越界"));
    }
    Ok(())
}
fn management_enabled() -> bool {
    cfg!(debug_assertions) || crate::plugin_center::installation_enabled()
}
fn management_only() -> Result<(), String> {
    if !management_enabled() {
        return Err(fail("当前平台不支持插件管理"));
    }
    Ok(())
}
fn source_rejection(source: &Value) -> Option<String> {
    if !cfg!(debug_assertions) && !crate::plugin_center::trusted_source(source) {
        Some("正式构建只允许运行固定插件中心安装的版本".into())
    } else {
        None
    }
}
fn install_mode(center: bool) -> Result<(), String> {
    if !install_mode_allowed(
        cfg!(debug_assertions),
        crate::plugin_center::installation_enabled(),
        center,
    ) {
        return Err(fail(
            "当前构建只允许受支持平台的固定中心安装；开发来源仅限调试构建",
        ));
    }
    Ok(())
}
fn install_mode_allowed(development: bool, mobile: bool, center: bool) -> bool {
    development || (mobile && center)
}
fn enabled_intent(directory: &Path, source: &Value) -> bool {
    // 中心首次安装表示用户确认启用；更新保留显式保存的启停意图。
    match fs::read(directory.join("enabled.json")) {
        Ok(bytes) => serde_json::from_slice::<bool>(&bytes).unwrap_or(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            crate::plugin_center::trusted_source(source)
        }
        Err(_) => false,
    }
}
fn recover(directory: &Path) -> Result<(), String> {
    if !directory.join("switch.json").exists() {
        return Ok(());
    }
    let current = directory.join("current");
    let next = directory.join("next");
    let backup = directory.join("backup");
    if next.exists() {
        if current.exists() {
            remove(&backup)?;
            fs::rename(&current, &backup).map_err(fail)?;
        }
        fs::rename(&next, &current).map_err(fail)?;
    } else if !current.exists() && backup.exists() {
        fs::rename(&backup, &current).map_err(fail)?;
    }
    fs::remove_file(directory.join("switch.json")).map_err(fail)?;
    Ok(())
}
fn switch(directory: &Path) -> Result<(), String> {
    write_json(&directory.join("switch.json"), &json!({"version":1}))?;
    recover(directory)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    manifest: Value,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    css: Option<String>,
}
fn version_parts(value: &str) -> Result<(Vec<&str>, Vec<&str>), String> {
    static PATTERN: OnceLock<regex::Regex> = OnceLock::new();
    let pattern=PATTERN.get_or_init(||regex::Regex::new(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$").expect("版本表达式有效"));
    let captures = pattern.captures(value).ok_or_else(|| fail("版本号无效"))?;
    let core = (1..=3)
        .map(|index| captures.get(index).unwrap().as_str())
        .collect();
    let pre = captures
        .get(4)
        .map(|value| value.as_str().split('.').collect::<Vec<_>>())
        .unwrap_or_default();
    if pre.iter().any(|part| {
        part.bytes().all(|byte| byte.is_ascii_digit()) && part.len() > 1 && part.starts_with('0')
    }) {
        return Err(fail("预发布版本号无效"));
    }
    Ok((core, pre))
}
fn compare_versions(left: &str, right: &str) -> Result<std::cmp::Ordering, String> {
    use std::cmp::Ordering;
    let (a, ap) = version_parts(left)?;
    let (b, bp) = version_parts(right)?;
    let numeric = |x: &str, y: &str| x.len().cmp(&y.len()).then_with(|| x.cmp(y));
    for (x, y) in a.into_iter().zip(b) {
        let order = numeric(x, y);
        if order != Ordering::Equal {
            return Ok(order);
        }
    }
    if ap.is_empty() || bp.is_empty() {
        return Ok(match (ap.is_empty(), bp.is_empty()) {
            (true, true) => Ordering::Equal,
            (true, false) => Ordering::Greater,
            _ => Ordering::Less,
        });
    }
    for index in 0..ap.len().max(bp.len()) {
        let (Some(x), Some(y)) = (ap.get(index), bp.get(index)) else {
            return Ok(ap.len().cmp(&bp.len()));
        };
        if x == y {
            continue;
        }
        let (nx, ny) = (
            x.bytes().all(|byte| byte.is_ascii_digit()),
            y.bytes().all(|byte| byte.is_ascii_digit()),
        );
        return Ok(match (nx, ny) {
            (true, true) => numeric(x, y),
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            _ => x.cmp(y),
        });
    }
    Ok(Ordering::Equal)
}
pub(crate) fn declared_skill_ids(manifest: &Value) -> Result<Vec<String>, String> {
    let Some(value) = manifest.get("skills") else {
        return Ok(Vec::new());
    };
    let values = value.as_array().ok_or_else(|| fail("skills 必须是数组"))?;
    let mut ids = Vec::new();
    let mut seen = HashSet::new();
    for value in values {
        let id = value.as_str().ok_or_else(|| fail("Skill ID 无效"))?;
        if id.is_empty()
            || id.len() > 128
            || !id.as_bytes()[0].is_ascii_alphanumeric()
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
        {
            return Err(fail("Skill ID 无效"));
        }
        if seen.insert(id) {
            ids.push(id.to_string());
        }
    }
    Ok(ids)
}
fn package_kind(manifest: &Value) -> Result<&'static str, String> {
    if manifest["formatVersion"] == 3
        && manifest["platform"] == "portable"
        && manifest["profile"] == "web-v1"
        && manifest["apiVersion"] == 1
        && manifest["format"] == "cjs"
        && manifest["main"].is_string()
        && manifest["backend"].is_null()
    {
        return Ok("plugin");
    }
    if manifest["formatVersion"] != 1
        || manifest["apiVersion"] != 1
        || !matches!(manifest["platform"].as_str(), Some("portable" | "desktop"))
    {
        return Err(fail("只接受跨端应用插件或独立 Skill 包"));
    }
    let forbidden: &[&str] = if manifest["platform"] == "portable" {
        &["main", "format", "profile", "styles", "backend", "template"]
    } else {
        &["main", "template"]
    };
    if forbidden.iter().any(|key| manifest.get(key).is_some()) {
        return Err(fail("独立 Skill 包不能声明代码、模板或样式入口"));
    }
    if declared_skill_ids(manifest)?.is_empty() {
        return Err(fail("独立 Skill 包至少声明一个 Skill"));
    }
    Ok("skills")
}
fn known_targets(manifest: &Value) -> Result<Vec<(&str, &str)>, String> {
    let targets = manifest["targets"]
        .as_object()
        .ok_or_else(|| fail("跨端包缺少 targets"))?;
    let mut result = Vec::new();
    for platform in ["desktop", "android", "ios"] {
        if let Some(target) = targets.get(platform) {
            let minimum = target["minAppVersion"]
                .as_str()
                .ok_or_else(|| fail("目标平台缺少最低客户端版本"))?;
            version_parts(minimum)?;
            result.push((platform, minimum));
        }
    }
    if result.is_empty() {
        return Err(fail("包至少声明一个已支持平台"));
    }
    Ok(result)
}
pub(crate) fn assert_package_compatible(
    manifest: &Value,
    platform: &str,
    app_version: &str,
) -> Result<(), String> {
    let kind = package_kind(manifest)?;
    version_parts(app_version)?;
    if kind == "skills" && manifest["platform"] == "desktop" {
        if platform != "desktop" {
            return Err(fail("此 Skill 包仅支持桌面端"));
        }
        if let Some(value) = manifest.get("minAppVersion") {
            let minimum = value.as_str().ok_or_else(|| fail("最低客户端版本无效"))?;
            if compare_versions(app_version, minimum)?.is_lt() {
                return Err(fail("当前客户端版本低于 Skill 包要求"));
            }
        }
        return Ok(());
    }
    let targets = known_targets(manifest)?;
    let minimum = targets
        .iter()
        .find(|(target, _)| *target == platform)
        .map(|(_, minimum)| *minimum)
        .ok_or_else(|| fail("包没有声明当前平台"))?;
    if compare_versions(app_version, minimum)?.is_lt() {
        return Err(fail("当前客户端版本低于包要求"));
    }
    Ok(())
}
pub(crate) fn assert_mobile_package_manifest(
    manifest: &Value,
    platform: &str,
    app_version: &str,
) -> Result<&'static str, String> {
    let kind = package_kind(manifest)?;
    if manifest["platform"] != "portable" {
        return Err(fail("移动宿主不接受仅桌面 Skill 包"));
    }
    known_targets(manifest)?;
    if platform != "unknown" {
        assert_package_compatible(manifest, platform, app_version)?;
    }
    Ok(kind)
}
fn artifact_for_app(app: &AppHandle, directory: &Path) -> Result<Artifact, String> {
    let value = artifact(directory)?;
    assert_mobile_package_manifest(
        &value.manifest,
        crate::plugin_center::platform(),
        &app.package_info().version.to_string(),
    )?;
    Ok(value)
}
fn assert_same_package_manifest(actual: &Value, declared: &Value) -> Result<(), String> {
    let kind = package_kind(actual)?;
    let permissions = |manifest: &Value| {
        manifest["permissions"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect::<std::collections::BTreeSet<_>>()
    };
    if package_kind(declared)? != kind
        || [
            "formatVersion",
            "platform",
            "apiVersion",
            "id",
            "version",
            "integrity",
            "main",
            "format",
            "profile",
            "backend",
            "styles",
        ]
        .iter()
        .any(|key| declared[key] != actual[key])
        || declared_skill_ids(declared)? != declared_skill_ids(actual)?
        || known_targets(declared)? != known_targets(actual)?
        || (kind == "plugin" && permissions(actual) != permissions(declared))
    {
        return Err(fail("中心声明与实际压缩包类型或内容不一致"));
    }
    Ok(())
}
fn artifact(directory: &Path) -> Result<Artifact, String> {
    let manifest: Value =
        serde_json::from_slice(&ai_skill_metadata_bytes(&directory.join("manifest.json"))?)
            .map_err(fail)?;
    let kind = package_kind(&manifest)?;
    identifier(
        manifest["id"]
            .as_str()
            .ok_or_else(|| fail("缺少插件身份"))?,
    )?;
    if !manifest["name"]
        .as_str()
        .is_some_and(|name| !name.trim().is_empty())
    {
        return Err(fail("包名称无效"));
    }
    version_parts(
        manifest["version"]
            .as_str()
            .ok_or_else(|| fail("包版本无效"))?,
    )?;
    if manifest["platform"] == "portable" {
        known_targets(&manifest)?;
    }
    let skills = declared_skill_ids(&manifest)?;
    let integrity = manifest["integrity"]
        .as_object()
        .ok_or_else(|| fail("缺少摘要清单"))?;
    let mut total = 0_u64;
    for (name, expected) in integrity {
        safe_path(name)?;
        if kind == "skills" || name.starts_with("skills/") {
            let parts = name.split('/').collect::<Vec<_>>();
            if parts.len() < 3 || parts[0] != "skills" || !skills.iter().any(|id| id == parts[1]) {
                return Err(fail("文件不属于声明的 Skill 目录"));
            }
        }
        if !expected.as_str().is_some_and(|value| {
            value.len() == 64
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
        }) {
            return Err(fail("包文件摘要无效"));
        }
        let mut current = directory.to_path_buf();
        for part in name.split('/') {
            current.push(part);
            if fs::symlink_metadata(&current)
                .map_err(fail)?
                .file_type()
                .is_symlink()
            {
                return Err(fail("包路径不允许符号链接"));
            }
        }
        let metadata = fs::symlink_metadata(directory.join(name)).map_err(fail)?;
        total = total
            .checked_add(metadata.len())
            .ok_or_else(|| fail("包体积溢出"))?;
        if !metadata.is_file() || metadata.len() > LIMIT || total > LIMIT {
            return Err(fail("包文件无效"));
        }
        if Some(hash(&fs::read(directory.join(name)).map_err(fail)?).as_str()) != expected.as_str()
        {
            return Err(fail("包文件摘要不匹配"));
        }
    }
    for id in skills {
        if !integrity.contains_key(&format!("skills/{id}/SKILL.md")) {
            return Err(fail("声明的 Skill 缺少 SKILL.md 摘要"));
        }
    }
    let read_entry = |field: &str| -> Result<String, String> {
        let name = manifest[field].as_str().ok_or_else(|| fail("缺少入口"))?;
        safe_path(name)?;
        if !integrity.contains_key(name) {
            return Err(fail("入口未声明摘要"));
        }
        fs::read_to_string(directory.join(name)).map_err(fail)
    };
    let code = if kind == "plugin" {
        Some(read_entry("main")?)
    } else {
        None
    };
    let css = if manifest["styles"].is_string() {
        Some(read_entry("styles")?)
    } else {
        None
    };
    Ok(Artifact {
        manifest,
        kind,
        code,
        css,
    })
}

pub(crate) struct AiSkillPackage {
    pub(crate) directory: PathBuf,
    pub(crate) manifest: Value,
    pub(crate) revision: String,
    pub(crate) kind: &'static str,
}
fn skill_revision_metadata(hash: &mut Sha256, path: &Path, optional: bool) -> Result<(), String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => {
            hash.update(b"missing");
            return Ok(());
        }
        Err(error) => return Err(fail(error)),
    };
    if metadata.file_type().is_symlink() {
        return Err(fail("技能安装路径不允许符号链接"));
    }
    hash.update(metadata.len().to_le_bytes());
    if let Ok(modified) = metadata.modified().and_then(|time| {
        time.duration_since(std::time::UNIX_EPOCH)
            .map_err(std::io::Error::other)
    }) {
        hash.update(modified.as_nanos().to_le_bytes());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        hash.update(metadata.dev().to_le_bytes());
        hash.update(metadata.ino().to_le_bytes());
        hash.update(metadata.ctime().to_le_bytes());
        hash.update(metadata.ctime_nsec().to_le_bytes());
    }
    Ok(())
}
fn ai_skill_revision(directory: &Path, slot: &Path) -> Result<String, String> {
    let mut digest = Sha256::new();
    skill_revision_metadata(&mut digest, slot, false)?;
    for name in ["manifest.json", ".source.json"] {
        let path = slot.join(name);
        skill_revision_metadata(&mut digest, &path, false)?;
        let metadata = fs::metadata(&path).map_err(fail)?;
        if !metadata.is_file() || metadata.len() > LIMIT {
            return Err(fail("技能包元数据无效"));
        }
        digest.update(ai_skill_metadata_bytes(&path)?);
    }
    skill_revision_metadata(&mut digest, &directory.join("enabled.json"), true)?;
    Ok(format!("{:x}", digest.finalize()))
}
fn ai_skill_metadata_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let metadata = fs::symlink_metadata(path).map_err(fail)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > LIMIT {
        return Err(fail("技能包元数据无效"));
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(fail)?
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(fail)?;
    if bytes.len() as u64 > LIMIT {
        return Err(fail("技能包元数据过大"));
    }
    Ok(bytes)
}
pub(crate) fn with_ai_skill_package<T>(
    app: &AppHandle,
    id: &str,
    read: impl FnOnce(&AiSkillPackage) -> Result<T, String>,
) -> Result<Option<T>, String> {
    identifier(id)?;
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let store = crate::setting::resolve_app_dir(app)?.join("portable-plugins");
    let directory = store.join(id);
    let current = directory.join("current");
    if !current.exists() {
        return Ok(None);
    }
    if directory.join("switch.json").exists() {
        return Err("AI_SKILL_UNAVAILABLE:插件正在切换版本".into());
    }
    for path in [&store, &directory, &current] {
        let metadata = fs::symlink_metadata(path).map_err(fail)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("AI_SKILL_UNAVAILABLE:技能安装目录无效".into());
        }
    }
    let revision = ai_skill_revision(&directory, &current)?;
    let manifest: Value =
        serde_json::from_slice(&ai_skill_metadata_bytes(&current.join("manifest.json"))?)
            .map_err(fail)?;
    if manifest["id"] != id {
        return Err("AI_SKILL_UNAVAILABLE:技能安装身份不匹配".into());
    }
    let kind = assert_mobile_package_manifest(
        &manifest,
        crate::plugin_center::platform(),
        &app.package_info().version.to_string(),
    )?;
    if manifest["skills"].is_null() {
        return Ok(None);
    }
    let skills = manifest["skills"]
        .as_array()
        .ok_or_else(|| fail("技能声明必须是数组"))?;
    if skills.is_empty() {
        return Ok(None);
    }
    let source: Value =
        serde_json::from_slice(&ai_skill_metadata_bytes(&current.join(".source.json"))?)
            .map_err(fail)?;
    if source_rejection(&source)
        .or_else(|| center_block_reason(app, &source))
        .is_some()
        || !enabled_intent(&directory, &source)
    {
        return Ok(None);
    }
    let package = AiSkillPackage {
        directory: current.clone(),
        manifest,
        revision,
        kind,
    };
    let result = read(&package)?;
    if ai_skill_revision(&directory, &current)? != package.revision {
        return Err("AI_SKILL_UNAVAILABLE:技能安装版本已变化".into());
    }
    Ok(Some(result))
}
fn extract(bytes: &[u8], destination: &Path) -> Result<Artifact, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(fail)?;
    if zip.len() > 2048 {
        return Err(fail("包文件过多"));
    }
    let mut paths = HashSet::new();
    let mut total = 0;
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(fail)?;
        let name = entry.name().trim_end_matches('/').to_string();
        safe_path(&name)?;
        if !paths.insert(name.clone())
            || entry
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(fail("重复路径或符号链接"));
        }
        if entry.is_dir() {
            continue;
        }
        if total + entry.size() > LIMIT || entry.size() > LIMIT {
            return Err(fail("解压体积过大"));
        }
        let target = destination.join(name);
        fs::create_dir_all(target.parent().unwrap()).map_err(fail)?;
        let mut output = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(target)
            .map_err(fail)?;
        let copied =
            std::io::copy(&mut entry.by_ref().take(LIMIT + 1), &mut output).map_err(fail)?;
        if copied > LIMIT || copied != entry.size() {
            return Err(fail("解压体积与声明不符"));
        }
        total += copied;
        output.sync_all().map_err(fail)?;
    }
    if !destination.join("manifest.json").exists() {
        let entries: Vec<_> = fs::read_dir(destination)
            .map_err(fail)?
            .collect::<Result<_, _>>()
            .map_err(fail)?;
        if entries.len() != 1 || !entries[0].file_type().map_err(fail)?.is_dir() {
            return Err(fail("压缩包必须只有一个插件根目录"));
        }
        let nested = entries[0].path();
        let value = artifact(&nested)?;
        if value.manifest["id"].as_str() != nested.file_name().and_then(|name| name.to_str()) {
            return Err(fail("压缩包根目录身份不匹配"));
        }
        for entry in fs::read_dir(&nested).map_err(fail)? {
            let entry = entry.map_err(fail)?;
            fs::rename(entry.path(), destination.join(entry.file_name())).map_err(fail)?;
        }
        fs::remove_dir(nested).map_err(fail)?;
    }
    artifact(destination)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstallSource {
    id: String,
    version: String,
    url: String,
    sha256: String,
    size: u64,
}

#[tauri::command]
pub async fn plugin_stage(app: AppHandle, source: InstallSource) -> Result<Value, String> {
    stage_package(app, source, None).await
}
pub(crate) async fn stage_package(
    app: AppHandle,
    source: InstallSource,
    center: Option<Value>,
) -> Result<Value, String> {
    let id = source.id.clone();
    let version = source.version.clone();
    let result = stage_package_inner(app, source, center).await;
    match &result {
        Ok(_) => crate::logger::info(format!("[plugins] 暂存完成 id={id} version={version}")),
        Err(error) => crate::logger::warn(format!(
            "[plugins] 暂存失败 id={id} version={version} error={error}"
        )),
    }
    result
}
async fn stage_package_inner(
    app: AppHandle,
    source: InstallSource,
    center: Option<Value>,
) -> Result<Value, String> {
    install_mode(center.is_some())?;
    identifier(&source.id)?;
    if source.size == 0 || source.size > LIMIT || source.sha256.len() != 64 {
        return Err(fail("下载描述无效"));
    }
    let url = url::Url::parse(&source.url).map_err(fail)?;
    if url.scheme() != "https"
        && !(url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")))
    {
        return Err(fail("开发来源只允许 HTTPS 或本机 HTTP"));
    }
    let download = Download::begin(&source.id)?;
    let request = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(fail)?
        .get(url)
        .send();
    let mut response = download
        .request(request)
        .await?
        .error_for_status()
        .map_err(fail)?;
    let mut bytes = Vec::new();
    while let Some(chunk) = download.request(response.chunk()).await? {
        download.check()?;
        if bytes.len() as u64 + chunk.len() as u64 > source.size {
            return Err(fail("下载大小不匹配"));
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.len() as u64 != source.size || hash(&bytes) != source.sha256 {
        return Err(fail("下载摘要或大小不匹配"));
    }
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    download.check()?;
    let directory = root(&app)?.join(&source.id);
    fs::create_dir_all(&directory).map_err(fail)?;
    recover(&directory)?;
    let current_source = directory.join("current/.source.json");
    if current_source.exists() {
        let previous = read_json(&current_source)?;
        let previous_url = url::Url::parse(
            previous["url"]
                .as_str()
                .ok_or_else(|| fail("来源记录无效"))?,
        )
        .map_err(fail)?;
        if previous_url.origin() != url::Url::parse(&source.url).map_err(fail)?.origin() {
            return Err(fail("同一插件不能跨来源接管，请先卸载"));
        }
    }
    let stage = directory.join("staging");
    remove(&stage)?;
    fs::create_dir(&stage).map_err(fail)?;
    let result = (|| {
        let value = extract(&bytes, &stage)?;
        assert_mobile_package_manifest(
            &value.manifest,
            crate::plugin_center::platform(),
            &app.package_info().version.to_string(),
        )?;
        if let Some(center) = &center {
            let declared = &center["manifest"];
            let declared_kind = assert_mobile_package_manifest(
                declared,
                crate::plugin_center::platform(),
                &app.package_info().version.to_string(),
            )?;
            if declared_kind != value.kind {
                return Err(fail("中心声明与实际压缩包类型不一致"));
            }
            assert_same_package_manifest(&value.manifest, declared)?;
        }
        if value.manifest["id"] != source.id || value.manifest["version"] != source.version {
            return Err(fail("下载身份不匹配"));
        }
        write_json(
            &stage.join(".source.json"),
            &json!({"id":source.id,"version":source.version,"url":source.url,"sha256":source.sha256,"size":source.size,"center":center}),
        )?;
        Ok(json!({"artifact":value,"sha256":source.sha256}))
    })();
    if result.is_err() {
        remove(&stage)?;
    }
    result
}

#[tauri::command]
pub fn plugin_commit(app: AppHandle, id: String, sha256: String) -> Result<(), String> {
    commit_package(app, id, sha256, None)
}
pub(crate) fn commit_center_package(
    app: AppHandle,
    id: String,
    sha256: String,
    origin: &str,
    release_id: &str,
    manifest: &Value,
) -> Result<(), String> {
    commit_package(app, id, sha256, Some((origin, release_id, manifest)))
}
fn commit_package(
    app: AppHandle,
    id: String,
    sha256: String,
    center: Option<(&str, &str, &Value)>,
) -> Result<(), String> {
    let result = commit_package_inner(app, &id, &sha256, center);
    match &result {
        Ok(()) => crate::logger::info(format!("[plugins] 提交待生效 id={id}")),
        Err(error) => crate::logger::warn(format!("[plugins] 提交失败 id={id} error={error}")),
    }
    result
}
fn commit_package_inner(
    app: AppHandle,
    id: &str,
    sha256: &str,
    center: Option<(&str, &str, &Value)>,
) -> Result<(), String> {
    install_mode(center.is_some())?;
    identifier(id)?;
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let directory = root(&app)?.join(id);
    recover(&directory)?;
    let stage = directory.join("staging");
    let artifact = artifact_for_app(&app, &stage)?;
    let source = read_json(&stage.join(".source.json"))?;
    if let Some((origin, release_id, manifest)) = center {
        if source["center"]["origin"] != origin || source["center"]["releaseId"] != release_id {
            return Err(fail("中心来源记录不匹配"));
        }
        assert_same_package_manifest(&artifact.manifest, manifest)?;
    } else if !source["center"].is_null() {
        return Err(fail("中心包必须重新核验发布状态后提交"));
    }
    if let Some(reason) = center_block_reason(&app, &source) {
        return Err(fail(reason));
    }
    if source["sha256"] != sha256 {
        return Err(fail("暂存版本已变化"));
    }
    remove(&directory.join("next"))?;
    fs::rename(stage, directory.join("next")).map_err(fail)?;
    write_json(&directory.join("pending.json"), &json!({"version":1}))
}

#[tauri::command]
pub fn plugin_cancel(app: AppHandle, id: String) -> Result<(), String> {
    identifier(&id)?;
    if let Some(cancelled) = DOWNLOADS
        .get_or_init(Default::default)
        .lock()
        .map_err(fail)?
        .get(&id)
    {
        cancelled.store(true, Ordering::SeqCst);
    }
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let directory = root(&app)?.join(id);
    recover(&directory)?;
    remove(&directory.join("staging"))?;
    remove(&directory.join("next"))?;
    if directory.join("pending.json").exists() {
        fs::remove_file(directory.join("pending.json")).map_err(fail)?;
    }
    Ok(())
}

fn copy_package_tree(from: &Path, to: &Path) -> Result<(), String> {
    for entry in fs::read_dir(from).map_err(fail)? {
        let entry = entry.map_err(fail)?;
        let target = to.join(entry.file_name());
        if entry.file_type().map_err(fail)?.is_symlink() {
            return Err(fail("备份包不允许符号链接"));
        }
        if entry.file_type().map_err(fail)?.is_dir() {
            fs::create_dir(&target).map_err(fail)?;
            copy_package_tree(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target).map_err(fail)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn plugin_restore(app: AppHandle, id: String) -> Result<(), String> {
    management_only()?;
    identifier(&id)?;
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let directory = root(&app)?.join(id);
    recover(&directory)?;
    let backup = directory.join("backup");
    artifact_for_app(&app, &backup)?;
    let source = read_json(&backup.join(".source.json"))?;
    if let Some(reason) = source_rejection(&source).or_else(|| center_block_reason(&app, &source)) {
        return Err(fail(reason));
    }
    let next = directory.join("next");
    remove(&next)?;
    fs::create_dir(&next).map_err(fail)?;
    copy_package_tree(&backup, &next)?;
    write_json(&directory.join("pending.json"), &json!({"version":1}))
}

#[tauri::command]
pub fn plugin_set_enabled(app: AppHandle, id: String, enabled: bool) -> Result<(), String> {
    management_only()?;
    identifier(&id)?;
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let directory = root(&app)?.join(id);
    if enabled {
        let slot = directory.join(if directory.join("current").exists() {
            "current"
        } else {
            "next"
        });
        artifact_for_app(&app, &slot)?;
        let source = read_json(&slot.join(".source.json"))?;
        if let Some(reason) =
            source_rejection(&source).or_else(|| center_block_reason(&app, &source))
        {
            return Err(fail(reason));
        }
    }
    write_json(&directory.join("enabled.json"), &json!(enabled))
}

#[tauri::command]
pub fn plugin_uninstall(app: AppHandle, id: String) -> Result<(), String> {
    management_only()?;
    identifier(&id)?;
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    crate::plugin_permissions::forget(&app, &id)?;
    crate::plugin_ai::forget(&app, &id)?;
    remove(&root(&app)?.join(id))
}

#[tauri::command]
pub fn plugin_packages(app: AppHandle) -> Result<Value, String> {
    let platform = if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else {
        "unknown"
    };
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let mut packages = Vec::new();
    for entry in fs::read_dir(root(&app)?).map_err(fail)? {
        let entry = entry.map_err(fail)?;
        if !entry.file_type().map_err(fail)?.is_dir() {
            continue;
        }
        let directory = entry.path();
        let id = entry.file_name().to_string_lossy().to_string();
        if identifier(&id).is_err() {
            continue;
        }
        let recovery = recover(&directory);
        let slot = directory.join(
            if directory.join("current").exists() || !directory.join("pending.json").exists() {
                "current"
            } else {
                "next"
            },
        );
        let source = read_json(&slot.join(".source.json")).unwrap_or(Value::Null);
        let blocked = source_rejection(&source).or_else(|| center_block_reason(&app, &source));
        let manifest = read_json(&slot.join("manifest.json")).unwrap_or(Value::Null);
        let current_version = read_json(&directory.join("current/manifest.json"))
            .ok()
            .and_then(|value| value["version"].as_str().map(str::to_owned));
        let pending = directory.join("pending.json").exists();
        let pending_version = if pending {
            read_json(&directory.join("next/manifest.json"))
                .ok()
                .and_then(|value| value["version"].as_str().map(str::to_owned))
        } else {
            None
        };
        let revoked = center_cached_status(&app, &source).ok().flatten()
            .filter(|value| matches!(value["status"].as_str(), Some("revoked" | "disabled")))
            .map(|value| json!({"kind":value["status"],"reason":value["reason"].as_str().unwrap_or("中心已停止此版本")}));
        let result = recovery.and_then(|_| {
            if let Some(reason) = blocked.clone() {
                return Err(reason);
            }
            artifact_for_app(&app, &slot)
        });
        let mut item = json!({
            "id":id,"name":manifest["name"].as_str(),"currentVersion":current_version,
            "pendingVersion":pending_version,"pending":pending,"hasBackup":directory.join("backup").exists(),
            "centerSource":source["center"],"blocked":blocked.is_some(),"revoked":revoked,
        });
        match result {
            Ok(value) => {
                if value.manifest["skills"]
                    .as_array()
                    .is_some_and(|skills| !skills.is_empty())
                    && slot == directory.join("current")
                {
                    item["skillRevision"] = json!(ai_skill_revision(&directory, &slot)?);
                }
                item["artifact"] = serde_json::to_value(value).map_err(fail)?;
                item["enabled"] = json!(enabled_intent(&directory, &source));
                item["error"] = read_json(&directory.join("error.json")).unwrap_or(Value::Null);
            }
            Err(error) => {
                item["error"] = json!(error);
                item["enabled"] = json!(false);
            }
        }
        packages.push(item);
    }
    Ok(
        json!({"platform":platform,"appVersion":app.package_info().version.to_string(),"packages":packages,"development":cfg!(debug_assertions),"managementEnabled":management_enabled()}),
    )
}

pub(crate) fn center_installations(app: &AppHandle) -> Result<Vec<Value>, String> {
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let mut result = Vec::new();
    for entry in fs::read_dir(root(app)?).map_err(fail)? {
        let entry = entry.map_err(fail)?;
        if !entry.file_type().map_err(fail)?.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        if identifier(&id).is_err() {
            continue;
        }
        for slot in ["current", "next", "backup"] {
            if let Ok(source) = read_json(&entry.path().join(slot).join(".source.json")) {
                if source["center"].is_object() {
                    result.push(json!({"pluginId":id,"origin":source["center"]["origin"],"releaseId":source["center"]["releaseId"]}));
                }
            }
        }
    }
    Ok(result)
}
pub(crate) fn save_center_statuses(
    app: &AppHandle,
    origin: &str,
    items: &[Value],
) -> Result<(), String> {
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let path = root(app)?.join(".center-status.json");
    let mut records = if path.exists() {
        read_json(&path)?
    } else {
        json!({})
    };
    merge_center_statuses(&mut records, origin, items)?;
    write_json(&path, &records)?;
    Ok(())
}
fn merge_center_statuses(records: &mut Value, origin: &str, items: &[Value]) -> Result<(), String> {
    if !records.is_object() {
        return Err(fail("中心状态记录损坏"));
    }
    for item in items {
        let id = item["releaseId"]
            .as_str()
            .ok_or_else(|| fail("中心状态缺少版本"))?;
        identifier(id)?;
        let key = format!("{origin}|{id}");
        if records[&key]["status"] == "revoked" {
            continue;
        }
        if ["available", "revoked", "disabled"].contains(&item["status"].as_str().unwrap_or("")) {
            records[&key] = item.clone();
        }
    }
    Ok(())
}
fn center_cached_status(app: &AppHandle, source: &Value) -> Result<Option<Value>, String> {
    if source["center"].is_null() {
        return Ok(None);
    }
    let origin = source["center"]["origin"]
        .as_str()
        .ok_or_else(|| fail("中心来源记录损坏"))?;
    let release = source["center"]["releaseId"]
        .as_str()
        .ok_or_else(|| fail("中心来源记录损坏"))?;
    let path = root(app)?.join(".center-status.json");
    if !path.exists() {
        return Ok(None);
    }
    let records = match read_json(&path) {
        Ok(value) if value.is_object() => value,
        _ => return Err("中心状态记录损坏，无法核验版本".into()),
    };
    Ok(records.get(format!("{origin}|{release}")).cloned())
}
fn center_block_reason(app: &AppHandle, source: &Value) -> Option<String> {
    let record = match center_cached_status(app, source) {
        Ok(Some(record)) => record,
        Ok(None) => return None,
        Err(error) => return Some(error),
    };
    match record["status"].as_str() {
        Some("revoked" | "disabled") => Some(format!(
            "插件版本已撤回或禁用：{}",
            record["reason"].as_str().unwrap_or("中心已停止此版本")
        )),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn release_only_installs_from_center_on_mobile() {
        assert!(install_mode_allowed(false, true, true));
        assert!(!install_mode_allowed(false, true, false));
        assert!(!install_mode_allowed(false, false, true));
        assert!(install_mode_allowed(true, true, false));
    }
    #[test]
    fn center_install_defaults_enabled_and_preserves_explicit_choice() {
        let directory = temp();
        let source = json!({"url":"https://plugins-api.taunote.app/v2/releases/release-1/download","center":{"origin":"https://plugins-api.taunote.app","releaseId":"release-1"}});
        assert!(enabled_intent(&directory, &source));
        write_json(&directory.join("enabled.json"), &json!(false)).unwrap();
        assert!(!enabled_intent(&directory, &source));
        fs::write(directory.join("enabled.json"), "损坏的启用状态").unwrap();
        assert!(!enabled_intent(&directory, &source));
        write_json(&directory.join("enabled.json"), &json!(true)).unwrap();
        assert!(enabled_intent(&directory, &source));
        fs::remove_dir_all(directory).unwrap();
    }
    #[tokio::test]
    async fn cancellation_interrupts_a_stalled_request() {
        let download = Download::begin("test.stalled").unwrap();
        let cancelled = download.cancelled.clone();
        let trigger = tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            cancelled.store(true, Ordering::SeqCst);
        });
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(1),
            download.request(std::future::pending::<Result<(), reqwest::Error>>()),
        )
        .await
        .unwrap();
        assert!(result.unwrap_err().contains("取消"));
        trigger.await.unwrap();
    }
    #[test]
    fn confirmed_revocation_survives_missing_or_available_responses() {
        let mut records = json!({});
        merge_center_statuses(
            &mut records,
            "https://center.test",
            &[json!({"releaseId":"r1","status":"revoked","reason":"test"})],
        )
        .unwrap();
        for status in ["available", "not_found"] {
            merge_center_statuses(
                &mut records,
                "https://center.test",
                &[json!({"releaseId":"r1","status":status})],
            )
            .unwrap();
            assert_eq!(records["https://center.test|r1"]["status"], "revoked");
        }
        assert!(merge_center_statuses(&mut json!([]), "https://center.test", &[]).is_err());
    }
    fn temp() -> PathBuf {
        let path = std::env::temp_dir().join(format!("tau-plugin-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        path
    }
    fn archive(name: &str, code: &str, expected: &str) -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(json!({"formatVersion":3,"apiVersion":1,"format":"cjs","name":"Counter","version":"1.0.0","platform":"portable","profile":"web-v1","id":"test.counter","targets":{"android":{"minAppVersion":"0.2.0"},"ios":{"minAppVersion":"0.2.0"}},"main":name,"integrity":{name:expected}}).to_string().as_bytes()).unwrap();
        zip.start_file(name, options).unwrap();
        zip.write_all(code.as_bytes()).unwrap();
        zip.finish().unwrap().into_inner()
    }
    #[test]
    fn duplicate_download_cannot_reset_cancellation() {
        let first = Download::begin("test.cancel").unwrap();
        first.cancelled.store(true, Ordering::SeqCst);
        assert!(Download::begin("test.cancel").is_err());
        assert!(first.check().is_err());
        drop(first);
        assert!(Download::begin("test.cancel").unwrap().check().is_ok());
    }
    #[test]
    fn validates_entry_hash_and_rejects_traversal() {
        let root = temp();
        let good = root.join("good");
        fs::create_dir(&good).unwrap();
        assert!(extract(&archive("main.js", "code", &hash(b"code")), &good).is_ok());
        let bad = root.join("bad");
        fs::create_dir(&bad).unwrap();
        assert!(extract(&archive("main.js", "code", &hash(b"other")), &bad).is_err());
        let escaped = root.join("escaped");
        fs::create_dir(&escaped).unwrap();
        assert!(extract(&archive("../escape.js", "code", &hash(b"code")), &escaped).is_err());
        assert!(!root.join("escape.js").exists());
        remove(&root).unwrap();
    }
    #[test]
    fn recovers_between_backup_and_commit_and_keeps_device_intent() {
        let root = temp();
        fs::create_dir(root.join("current")).unwrap();
        fs::write(root.join("current/version"), "old").unwrap();
        fs::create_dir(root.join("next")).unwrap();
        fs::write(root.join("next/version"), "new").unwrap();
        write_json(&root.join("enabled.json"), &json!(true)).unwrap();
        write_json(&root.join("switch.json"), &json!({"version":1})).unwrap();
        fs::rename(root.join("current"), root.join("backup")).unwrap();
        recover(&root).unwrap();
        recover(&root).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("current/version")).unwrap(),
            "new"
        );
        assert_eq!(
            fs::read_to_string(root.join("backup/version")).unwrap(),
            "old"
        );
        assert_eq!(read_json(&root.join("enabled.json")).unwrap(), true);
        remove(&root).unwrap();
    }
    #[test]
    fn failed_switch_does_not_delete_current_package() {
        let root = temp();
        fs::create_dir(root.join("current")).unwrap();
        fs::write(root.join("current/version"), "old").unwrap();
        fs::create_dir(root.join("next")).unwrap();
        fs::write(root.join("next/version"), "new").unwrap();
        fs::write(root.join("backup"), "blocked").unwrap();
        assert!(switch(&root).is_err());
        assert_eq!(
            fs::read_to_string(root.join("current/version")).unwrap(),
            "old"
        );
        fs::remove_file(root.join("backup")).unwrap();
        recover(&root).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("current/version")).unwrap(),
            "new"
        );
        remove(&root).unwrap();
    }
}

#[tauri::command]
pub fn plugin_apply_pending(app: AppHandle) -> Result<(), String> {
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    for entry in fs::read_dir(root(&app)?).map_err(fail)? {
        let entry = entry.map_err(fail)?;
        if !entry.file_type().map_err(fail)?.is_dir() {
            continue;
        }
        let directory = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let result = (|| -> Result<(), String> {
            recover(&directory)?;
            if directory.join("pending.json").exists() {
                if directory.join("next").exists() {
                    artifact_for_app(&app, &directory.join("next"))?;
                    switch(&directory)?;
                    crate::logger::info(format!("[plugins] 待生效版本已切换 id={name}"));
                }
                fs::remove_file(directory.join("pending.json")).map_err(fail)?;
            }
            Ok(())
        })();
        if let Err(error) = result {
            crate::logger::error(format!(
                "[plugins] 应用待生效版本失败 id={name} error={error}"
            ));
            write_json(&directory.join("error.json"), &json!(error))?;
        } else if directory.join("error.json").exists() {
            fs::remove_file(directory.join("error.json")).map_err(fail)?;
        }
    }
    Ok(())
}

/** AI 注册与调用复用插件安装、启用和中心来源门闩。 */
pub(crate) fn installed_for_ai(app: &AppHandle, id: &str) -> Result<(Value, String), String> {
    identifier(id)?;
    let _lock = STORE_LOCK.lock().map_err(fail)?;
    let store = crate::setting::resolve_app_dir(app)?.join("portable-plugins");
    let directory = store.join(id);
    let current = directory.join("current");
    if directory.join("switch.json").exists() {
        return Err(fail("插件正在切换版本"));
    }
    for path in [&store, &directory, &current] {
        let metadata = fs::symlink_metadata(path).map_err(fail)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(fail("插件安装目录无效"));
        }
    }
    let revision = ai_skill_revision(&directory, &current)?;
    let value = artifact_for_app(app, &current)?;
    if value.kind != "plugin" {
        return Err(fail("独立 Skill 包不提供插件代码能力"));
    }
    if value.manifest["id"] != id || value.manifest["apiVersion"] != 1 {
        return Err(fail("插件安装身份无效"));
    }
    let source = read_json(&current.join(".source.json"))?;
    if let Some(reason) = source_rejection(&source).or_else(|| center_block_reason(app, &source)) {
        return Err(fail(reason));
    }
    if !enabled_intent(&directory, &source) {
        return Err(fail("插件已停用"));
    }
    if ai_skill_revision(&directory, &current)? != revision {
        return Err(fail("插件安装代次已变化"));
    }
    Ok((value.manifest, revision))
}

#[cfg(test)]
mod ai_skill_generation_tests {
    use super::*;
    #[test]
    fn skill_generation_tracks_enabled_intent_and_same_version_reinstall() {
        let root =
            std::env::temp_dir().join(format!("plugin-ai-generation-{}", uuid::Uuid::new_v4()));
        let directory = root.join("portable-plugins/example.skill");
        let current = directory.join("current");
        fs::create_dir_all(&current).unwrap();
        let manifest = json!({"id":"example.skill","version":"1.0.0","skills":["summary"]});
        let source = json!({"sha256":"fixed-package-digest"});
        write_json(&current.join("manifest.json"), &manifest).unwrap();
        write_json(&current.join(".source.json"), &source).unwrap();
        write_json(&directory.join("enabled.json"), &json!(true)).unwrap();
        let original = ai_skill_revision(&directory, &current).unwrap();
        assert_eq!(ai_skill_revision(&directory, &current).unwrap(), original);
        fs::create_dir(directory.join("staging")).unwrap();
        assert_eq!(ai_skill_revision(&directory, &current).unwrap(), original);
        write_json(&directory.join("enabled.json"), &json!(false)).unwrap();
        write_json(&directory.join("enabled.json"), &json!(true)).unwrap();
        let reenabled = ai_skill_revision(&directory, &current).unwrap();
        assert_ne!(original, reenabled);
        fs::rename(&current, directory.join("old")).unwrap();
        fs::create_dir(&current).unwrap();
        write_json(&current.join("manifest.json"), &manifest).unwrap();
        write_json(&current.join(".source.json"), &source).unwrap();
        assert_ne!(ai_skill_revision(&directory, &current).unwrap(), reenabled);
        fs::remove_dir_all(root).unwrap();
    }
}

#[cfg(test)]
mod skill_package_tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn fixture() -> Fixture {
        let path =
            std::env::temp_dir().join(format!("native-skill-package-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Fixture(path)
    }
    fn manifest(version: &str, files: &[(&str, &[u8])]) -> Value {
        let integrity = files
            .iter()
            .map(|(name, bytes)| (name.to_string(), Value::String(hash(bytes))))
            .collect::<serde_json::Map<_, _>>();
        json!({"formatVersion":1,"apiVersion":1,"platform":"portable","id":"example.notes","name":"笔记技能","version":version,"targets":{"android":{"minAppVersion":"0.2.13"},"ios":{"minAppVersion":"0.2.13"}},"skills":["summary"],"integrity":integrity})
    }
    fn archive(value: &Value, files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(value.to_string().as_bytes()).unwrap();
        zip.start_file("README.md", options).unwrap();
        zip.write_all(b"Package documentation").unwrap();
        for (name, bytes) in files {
            zip.start_file(*name, options).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap().into_inner()
    }
    fn prepare(directory: &Path, value: &Value, files: &[(&str, &[u8])]) -> Artifact {
        fs::create_dir_all(directory).unwrap();
        let bytes = archive(value, files);
        let artifact = extract(&bytes, directory).unwrap();
        write_json(
            &directory.join(".source.json"),
            &json!({"sha256":hash(&bytes),"version":value["version"],"center":null}),
        )
        .unwrap();
        artifact
    }
    #[test]
    fn standalone_skills_install_update_restore_and_remove_preserve_scripts_as_data() {
        let fixture = fixture();
        let directory = fixture.0.join("example.notes");
        fs::create_dir(&directory).unwrap();
        let files = [
            ("skills/summary/SKILL.md", b"First instructions".as_slice()),
            (
                "skills/summary/scripts/helper.py",
                b"raise RuntimeError('data, never execute')".as_slice(),
            ),
            ("skills/summary/assets/data.bin", &[0_u8, 255]),
        ];
        let value = manifest("1.0.0", &files);
        let parsed = prepare(&directory.join("next"), &value, &files);
        assert_eq!(parsed.kind, "skills");
        assert!(parsed.code.is_none());
        let serialized = serde_json::to_value(parsed).unwrap();
        assert!(serialized.get("code").is_none());
        assert!(serialized.get("css").is_none());
        assert_package_compatible(&value, "android", "0.2.13").unwrap();
        write_json(&directory.join("enabled.json"), &json!(true)).unwrap();
        assert!(enabled_intent(&directory, &json!({})));
        switch(&directory).unwrap();
        assert_eq!(
            artifact(&directory.join("current")).unwrap().manifest["version"],
            "1.0.0"
        );
        let second = [
            ("skills/summary/SKILL.md", b"Second instructions".as_slice()),
            files[1],
            files[2],
        ];
        prepare(
            &directory.join("next"),
            &manifest("1.1.0", &second),
            &second,
        );
        switch(&directory).unwrap();
        assert_eq!(
            artifact(&directory.join("current")).unwrap().manifest["version"],
            "1.1.0"
        );
        assert_eq!(
            fs::read(directory.join("current/skills/summary/scripts/helper.py")).unwrap(),
            files[1].1
        );
        let next = directory.join("next");
        fs::create_dir(&next).unwrap();
        copy_package_tree(&directory.join("backup"), &next).unwrap();
        artifact(&next).unwrap();
        switch(&directory).unwrap();
        assert_eq!(
            artifact(&directory.join("current")).unwrap().manifest["version"],
            "1.0.0"
        );
        assert_eq!(
            fs::read(directory.join("current/skills/summary/assets/data.bin")).unwrap(),
            files[2].1
        );
        remove(&directory).unwrap();
        assert!(!directory.exists());
    }
    #[test]
    fn standalone_compatibility_uses_explicit_targets_and_semver() {
        let files = [("skills/summary/SKILL.md", b"instructions".as_slice())];
        let value = manifest("1.0.0", &files);
        assert_package_compatible(&value, "ios", "0.2.13").unwrap();
        assert!(assert_package_compatible(&value, "ios", "0.2.13-rc.1").is_err());
        let mut portable = value.clone();
        portable["minAppVersion"] = json!("999999.0.0");
        assert_package_compatible(&portable, "ios", "0.2.13").unwrap();
        let mut desktop = value.clone();
        desktop["platform"] = json!("desktop");
        desktop["minAppVersion"] = json!("0.60.1");
        assert_package_compatible(&desktop, "desktop", "0.60.1").unwrap();
        assert!(assert_package_compatible(&desktop, "android", "99.0.0").is_err());
        assert!(assert_mobile_package_manifest(&desktop, "unknown", "99.0.0").is_err());
        desktop["format"] = json!("cjs");
        desktop["profile"] = json!("old-metadata");
        assert_package_compatible(&desktop, "desktop", "0.60.1").unwrap();
        assert!(assert_mobile_package_manifest(&desktop, "android", "99.0.0").is_err());
        let mut no_mobile = value.clone();
        no_mobile["targets"] = json!({"desktop":{"minAppVersion":"0.1.0"}});
        assert!(assert_package_compatible(&no_mobile, "ios", "99.0.0").is_err());
        for targets in [
            json!({}),
            json!({"future":{"minAppVersion":"0.0.0"}}),
            json!({"ios":{"minAppVersion":"0.02.13"}}),
            json!({"ios":{"minAppVersion":"0.2.١٣"}}),
        ] {
            let mut invalid = value.clone();
            invalid["targets"] = targets;
            assert!(assert_package_compatible(&invalid, "ios", "99.0.0").is_err());
        }
        let mut huge = value.clone();
        huge["targets"]["ios"]["minAppVersion"] = json!("999999999999999999999999999999999999.0.0");
        assert!(assert_package_compatible(&huge, "ios", "99.0.0").is_err());
        assert!(compare_versions("1.0.0-alpha.2", "1.0.0-alpha.10")
            .unwrap()
            .is_lt());
        assert!(compare_versions("1.0.0+build", "1.0.0").unwrap().is_eq());
    }
    #[test]
    fn static_templates_and_code_fields_cannot_masquerade_as_skill_packages() {
        let fixture = fixture();
        let files = [("skills/summary/SKILL.md", b"instructions".as_slice())];
        let value = manifest("1.0.0", &files);
        for field in ["main", "format", "profile", "styles", "backend", "template"] {
            let mut invalid = value.clone();
            invalid[field] = Value::Null;
            let directory = fixture.0.join(field);
            fs::create_dir(&directory).unwrap();
            assert!(extract(&archive(&invalid, &files), &directory).is_err());
        }
        let mut outside = value.clone();
        outside["integrity"]["README.md"] = json!(hash(b"Package documentation"));
        let directory = fixture.0.join("outside");
        fs::create_dir(&directory).unwrap();
        assert!(extract(&archive(&outside, &files), &directory).is_err());
        let mut missing = value.clone();
        missing["integrity"] = json!({});
        let directory = fixture.0.join("missing");
        fs::create_dir(&directory).unwrap();
        assert!(extract(&archive(&missing, &files), &directory).is_err());
        let mut wrong = value.clone();
        wrong["integrity"]["skills/summary/SKILL.md"] = json!("0".repeat(64));
        let directory = fixture.0.join("wrong-hash");
        fs::create_dir(&directory).unwrap();
        assert!(extract(&archive(&wrong, &files), &directory).is_err());
        let mut advertised = value.clone();
        advertised["targets"]["ios"]["minAppVersion"] = json!("0.0.0");
        assert!(assert_same_package_manifest(&value, &advertised).is_err());
    }
    #[test]
    fn interrupted_static_update_recovers_the_verified_next_package() {
        let fixture = fixture();
        let directory = fixture.0.join("example.notes");
        fs::create_dir(&directory).unwrap();
        let first = [("skills/summary/SKILL.md", b"one".as_slice())];
        let second = [("skills/summary/SKILL.md", b"two".as_slice())];
        prepare(&directory.join("next"), &manifest("1.0.0", &first), &first);
        switch(&directory).unwrap();
        prepare(
            &directory.join("next"),
            &manifest("1.1.0", &second),
            &second,
        );
        write_json(&directory.join("switch.json"), &json!({"version":1})).unwrap();
        fs::rename(directory.join("current"), directory.join("backup")).unwrap();
        recover(&directory).unwrap();
        assert_eq!(
            artifact(&directory.join("current")).unwrap().manifest["version"],
            "1.1.0"
        );
        assert_eq!(
            artifact(&directory.join("backup")).unwrap().manifest["version"],
            "1.0.0"
        );
    }
}
