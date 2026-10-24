use crate::plugin_files::{FileLease, TemporaryFile};
use crate::plugin_transport::{window_allowed, with_host};
use std::collections::HashMap;
use std::fs;
use std::io::Cursor;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, WebviewWindow};
use uuid::Uuid;

use crate::setting::{load_or_init_setting, resolve_app_dir};

#[derive(Debug, Clone)]
struct AppError {
    code: String,
    message: String,
}

impl AppError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone)]
struct ProcessedUploadFile {
    file_name: String,
    mime_type: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
struct LocalConfig {
    path: String,
}

#[derive(Debug, Clone)]
enum ResourceProvider {
    Local(LocalConfig),
    Plugin(crate::plugin_provider::PluginProvider),
}

fn as_string(value: Option<&Value>) -> String {
    value.and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn as_bool(value: Option<&Value>) -> bool {
    value.and_then(|v| v.as_bool()).unwrap_or(false)
}

fn format_error(error: AppError) -> String {
    format!("{}:{}", error.code, error.message)
}

fn normalized_file_name(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        "resource.bin".to_string()
    } else {
        trimmed.replace('\\', "/")
    }
}

fn sanitize_local_path(path: &str) -> String {
    let mut normalized = path.trim().replace('\\', "/");
    normalized = normalized.trim_matches('/').to_string();

    if normalized == ".editor" {
        return "resources".to_string();
    }
    if let Some(stripped) = normalized.strip_prefix(".editor/") {
        normalized = stripped.to_string();
    }

    if normalized.is_empty() {
        return "resources".to_string();
    }

    let mut segments = Vec::new();
    for segment in normalized.split('/') {
        let item = segment.trim();
        if item.is_empty() {
            continue;
        }
        if item == "." || item == ".." || item.contains(':') {
            return "resources".to_string();
        }
        segments.push(item);
    }

    if segments.is_empty() {
        "resources".to_string()
    } else {
        segments.join("/")
    }
}

fn extension_from_file_name(file_name: &str) -> String {
    Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn replace_extension(file_name: &str, extension: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|part| part.to_str())
        .unwrap_or("resource");
    format!("{stem}.{extension}")
}

fn sanitize_file_stem(file_name: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|part| part.to_str())
        .unwrap_or("resource");
    let cleaned = stem.trim().replace(['/', '\\'], "_");
    if cleaned.is_empty() {
        "resource".to_string()
    } else {
        cleaned
    }
}

fn build_object_name(file_name: &str) -> String {
    let stem = sanitize_file_stem(file_name);
    let extension = extension_from_file_name(file_name);
    let id = Uuid::new_v4().simple().to_string();
    if extension.is_empty() {
        format!("{stem}_{id}")
    } else {
        format!("{stem}_{id}.{extension}")
    }
}

fn should_compress_image(mime_type: &str, file_name: &str) -> bool {
    let normalized_mime = mime_type.to_ascii_lowercase();
    if matches!(
        normalized_mime.as_str(),
        "image/png" | "image/jpeg" | "image/jpg"
    ) {
        return true;
    }
    matches!(
        extension_from_file_name(file_name).as_str(),
        "png" | "jpeg" | "jpg"
    )
}

// 超出压缩预算时保留原文件上传，避免解码大图放大内存；不限制文件传输大小。
fn compression_fits_memory(path: &Path) -> bool {
    if fs::metadata(path).map_or(true, |metadata| metadata.len() > 32 * 1024 * 1024) {
        return false;
    }
    image::ImageReader::open(path)
        .ok()
        .and_then(|reader| reader.with_guessed_format().ok())
        .and_then(|reader| reader.into_dimensions().ok())
        .is_some_and(|(width, height)| u64::from(width) * u64::from(height) <= 8 * 1024 * 1024)
}

