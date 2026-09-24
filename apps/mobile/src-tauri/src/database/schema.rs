use std::fs;
use std::ops::{Deref, DerefMut};
use std::sync::{Mutex, MutexGuard, OnceLock};

use rusqlite::Connection;
use tauri::AppHandle;

use super::index_db;
use super::migrator;
use crate::setting::{get_active_database_name, load_or_init_setting, resolve_database_path};

fn backup_before_migration(
    conn: &Connection,
    database_path: &std::path::Path,
) -> Result<(), String> {
    let file_prefix = format!(
        "{}.db.pre-schema-v{}-",
        database_path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or_default(),
        migrator::MAIN_SCHEMA_VERSION
    );
    // 迁移失败重试时库内容与首份备份一致，已存在备份则复用，避免全量备份反复膨胀
    if let Some(parent) = database_path.parent() {
        if let Ok(entries) = fs::read_dir(parent) {
            let exists = entries
                .filter_map(|entry| entry.ok())
                .any(|entry| entry.file_name().to_string_lossy().starts_with(&file_prefix));
            if exists {
                return Ok(());
            }
        }
    }
    let backup_path = database_path.with_extension(format!(
        "db.pre-schema-v{}-{}.bak",
        migrator::MAIN_SCHEMA_VERSION,
        uuid::Uuid::new_v4()
    ));
    // VACUUM INTO 包含 WAL 中已提交的数据，直接复制 db 文件可能遗漏记录。
    conn.execute("VACUUM INTO ?1", [backup_path.to_string_lossy().as_ref()])
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: 备份数据库失败: {e}"))?;
    Ok(())
}

pub fn force_checkpoint(app: &AppHandle, db_name: &str) -> Result<(), String> {
    let path = resolve_database_path(app, db_name)
        .map_err(|e| format!("DB_CHECKPOINT_FAILED: Failed to resolve database path: {e}"))?;
    let conn = Connection::open(path)
        .map_err(|e| format!("DB_CHECKPOINT_FAILED: Failed to open database: {e}"))?;
    let (busy, log, checkpointed) = conn
        .query_row("PRAGMA wal_checkpoint(FULL)", [], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| format!("DB_CHECKPOINT_FAILED: Failed to checkpoint database: {e}"))?;
    if busy != 0 || log != checkpointed {
        return Err(format!(
            "DB_CHECKPOINT_FAILED: busy={busy}, log={log}, wal file is not fully checkpointed"
        ));
    }
    Ok(())
}

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
    let has_data: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%')", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if has_data && migrator::needs_main_upgrade(&conn)? {
        backup_before_migration(&conn, &database_path)
            .map_err(|error| format!("{error}；原数据库未修改，备份文件路径位于数据库目录"))?;
    }
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

pub fn validate_download(path: &std::path::Path) -> Result<(), String> {
    let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|e| e.to_string())?;
    let has_contents: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='contents' AND type='table')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !has_contents {
        return Err("下载的文件不是 Tau 数据库".into());
    }
    let integrity: String = conn
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if integrity != "ok" {
        return Err(format!("数据库完整性检查失败: {integrity}"));
    }
    migrator::ensure_main_schema(&conn)?;
    let busy: i64 = conn
        .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if busy != 0 {
        return Err("下载库仍被占用，无法完成升级".into());
    }
    conn.execute_batch("PRAGMA journal_mode=DELETE;")
        .map_err(|e| e.to_string())?;
    Ok(())
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

/// 丢弃缓存的连接。库切换由 open_active_database 的名字比对自动处理；
/// 以下场景必须显式失效：checkpoint（要求无并发连接）、下载替换数据库文件
///（Windows 上文件被占用时 rename 会直接失败）。
pub fn invalidate_cached_connection() {
    let Some(cache) = ACTIVE_CONNECTION_CACHE.get() else {
        return;
    };
    let mut guard = match cache.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    *guard = None;
    super::knowledge_migration::clear_mapping_cache();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_before_migration_snapshots_wal_and_reuses_first() {
        let dir = std::env::temp_dir().join(format!("tau-backup-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("main.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT);
             INSERT INTO t(v) VALUES('in-wal');",
        )
        .unwrap();
        backup_before_migration(&conn, &path).unwrap();
        let backups: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .filter(|name| name.starts_with("main.db.pre-schema-v3-"))
            .collect();
        assert_eq!(backups.len(), 1, "首份备份应存在且唯一");
        assert!(backups[0].ends_with(".bak"));
        // WAL 中已提交的数据必须进入快照，直接复制 db 文件会遗漏
        let snapshot = Connection::open(dir.join(&backups[0])).unwrap();
        let in_wal: i64 = snapshot
            .query_row("SELECT COUNT(*) FROM t WHERE v='in-wal'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(in_wal, 1);
        drop(snapshot);
        // 迁移失败重试复用首份，不反复膨胀
        backup_before_migration(&conn, &path).unwrap();
        let count = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("main.db.pre-schema-v3-")
            })
            .count();
        assert_eq!(count, 1);
        drop(conn);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn downloaded_file_is_validated_and_migrated_before_use() {
        let dir = std::env::temp_dir().join(format!("tau-download-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("download.db");
        fs::write(&path, b"not sqlite").unwrap();
        assert!(validate_download(&path).is_err());
        fs::remove_file(&path).unwrap();
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE unrelated(id INTEGER)")
            .unwrap();
        drop(conn);
        assert!(validate_download(&path).is_err());
        fs::remove_file(&path).unwrap();
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE contents(id INTEGER PRIMARY KEY,create_time INTEGER NOT NULL,update_time INTEGER NOT NULL,content TEXT,count INTEGER DEFAULT 0,ref_count INTEGER DEFAULT 0);").unwrap();
        drop(conn);
        validate_download(&path).unwrap();
        let conn = Connection::open(&path).unwrap();
        assert_eq!(
            migrator::get_meta(&conn, "main_schema_version").unwrap(),
            Some("3".into())
        );
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert_eq!(mode, "delete");
        drop(conn);
        fs::remove_dir_all(dir).unwrap();
    }
}
