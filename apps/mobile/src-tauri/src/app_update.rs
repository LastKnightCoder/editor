//! Android 应用内更新：读取 R2 上的 `mobile/android/latest.json`，下载 APK 到缓存目录并校验
//! SHA-256，再经 JNI 调 MainActivity.installAppUpdate 拉起系统安装器（用户确认后覆盖安装）。
//!
//! 清单由 `scripts/publish-mobile.mjs` 生成；下载地址只由固定发布源与校验过的文件名拼出，
//! 前端不传 URL 或路径。iOS 不走本模块，更新经 App Store / TestFlight。

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

const RELEASE_BASE_URL: &str = "https://dl.taunote.app/mobile/android";
const UPDATE_DIR: &str = "app-update";
const CHUNK_TIMEOUT: Duration = Duration::from_secs(30);
/// 进度回传粒度：约每 256 KB 一次，避免 IPC 洪泛
const PROGRESS_STEP: u64 = 256 * 1024;

static DOWNLOADING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNote {
    pub version: String,
    pub note: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AndroidRelease {
    pub version: String,
    #[serde(default)]
    pub release_date: String,
    pub file: String,
    pub size: u64,
    pub sha256: String,
    #[serde(default)]
    pub release_notes: Vec<ReleaseNote>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateCheck {
    pub current_version: String,
    pub available: bool,
    pub latest: AndroidRelease,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub received: u64,
    pub total: u64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub enum InstallOutcome {
    /// 已拉起系统安装器
    Started,
    /// 尚未允许 Tau 安装应用，已打开系统授权页
    PermissionRequired,
}

fn parse_version(version: &str) -> Option<(u64, u64, u64)> {
    let mut parts = version.split('.').map(|part| part.parse::<u64>().ok());
    let parsed = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(parsed)
}

fn apk_name(version: &str) -> String {
    format!("Tau-v{version}-android-arm64.apk")
}

/// 清单来自网络：版本、文件名与摘要格式都核对过才用于拼下载地址和本地路径
fn validate_release(release: &AndroidRelease) -> Result<(), String> {
    if parse_version(&release.version).is_none() {
        return Err(format!(
            "APP_UPDATE_MANIFEST_INVALID: bad version {}",
            release.version
        ));
    }
    if release.file != apk_name(&release.version) {
        return Err(format!(
            "APP_UPDATE_MANIFEST_INVALID: bad file {}",
            release.file
        ));
    }
    let hex = release.sha256.len() == 64 && release.sha256.bytes().all(|b| b.is_ascii_hexdigit());
    if !hex || release.size == 0 {
        return Err("APP_UPDATE_MANIFEST_INVALID: bad digest or size".to_string());
    }
    Ok(())
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("APP_UPDATE_NETWORK: {e}"))
}

async fn fetch_latest(client: &reqwest::Client) -> Result<AndroidRelease, String> {
    let mut release = client
        .get(format!("{RELEASE_BASE_URL}/latest.json"))
        .header("Cache-Control", "no-cache")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("APP_UPDATE_NETWORK: {e}"))?
        .error_for_status()
        .map_err(|e| format!("APP_UPDATE_NETWORK: {e}"))?
        .json::<AndroidRelease>()
        .await
        .map_err(|e| format!("APP_UPDATE_MANIFEST_INVALID: {e}"))?;
    validate_release(&release)?;
    release.sha256.make_ascii_lowercase();
    Ok(release)
}

fn update_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|dir| dir.join(UPDATE_DIR))
        .map_err(|e| format!("APP_UPDATE_STORAGE: {e}"))
}

fn sha256_file(path: &PathBuf) -> Option<String> {
    let mut hasher = Sha256::new();
    let mut file = std::fs::File::open(path).ok()?;
    std::io::copy(&mut file, &mut hasher).ok()?;
    Some(format!("{:x}", hasher.finalize()))
}

#[tauri::command]
pub async fn app_update_check(app: AppHandle) -> Result<AppUpdateCheck, String> {
    let current_version = app.package_info().version.to_string();
    let latest = fetch_latest(&http_client()?).await?;
    let available = parse_version(&latest.version) > parse_version(&current_version);
    Ok(AppUpdateCheck {
        current_version,
        available,
        latest,
    })
}

struct DownloadGuard;

impl DownloadGuard {
    fn acquire() -> Result<Self, String> {
        DOWNLOADING
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| DownloadGuard)
            .map_err(|_| "APP_UPDATE_BUSY: download in progress".to_string())
    }
}

impl Drop for DownloadGuard {
    fn drop(&mut self) {
        DOWNLOADING.store(false, Ordering::Release);
    }
}

