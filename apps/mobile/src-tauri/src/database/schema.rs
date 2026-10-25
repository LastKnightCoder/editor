use std::fs;
use std::ops::{Deref, DerefMut};
use std::sync::{Mutex, MutexGuard, OnceLock};

use rusqlite::Connection;
use tauri::AppHandle;

use super::index_db;
use super::migrator;
use crate::setting::{get_active_database_name, load_or_init_setting, resolve_database_path};

pub fn ensure_database_file(app: &AppHandle, db_name: &str) -> Result<(), String> {
    let database_path = resolve_database_path(app, db_name)
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to resolve database path: {e}"))?;
    if !database_path.exists() {
        if let Some(parent) = database_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("DB_OPEN_FAILED: Failed to create database directory: {e}"))?;
        }
    }
    let conn = Connection::open(&database_path)
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to open database: {e}"))?;
    migrator::ensure_main_schema(&conn)?;
    index_db::ensure_index_database(app, db_name, &conn)?;
    Ok(())
}

pub fn open_database_by_name(app: &AppHandle, db_name: &str) -> Result<Connection, String> {
    ensure_database_file(app, db_name)?;
    let path = resolve_database_path(app, db_name)
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to resolve database path: {e}"))?;
    let conn = Connection::open(path).map_err(|e| format!("DB_OPEN_FAILED: {e}"))?;
    conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn open_active_database(app: &AppHandle) -> Result<ActiveConnection, String> {
    let setting = load_or_init_setting(app)?;
    let db_name = get_active_database_name(&setting);
    let cache = ACTIVE_CONNECTION_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = match cache.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    if let Some(cached) = guard.as_ref() {
        if cached.db_name == db_name {
            return Ok(ActiveConnection { _guard: guard });
        }
    }
    let conn = open_database_by_name(app, &db_name)?;
    *guard = Some(CachedConnection { db_name, conn });
    Ok(ActiveConnection { _guard: guard })
}

struct CachedConnection {
    db_name: String,
    conn: Connection,
}

/// 每次查询重开连接会连带重跑迁移检查（ensure_database_file），是 IPC 延迟的大头；
/// 按 active 库名缓存单连接，守卫持有期间序列化并发访问（SQLite 单写者本就串行）。
static ACTIVE_CONNECTION_CACHE: OnceLock<Mutex<Option<CachedConnection>>> = OnceLock::new();

pub struct ActiveConnection {
    _guard: MutexGuard<'static, Option<CachedConnection>>,
}

impl ActiveConnection {
    pub fn database_name(&self) -> &str {
        &self
            ._guard
            .as_ref()
            .expect("缓存连接在守卫存续期间必在")
            .db_name
    }
}

impl Deref for ActiveConnection {
    type Target = Connection;

    fn deref(&self) -> &Connection {
        &self
            ._guard
            .as_ref()
            .expect("缓存连接在守卫存续期间必在")
            .conn
    }
}

impl DerefMut for ActiveConnection {
    fn deref_mut(&mut self) -> &mut Connection {
        &mut self
            ._guard
            .as_mut()
            .expect("缓存连接在守卫存续期间必在")
            .conn
    }
}

/// 当前激活数据库文件大小（字节）：主库 + WAL/SHM 附属文件一并计入
pub fn active_database_size_bytes(app: &AppHandle) -> Result<u64, String> {
    let setting = load_or_init_setting(app)?;
    let db_name = get_active_database_name(&setting);
    let path = resolve_database_path(app, &db_name)
        .map_err(|e| format!("DB_SIZE_FAILED: Failed to resolve database path: {e}"))?;
    let mut total = path.metadata().map(|m| m.len()).unwrap_or(0);
    for ext in ["-wal", "-shm"] {
        let mut side = path.clone().into_os_string();
        side.push(ext);
        if let Ok(meta) = std::path::PathBuf::from(side).metadata() {
            total += meta.len();
        }
    }
    Ok(total)
}

/// 用下载的库文件替换本机库：先合并 WAL 并把旧库复制进 backup/，再丢弃该库的编辑器缓存后原子替换。
pub(crate) fn install_download(
    app: &AppHandle,
    name: &str,
    local_version: u64,
    download: &std::path::PathBuf,
) -> Result<(), String> {
    let _cache_lock = crate::collaboration::CACHE_WRITE_LOCK
        .lock()
        .map_err(|_| "缓存保存锁不可用")?;
    let mut connections = ACTIVE_CONNECTION_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| "数据库连接锁不可用")?;
    *connections = None;
    let destination = resolve_database_path(app, name)?;
    if destination.exists() {
        let main = Connection::open(&destination).map_err(|e| e.to_string())?;
        main.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
            .map_err(|e| e.to_string())?;
        drop(main);
        let backup = crate::setting::resolve_app_dir(app)?.join("backup");
        fs::create_dir_all(&backup).map_err(|e| e.to_string())?;
        let stamp = chrono::Local::now().format("%Y-%m-%d-%H-%M-%S");
        fs::copy(
            &destination,
            backup.join(format!("version-{local_version}-{stamp}-{name}")),
        )
        .map_err(|e| format!("备份本地数据库失败: {e}"))?;
    }
    crate::collaboration::release_library_sessions(
        &crate::collaboration::session_store(app)?,
        name,
    )?;
    replace_database_file(download, &destination).map_err(|e| e.to_string())?;
    for suffix in ["-wal", "-shm"] {
        let _ = fs::remove_file(format!("{}{suffix}", destination.to_string_lossy()));
    }
    Ok(())
}
fn replace_database_file(
    download: &std::path::PathBuf,
    destination: &std::path::PathBuf,
) -> std::io::Result<()> {
    let previous = destination.with_extension(format!("db.{}.previous", uuid::Uuid::new_v4()));
    let existed = destination.exists();
    if existed {
        fs::rename(destination, &previous)?;
    }
    if let Err(error) = fs::rename(download, destination) {
        if existed {
            fs::rename(&previous, destination)?;
        }
        return Err(error);
    }
    if existed {
        let _ = fs::remove_file(previous);
    }
    Ok(())
}

#[cfg(test)]
mod replacement_tests {
    use super::*;
    #[test]
    fn replacement_failure_restores_original_file() {
        let dir = std::env::temp_dir().join(format!("tau-replace-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let original = dir.join("data.db");
        fs::write(&original, b"original").unwrap();
        assert!(replace_database_file(&dir.join("missing.db"), &original).is_err());
        assert_eq!(fs::read(&original).unwrap(), b"original");
        fs::remove_dir_all(dir).unwrap();
    }
}
