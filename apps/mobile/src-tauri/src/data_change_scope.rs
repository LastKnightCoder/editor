use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, io::Write, path::Path, sync::Mutex};

static LOCK: Mutex<()> = Mutex::new(());
#[derive(Serialize, Deserialize)]
struct Store {
    version: u8,
    device: String,
    databases: BTreeMap<String, Workspace>,
}
#[derive(Serialize, Deserialize)]
struct Workspace {
    epoch: String,
    #[serde(default)]
    file: String,
}
fn load(path: &Path) -> Result<Store, String> {
    match fs::read(path) {
        Ok(bytes) => {
            let value: Store =
                serde_json::from_slice(&bytes).map_err(|_| "业务变更作用域文件损坏")?;
            if value.version != 1 || value.device.is_empty() {
                return Err("业务变更作用域格式无效".into());
            }
            Ok(value)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Store {
            version: 1,
            device: uuid::Uuid::new_v4().to_string(),
            databases: BTreeMap::new(),
        }),
        Err(error) => Err(error.to_string()),
    }
}
fn save(path: &Path, store: &Store) -> Result<(), String> {
    let parent = path.parent().ok_or("作用域目录无效")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = parent.join(format!("data-change-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec(store).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    let _ = fs::remove_file(&temporary);
    result
}
fn identity(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Ok(format!(
            "{}:{}:{:?}",
            metadata.dev(),
            metadata.ino(),
            metadata.created().ok()
        ))
    }
    #[cfg(not(unix))]
    {
        Ok(format!(
            "{:?}",
            metadata.created().map_err(|e| e.to_string())?
        ))
    }
}
pub(crate) fn scope(directory: &Path, database: &str, file: &Path) -> Result<String, String> {
    let _lock = LOCK.lock().map_err(|_| "业务变更作用域不可用")?;
    let path = directory.join("data-change-scopes.json");
    let mut store = load(&path)?;
    let current = identity(file)?;
    let previous = serde_json::to_vec(&store).map_err(|e| e.to_string())?;
    let workspace = store
        .databases
        .entry(database.to_owned())
        .or_insert_with(|| Workspace {
            epoch: uuid::Uuid::new_v4().to_string(),
            file: String::new(),
        });
    if workspace.file != current {
        workspace.epoch = uuid::Uuid::new_v4().to_string();
        workspace.file = current;
    }
    let value = serde_json::to_string(&(&store.device, database, &workspace.epoch))
        .map_err(|e| e.to_string())?;
    if previous != serde_json::to_vec(&store).map_err(|e| e.to_string())? {
        save(&path, &store)?;
    }
    Ok(value)
}
pub(crate) fn invalidate(directory: &Path, database: &str) -> Result<(), String> {
    let _lock = LOCK.lock().map_err(|_| "业务变更作用域不可用")?;
    let path = directory.join("data-change-scopes.json");
    let mut store = load(&path)?;
    let workspace = store
        .databases
        .entry(database.to_owned())
        .or_insert_with(|| Workspace {
            epoch: String::new(),
            file: String::new(),
        });
    workspace.epoch = uuid::Uuid::new_v4().to_string();
    save(&path, &store)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restarts_preserve_scope_and_replacement_changes_it_before_installing() {
        let directory =
            std::env::temp_dir().join(format!("tau-data-scope-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let file = directory.join("main.db");
        fs::write(&file, []).unwrap();
        let first = scope(&directory, "main.db", &file).unwrap();
        assert_eq!(scope(&directory, "main.db", &file).unwrap(), first);
        invalidate(&directory, "main.db").unwrap();
        let second = scope(&directory, "main.db", &file).unwrap();
        assert_ne!(first, second);
        fs::write(directory.join("incoming.db"), []).unwrap();
        fs::rename(directory.join("incoming.db"), &file).unwrap();
        assert_ne!(scope(&directory, "main.db", &file).unwrap(), second);
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn corrupt_scope_is_reported_without_overwriting_it() {
        let directory =
            std::env::temp_dir().join(format!("tau-data-scope-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let file = directory.join("main.db");
        fs::write(&file, []).unwrap();
        let registry = directory.join("data-change-scopes.json");
        fs::write(&registry, b"broken").unwrap();
        assert!(scope(&directory, "main.db", &file).is_err());
        assert_eq!(fs::read(&registry).unwrap(), b"broken");
        fs::remove_dir_all(directory).unwrap();
    }
}
