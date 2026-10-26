//! 日志落盘：`.editor/logs/session-<日期>_<时间>-<后缀>.log`，每次启动一个文件。
//! 单文件超过 10 MB 轮转为 `*.old.log`，超过 3 天的 session 文件在启动时清理。
//! 前端经 `app_log` 命令写入同一文件（带 `[ui]` 来源标记）；`init` 之前的 Rust 日志先进内存缓冲。
//! 行格式与桌面端 electron-log 一致：`[时间] [级别] 消息`，debug 级别只输出到 stderr 不落盘。

use std::collections::VecDeque;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, SystemTime};

use chrono::{DateTime, Local, SecondsFormat};
use flate2::write::GzEncoder;
use flate2::Compression;
use tauri::AppHandle;

const LOG_DIR_NAME: &str = "logs";
const SESSION_PREFIX: &str = "session-";
const RETENTION: Duration = Duration::from_secs(3 * 24 * 60 * 60);
const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;
/// 单条消息上限，防止前端大对象刷爆日志文件
const MAX_MESSAGE_CHARS: usize = 4000;
/// init 之前的日志缓冲上限，超出丢最早的
const PENDING_LIMIT: usize = 256;
// 反馈收集：本次运行取尾部 2 MiB，上次运行取 1 MiB（卡死后重开时问题多在上一份里）
const CURRENT_TAIL: u64 = 2 * 1024 * 1024;
const PREVIOUS_TAIL: u64 = 1024 * 1024;
const EMPTY_LOG_NOTICE: &str = "（没有可用的日志）";

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Level {
    Debug,
    Info,
    Warn,
    Error,
}

impl Level {
    fn label(self) -> &'static str {
        match self {
            Level::Debug => "debug",
            Level::Info => "info",
            Level::Warn => "warn",
            Level::Error => "error",
        }
    }

    fn parse(value: &str) -> Option<Level> {
        match value {
            "debug" => Some(Level::Debug),
            "info" => Some(Level::Info),
            "warn" => Some(Level::Warn),
            "error" => Some(Level::Error),
            _ => None,
        }
    }
}

struct Session {
    dir: PathBuf,
    path: PathBuf,
    file: File,
}

impl Session {
    fn open(dir: PathBuf, now: DateTime<Local>) -> io::Result<Self> {
        fs::create_dir_all(&dir)?;
        let path = dir.join(session_file_name(now));
        let file = open_append(&path)?;
        Ok(Session { dir, path, file })
    }

    fn append(&mut self, line: &str) {
        // 轮转失败（权限/占用）时继续写当前文件，不丢这条日志
        let _ = self.rotate_if_over(MAX_FILE_BYTES);
        let _ = self.file.write_all(line.as_bytes());
    }

    fn rotate_if_over(&mut self, limit: u64) -> io::Result<()> {
        if self.file.metadata()?.len() < limit {
            return Ok(());
        }
        let rotated = self.path.with_extension("old.log");
        let _ = fs::remove_file(&rotated);
        fs::rename(&self.path, &rotated)?;
        self.file = open_append(&self.path)?;
        Ok(())
    }
}

enum State {
    Pending(VecDeque<String>),
    Ready(Session),
}

static STATE: Mutex<State> = Mutex::new(State::Pending(VecDeque::new()));

fn lock() -> std::sync::MutexGuard<'static, State> {
    STATE.lock().unwrap_or_else(PoisonError::into_inner)
}

fn open_append(path: &Path) -> io::Result<File> {
    OpenOptions::new().create(true).append(true).open(path)
}

// 启动时间 + 随机后缀：秒级内连续重启不撞名
fn session_file_name(now: DateTime<Local>) -> String {
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    format!(
        "{SESSION_PREFIX}{}-{}.log",
        now.format("%Y-%m-%d_%H-%M-%S"),
        &suffix[..4]
    )
}

fn format_line(level: Level, source: Option<&str>, message: &str) -> String {
    let timestamp = Local::now().to_rfc3339_opts(SecondsFormat::Millis, false);
    match source {
        Some(source) => format!("[{timestamp}] [{}] [{source}] {message}\n", level.label()),
        None => format!("[{timestamp}] [{}] {message}\n", level.label()),
    }
}

fn truncate_chars(message: &str, limit: usize) -> String {
    match message.char_indices().nth(limit) {
        Some((index, _)) => format!("{}…", &message[..index]),
        None => message.to_string(),
    }
}

fn write(level: Level, source: Option<&str>, message: &str) {
    if level < Level::Info {
        // debug 只进开发终端，不落盘
        #[cfg(debug_assertions)]
        eprint!("{}", format_line(level, source, message));
        return;
    }
    let line = format_line(level, source, message);
    #[cfg(debug_assertions)]
    eprint!("{line}");
    let mut state = lock();
    match &mut *state {
        State::Pending(queue) => {
            if queue.len() >= PENDING_LIMIT {
                queue.pop_front();
            }
            queue.push_back(line);
        }
        State::Ready(session) => session.append(&line),
    }
}

