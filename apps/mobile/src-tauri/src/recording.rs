//! 编辑器录音与录音转写的宿主命令。
//!
//! 录音文件只放在应用目录 `recordings/` 下，WebView 只拿到录音 id，不接触路径。
//! 每段录音有一个 JSON 旁注记录所属文档与落点：进程被杀后据此找回，插入文档后删除。

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{ipc::Channel, AppHandle, WebviewWindow};
use tauri_plugin_native_record::NativeRecordExt;

use crate::plugin_transport::window_allowed;
use crate::setting::resolve_app_dir;

/// 未处理的找回录音保留期限
const PENDING_TTL_MS: i64 = 7 * 24 * 60 * 60 * 1000;
const RECORDING_MIME: &str = "audio/mp4";
const MAX_PREPARED_FILES: usize = 4;
const MIN_DURATION_MS: u64 = 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingTarget {
    /// 所属文档，如 `content:12`
    pub document: String,
    /// 找回时插在正文里以此开头的顶层块之后；段落没有稳定 id，只能按文字定位。为空或找不到时插到文末
    #[serde(default)]
    pub after_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Sidecar {
    id: String,
    target: RecordingTarget,
    title: String,
    started_at: i64,
    /// 已存入资源时的地址；为空表示录音还停在本地文件
    #[serde(default)]
    src: Option<String>,
    #[serde(default)]
    duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingRecording {
    id: String,
    target: RecordingTarget,
    title: String,
    started_at: i64,
    duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredRecording {
    src: String,
    duration_ms: u64,
    size_bytes: u64,
}

fn active() -> &'static Mutex<Option<String>> {
    static ACTIVE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn valid_id(id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| "录音 id 无效".into())
}

fn recordings_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = resolve_app_dir(app)?.join("recordings");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

struct Paths {
    raw: PathBuf,
    m4a: PathBuf,
    sidecar: PathBuf,
}

fn paths(app: &AppHandle, id: &str) -> Result<Paths, String> {
    valid_id(id)?;
    let dir = recordings_dir(app)?;
    Ok(Paths {
        raw: dir.join(format!("{id}.aac")),
        m4a: dir.join(format!("{id}.m4a")),
        sidecar: dir.join(format!("{id}.json")),
    })
}

fn read_sidecar(path: &Path) -> Result<Sidecar, String> {
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| format!("录音记录损坏：{e}"))
}

fn write_sidecar(path: &Path, sidecar: &Sidecar) -> Result<(), String> {
    let text = serde_json::to_string(sidecar).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn remove_files(paths: &Paths) {
    for path in [&paths.raw, &paths.m4a, &paths.sidecar] {
        let _ = fs::remove_file(path);
    }
}

fn file_name_for(title: &str) -> String {
    let safe: String = title
        .chars()
        .map(|c| {
            if c.is_control() || "/\\:*?\"<>|".contains(c) {
                '-'
            } else {
                c
            }
        })
        .collect();
    format!("{}.m4a", safe.trim())
}

#[tauri::command]
pub async fn recording_start(
    app: AppHandle,
    window: WebviewWindow,
    target: RecordingTarget,
    title: String,
    on_event: Channel<Value>,
) -> Result<Value, String> {
    window_allowed(&window)?;
    let id = uuid::Uuid::new_v4().to_string();
    {
        let mut current = active().lock().map_err(|_| "录音状态不可用")?;
        if current.is_some() {
            return Err("已有录音正在进行".into());
        }
        *current = Some(id.clone());
    }
    let started = async {
        let paths = paths(&app, &id)?;
        write_sidecar(
            &paths.sidecar,
            &Sidecar {
                id: id.clone(),
                target,
                title: title.clone(),
                started_at: now_ms(),
                src: None,
                duration_ms: None,
            },
        )?;
        let reply = app
            .native_record()
            .start(&id, &paths.raw.to_string_lossy(), &title, on_event)
            .await;
        if reply.is_err() {
            remove_files(&paths);
        }
        reply
    }
    .await;
    match started {
        Ok(reply) => Ok(serde_json::json!({ "id": id, "freeBytes": reply.free_bytes })),
        Err(error) => {
            *active().lock().map_err(|_| "录音状态不可用")? = None;
            Err(error)
        }
    }
}

fn ensure_active(id: &str) -> Result<(), String> {
    match active().lock().map_err(|_| "录音状态不可用")?.as_deref() {
        Some(current) if current == id => Ok(()),
        _ => Err("录音已结束".into()),
    }
}

#[tauri::command]
pub async fn recording_pause(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
) -> Result<(), String> {
    window_allowed(&window)?;
    ensure_active(&id)?;
    app.native_record().pause(&id).await
}

#[tauri::command]
pub async fn recording_resume(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
) -> Result<(), String> {
    window_allowed(&window)?;
    ensure_active(&id)?;
    app.native_record().resume(&id).await
}

/// 原生 m4a → 资源；成功后删掉本地文件，旁注记下资源地址，插入文档后由 `recording_discard` 删除
async fn store(
    app: &AppHandle,
    paths: &Paths,
    database: Option<String>,
    collaboration: Option<crate::collaboration_assets::AssetContext>,
    duration_ms: u64,
    size_bytes: u64,
) -> Result<StoredRecording, String> {
    let mut sidecar = read_sidecar(&paths.sidecar)?;
    let src = crate::resource_upload::store_owned_file(
        app,
        &paths.m4a,
        &file_name_for(&sidecar.title),
        RECORDING_MIME,
        database,
        collaboration,
    )
    .await?;
    sidecar.src = Some(src.clone());
    sidecar.duration_ms = Some(duration_ms);
    write_sidecar(&paths.sidecar, &sidecar)?;
    let _ = fs::remove_file(&paths.raw);
    let _ = fs::remove_file(&paths.m4a);
    Ok(StoredRecording {
        src,
        duration_ms,
        size_bytes,
    })
}

#[tauri::command]
pub async fn recording_stop(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    database: Option<String>,
    collaboration: Option<crate::collaboration_assets::AssetContext>,
) -> Result<StoredRecording, String> {
    window_allowed(&window)?;
    ensure_active(&id)?;
    let paths = paths(&app, &id)?;
    let output = paths.m4a.to_string_lossy().to_string();
    // 系统音频服务重置时原生会话已先结束，录音文件还在：改走重封装
    let finished = match app.native_record().stop(&id, &output).await {
        Ok(reply) => Ok(reply),
        Err(_) if paths.raw.exists() => {
            app.native_record()
                .finalize(&paths.raw.to_string_lossy(), &output)
                .await
        }
        Err(error) => Err(error),
    };
    *active().lock().map_err(|_| "录音状态不可用")? = None;
    let finished = finished?;
    // 太短的录音不存入资源，免得上传后再删
    if finished.duration_ms < MIN_DURATION_MS {
        remove_files(&paths);
        return Err("RECORDING_TOO_SHORT:录音太短".into());
    }
    store(
        &app,
        &paths,
        database,
        collaboration,
        finished.duration_ms,
        finished.size_bytes,
    )
    .await
}

#[tauri::command]
pub async fn recording_cancel(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
) -> Result<(), String> {
    window_allowed(&window)?;
    let paths = paths(&app, &id)?;
    let is_active = ensure_active(&id).is_ok();
    if is_active {
        let _ = app.native_record().cancel(&id).await;
        *active().lock().map_err(|_| "录音状态不可用")? = None;
    }
    remove_files(&paths);
    Ok(())
}

#[tauri::command]
pub async fn recording_open_settings(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    window_allowed(&window)?;
    app.native_record().open_settings().await
}

/// 插入文档后（或用户在找回横幅里删除时）清掉旁注；资源本身不删
#[tauri::command]
pub fn recording_discard(app: AppHandle, window: WebviewWindow, id: String) -> Result<(), String> {
    window_allowed(&window)?;
    if ensure_active(&id).is_ok() {
        return Err("录音仍在进行".into());
    }
    remove_files(&paths(&app, &id)?);
    Ok(())
}

/// 该文档未插入的录音；顺带清理超期记录
#[tauri::command]
pub fn recording_pending(
    app: AppHandle,
    window: WebviewWindow,
    document: String,
) -> Result<Vec<PendingRecording>, String> {
    window_allowed(&window)?;
    let current = active().lock().map_err(|_| "录音状态不可用")?.clone();
    let mut pending = Vec::new();
    let entries = fs::read_dir(recordings_dir(&app)?).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|v| v.to_str()) != Some("json") {
            continue;
        }
        let Ok(sidecar) = read_sidecar(&path) else {
            let _ = fs::remove_file(&path);
            continue;
        };
        if current.as_deref() == Some(sidecar.id.as_str()) {
            continue;
        }
        let Ok(files) = paths(&app, &sidecar.id) else {
            continue;
        };
        let has_audio = sidecar.src.is_some() || files.raw.exists() || files.m4a.exists();
        if !has_audio || now_ms() - sidecar.started_at > PENDING_TTL_MS {
            remove_files(&files);
            continue;
        }
        if sidecar.target.document == document {
            pending.push(PendingRecording {
                id: sidecar.id,
                target: sidecar.target,
                title: sidecar.title,
                started_at: sidecar.started_at,
                duration_ms: sidecar.duration_ms,
            });
        }
    }
    pending.sort_by_key(|item| item.started_at);
    Ok(pending)
}

