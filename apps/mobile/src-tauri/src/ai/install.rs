use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};

use super::store::{safe_id, session_dir, sync_directory};

#[derive(Serialize, Deserialize)]
struct Journal {
    id: String,
    database: String,
    had_database: bool,
    had_sessions: bool,
    replaces_sessions: bool,
}
static INSTALL_LOCK: Mutex<()> = Mutex::new(());
pub fn lock() -> Result<MutexGuard<'static, ()>, String> {
    INSTALL_LOCK
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:安装恢复锁不可用".into())
}
fn journal_path(root: &Path, database: &str) -> Result<PathBuf, String> {
    let name = crate::setting::normalize_database_name(database)?;
    Ok(root.join("ai-installs").join(format!("{name}.json")))
}
pub fn prepare(root: &Path, database: &str, replaces_sessions: bool) -> Result<(), String> {
    let journal = Journal {
        id: uuid::Uuid::new_v4().to_string(),
        database: database.into(),
        had_database: root.join(database).exists(),
        had_sessions: session_dir(root, database)?.exists(),
        replaces_sessions,
    };
    let backup = root.join("backup").join("ai-installs").join(&journal.id);
    fs::create_dir_all(&backup).map_err(|error| error.to_string())?;
    if journal.had_database {
        fs::copy(root.join(database), backup.join("data.db")).map_err(|error| error.to_string())?;
        File::open(backup.join("data.db"))
            .and_then(|file| file.sync_all())
            .map_err(|error| error.to_string())?;
    }
    sync_directory(&backup)?;
    let path = journal_path(root, database)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|error| error.to_string())?;
    let file = File::create(&path).map_err(|error| error.to_string())?;
    serde_json::to_writer(&file, &journal).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    sync_directory(path.parent().unwrap())?;
    Ok(())
}
pub fn install_sessions(
    root: &Path,
    database: &str,
    download: Option<&Path>,
) -> Result<(), String> {
    let journal: Journal = serde_json::from_reader(
        File::open(journal_path(root, database)?).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    let destination = session_dir(root, database)?;
    fs::create_dir_all(destination.parent().unwrap()).map_err(|error| error.to_string())?;
    if destination.exists() {
        fs::rename(
            &destination,
            root.join("backup")
                .join("ai-installs")
                .join(&journal.id)
                .join("sessions"),
        )
        .map_err(|error| error.to_string())?;
    }
    match download {
        Some(download) => fs::rename(download, destination).map_err(|error| error.to_string()),
        // 未提供远端正文时保留原目录备份，不能把旧文件当成新库对应的历史。
        None => fs::create_dir_all(destination).map_err(|error| error.to_string()),
    }?;
    sync_directory(&root.join("sessions"))?;
    sync_directory(&root.join("backup").join("ai-installs").join(&journal.id))
}
pub fn finish(root: &Path, database: &str) -> Result<(), String> {
    let path = journal_path(root, database)?;
    fs::remove_file(&path).map_err(|error| error.to_string())?;
    sync_directory(path.parent().unwrap())
}
pub fn recover(root: &Path, database: &str) -> Result<(), String> {
    let _guard = lock()?;
    recover_locked(root, database)
}
pub fn recover_locked(root: &Path, database: &str) -> Result<(), String> {
    let path = journal_path(root, database)?;
    if !path.exists() {
        return Ok(());
    }
    let journal: Journal =
        serde_json::from_reader(File::open(&path).map_err(|error| error.to_string())?)
            .map_err(|error| format!("AI_STORAGE_FAILED:安装日志损坏：{error}"))?;
    safe_id(&journal.id)?;
    if journal.database != database {
        return Err("AI_STORAGE_FAILED:安装日志不属于当前库".into());
    }
    let backup = root.join("backup").join("ai-installs").join(&journal.id);
    let destination = root.join(database);
    if journal.had_database {
        let temporary = root.join(format!("{}.recovering", database));
        fs::copy(backup.join("data.db"), &temporary)
            .map_err(|error| format!("AI_STORAGE_FAILED:恢复原库失败：{error}"))?;
        File::open(&temporary)
            .and_then(|file| file.sync_all())
            .map_err(|error| error.to_string())?;
        fs::rename(temporary, &destination).map_err(|error| error.to_string())?;
    } else if destination.exists() {
        fs::remove_file(&destination).map_err(|error| error.to_string())?;
    }
    for suffix in ["-wal", "-shm"] {
        let _ = fs::remove_file(format!("{}{suffix}", destination.to_string_lossy()));
    }
    if journal.replaces_sessions {
        let sessions = session_dir(root, database)?;
        let previous = backup.join("sessions");
        if previous.exists() {
            if sessions.exists() {
                fs::remove_dir_all(&sessions).map_err(|error| error.to_string())?;
            }
            fs::rename(previous, sessions).map_err(|error| error.to_string())?;
        } else if !journal.had_sessions && sessions.exists() {
            fs::remove_dir_all(sessions).map_err(|error| error.to_string())?;
        }
    }
    fs::remove_file(&path).map_err(|error| error.to_string())?;
    sync_directory(root)?;
    sync_directory(path.parent().unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn interrupted_pair_install_restores_database_and_session_directory() {
        let root = std::env::temp_dir().join(format!("ai-install-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let database = rusqlite::Connection::open(root.join("data.db")).unwrap();
        database
            .execute_batch("CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES('old');")
            .unwrap();
        drop(database);
        let sessions = session_dir(&root, "data.db").unwrap();
        fs::create_dir_all(&sessions).unwrap();
        fs::write(sessions.join("old.jsonl"), b"old").unwrap();
        prepare(&root, "data.db", true).unwrap();
        let replacement = root.join("new.db");
        let database = rusqlite::Connection::open(&replacement).unwrap();
        database
            .execute_batch("CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES('new');")
            .unwrap();
        drop(database);
        fs::rename(replacement, root.join("data.db")).unwrap();
        let incoming = root.join("incoming");
        fs::create_dir(&incoming).unwrap();
        fs::write(incoming.join("new.jsonl"), b"new").unwrap();
        install_sessions(&root, "data.db", Some(&incoming)).unwrap();
        recover(&root, "data.db").unwrap();
        let database = rusqlite::Connection::open(root.join("data.db")).unwrap();
        assert_eq!(
            database
                .query_row("SELECT value FROM sample", [], |row| row
                    .get::<_, String>(0))
                .unwrap(),
            "old"
        );
        drop(database);
        assert!(sessions.join("old.jsonl").exists());
        assert!(!sessions.join("new.jsonl").exists());
        recover(&root, "data.db").unwrap();
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn missing_manifest_preserves_backup_without_reusing_old_history() {
        let root = std::env::temp_dir().join(format!("ai-no-manifest-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("data.db"), b"original").unwrap();
        let sessions = session_dir(&root, "data.db").unwrap();
        fs::create_dir_all(&sessions).unwrap();
        fs::write(sessions.join("same-name.jsonl"), b"old-content").unwrap();
        prepare(&root, "data.db", true).unwrap();
        install_sessions(&root, "data.db", None).unwrap();
        assert!(!sessions.join("same-name.jsonl").exists());
        let journal: Journal =
            serde_json::from_reader(File::open(journal_path(&root, "data.db").unwrap()).unwrap())
                .unwrap();
        assert_eq!(
            fs::read(
                root.join("backup/ai-installs")
                    .join(&journal.id)
                    .join("sessions/same-name.jsonl")
            )
            .unwrap(),
            b"old-content"
        );
        recover(&root, "data.db").unwrap();
        assert!(sessions.join("same-name.jsonl").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
