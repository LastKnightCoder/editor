//! 移动端正文字体：读取 R2 上的 `fonts/manifest.json`，按需下载 WOFF2 到 `.editor/fonts/` 并校验
//! SHA-256，再按字重文件把字节交给前端注册 FontFace（Android WebView 的 asset 协议加载不稳定，
//! 两端统一走二进制 IPC）。
//!
//! 清单由 `scripts/publish-fonts.mjs` 生成；下载地址与本地路径只由固定发布源和校验过的文件名拼出，
//! 前端只传字体 id 与 style。一款字体全部文件落盘后才写 `<id>.json` 标记，标记即「已安装」。

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::ipc::{Channel, Response};
use tauri::AppHandle;

use crate::setting::resolve_app_dir;

const FONT_BASE_URL: &str = "https://dl.taunote.app/fonts";
const FONT_DIR: &str = "fonts";
const MAX_FONT_FILE_SIZE: u64 = 64 * 1024 * 1024;
const CHUNK_TIMEOUT: Duration = Duration::from_secs(30);
/// 进度回传粒度：约每 256 KB 一次，避免 IPC 洪泛
const PROGRESS_STEP: u64 = 256 * 1024;

static DOWNLOADING: AtomicBool = AtomicBool::new(false);
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FontFile {
    pub style: String,
    /// CSS font-weight 描述符：单值 `400` 或可变字体区间 `200 900`
    pub weight: String,
    pub file: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReadingFont {
    pub id: String,
    pub name: String,
    pub version: String,
    pub license: String,
    pub files: Vec<FontFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub received: u64,
    pub total: u64,
}

fn manifest_invalid(detail: &str) -> String {
    format!("READING_FONT_MANIFEST_INVALID: {detail}")
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        })
}

fn valid_version(version: &str) -> bool {
    version
        .split('.')
        .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
}

fn valid_weight(weight: &str) -> bool {
    let parts: Vec<&str> = weight.split(' ').collect();
    parts.len() <= 2
        && parts
            .iter()
            .all(|part| part.len() == 3 && part.bytes().all(|b| b.is_ascii_digit()))
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn font_file_name(id: &str, version: &str, style: &str) -> String {
    format!("{id}-{version}-{style}.woff2")
}

/// 清单与本地标记都按同一规则校验：文件名必须由 id、版本与 style 拼出，杜绝路径注入
fn validate_font(font: &ReadingFont) -> Result<(), String> {
    if !valid_id(&font.id) || !valid_version(&font.version) || font.name.is_empty() {
        return Err(manifest_invalid(&format!("bad font {}", font.id)));
    }
    if font.files.is_empty() {
        return Err(manifest_invalid(&format!("{} has no files", font.id)));
    }
    for file in &font.files {
        let style_ok = !file.style.is_empty() && file.style.bytes().all(|b| b.is_ascii_lowercase());
        if !style_ok
            || !valid_weight(&file.weight)
            || file.file != font_file_name(&font.id, &font.version, &file.style)
            || !valid_sha256(&file.sha256)
            || file.size == 0
            || file.size > MAX_FONT_FILE_SIZE
        {
            return Err(manifest_invalid(&format!("bad file {}", file.file)));
        }
    }
    Ok(())
}

/// 文件名属于某款字体：`<id>-<版本>-…`，版本以数字开头，避免 `noto-serif` 误删 `noto-serif-sc`
fn belongs_to(id: &str, name: &str) -> bool {
    name.strip_prefix(id)
        .and_then(|rest| rest.strip_prefix('-'))
        .and_then(|rest| rest.bytes().next())
        .is_some_and(|b| b.is_ascii_digit())
}

fn marker_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}

fn font_dir(app: &AppHandle) -> Result<PathBuf, String> {
    resolve_app_dir(app)
        .map(|dir| dir.join(FONT_DIR))
        .map_err(|e| format!("READING_FONT_STORAGE: {e}"))
}