/// 找回：已存入资源的直接返回地址；还停在本地的先重封装再存
#[tauri::command]
pub async fn recording_recover(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    database: Option<String>,
    collaboration: Option<crate::collaboration_assets::AssetContext>,
) -> Result<StoredRecording, String> {
    window_allowed(&window)?;
    if ensure_active(&id).is_ok() {
        return Err("录音仍在进行".into());
    }
    let paths = paths(&app, &id)?;
    let sidecar = read_sidecar(&paths.sidecar)?;
    if let Some(src) = sidecar.src {
        return Ok(StoredRecording {
            src,
            duration_ms: sidecar.duration_ms.unwrap_or(0),
            size_bytes: 0,
        });
    }
    let finished = if paths.m4a.exists() && !paths.raw.exists() {
        tauri_plugin_native_record::FinishReply {
            duration_ms: 0,
            size_bytes: fs::metadata(&paths.m4a).map(|m| m.len()).unwrap_or(0),
        }
    } else {
        app.native_record()
            .finalize(&paths.raw.to_string_lossy(), &paths.m4a.to_string_lossy())
            .await?
    };
    store(
        &app,
        &paths,
        database,
        collaboration,
        finished.duration_ms,
        finished.size_bytes,
    )
    .await
}

// ---- 录音转写：按识别服务声明的格式准备音频，交给识别插件读取 ----