/// 下载线上最新版本；已有同摘要的完整文件时直接复用。返回下载到的版本号。
#[tauri::command]
pub async fn app_update_download(
    app: AppHandle,
    on_progress: Channel<DownloadProgress>,
) -> Result<String, String> {
    let _guard = DownloadGuard::acquire()?;
    let client = http_client()?;
    let release = fetch_latest(&client).await?;
    let dir = update_dir(&app)?;
    let target = dir.join(&release.file);
    let report = |received| {
        let _ = on_progress.send(DownloadProgress {
            received,
            total: release.size,
        });
    };

    if sha256_file(&target).as_deref() == Some(release.sha256.as_str()) {
        report(release.size);
        return Ok(release.version);
    }
    // 只保留本次版本：旧安装包与中断残留一并清掉
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("APP_UPDATE_STORAGE: {e}"))?;

    let partial = dir.join(format!("{}.part", release.file));
    let response = client
        .get(format!("{RELEASE_BASE_URL}/{}", release.file))
        .send()
        .await
        .map_err(|e| format!("APP_UPDATE_NETWORK: {e}"))?
        .error_for_status()
        .map_err(|e| format!("APP_UPDATE_NETWORK: {e}"))?;
    let mut file =
        std::fs::File::create(&partial).map_err(|e| format!("APP_UPDATE_STORAGE: {e}"))?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    let mut reported = 0u64;
    let mut stream = response.bytes_stream();
    report(0);
    loop {
        let chunk = match tokio::time::timeout(CHUNK_TIMEOUT, stream.next()).await {
            Err(_) => return Err("APP_UPDATE_NETWORK: download stalled".to_string()),
            Ok(None) => break,
            Ok(Some(chunk)) => chunk.map_err(|e| format!("APP_UPDATE_NETWORK: {e}"))?,
        };
        received += chunk.len() as u64;
        if received > release.size {
            return Err("APP_UPDATE_CORRUPT: larger than manifest size".to_string());
        }
        hasher.update(&chunk);
        file.write_all(&chunk)
            .map_err(|e| format!("APP_UPDATE_STORAGE: {e}"))?;
        if received - reported >= PROGRESS_STEP {
            reported = received;
            report(received);
        }
    }
    file.flush()
        .map_err(|e| format!("APP_UPDATE_STORAGE: {e}"))?;
    drop(file);

    let digest = format!("{:x}", hasher.finalize());
    if received != release.size || digest != release.sha256 {
        let _ = std::fs::remove_file(&partial);
        return Err("APP_UPDATE_CORRUPT: size or digest mismatch".to_string());
    }
    std::fs::rename(&partial, &target).map_err(|e| format!("APP_UPDATE_STORAGE: {e}"))?;
    report(received);
    Ok(release.version)
}

#[tauri::command]
pub async fn app_update_install(app: AppHandle, version: String) -> Result<InstallOutcome, String> {
    if parse_version(&version).is_none() {
        return Err(format!("APP_UPDATE_NOT_DOWNLOADED: bad version {version}"));
    }
    let apk = update_dir(&app)?.join(apk_name(&version));
    if !apk.is_file() {
        return Err("APP_UPDATE_NOT_DOWNLOADED: package missing".to_string());
    }
    launch_installer(&app, apk.to_string_lossy().into_owned()).await
}

#[cfg(target_os = "android")]
async fn launch_installer(app: &AppHandle, path: String) -> Result<InstallOutcome, String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("APP_UPDATE_INSTALL_FAILED: main window missing".to_string());
    };
    // exec 在 Activity 主线程执行，命令为 async 才不会与主线程互相等待
    let (sender, receiver) = tokio::sync::oneshot::channel::<i32>();
    window
        .with_webview(move |webview| {
            webview.jni_handle().exec(move |env, activity, _webview| {
                let code = env
                    .new_string(&path)
                    .and_then(|path| {
                        env.call_method(
                            activity,
                            "installAppUpdate",
                            "(Ljava/lang/String;)I",
                            &[(&path).into()],
                        )
                    })
                    .and_then(|value| value.i())
                    .unwrap_or_else(|_| {
                        // 调用失败会留下待处理的 Java 异常，不清掉回到主循环就会闪退
                        let _ = env.exception_clear();
                        -1
                    });
                let _ = sender.send(code);
            });
        })
        .map_err(|e| format!("APP_UPDATE_INSTALL_FAILED: {e}"))?;
    match receiver.await {
        Ok(0) => Ok(InstallOutcome::Started),
        Ok(1) => Ok(InstallOutcome::PermissionRequired),
        _ => Err("APP_UPDATE_INSTALL_FAILED: installer not started".to_string()),
    }
}

#[cfg(not(target_os = "android"))]
async fn launch_installer(_app: &AppHandle, _path: String) -> Result<InstallOutcome, String> {
    Err("APP_UPDATE_UNSUPPORTED: in-app install is Android only".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(version: &str) -> AndroidRelease {
        AndroidRelease {
            version: version.to_string(),
            release_date: String::new(),
            file: apk_name(version),
            size: 1,
            sha256: "a".repeat(64),
            release_notes: Vec::new(),
        }
    }

    #[test]
    fn versions_compare_numerically() {
        assert!(parse_version("0.10.0") > parse_version("0.9.9"));
        assert_eq!(parse_version("1.2"), None);
        assert_eq!(parse_version("1.2.3.4"), None);
        assert_eq!(parse_version("1.2.x"), None);
    }

    #[test]
    fn manifest_must_name_its_own_apk() {
        assert!(validate_release(&release("0.2.5")).is_ok());
        let mut traversal = release("0.2.5");
        traversal.file = "../Tau-v0.2.5-android-arm64.apk".to_string();
        assert!(validate_release(&traversal).is_err());
        let mut bad_digest = release("0.2.5");
        bad_digest.sha256 = "z".repeat(64);
        assert!(validate_release(&bad_digest).is_err());
        assert!(validate_release(&release("0.2")).is_err());
    }

    #[test]
    fn manifest_parses_publish_output() {
        let text = r#"{"version":"0.2.5","releaseDate":"2026-10-24T00:00:00.000Z","file":"Tau-v0.2.5-android-arm64.apk","size":10,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","certSha256":"b","releaseNotes":[{"version":"0.2.5","note":"- 修复"}]}"#;
        let parsed: AndroidRelease = serde_json::from_str(text).unwrap();
        assert_eq!(parsed.release_notes.len(), 1);
        assert!(validate_release(&parsed).is_ok());
    }
}