/// 已安装字体：标记有效且每个文件都在、大小一致（启动时每次读，不做全量摘要）
fn read_installed(dir: &Path) -> Vec<ReadingFont> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut fonts: Vec<ReadingFont> = entries
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
        .filter_map(|entry| std::fs::read(entry.path()).ok())
        .filter_map(|bytes| serde_json::from_slice::<ReadingFont>(&bytes).ok())
        .filter(|font| validate_font(font).is_ok())
        .filter(|font| {
            font.files.iter().all(|file| {
                std::fs::metadata(dir.join(&file.file)).is_ok_and(|meta| meta.len() == file.size)
            })
        })
        .collect();
    fonts.sort_by(|a, b| a.id.cmp(&b.id));
    fonts
}

fn installed_font(dir: &Path, id: &str) -> Result<ReadingFont, String> {
    read_installed(dir)
        .into_iter()
        .find(|font| font.id == id)
        .ok_or_else(|| format!("READING_FONT_NOT_INSTALLED: {id}"))
}

/// 删除某款字体除 keep 以外的文件（旧版本、中断残留），标记文件单独处理
fn remove_font_files(dir: &Path, id: &str, keep: &[String]) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if belongs_to(id, &name) && !keep.contains(&name) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("READING_FONT_NETWORK: {e}"))
}

async fn fetch_catalog(client: &reqwest::Client) -> Result<Vec<ReadingFont>, String> {
    let mut fonts = client
        .get(format!("{FONT_BASE_URL}/manifest.json"))
        .header("Cache-Control", "no-cache")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("READING_FONT_NETWORK: {e}"))?
        .error_for_status()
        .map_err(|e| format!("READING_FONT_NETWORK: {e}"))?
        .json::<Vec<ReadingFont>>()
        .await
        .map_err(|e| manifest_invalid(&e.to_string()))?;
    for font in &mut fonts {
        for file in &mut font.files {
            file.sha256.make_ascii_lowercase();
        }
        validate_font(font)?;
    }
    Ok(fonts)
}

fn sha256_file(path: &Path) -> Option<String> {
    let mut hasher = Sha256::new();
    let mut file = std::fs::File::open(path).ok()?;
    std::io::copy(&mut file, &mut hasher).ok()?;
    Some(format!("{:x}", hasher.finalize()))
}

struct DownloadGuard;

impl DownloadGuard {
    fn acquire() -> Result<Self, String> {
        DOWNLOADING
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| {
                CANCEL_REQUESTED.store(false, Ordering::Release);
                DownloadGuard
            })
            .map_err(|_| "READING_FONT_BUSY: download in progress".to_string())
    }
}

impl Drop for DownloadGuard {
    fn drop(&mut self) {
        DOWNLOADING.store(false, Ordering::Release);
    }
}

/// 下载单个字重文件到 `.part` 再原子改名；report 收到的是本文件已接收字节数
async fn download_file(
    client: &reqwest::Client,
    dir: &Path,
    file: &FontFile,
    report: impl Fn(u64),
) -> Result<(), String> {
    let target = dir.join(&file.file);
    let partial = dir.join(format!("{}.part", file.file));
    let response = client
        .get(format!("{FONT_BASE_URL}/{}", file.file))
        .send()
        .await
        .map_err(|e| format!("READING_FONT_NETWORK: {e}"))?
        .error_for_status()
        .map_err(|e| format!("READING_FONT_NETWORK: {e}"))?;
    let mut out =
        std::fs::File::create(&partial).map_err(|e| format!("READING_FONT_STORAGE: {e}"))?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    let mut reported = 0u64;
    let mut stream = response.bytes_stream();
    let result: Result<(), String> = async {
        loop {
            if CANCEL_REQUESTED.load(Ordering::Acquire) {
                return Err("READING_FONT_CANCELLED: download cancelled".to_string());
            }
            let chunk = match tokio::time::timeout(CHUNK_TIMEOUT, stream.next()).await {
                Err(_) => return Err("READING_FONT_NETWORK: download stalled".to_string()),
                Ok(None) => break,
                Ok(Some(chunk)) => chunk.map_err(|e| format!("READING_FONT_NETWORK: {e}"))?,
            };
            received += chunk.len() as u64;
            if received > file.size {
                return Err("READING_FONT_CORRUPT: larger than manifest size".to_string());
            }
            hasher.update(&chunk);
            out.write_all(&chunk)
                .map_err(|e| format!("READING_FONT_STORAGE: {e}"))?;
            if received - reported >= PROGRESS_STEP {
                reported = received;
                report(received);
            }
        }
        out.flush()
            .map_err(|e| format!("READING_FONT_STORAGE: {e}"))?;
        let digest = format!("{:x}", hasher.finalize_reset());
        if received != file.size || digest != file.sha256 {
            return Err("READING_FONT_CORRUPT: size or digest mismatch".to_string());
        }
        Ok(())
    }
    .await;
    drop(out);
    if let Err(error) = result {
        let _ = std::fs::remove_file(&partial);
        return Err(error);
    }
    std::fs::rename(&partial, &target).map_err(|e| format!("READING_FONT_STORAGE: {e}"))
}