pub fn debug(message: impl AsRef<str>) {
    write(Level::Debug, None, message.as_ref());
}

pub fn info(message: impl AsRef<str>) {
    write(Level::Info, None, message.as_ref());
}

pub fn warn(message: impl AsRef<str>) {
    write(Level::Warn, None, message.as_ref());
}

pub fn error(message: impl AsRef<str>) {
    write(Level::Error, None, message.as_ref());
}

/// 打开本次 session 文件并冲洗启动早期的缓冲；重复调用无效果。
/// 过期清理放到阻塞线程池，不占用启动关键路径。
pub fn init(app: &AppHandle) {
    let dir = match crate::setting::resolve_app_dir(app) {
        Ok(dir) => dir.join(LOG_DIR_NAME),
        Err(reason) => {
            eprintln!("[logger] 无法解析日志目录: {reason}");
            return;
        }
    };
    let session = match Session::open(dir.clone(), Local::now()) {
        Ok(session) => session,
        Err(reason) => {
            eprintln!("[logger] 无法创建日志文件: {reason}");
            return;
        }
    };
    let path = session.path.display().to_string();
    {
        let mut state = lock();
        let pending = match &mut *state {
            State::Ready(_) => return,
            State::Pending(queue) => std::mem::take(queue),
        };
        let mut session = session;
        for line in pending {
            session.append(&line);
        }
        *state = State::Ready(session);
    }
    info(format!(
        "日志系统初始化 version={} os={} arch={} session={path}",
        app.package_info().version,
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    tauri::async_runtime::spawn_blocking(move || {
        clean_expired(&dir);
    });
}

/// 删除 logs 目录下超过保留期的 session 文件（含 `.old.log` 轮转产物），其他文件不动。
pub(crate) fn clean_expired(dir: &Path) -> usize {
    clean_expired_before(dir, SystemTime::now() - RETENTION)
}

fn clean_expired_before(dir: &Path, cutoff: SystemTime) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name();
        if !name.to_string_lossy().starts_with(SESSION_PREFIX) {
            continue;
        }
        let expired = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .map(|modified| modified < cutoff)
            .unwrap_or(false);
        // 单个文件清理失败（占用/权限）不影响其余日志
        if expired && fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// 前端 console 劫持后的上报通道：级别白名单之外归为 info，消息按字符截断。
#[tauri::command]
pub fn app_log(level: String, message: String) {
    let level = Level::parse(&level).unwrap_or(Level::Info);
    write(
        level,
        Some("ui"),
        &truncate_chars(&message, MAX_MESSAGE_CHARS),
    );
}

/// 反馈附带的日志：本次 session 尾部 + 上次 session 尾部，gzip 压缩。
pub(crate) fn collect_feedback_log() -> Vec<u8> {
    let located = match &*lock() {
        State::Ready(session) => Some((session.dir.clone(), session.path.clone())),
        State::Pending(_) => None,
    };
    let text = located
        .map(|(dir, current)| collect_text(&dir, &current))
        .unwrap_or_default();
    gzip(if text.is_empty() {
        EMPTY_LOG_NOTICE
    } else {
        &text
    })
}

fn collect_text(dir: &Path, current: &Path) -> String {
    let mut sections = vec![(current.to_path_buf(), CURRENT_TAIL)];
    if let Some(previous) = previous_session_log(dir, current) {
        sections.push((previous, PREVIOUS_TAIL));
    }
    sections
        .into_iter()
        .filter_map(|(path, cap)| {
            let name = path.file_name()?.to_string_lossy().into_owned();
            read_tail(&path, cap).map(|content| format!("===== {name} =====\n{content}"))
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// 本次运行之前最近的一份 session 日志（轮转产物 `.old.log` 不算）
fn previous_session_log(dir: &Path, current: &Path) -> Option<PathBuf> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let eligible = name.starts_with(SESSION_PREFIX)
                && name.ends_with(".log")
                && !name.ends_with(".old.log")
                && dir.join(&name) != current;
            eligible.then_some(name)
        })
        .collect();
    names.sort();
    names.pop().map(|name| dir.join(name))
}

fn read_tail(path: &Path, max_bytes: u64) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let size = file.metadata().ok()?.len();
    let length = size.min(max_bytes);
    file.seek(SeekFrom::Start(size - length)).ok()?;
    let mut buffer = Vec::with_capacity(length as usize);
    file.read_to_end(&mut buffer).ok()?;
    let text = String::from_utf8_lossy(&buffer).into_owned();
    if size <= max_bytes {
        return Some(text);
    }
    // 截断处可能落在多字节字符或行中间，丢掉第一行残片
    Some(
        text.find('\n')
            .map(|index| text[index + 1..].to_string())
            .unwrap_or_default(),
    )
}

fn gzip(text: &str) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    let _ = encoder.write_all(text.as_bytes());
    encoder.finish().unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tau-logger-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn touch(path: &Path, modified: SystemTime) {
        let file = File::create(path).unwrap();
        file.set_modified(modified).unwrap();
    }

    fn gunzip(bytes: &[u8]) -> String {
        let mut decoder = flate2::read::GzDecoder::new(bytes);
        let mut text = String::new();
        decoder.read_to_string(&mut text).unwrap();
        text
    }

    #[test]
    fn session_file_name_carries_timestamp_and_suffix() {
        let now = Local::now();
        let name = session_file_name(now);
        assert!(name.starts_with(&format!("session-{}-", now.format("%Y-%m-%d_%H-%M-%S"))));
        assert!(name.ends_with(".log"));
        let suffix = &name[name.len() - 8..name.len() - 4];
        assert!(suffix.bytes().all(|b| b.is_ascii_hexdigit()));
        assert_ne!(session_file_name(now), name);
    }

    #[test]
    fn formats_line_like_electron_log_and_truncates_by_char() {
        let line = format_line(Level::Warn, Some("ui"), "hello");
        assert!(line.ends_with("] [warn] [ui] hello\n"));
        assert!(line.starts_with('['));
        let line = format_line(Level::Error, None, "x");
        assert!(line.ends_with("] [error] x\n"));
        assert_eq!(truncate_chars("日志日志", 2), "日志…");
        assert_eq!(truncate_chars("ok", 4000), "ok");
        assert_eq!(Level::parse("info"), Some(Level::Info));
        assert_eq!(Level::parse("trace"), None);
    }

    #[test]
    fn rotates_current_file_when_over_limit() {
        let dir = temp_dir();
        let mut session = Session::open(dir.clone(), Local::now()).unwrap();
        let current = session.path.clone();
        session.append(&"a".repeat(64));
        session.rotate_if_over(32).unwrap();
        let rotated = current.with_extension("old.log");
        assert_eq!(fs::read_to_string(&rotated).unwrap().len(), 64);
        assert_eq!(fs::metadata(&current).unwrap().len(), 0);
        session.append("after\n");
        session.rotate_if_over(1).unwrap();
        // 再次轮转覆盖旧的 .old.log，而不是堆积
        assert_eq!(fs::read_to_string(&rotated).unwrap(), "after\n");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn cleans_only_expired_session_files() {
        let dir = temp_dir();
        let now = SystemTime::now();
        let old = now - RETENTION - Duration::from_secs(60);
        touch(&dir.join("session-2026-01-01_00-00-00-aaaa.log"), old);
        touch(&dir.join("session-2026-01-01_00-00-00-aaaa.old.log"), old);
        touch(&dir.join("session-2026-01-02_00-00-00-bbbb.log"), now);
        touch(&dir.join("other.log"), old);
        assert_eq!(clean_expired_before(&dir, now - RETENTION), 2);
        let mut remaining: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        remaining.sort();
        assert_eq!(
            remaining,
            vec!["other.log", "session-2026-01-02_00-00-00-bbbb.log"]
        );
        assert_eq!(clean_expired_before(&dir.join("missing"), now), 0);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn collects_current_and_previous_session_tails() {
        let dir = temp_dir();
        fs::write(
            dir.join("session-2026-01-01_00-00-00-aaaa.log"),
            "first\nolder line\n",
        )
        .unwrap();
        fs::write(
            dir.join("session-2026-01-01_00-00-00-aaaa.old.log"),
            "rotated\n",
        )
        .unwrap();
        fs::write(
            dir.join("session-2026-01-02_00-00-00-bbbb.log"),
            "previous\n",
        )
        .unwrap();
        let current = dir.join("session-2026-01-03_00-00-00-cccc.log");
        fs::write(&current, "current\n").unwrap();
        assert_eq!(
            previous_session_log(&dir, &current),
            Some(dir.join("session-2026-01-02_00-00-00-bbbb.log"))
        );
        let text = collect_text(&dir, &current);
        assert_eq!(
            text,
            "===== session-2026-01-03_00-00-00-cccc.log =====\ncurrent\n\n\n===== session-2026-01-02_00-00-00-bbbb.log =====\nprevious\n"
        );
        // 尾部截断丢掉首行残片
        assert_eq!(
            read_tail(&dir.join("session-2026-01-01_00-00-00-aaaa.log"), 12),
            Some("older line\n".to_string())
        );
        assert_eq!(gunzip(&gzip("abc")), "abc");
        fs::remove_dir_all(dir).unwrap();
    }
}