struct Prepared {
    path: PathBuf,
    /// 转码产物由本命令创建，释放时删除；原样交出的是用户资源，不删
    owned: bool,
    cancelled: Arc<AtomicBool>,
    reader: Option<(fs::File, u64)>,
}

fn prepared() -> &'static Mutex<HashMap<String, Prepared>> {
    static STATE: OnceLock<Mutex<HashMap<String, Prepared>>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedAudio {
    name: String,
    mime_type: String,
    size_bytes: u64,
    /// 取不到时为 None（原样交出且容器头没有帧数）
    duration_ms: Option<u64>,
    /// 交给识别服务的这份音频的公网地址：原样交出的远程资源即其地址；转码副本在原资源已在远程存储时上传同一存储
    url: Option<String>,
}

/// `src` 为音频块地址：`~/.editor/…` 本地资源或 http(s) 远程资源（协作资源由前端先解析为本地路径）
async fn source_path(app: &AppHandle, src: &str) -> Result<(PathBuf, bool), String> {
    if src.starts_with("http://") || src.starts_with("https://") {
        let local =
            crate::remote_resource_cache::remote_resource_to_local(app.clone(), src.into(), None)
                .await?;
        return Ok((PathBuf::from(local), true));
    }
    let root = resolve_app_dir(app)?;
    Ok((
        crate::collaboration_assets::local_path_in(&root, src)?,
        false,
    ))
}