fn write_marker(dir: &Path, font: &ReadingFont) -> Result<(), String> {
    let bytes = serde_json::to_vec(font).map_err(|e| format!("READING_FONT_STORAGE: {e}"))?;
    let partial = dir.join(format!("{}.json.part", font.id));
    std::fs::write(&partial, bytes).map_err(|e| format!("READING_FONT_STORAGE: {e}"))?;
    std::fs::rename(&partial, marker_path(dir, &font.id))
        .map_err(|e| format!("READING_FONT_STORAGE: {e}"))
}

/// 线上可下载的字体清单（含大小与版本）；设置页据此显示下载大小与新版本
#[tauri::command]
pub async fn reading_font_catalog() -> Result<Vec<ReadingFont>, String> {
    fetch_catalog(&http_client()?).await
}

/// 本机已完整下载的字体；无网络也可用，决定启动时能否加载所选字体
#[tauri::command]
pub async fn reading_font_installed(app: AppHandle) -> Result<Vec<ReadingFont>, String> {
    let dir = font_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || read_installed(&dir))
        .await
        .map_err(|e| format!("READING_FONT_STORAGE: {e}"))
}

/// 下载线上最新版本的一款字体；已有同摘要的文件直接复用。完成后清理该字体的旧版本文件。
#[tauri::command]
pub async fn reading_font_download(
    app: AppHandle,
    id: String,
    on_progress: Channel<DownloadProgress>,
) -> Result<ReadingFont, String> {
    let _guard = DownloadGuard::acquire()?;
    let client = http_client()?;
    let font = fetch_catalog(&client)
        .await?
        .into_iter()
        .find(|font| font.id == id)
        .ok_or_else(|| format!("READING_FONT_NOT_FOUND: {id}"))?;
    let dir = font_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("READING_FONT_STORAGE: {e}"))?;

    let total: u64 = font.files.iter().map(|file| file.size).sum();
    let mut done = 0u64;
    let _ = on_progress.send(DownloadProgress { received: 0, total });
    for file in &font.files {
        let existing = dir.join(&file.file);
        if sha256_file(&existing).as_deref() != Some(file.sha256.as_str()) {
            let base = done;
            let report = |received: u64| {
                let _ = on_progress.send(DownloadProgress {
                    received: base + received,
                    total,
                });
            };
            download_file(&client, &dir, file, report).await?;
        }
        done += file.size;
        let _ = on_progress.send(DownloadProgress {
            received: done,
            total,
        });
    }
    write_marker(&dir, &font)?;
    let keep: Vec<String> = font.files.iter().map(|file| file.file.clone()).collect();
    remove_font_files(&dir, &font.id, &keep);
    Ok(font)
}

#[tauri::command]
pub fn reading_font_cancel_download() {
    CANCEL_REQUESTED.store(true, Ordering::Release);
}

/// 移除一款字体：先删标记（立即视为未安装），再删文件
#[tauri::command]
pub async fn reading_font_remove(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err(format!("READING_FONT_NOT_FOUND: {id}"));
    }
    let dir = font_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        match std::fs::remove_file(marker_path(&dir, &id)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("READING_FONT_STORAGE: {e}")),
        }
        remove_font_files(&dir, &id, &[]);
        Ok(())
    })
    .await
    .map_err(|e| format!("READING_FONT_STORAGE: {e}"))?
}