fn compress_image_if_needed(
    file_name: &str,
    mime_type: &str,
    bytes: Vec<u8>,
    enable_compression: bool,
) -> ProcessedUploadFile {
    let original = ProcessedUploadFile {
        file_name: file_name.to_string(),
        mime_type: mime_type.to_string(),
        bytes,
    };

    if !enable_compression || !should_compress_image(mime_type, file_name) {
        return original;
    }

    match try_compress_to_webp(file_name, &original.bytes) {
        Ok(processed) => processed,
        Err(error) => {
            eprintln!("[resource-upload] 图片压缩失败，使用原始文件: {error}");
            original
        }
    }
}

fn try_compress_to_webp(file_name: &str, bytes: &[u8]) -> Result<ProcessedUploadFile, String> {
    let decoded = image::load_from_memory(bytes).map_err(|e| format!("图片解码失败: {e}"))?;
    let rgba = decoded.thumbnail(2048, 2048).to_rgba8();
    drop(decoded);
    let (width, height) = rgba.dimensions();
    if width == 0 || height == 0 {
        return Err("图片尺寸无效".to_string());
    }

    let encoder = webp::Encoder::from_rgba(rgba.as_raw(), width, height);
    let compressed = encoder.encode(80.0);
    let compressed_bytes = compressed.to_vec();
    if compressed_bytes.is_empty() {
        return Err("压缩结果为空".to_string());
    }

    Ok(ProcessedUploadFile {
        file_name: replace_extension(file_name, "webp"),
        mime_type: "image/webp".to_string(),
        bytes: compressed_bytes,
    })
}

/// 按指定上传服务解析配置；`active` 通常取 imageBed.active，测试上传时传入待测服务
fn parse_resource_provider(
    app: &AppHandle,
    setting: &Value,
    active: &str,
) -> Result<ResourceProvider, AppError> {
    if active == "local" {
        return Ok(ResourceProvider::Local(LocalConfig {
            path: sanitize_local_path(&as_string(setting.pointer("/imageBed/local/path"))),
        }));
    }
    let selected = if active == "plugin" {
        None
    } else {
        Some(active)
    };
    crate::plugin_provider::PluginProvider::from_setting(app, setting, "imageBed", selected)
        .map(ResourceProvider::Plugin)
        .map_err(|error| AppError::new("RESOURCE_CONFIG_MISSING", error))
}

fn upload_to_local(
    app: &AppHandle,
    config: &LocalConfig,
    object_name: &str,
    content: &[u8],
) -> Result<String, AppError> {
    let app_dir = resolve_app_dir(app).map_err(|e| {
        AppError::new(
            "RESOURCE_WRITE_FAILED",
            format!("解析本地资源目录失败: {e}"),
        )
    })?;
    let local_path = sanitize_local_path(&config.path);
    let resource_dir = app_dir.join(&local_path);
    fs::create_dir_all(&resource_dir).map_err(|e| {
        AppError::new(
            "RESOURCE_WRITE_FAILED",
            format!("创建本地资源目录失败: {e}"),
        )
    })?;
    let target_path = resource_dir.join(object_name);
    fs::write(&target_path, content).map_err(|e| {
        AppError::new(
            "RESOURCE_WRITE_FAILED",
            format!("写入本地资源文件失败: {e}"),
        )
    })?;

    Ok(format!("~/.editor/{local_path}/{object_name}"))
}