/// 按识别服务声明的格式准备音频：`accepted` 为空或包含原文件格式时原样交出，否则转成 Ogg Opus；
/// 声明里没有宿主能转出的格式时返回 `UNSUPPORTED_FORMAT`
#[tauri::command]
pub async fn transcript_audio_prepare(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    src: String,
    accepted: Vec<String>,
) -> Result<PreparedAudio, String> {
    window_allowed(&window)?;
    valid_id(&id)?;
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut state = prepared().lock().map_err(|_| "转写状态不可用")?;
        if state.len() >= MAX_PREPARED_FILES {
            return Err("转写任务过多，请稍后重试".into());
        }
        if state.contains_key(&id) {
            return Err("转写任务已存在".into());
        }
        state.insert(
            id.clone(),
            Prepared {
                path: PathBuf::new(),
                owned: false,
                cancelled: cancelled.clone(),
                reader: None,
            },
        );
    }
    let result = async {
        let (input, remote) = source_path(&app, &src).await?;
        let source_mime = crate::audio_transcode::mime_for_path(&input);
        let accepts = |mime: &str| accepted.is_empty() || accepted.iter().any(|item| item == mime);
        if accepts(source_mime) {
            set_prepared_path(&id, input.clone(), false)?;
            let size_bytes = fs::metadata(&input).map_err(|e| e.to_string())?.len();
            let probe = input.clone();
            let duration_ms = tauri::async_runtime::spawn_blocking(move || {
                crate::audio_transcode::probe_duration_ms(&probe)
            })
            .await
            .map_err(|e| e.to_string())?;
            let name = input
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("audio")
                .to_string();
            return Ok(PreparedAudio {
                name,
                mime_type: source_mime.into(),
                size_bytes,
                duration_ms,
                url: remote.then(|| src.clone()),
            });
        }
        if !accepts(crate::audio_transcode::OGG_OPUS_MIME) {
            return Err("UNSUPPORTED_FORMAT:当前识别服务不支持这种音频格式".into());
        }
        let dir = resolve_app_dir(&app)?.join("transcripts");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let output = dir.join(format!("{id}.ogg"));
        set_prepared_path(&id, output.clone(), true)?;
        let flag = cancelled.clone();
        let target = output.clone();
        let converted = tauri::async_runtime::spawn_blocking(move || {
            crate::audio_transcode::transcode_to_ogg_opus(&input, &target, &|| {
                flag.load(Ordering::Relaxed)
            })
        })
        .await
        .map_err(|e| e.to_string())??;
        if cancelled.load(Ordering::Relaxed) {
            return Err("转写已取消".into());
        }
        // 原音频已在远程存储：副本放同一存储，交给识别服务按地址下载；本地资源不为转写上传
        let url = if remote && crate::resource_upload::active_provider_is_plugin(&app)? {
            crate::resource_upload::store_owned_file(
                &app,
                &output,
                &format!("{id}.ogg"),
                crate::audio_transcode::OGG_OPUS_MIME,
                None,
                None,
            )
            .await
            .ok()
            .filter(|url| url.starts_with("https://") || url.starts_with("http://"))
        } else {
            None
        };
        Ok(PreparedAudio {
            name: format!("{id}.ogg"),
            mime_type: crate::audio_transcode::OGG_OPUS_MIME.into(),
            size_bytes: converted.size_bytes,
            duration_ms: Some(converted.duration_ms),
            url,
        })
    }
    .await;
    if result.is_err() {
        release_prepared(&id);
    }
    result
}

fn set_prepared_path(id: &str, path: PathBuf, owned: bool) -> Result<(), String> {
    let mut state = prepared().lock().map_err(|_| "转写状态不可用")?;
    let entry = state.get_mut(id).ok_or("转写已取消")?;
    entry.path = path;
    entry.owned = owned;
    Ok(())
}

/// 顺序读取转码结果；`offset` 为 0 时从头重新打开，可多次读取
#[tauri::command]
pub async fn transcript_audio_read(
    window: WebviewWindow,
    id: String,
    offset: u64,
) -> Result<Option<String>, String> {
    window_allowed(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let mut state = prepared().lock().map_err(|_| "转写状态不可用")?;
        let entry = state.get_mut(&id).ok_or("转写音频已释放")?;
        if offset == 0 {
            entry.reader = Some((fs::File::open(&entry.path).map_err(|e| e.to_string())?, 0));
        }
        let (file, position) = entry.reader.as_mut().ok_or("转写音频读取顺序无效")?;
        if *position != offset {
            return Err("转写音频读取顺序无效".into());
        }
        let mut bytes = vec![0; crate::plugin_files::CHUNK_BYTES];
        let size = file.read(&mut bytes).map_err(|e| e.to_string())?;
        *position += size as u64;
        Ok((size != 0).then(|| crate::plugin_files::encode_chunk(&bytes[..size])))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn release_prepared(id: &str) {
    if let Ok(mut state) = prepared().lock() {
        if let Some(entry) = state.remove(id) {
            entry.cancelled.store(true, Ordering::Relaxed);
            if entry.owned {
                let _ = fs::remove_file(entry.path);
            }
        }
    }
}

/// 结束或取消转写：中止进行中的转码并删除转码副本（原样交出的资源与已上传的副本保留）
#[tauri::command]
pub fn transcript_audio_release(window: WebviewWindow, id: String) -> Result<(), String> {
    window_allowed(&window)?;
    release_prepared(&id);
    Ok(())
}