/// 读出已安装字体某个字重文件的字节，前端以 ArrayBuffer 接收后注册 FontFace
#[tauri::command]
pub async fn reading_font_read(
    app: AppHandle,
    id: String,
    style: String,
) -> Result<Response, String> {
    let dir = font_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let font = installed_font(&dir, &id)?;
        let file = font
            .files
            .iter()
            .find(|file| file.style == style)
            .ok_or_else(|| format!("READING_FONT_NOT_INSTALLED: {id}/{style}"))?;
        std::fs::read(dir.join(&file.file))
            .map(Response::new)
            .map_err(|e| format!("READING_FONT_STORAGE: {e}"))
    })
    .await
    .map_err(|e| format!("READING_FONT_STORAGE: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn font(id: &str, version: &str) -> ReadingFont {
        ReadingFont {
            id: id.to_string(),
            name: "示例".to_string(),
            version: version.to_string(),
            license: format!("{id}-{version}-LICENSE.txt"),
            files: vec![FontFile {
                style: "regular".to_string(),
                weight: "400".to_string(),
                file: font_file_name(id, version, "regular"),
                size: 4,
                sha256: "a".repeat(64),
            }],
        }
    }

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tau-font-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn manifest_parses_publish_output() {
        let text = r#"[{"id":"noto-serif-sc","name":"思源宋体","version":"2.003","license":"noto-serif-sc-2.003-LICENSE.txt","files":[{"style":"variable","weight":"200 900","file":"noto-serif-sc-2.003-variable.woff2","size":10,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}]"#;
        let fonts: Vec<ReadingFont> = serde_json::from_str(text).unwrap();
        assert!(validate_font(&fonts[0]).is_ok());
    }

    #[test]
    fn file_name_must_derive_from_id_version_style() {
        let mut bad = font("demo", "1.0");
        bad.files[0].file = "../escape.woff2".to_string();
        assert!(validate_font(&bad).is_err());
        let mut bad_weight = font("demo", "1.0");
        bad_weight.files[0].weight = "bold".to_string();
        assert!(validate_font(&bad_weight).is_err());
        assert!(validate_font(&font("Demo", "1.0")).is_err());
        assert!(validate_font(&font("demo", "1.x")).is_err());
    }

    #[test]
    fn belongs_to_does_not_match_longer_ids() {
        assert!(belongs_to(
            "noto-serif-sc",
            "noto-serif-sc-2.003-variable.woff2"
        ));
        assert!(belongs_to(
            "noto-serif-sc",
            "noto-serif-sc-2.003-variable.woff2.part"
        ));
        assert!(!belongs_to(
            "noto-serif",
            "noto-serif-sc-2.003-variable.woff2"
        ));
        assert!(!belongs_to("noto-serif-sc", "noto-serif-sc.json"));
    }

    #[test]
    fn installed_requires_marker_and_complete_files() {
        let dir = temp_dir();
        let demo = font("demo", "1.0");
        std::fs::write(dir.join(&demo.files[0].file), b"abc").unwrap();
        write_marker(&dir, &demo).unwrap();
        assert!(
            read_installed(&dir).is_empty(),
            "文件大小与标记不符时不算已安装"
        );

        std::fs::write(dir.join(&demo.files[0].file), b"abcd").unwrap();
        assert_eq!(read_installed(&dir), vec![demo.clone()]);
        assert!(installed_font(&dir, "other").is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn cleanup_keeps_current_version_only() {
        let dir = temp_dir();
        for name in [
            "demo-0.9-regular.woff2",
            "demo-1.0-regular.woff2",
            "demo-1.0-regular.woff2.part",
            "demo-sc-1.0-regular.woff2",
        ] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        remove_font_files(&dir, "demo", &["demo-1.0-regular.woff2".to_string()]);
        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(
            left,
            vec!["demo-1.0-regular.woff2", "demo-sc-1.0-regular.woff2"]
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