struct UploadInput {
    lease: FileLease,
    file: TemporaryFile,
    file_name: String,
    mime_type: String,
    provider: ResourceProvider,
    compress: bool,
}
type UploadStage = Arc<Mutex<Option<UploadInput>>>;
fn uploads() -> &'static Mutex<HashMap<String, UploadStage>> {
    static STATE: OnceLock<Mutex<HashMap<String, UploadStage>>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(HashMap::new()))
}
pub(crate) fn invalidate_uploads() {
    if let Ok(mut state) = uploads().lock() {
        state.clear();
    }
}
fn upload_stage(id: &str) -> Result<UploadStage, String> {
    uploads()
        .lock()
        .map_err(|_| "资源上传状态不可用")?
        .get(id)
        .cloned()
        .ok_or_else(|| "资源上传已结束".into())
}
#[tauri::command]
pub fn resource_upload_begin(
    app: AppHandle,
    window: WebviewWindow,
    file_name: String,
    mime_type: String,
) -> Result<String, String> {
    window_allowed(&window)?;
    let setting = load_or_init_setting(&app)?;
    let token =
        crate::plugin_transport::host_token(&crate::setting::get_active_database_name(&setting))?;
    let provider = parse_resource_provider(
        &app,
        &setting,
        &as_string(setting.pointer("/imageBed/active")),
    )
    .map_err(format_error)?;
    let file = TemporaryFile::new(&app)?;
    let lease = FileLease::open(&token, &file.path, true)?;
    let id = uuid::Uuid::new_v4().to_string();
    let stage = Arc::new(Mutex::new(Some(UploadInput {
        lease,
        file,
        file_name: normalized_file_name(&file_name),
        mime_type,
        provider,
        compress: as_bool(setting.pointer("/imageBed/enableCompression")),
    })));
    with_host(&token, || {
        let mut state = uploads().lock().map_err(|_| "资源上传状态不可用")?;
        if state.len() >= 4 {
            return Err("资源上传任务过多，请稍后重试".into());
        }
        state.insert(id.clone(), stage);
        Ok(id)
    })
}
#[tauri::command]
pub async fn resource_upload_write(
    window: WebviewWindow,
    id: String,
    offset: u64,
    chunk: String,
) -> Result<(), String> {
    window_allowed(&window)?;
    let stage = upload_stage(&id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let input = stage.lock().map_err(|_| "资源上传状态不可用")?;
        let input = input.as_ref().ok_or("资源上传已结束")?;
        crate::plugin_files::write_chunk(
            &input.lease.token,
            &input.lease.descriptor.id,
            offset,
            &chunk,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn resource_upload_cancel(window: WebviewWindow, id: String) -> Result<(), String> {
    window_allowed(&window)?;
    uploads()
        .lock()
        .map_err(|_| "资源上传状态不可用")?
        .remove(&id);
    Ok(())
}
#[tauri::command]
pub async fn upload_resource(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    size: u64,
) -> Result<String, String> {
    window_allowed(&window)?;
    let stage = uploads()
        .lock()
        .map_err(|_| "资源上传状态不可用")?
        .remove(&id)
        .ok_or("资源上传已结束")?;
    let input = stage
        .lock()
        .map_err(|_| "资源上传状态不可用")?
        .take()
        .ok_or("资源上传已结束")?;
    input.lease.finish(size)?;
    if size == 0 {
        return Err("RESOURCE_UPLOAD_FAILED:上传文件内容为空".into());
    }
    let UploadInput {
        lease,
        file,
        file_name,
        mime_type,
        provider,
        compress,
    } = input;
    let token = lease.token.clone();
    drop(lease);
    let compression_memory = crate::plugin_files::memory_permit().await?;
    let (file_name, mime_type, file) = tauri::async_runtime::spawn_blocking(move || {
        if compress
            && should_compress_image(&mime_type, &file_name)
            && compression_fits_memory(&file.path)
        {
            let bytes = fs::read(&file.path).map_err(|e| e.to_string())?;
            let processed = compress_image_if_needed(&file_name, &mime_type, bytes, true);
            fs::write(&file.path, &processed.bytes).map_err(|e| e.to_string())?;
            Ok::<_, String>((processed.file_name, processed.mime_type, file))
        } else {
            Ok((file_name, mime_type, file))
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    drop(compression_memory);
    with_host(&token, || Ok(()))?;
    let object_name = build_object_name(&file_name);
    match provider {
        ResourceProvider::Local(config) => {
            let local_path = sanitize_local_path(&config.path);
            let directory = resolve_app_dir(&app)?.join(&local_path);
            fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
            fs::copy(&file.path, directory.join(&object_name)).map_err(|e| e.to_string())?;
            Ok(format!("~/.editor/{local_path}/{object_name}"))
        }
        ResourceProvider::Plugin(plugin) => {
            plugin
                .upload_resource_path(&object_name, &mime_type, &file.path)
                .await
        }
    }
}

async fn upload_with_provider(
    app: &AppHandle,
    provider: &ResourceProvider,
    name: &str,
    file: &ProcessedUploadFile,
) -> Result<String, AppError> {
    match provider {
        ResourceProvider::Local(config) => upload_to_local(app, config, name, &file.bytes),
        ResourceProvider::Plugin(plugin) => plugin
            .upload_resource(name, &file.mime_type, &file.bytes)
            .await
            .map_err(|error| AppError::new("RESOURCE_UPLOAD_FAILED", error)),
    }
}

/// 测试图固定文件名：每次覆盖同一个对象，不在远端累积
const UPLOAD_TEST_OBJECT_NAME: &str = "tau-upload-test.png";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadTestResponse {
    pub url: String,
    /// 上传后能否按返回地址直接读取（私有 Bucket、需鉴权的 WebDAV 会是 false）
    pub readable: bool,
    pub elapsed_ms: u64,
}

fn build_test_image() -> Result<Vec<u8>, AppError> {
    let image = image::RgbaImage::from_pixel(16, 16, image::Rgba([94, 129, 172, 255]));
    let mut bytes = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
        .map_err(|e| AppError::new("RESOURCE_UPLOAD_FAILED", format!("生成测试图片失败: {e}")))?;
    Ok(bytes)
}

async fn is_url_readable(url: &str) -> bool {
    match reqwest::Client::new()
        .get(url)
        .header("User-Agent", "tau-mobile")
        .timeout(Duration::from_secs(12))
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

/// 用指定上传服务真传一张测试图并回读，不改写 imageBed.active
#[tauri::command]
pub async fn resource_upload_test(
    app: AppHandle,
    provider: String,
) -> Result<UploadTestResponse, String> {
    let setting = load_or_init_setting(&app)
        .map_err(|e| format!("SETTING_INVALID:读取 setting.json 失败: {e}"))?;
    let parsed = parse_resource_provider(&app, &setting, &provider).map_err(format_error)?;
    if matches!(parsed, ResourceProvider::Local(_)) {
        return Err(format_error(AppError::new(
            "RESOURCE_CONFIG_MISSING",
            "保存在本机无需测试",
        )));
    }
    let file = ProcessedUploadFile {
        file_name: UPLOAD_TEST_OBJECT_NAME.to_string(),
        mime_type: "image/png".to_string(),
        bytes: build_test_image().map_err(format_error)?,
    };
    let started = Instant::now();
    let name = build_object_name(UPLOAD_TEST_OBJECT_NAME);
    let url = upload_with_provider(&app, &parsed, &name, &file)
        .await
        .map_err(format_error)?;
    let readable = is_url_readable(&url).await;
    Ok(UploadTestResponse {
        url,
        readable,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

fn resolve_resource_path(app: &AppHandle, path: &str) -> Result<std::path::PathBuf, String> {
    let app_dir = resolve_app_dir(app).and_then(|dir| {
        dir.canonicalize()
            .map_err(|e| format!("RESOURCE_READ_FAILED: {e}"))
    })?;
    let canonical = std::path::Path::new(path)
        .canonicalize()
        .map_err(|e| format!("RESOURCE_READ_FAILED: 路径无效: {e}"))?;
    if !canonical.starts_with(&app_dir) {
        return Err("RESOURCE_READ_FAILED: 路径超出 .editor 范围".to_string());
    }
    Ok(canonical)
}

/// 读取 .editor 内的资源文件并以 base64 返回。
/// Android 的 asset protocol 存在无法加载图片的官方未决缺陷（tauri#12364），
/// raw response 亦不可靠（tauri#10573），统一 base64 字符串 + 前端 blob URL。
/// 大文件读写经 spawn_blocking 离开主线程，避免阻塞其它 IPC
#[tauri::command]
pub async fn read_resource_bytes(app: AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let canonical = resolve_resource_path(&app, &path)?;
        let bytes =
            fs::read(&canonical).map_err(|e| format!("RESOURCE_READ_FAILED: 读取失败: {e}"))?;
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    })
    .await
    .map_err(|e| format!("RESOURCE_READ_FAILED: {e}"))?
}

/// 列表缩略图最长边：覆盖列表小图（76px）与置顶特写卡（全宽），72 质量 webp 约几十 KB，
/// 相比全尺寸图（实测最大 3.7MB）base64 IPC 负载降两个数量级
const THUMB_MAX_DIMENSION: u32 = 640;
pub(crate) const THUMB_SUFFIX: &str = "_thumb.webp";
const THUMB_SOURCE_EXTENSIONS: [&str; 4] = ["webp", "jpg", "jpeg", "png"];

fn decode_image_rgba(bytes: &[u8]) -> Result<image::RgbaImage, String> {
    if let Ok(decoded) = image::load_from_memory(bytes) {
        return Ok(decoded.to_rgba8());
    }
    // image crate 只启用了 jpeg/png 特性，webp 走 libwebp 绑定解码
    let decoded = webp::Decoder::new(bytes)
        .decode()
        .ok_or_else(|| "图片解码失败: 不支持的格式".to_string())?;
    Ok(decoded.to_image().to_rgba8())
}

fn thumb_path_for(canonical: &Path) -> std::path::PathBuf {
    let stem = canonical
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("resource");
    canonical.with_file_name(format!("{stem}{THUMB_SUFFIX}"))
}

/// 缩略图新鲜度：原图被同名覆盖更新（云同步下发即原地写入）时必须重建
fn is_thumb_fresh(original: &Path, thumb: &Path) -> bool {
    let (Ok(original_meta), Ok(thumb_meta)) = (fs::metadata(original), fs::metadata(thumb)) else {
        return false;
    };
    match (original_meta.modified(), thumb_meta.modified()) {
        (Ok(original_mtime), Ok(thumb_mtime)) => thumb_mtime >= original_mtime,
        _ => false,
    }
}

/// 生成缩略图字节；原图已小于缩略图尺寸时返回 None（直接复用原图，不产生多余文件）
fn build_thumb_bytes(original: &[u8]) -> Result<Option<Vec<u8>>, String> {
    let rgba = decode_image_rgba(original)?;
    let (width, height) = rgba.dimensions();
    if width == 0 || height == 0 {
        return Err("图片尺寸无效".to_string());
    }
    if width <= THUMB_MAX_DIMENSION && height <= THUMB_MAX_DIMENSION {
        return Ok(None);
    }
    let resized = image::imageops::thumbnail(&rgba, THUMB_MAX_DIMENSION, THUMB_MAX_DIMENSION);
    let encoded =
        webp::Encoder::from_rgba(resized.as_raw(), resized.width(), resized.height()).encode(72.0);
    let thumb_bytes = encoded.to_vec();
    if thumb_bytes.is_empty() {
        return Err("缩略图编码失败".to_string());
    }
    Ok(Some(thumb_bytes))
}

fn read_thumb_bytes(canonical: &Path) -> Result<Vec<u8>, String> {
    let thumb_path = thumb_path_for(canonical);
    if is_thumb_fresh(canonical, &thumb_path) {
        if let Ok(cached) = fs::read(&thumb_path) {
            return Ok(cached);
        }
    }
    let original =
        fs::read(canonical).map_err(|e| format!("RESOURCE_READ_FAILED: 读取失败: {e}"))?;
    let Some(thumb_bytes) =
        build_thumb_bytes(&original).map_err(|e| format!("RESOURCE_READ_FAILED: {e}"))?
    else {
        return Ok(original);
    };
    // 缓存写入失败不阻塞本次返回，下次再生成
    let _ = fs::write(&thumb_path, &thumb_bytes);
    Ok(thumb_bytes)
}

/// 按需生成并读取缩略图：缓存为原文件旁的 <stem>_thumb.webp；
/// 生成失败时回退原图字节，保证前端无需区分降级路径
#[tauri::command]
pub async fn read_resource_thumb(app: AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let canonical = resolve_resource_path(&app, &path)?;
        let bytes = read_thumb_bytes(&canonical)?;
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    })
    .await
    .map_err(|e| format!("RESOURCE_READ_FAILED: {e}"))?
}

fn collect_thumb_candidates(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_thumb_candidates(&path, out);
            continue;
        }
        let Some(extension) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        if !THUMB_SOURCE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()) {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if stem.ends_with("_thumb") || is_thumb_fresh(&path, &thumb_path_for(&path)) {
            continue;
        }
        out.push(path);
    }
}

/// 启动后后台补齐缺失的缩略图：全尺寸图解码是重 CPU 操作（实测单张最长 >10s），
/// 若在列表打开时现场生成会饱和 CPU 拖垮整机帧率；串行 + 延迟启动，让位给首屏
pub async fn prewarm_resource_thumbs(app: AppHandle) {
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    let generated = tauri::async_runtime::spawn_blocking(move || {
        let Ok(app_dir) = resolve_app_dir(&app) else {
            return 0u32;
        };
        let mut candidates = Vec::new();
        collect_thumb_candidates(&app_dir, &mut candidates);
        let total = candidates.len();
        let mut generated = 0u32;
        for path in candidates {
            let Ok(original) = fs::read(&path) else {
                continue;
            };
            match build_thumb_bytes(&original) {
                Ok(Some(bytes)) => {
                    if fs::write(thumb_path_for(&path), &bytes).is_ok() {
                        generated += 1;
                    }
                }
                Ok(None) => {}
                Err(error) => {
                    eprintln!("[thumb-prewarm] 生成失败 {}: {error}", path.display());
                }
            }
        }
        if total > 0 {
            eprintln!("[thumb-prewarm] 补齐缩略图 {generated}/{total}");
        }
        generated
    })
    .await;
    if let Err(error) = generated {
        eprintln!("[thumb-prewarm] 后台任务失败: {error}");
    }
}

#[cfg(test)]
mod memory_tests {
    use super::*;
    #[test]
    fn compression_budget_skips_large_files_without_rejecting_transfer() {
        let dir = std::env::temp_dir().join(format!("tau-compression-{}", Uuid::new_v4()));
        let file = TemporaryFile::new_in(&dir).unwrap();
        fs::write(&file.path, build_test_image().unwrap()).unwrap();
        assert!(compression_fits_memory(&file.path));
        let mut bytes = fs::read(&file.path).unwrap();
        bytes[16..20].copy_from_slice(&20000u32.to_be_bytes());
        bytes[20..24].copy_from_slice(&20000u32.to_be_bytes());
        let mut crc = u32::MAX;
        for byte in &bytes[12..29] {
            crc ^= u32::from(*byte);
            for _ in 0..8 {
                crc = (crc >> 1) ^ (0xedb88320 & 0u32.wrapping_sub(crc & 1));
            }
        }
        bytes[29..33].copy_from_slice(&(!crc).to_be_bytes());
        fs::write(&file.path, bytes).unwrap();
        assert!(!compression_fits_memory(&file.path));
        fs::OpenOptions::new()
            .write(true)
            .open(&file.path)
            .unwrap()
            .set_len(33 * 1024 * 1024)
            .unwrap();
        assert!(!compression_fits_memory(&file.path));
        drop(file);
        fs::remove_dir(dir).unwrap();
    }
}
