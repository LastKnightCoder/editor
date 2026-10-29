use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::plugin_files::{encode_chunk, CHUNK_BYTES};

fn failure(error: impl std::fmt::Display) -> String {
    format!("AI_STORAGE_FAILED:{error}")
}
pub fn sync_directory(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    File::open(path)
        .and_then(|file| file.sync_all())
        .map_err(failure)?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}
pub fn safe_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 256
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Err("AI_SESSION_INVALID:标识无效".into());
    }
    Ok(())
}
fn safe_operation_id(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 4096 {
        return Err("AI_SESSION_INVALID:操作标识无效".into());
    }
    Ok(())
}
pub fn session_dir(root: &Path, database: &str) -> Result<PathBuf, String> {
    let database = crate::setting::normalize_database_name(database)?;
    let parent = root.join("sessions");
    let stem = database.strip_suffix(".db").unwrap_or(&database);
    if stem.is_empty() || matches!(stem, "." | "..") {
        return Err("AI_SESSION_INVALID:会话库名无效".into());
    }
    let directory = parent.join(stem);
    for path in [&parent, &directory] {
        if path
            .symlink_metadata()
            .is_ok_and(|metadata| metadata.file_type().is_symlink())
        {
            return Err("AI_SESSION_INVALID:会话目录不允许符号链接".into());
        }
    }
    Ok(directory)
}
pub fn safe_file(value: &str) -> Result<(), String> {
    if !crate::chunked_sync::valid_name(value) || !value.ends_with(".jsonl") {
        return Err("AI_SESSION_INVALID:会话文件名无效".into());
    }
    Ok(())
}
const HASH_CACHE_CAPACITY: usize = 128;

#[derive(Clone, PartialEq, Eq)]
struct FileFingerprint {
    size: u64,
    modified: SystemTime,
    #[cfg(unix)]
    identity: (u64, u64),
    #[cfg(unix)]
    changed: (i64, i64),
}
impl FileFingerprint {
    fn of(metadata: &fs::Metadata) -> Result<Self, String> {
        #[cfg(unix)]
        use std::os::unix::fs::MetadataExt;
        Ok(Self {
            size: metadata.len(),
            modified: metadata.modified().map_err(failure)?,
            #[cfg(unix)]
            identity: (metadata.dev(), metadata.ino()),
            #[cfg(unix)]
            changed: (metadata.ctime(), metadata.ctime_nsec()),
        })
    }
}
struct CachedHash {
    fingerprint: FileFingerprint,
    hash: String,
    last_used: u64,
}
#[derive(Default)]
struct HashCache {
    entries: HashMap<PathBuf, CachedHash>,
    clock: u64,
}
impl HashCache {
    fn get(&mut self, path: &Path, fingerprint: &FileFingerprint) -> Option<String> {
        self.clock = self.clock.wrapping_add(1);
        let entry = self.entries.get_mut(path)?;
        if entry.fingerprint != *fingerprint {
            return None;
        }
        entry.last_used = self.clock;
        Some(entry.hash.clone())
    }
    fn insert(&mut self, path: &Path, fingerprint: FileFingerprint, hash: String) {
        if !self.entries.contains_key(path) && self.entries.len() >= HASH_CACHE_CAPACITY {
            if let Some(oldest) = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(path, _)| path.clone())
            {
                self.entries.remove(&oldest);
            }
        }
        self.clock = self.clock.wrapping_add(1);
        self.entries.insert(
            path.into(),
            CachedHash {
                fingerprint,
                hash,
                last_used: self.clock,
            },
        );
    }
}
fn hash_cache() -> &'static Mutex<HashCache> {
    static VALUE: OnceLock<Mutex<HashCache>> = OnceLock::new();
    VALUE.get_or_init(|| Mutex::new(HashCache::default()))
}
fn invalidate_file_hash(path: &Path) -> Result<(), String> {
    hash_cache()
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:文件摘要缓存不可用")?
        .entries
        .remove(path);
    Ok(())
}
fn hash_reader(file: &mut File) -> Result<String, String> {
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 65536];
    loop {
        let count = file.read(&mut buffer).map_err(failure)?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn file_hash_with(
    path: &Path,
    read_hash: impl Fn(&mut File) -> Result<String, String>,
) -> Result<String, String> {
    // 同时复核句柄与路径，避免原子替换后缓存仍对应旧 inode。
    for _ in 0..3 {
        let mut file = File::open(path).map_err(failure)?;
        let before = FileFingerprint::of(&file.metadata().map_err(failure)?)?;
        if FileFingerprint::of(&fs::metadata(path).map_err(failure)?)? != before {
            continue;
        }
        let cached = hash_cache()
            .lock()
            .map_err(|_| "AI_STORAGE_FAILED:文件摘要缓存不可用")?
            .get(path, &before);
        let hash = match &cached {
            Some(hash) => hash.clone(),
            None => read_hash(&mut file)?,
        };
        if FileFingerprint::of(&file.metadata().map_err(failure)?)? != before
            || FileFingerprint::of(&fs::metadata(path).map_err(failure)?)? != before
        {
            continue;
        }
        if cached.is_none() {
            hash_cache()
                .lock()
                .map_err(|_| "AI_STORAGE_FAILED:文件摘要缓存不可用")?
                .insert(path, before, hash.clone());
        }
        return Ok(hash);
    }
    Err("AI_SESSION_REVISION_CONFLICT:计算摘要期间会话持续变化".into())
}
fn file_hash(path: &Path) -> Result<String, String> {
    file_hash_with(path, hash_reader)
}
fn entries(path: &Path) -> Result<Vec<Value>, String> {
    let file = File::open(path).map_err(failure)?;
    let mut result = Vec::new();
    let mut ids = HashSet::new();
    for (index, line) in BufReader::new(file).lines().enumerate() {
        let line = line.map_err(failure)?;
        if line.trim().is_empty() {
            continue;
        }
        let value: Value =
            serde_json::from_str(&line).map_err(|_| "AI_SESSION_INVALID:会话包含损坏记录")?;
        if index == 0 {
            if value["type"] != "session" || value["version"] != 3 {
                return Err("AI_SESSION_FORMAT_UNSUPPORTED:仅支持 pi 会话 v3".into());
            }
        } else {
            let id = value["id"]
                .as_str()
                .ok_or("AI_SESSION_INVALID:记录缺少标识")?;
            safe_id(id)?;
            if !ids.insert(id.to_string()) {
                return Err("AI_SESSION_INVALID:记录标识重复".into());
            }
            if let Some(parent) = value["parentId"].as_str() {
                if parent == id || !ids.contains(parent) {
                    return Err("AI_SESSION_INVALID:记录父节点无效".into());
                }
            }
        }
        result.push(value);
    }
    if result.is_empty() {
        return Err("AI_SESSION_INVALID:会话文件为空".into());
    }
    Ok(result)
}
fn count_users(values: &[Value]) -> usize {
    let by_id: HashMap<&str, &Value> = values
        .iter()
        .skip(1)
        .filter_map(|value| value["id"].as_str().map(|id| (id, value)))
        .collect();
    let mut leaf = values.last().and_then(|value| value["id"].as_str());
    let mut path = Vec::new();
    while let Some(id) = leaf {
        let Some(value) = by_id.get(id) else {
            break;
        };
        path.push(*value);
        leaf = value["parentId"].as_str();
    }
    let omitted: HashSet<&str> = path
        .iter()
        .filter(|value| value["type"] == "context_edit" && value["replacement"].is_null())
        .filter_map(|value| value["targetId"].as_str())
        .collect();
    path.iter()
        .filter(|value| {
            value["type"] == "message"
                && value["message"]["role"] == "user"
                && !omitted.contains(value["id"].as_str().unwrap_or_default())
        })
        .count()
}

pub struct Store {
    pub root: PathBuf,
    pub database: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub row: Value,
    pub revision: String,
    pub size: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionChunk {
    pub row: Value,
    pub revision: String,
    pub data: String,
    pub next_offset: u64,
    pub eof: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSession {
    pub id: String,
    pub scope: String,
    pub domain_ref: Option<String>,
    pub title: Option<String>,
    pub cwd: Option<String>,
    pub header: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSession {
    pub session_id: String,
    pub operation_id: String,
    pub expected_revision: String,
    pub entries: Vec<Value>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Journal {
    session_id: String,
    file_name: String,
    staged_name: String,
    row: Option<Value>,
    expected_hash: Option<String>,
    after_hash: Option<String>,
    #[serde(default)]
    previous_row: Option<Value>,
}

impl Store {
    pub fn connection(&self) -> Result<Connection, String> {
        Connection::open(self.root.join(&self.database)).map_err(failure)
    }
    pub fn directory(&self) -> Result<PathBuf, String> {
        session_dir(&self.root, &self.database)
    }
    fn journal_dir(&self) -> PathBuf {
        self.root
            .join("ai-journals")
            .join(self.database.strip_suffix(".db").unwrap_or(&self.database))
    }
    pub fn row(&self, id: &str) -> Result<Value, String> {
        safe_id(id)?;
        self.connection()?.query_row("SELECT id,scope,domain_ref,session_file,cwd,title,title_dirty,group_id,order_num,archived,source,message_count,create_time,update_time FROM chat_session WHERE id=?1", [id], |row| Ok(json!({
            "id":row.get::<_,String>(0)?, "scope":row.get::<_,String>(1)?, "domainRef":row.get::<_,Option<String>>(2)?, "sessionFile":row.get::<_,String>(3)?, "cwd":row.get::<_,String>(4)?, "title":row.get::<_,String>(5)?, "titleDirty":row.get::<_,i64>(6)? != 0, "groupId":row.get::<_,Option<i64>>(7)?, "orderNum":row.get::<_,Option<i64>>(8)?, "archived":row.get::<_,i64>(9)? != 0, "source":row.get::<_,String>(10)?, "messageCount":row.get::<_,i64>(11)?, "createTime":row.get::<_,i64>(12)?, "updateTime":row.get::<_,i64>(13)?
        }))).optional().map_err(failure)?.ok_or_else(|| "AI_SESSION_NOT_FOUND:会话不存在".into())
    }
    fn path(&self, row: &Value) -> Result<PathBuf, String> {
        let name = row["sessionFile"]
            .as_str()
            .ok_or("AI_SESSION_INVALID:会话没有文件")?;
        safe_file(name)?;
        let path = self.directory()?.join(name);
        if !path.is_file() {
            return Err("AI_SESSION_FILE_MISSING:会话正文缺失".into());
        }
        if path
            .symlink_metadata()
            .map_err(failure)?
            .file_type()
            .is_symlink()
        {
            return Err("AI_SESSION_INVALID:会话文件不允许符号链接".into());
        }
        Ok(path)
    }
    pub fn info(&self, id: &str) -> Result<SessionInfo, String> {
        let row = self.row(id)?;
        let path = self.path(&row)?;
        let mut hash = Sha256::new();
        hash.update(file_hash(&path)?);
        hash.update(serde_json::to_vec(&row).map_err(failure)?);
        Ok(SessionInfo {
            row,
            revision: format!("{:x}", hash.finalize()),
            size: path.metadata().map_err(failure)?.len(),
        })
    }
    pub fn read(&self, id: &str, offset: u64) -> Result<SessionChunk, String> {
        let info = self.info(id)?;
        if offset > info.size {
            return Err("AI_SESSION_INVALID:读取位置无效".into());
        }
        let mut file = File::open(self.path(&info.row)?).map_err(failure)?;
        file.seek(SeekFrom::Start(offset)).map_err(failure)?;
        let mut bytes = vec![0; CHUNK_BYTES / 2];
        let count = file.read(&mut bytes).map_err(failure)?;
        bytes.truncate(count);
        let next_offset = offset + count as u64;
        Ok(SessionChunk {
            row: info.row,
            revision: info.revision,
            data: encode_chunk(&bytes),
            next_offset,
            eof: next_offset == info.size,
        })
    }
    fn save_row(&self, value: &Value) -> Result<(), String> {
        self.connection()?.execute("INSERT INTO chat_session(id,scope,domain_ref,session_file,cwd,title,title_dirty,group_id,order_num,archived,source,message_count,create_time,update_time) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14) ON CONFLICT(id) DO UPDATE SET scope=excluded.scope,domain_ref=excluded.domain_ref,session_file=excluded.session_file,cwd=excluded.cwd,title=excluded.title,title_dirty=excluded.title_dirty,group_id=excluded.group_id,order_num=excluded.order_num,archived=excluded.archived,source=excluded.source,message_count=excluded.message_count,update_time=excluded.update_time",params![
            value["id"].as_str(),value["scope"].as_str(),value["domainRef"].as_str(),value["sessionFile"].as_str(),value["cwd"].as_str().unwrap_or(""),value["title"].as_str().unwrap_or(""),i64::from(value["titleDirty"].as_bool().unwrap_or(false)),value["groupId"].as_i64(),value["orderNum"].as_i64(),i64::from(value["archived"].as_bool().unwrap_or(false)),value["source"].as_str().unwrap_or("mobile"),value["messageCount"].as_i64().unwrap_or(0),value["createTime"].as_i64(),value["updateTime"].as_i64()
        ]).map_err(failure)?;
        Ok(())
    }
    fn apply_journal(&self, journal: &Journal) -> Result<(), String> {
        safe_id(&journal.session_id)?;
        safe_file(&journal.file_name)?;
        safe_id(&journal.staged_name)?;
        let target = self.directory()?.join(&journal.file_name);
        let staged = self.journal_dir().join(&journal.staged_name);
        if journal.row.is_none() {
            invalidate_file_hash(&target)?;
            let backup = self.root.join("backup").join("ai-sessions");
            fs::create_dir_all(&backup).map_err(failure)?;
            let backup_name = format!("{}-{}", journal.staged_name, journal.file_name);
            if let Some(row) = &journal.previous_row {
                let mut metadata =
                    File::create(backup.join(format!("{backup_name}.metadata.json")))
                        .map_err(failure)?;
                serde_json::to_writer(&mut metadata, row).map_err(failure)?;
                metadata.sync_all().map_err(failure)?;
            }
            if target.exists() {
                fs::rename(&target, backup.join(backup_name)).map_err(failure)?;
            }
            self.connection()?
                .execute(
                    "DELETE FROM chat_session WHERE id=?1",
                    [&journal.session_id],
                )
                .map_err(failure)?;
        } else {
            if staged.exists() {
                let current = if target.exists() {
                    Some(file_hash(&target)?)
                } else {
                    None
                };
                if current != journal.expected_hash && current != journal.after_hash {
                    return Err("AI_SESSION_REVISION_CONFLICT:恢复时会话已被其他写入改变".into());
                }
                invalidate_file_hash(&target)?;
                invalidate_file_hash(&staged)?;
                fs::rename(&staged, &target).map_err(failure)?;
                sync_directory(target.parent().unwrap())?;
            }
            if Some(file_hash(&target)?) != journal.after_hash {
                return Err("AI_STORAGE_FAILED:恢复文件与事务不一致".into());
            }
            self.save_row(journal.row.as_ref().unwrap())?;
        }
        Ok(())
    }
    pub fn recover(&self) -> Result<(), String> {
        let directory = self.journal_dir();
        if !directory.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(directory).map_err(failure)? {
            let path = entry.map_err(failure)?.path();
            if path.extension().is_none_or(|value| value != "json") {
                continue;
            }
            let journal: Journal =
                serde_json::from_reader(File::open(&path).map_err(failure)?).map_err(failure)?;
            self.apply_journal(&journal)?;
            let _ = fs::remove_file(self.journal_dir().join(&journal.staged_name));
            fs::remove_file(path).map_err(failure)?;
        }
        Ok(())
    }
    fn transact(
        &self,
        id: &str,
        file_name: &str,
        row: Option<Value>,
        original: Option<&Path>,
        lines: &[Value],
        operation: &str,
    ) -> Result<(), String> {
        safe_operation_id(operation)?;
        let operation_key = format!("{:x}", Sha256::digest(operation.as_bytes()));
        let directory = self.journal_dir();
        fs::create_dir_all(&directory).map_err(failure)?;
        fs::create_dir_all(self.directory()?).map_err(failure)?;
        let staged_name = format!("{operation_key}-stage");
        let staged = directory.join(&staged_name);
        invalidate_file_hash(&staged)?;
        let mut output = File::create(&staged).map_err(failure)?;
        if let Some(original) = original {
            let mut source = File::open(original).map_err(failure)?;
            std::io::copy(&mut source, &mut output).map_err(failure)?;
            if source.metadata().map_err(failure)?.len() > 0 {
                source.seek(SeekFrom::End(-1)).map_err(failure)?;
                let mut last = [0];
                source.read_exact(&mut last).map_err(failure)?;
                if last[0] != b'\n' {
                    output.write_all(b"\n").map_err(failure)?;
                }
            }
        }
        for line in lines {
            serde_json::to_writer(&mut output, line).map_err(failure)?;
            output.write_all(b"\n").map_err(failure)?;
        }
        output.sync_all().map_err(failure)?;
        let previous_row = if row.is_none() {
            Some(self.row(id)?)
        } else {
            None
        };
        let journal = Journal {
            session_id: id.into(),
            file_name: file_name.into(),
            staged_name,
            row,
            expected_hash: original.map(file_hash).transpose()?,
            after_hash: Some(file_hash(&staged)?),
            previous_row,
        };
        let journal_path = directory.join(format!("{operation_key}.json"));
        let mut file = File::create(&journal_path).map_err(failure)?;
        serde_json::to_writer(&mut file, &journal).map_err(failure)?;
        file.sync_all().map_err(failure)?;
        sync_directory(&directory)?;
        self.apply_journal(&journal)?;
        fs::remove_file(journal_path).map_err(failure)?;
        let _ = fs::remove_file(staged);
        Ok(())
    }
    pub fn create(&self, input: CreateSession) -> Result<SessionInfo, String> {
        safe_id(&input.id)?;
        if input.header["type"] != "session"
            || input.header["version"] != 3
            || input.header["id"] != input.id
        {
            return Err("AI_SESSION_FORMAT_UNSUPPORTED:会话头必须为当前 v3 和指定标识".into());
        }
        let exists = self
            .connection()?
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM chat_session WHERE id=?1)",
                [&input.id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(failure)?;
        if exists {
            return self.info(&input.id);
        }
        let now = chrono::Utc::now().timestamp_millis();
        let filename = format!(
            "{}_{}.jsonl",
            chrono::Utc::now().format("%Y-%m-%dT%H-%M-%S-%3fZ"),
            input.id
        );
        let row = json!({"id":input.id,"scope":input.scope,"domainRef":input.domain_ref,"sessionFile":filename,"cwd":input.cwd.unwrap_or_default(),"title":input.title.unwrap_or_default(),"titleDirty":false,"groupId":null,"orderNum":null,"archived":false,"source":"mobile","messageCount":0,"createTime":now,"updateTime":now});
        self.transact(
            &input.id,
            &filename,
            Some(row),
            None,
            &[input.header],
            &uuid::Uuid::new_v4().to_string(),
        )?;
        self.info(&input.id)
    }
    pub fn commit(&self, input: CommitSession) -> Result<SessionInfo, String> {
        safe_operation_id(&input.operation_id)?;
        let info = self.info(&input.session_id)?;
        let path = self.path(&info.row)?;
        let mut values = entries(&path)?;
        if values[0]["id"] != input.session_id {
            return Err("AI_SESSION_INVALID:会话头与目录不一致".into());
        }
        let by_id: HashMap<String, Value> = values
            .iter()
            .skip(1)
            .filter_map(|value| value["id"].as_str().map(|id| (id.into(), value.clone())))
            .collect();
        if !input.entries.is_empty()
            && input
                .entries
                .iter()
                .all(|value| value["id"].as_str().and_then(|id| by_id.get(id)) == Some(value))
        {
            return Ok(info);
        }
        if info.revision != input.expected_revision {
            return Err("AI_SESSION_REVISION_CONFLICT:会话版本已变化".into());
        }
        let mut ids: HashSet<String> = by_id.keys().cloned().collect();
        for value in &input.entries {
            let id = value["id"]
                .as_str()
                .ok_or("AI_SESSION_INVALID:记录缺少标识")?;
            safe_id(id)?;
            if !ids.insert(id.into())
                || value["type"] == "session"
                || !value["type"].is_string()
                || value.get("parentId").is_none()
            {
                return Err("AI_SESSION_INVALID:重复记录、缺少父节点或无效类型".into());
            }
            if let Some(parent) = value["parentId"].as_str() {
                if parent == id || !ids.contains(parent) {
                    return Err("AI_SESSION_INVALID:记录父节点无效".into());
                }
            }
        }
        values.extend(input.entries.iter().cloned());
        let mut row = info.row;
        row["messageCount"] = json!(count_users(&values));
        row["updateTime"] = json!(chrono::Utc::now().timestamp_millis());
        let filename = row["sessionFile"].as_str().unwrap().to_string();
        self.transact(
            &input.session_id,
            &filename,
            Some(row),
            Some(&path),
            &input.entries,
            &input.operation_id,
        )?;
        self.info(&input.session_id)
    }
    pub fn patch(&self, id: &str, revision: &str, patch: Value) -> Result<SessionInfo, String> {
        if !patch.is_object()
            || patch.get("title").is_some_and(|value| !value.is_string())
            || ["titleDirty", "archived"]
                .iter()
                .any(|key| patch.get(key).is_some_and(|value| !value.is_boolean()))
            || ["groupId", "orderNum"].iter().any(|key| {
                patch
                    .get(key)
                    .is_some_and(|value| !value.is_null() && !value.is_i64())
            })
        {
            return Err("AI_SESSION_INVALID:目录修改字段类型无效".into());
        }
        let info = self.info(id)?;
        if info.revision != revision {
            return Err("AI_SESSION_REVISION_CONFLICT:会话版本已变化".into());
        }
        let mut row = info.row;
        for key in ["title", "titleDirty", "groupId", "orderNum", "archived"] {
            if let Some(value) = patch.get(key) {
                row[key] = value.clone();
            }
        }
        row["updateTime"] = json!(chrono::Utc::now().timestamp_millis());
        self.save_row(&row)?;
        self.info(id)
    }
    pub fn remove(&self, id: &str, revision: &str) -> Result<(), String> {
        let info = self.info(id)?;
        if info.revision != revision {
            return Err("AI_SESSION_REVISION_CONFLICT:会话版本已变化".into());
        }
        let filename = info.row["sessionFile"].as_str().unwrap();
        self.transact(
            id,
            filename,
            None,
            Some(&self.path(&info.row)?),
            &[],
            &uuid::Uuid::new_v4().to_string(),
        )
    }
    pub fn list(
        &self,
        scope: Option<&str>,
        domain_ref: Option<&str>,
        filter_domain: bool,
        archived: bool,
        offset: u64,
        limit: u64,
    ) -> Result<Value, String> {
        let connection = self.connection()?;
        let mut statement = connection.prepare("SELECT id FROM chat_session WHERE (?1 IS NULL OR scope=?1) AND (NOT ?2 OR domain_ref IS ?3) AND (?4 OR archived=0) ORDER BY update_time DESC,id DESC LIMIT ?5 OFFSET ?6").map_err(failure)?;
        let ids = statement
            .query_map(
                params![
                    scope,
                    filter_domain,
                    domain_ref,
                    archived,
                    limit.clamp(1, 100),
                    offset
                ],
                |row| row.get::<_, String>(0),
            )
            .map_err(failure)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(failure)?;
        let rows = ids
            .iter()
            .map(|id| self.row(id))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(
            json!({"items":rows,"nextOffset":offset+rows.len() as u64,"hasMore":rows.len() as u64 == limit.clamp(1,100)}),
        )
    }
    pub fn sync_files(&self) -> Result<Vec<String>, String> {
        self.recover()?;
        let connection = self.connection()?;
        let mut query = connection
            .prepare("SELECT id FROM chat_session")
            .map_err(failure)?;
        let ids = query
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(failure)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(failure)?;
        for id in ids {
            self.info(&id)?;
        }
        let directory = self.directory()?;
        if !directory.exists() {
            return Ok(Vec::new());
        }
        let mut files = fs::read_dir(directory)
            .map_err(failure)?
            .map(|entry| entry.map_err(failure))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().to_string();
                name.ends_with(".jsonl").then_some(name)
            })
            .collect::<Vec<_>>();
        files.sort();
        Ok(files)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(Store);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0.root);
        }
    }
    fn fixture() -> Fixture {
        let root = std::env::temp_dir().join(format!("ai-store-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let store = Store {
            root,
            database: "data.db".into(),
        };
        store.connection().unwrap().execute_batch("CREATE TABLE chat_session(id TEXT PRIMARY KEY,scope TEXT NOT NULL,domain_ref TEXT,session_file TEXT NOT NULL,cwd TEXT NOT NULL DEFAULT '',title TEXT NOT NULL DEFAULT '',title_dirty INTEGER NOT NULL DEFAULT 0,group_id INTEGER,order_num INTEGER,archived INTEGER NOT NULL DEFAULT 0,source TEXT NOT NULL DEFAULT 'desktop',message_count INTEGER NOT NULL DEFAULT 0,create_time INTEGER NOT NULL,update_time INTEGER NOT NULL);").unwrap();
        store.create(CreateSession{id:"session-1".into(),scope:"main-chat".into(),domain_ref:None,title:Some("验证会话".into()),cwd:None,header:json!({"type":"session","version":3,"id":"session-1","timestamp":"2026-10-29T00:00:00Z","cwd":""})}).unwrap();
        Fixture(store)
    }
    #[test]
    fn real_sqlite_session_cas_idempotency_and_branch_count() {
        let fixture = fixture();
        let store = &fixture.0;
        let first = store.info("session-1").unwrap();
        let user = json!({"type":"message","id":"user-1","parentId":null,"timestamp":"2026-10-29T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"中文问题"}]}});
        let request = || CommitSession {
            session_id: "session-1".into(),
            operation_id: "run-1:user-1".into(),
            expected_revision: first.revision.clone(),
            entries: vec![user.clone()],
        };
        let second = store.commit(request()).unwrap();
        assert_eq!(second.row["messageCount"], 1);
        assert_eq!(store.commit(request()).unwrap().revision, second.revision);
        assert!(store
            .commit(CommitSession {
                session_id: "session-1".into(),
                operation_id: "bad".into(),
                expected_revision: first.revision,
                entries: vec![
                    json!({"type":"custom","customType":"bad","id":"bad-1","parentId":"user-1"})
                ]
            })
            .unwrap_err()
            .contains("REVISION_CONFLICT"));
        let omit = json!({"type":"context_edit","id":"omit-1","parentId":"user-1","targetId":"user-1","replacement":null,"timestamp":"2026-10-29T00:00:01Z"});
        let third = store
            .commit(CommitSession {
                session_id: "session-1".into(),
                operation_id: "operation-2".into(),
                expected_revision: second.revision,
                entries: vec![omit],
            })
            .unwrap();
        assert_eq!(third.row["messageCount"], 0);
        let chunk = store.read("session-1", 0).unwrap();
        assert!(chunk.eof);
        let decoded = crate::plugin_files::decode_chunk(&chunk.data).unwrap();
        assert!(String::from_utf8(decoded).unwrap().contains("中文问题"));
        assert!(store
            .patch("session-1", "old", json!({"title":"不应修改"}))
            .is_err());
        assert_eq!(store.sync_files().unwrap().len(), 1);
    }
    #[test]
    fn recovery_finishes_catalog_write_after_file_was_committed() {
        let fixture = fixture();
        let store = &fixture.0;
        let before = store.info("session-1").unwrap();
        let target = store.path(&before.row).unwrap();
        let directory = store.journal_dir();
        fs::create_dir_all(&directory).unwrap();
        let stage = directory.join("recover-stage");
        fs::copy(&target, &stage).unwrap();
        let message = json!({"type":"message","id":"recover-user","parentId":null,"timestamp":"2026-10-29T00:00:00Z","message":{"role":"user","content":"待恢复"}});
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&stage)
            .unwrap();
        writeln!(file, "{message}").unwrap();
        file.sync_all().unwrap();
        let mut row = before.row;
        row["messageCount"] = json!(1);
        let journal = Journal {
            session_id: "session-1".into(),
            file_name: row["sessionFile"].as_str().unwrap().into(),
            staged_name: "recover-stage".into(),
            row: Some(row),
            expected_hash: Some(file_hash(&target).unwrap()),
            after_hash: Some(file_hash(&stage).unwrap()),
            previous_row: None,
        };
        serde_json::to_writer(
            File::create(directory.join("recover.json")).unwrap(),
            &journal,
        )
        .unwrap();
        fs::rename(&stage, &target).unwrap();
        assert_eq!(store.row("session-1").unwrap()["messageCount"], 0);
        store.recover().unwrap();
        assert_eq!(store.row("session-1").unwrap()["messageCount"], 1);
        store.recover().unwrap();
        assert_eq!(entries(&target).unwrap().len(), 2);
    }
    #[test]
    fn missing_files_do_not_become_empty_sync_manifests_and_delete_is_backed_up() {
        let fixture = fixture();
        let store = &fixture.0;
        let info = store.info("session-1").unwrap();
        let target = store.path(&info.row).unwrap();
        fs::rename(&target, target.with_extension("saved")).unwrap();
        assert!(store.sync_files().unwrap_err().contains("FILE_MISSING"));
        fs::rename(target.with_extension("saved"), &target).unwrap();
        store.remove("session-1", &info.revision).unwrap();
        assert!(store.row("session-1").is_err());
        assert_eq!(
            fs::read_dir(store.root.join("backup/ai-sessions"))
                .unwrap()
                .count(),
            2
        );
        assert!(safe_id("../escape").is_err());
        assert!(safe_file("../file.jsonl").is_err());
        assert_ne!(
            session_dir(&store.root, "data.db").unwrap(),
            session_dir(&store.root, "data.db.db").unwrap()
        );
        assert!(session_dir(&store.root, ".db").is_err());
    }
    #[test]
    fn unchanged_digest_uses_cache_without_reading_file_body() {
        let fixture = fixture();
        let path = fixture.0.root.join("cached.jsonl");
        fs::write(&path, b"unchanged-body").unwrap();
        let expected = file_hash(&path).unwrap();
        let actual = file_hash_with(&path, |_| panic!("缓存命中时不得读取文件正文")).unwrap();
        assert_eq!(actual, expected);
    }
    #[test]
    fn same_length_rewrite_invalidates_digest_even_if_mtime_is_restored() {
        let fixture = fixture();
        let path = fixture.0.root.join("rewritten.jsonl");
        fs::write(&path, b"before").unwrap();
        #[cfg(unix)]
        let modified = fs::metadata(&path).unwrap().modified().unwrap();
        let before = file_hash(&path).unwrap();
        fs::write(&path, b"after!").unwrap();
        #[cfg(unix)]
        File::open(&path)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
        let after = file_hash(&path).unwrap();
        assert_ne!(after, before);
        assert_eq!(after, format!("{:x}", Sha256::digest(b"after!")));
    }
    #[test]
    fn atomic_replacement_deletion_and_restore_do_not_reuse_stale_digest() {
        let fixture = fixture();
        let path = fixture.0.root.join("replaced.jsonl");
        let backup = fixture.0.root.join("original.backup");
        let incoming = fixture.0.root.join("incoming.file");
        fs::write(&path, b"before").unwrap();
        #[cfg(unix)]
        let modified = fs::metadata(&path).unwrap().modified().unwrap();
        let before = file_hash(&path).unwrap();
        fs::write(&incoming, b"after!").unwrap();
        #[cfg(unix)]
        File::open(&incoming)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
        fs::rename(&path, &backup).unwrap();
        fs::rename(&incoming, &path).unwrap();
        assert_eq!(
            file_hash(&path).unwrap(),
            format!("{:x}", Sha256::digest(b"after!"))
        );
        fs::remove_file(&path).unwrap();
        assert!(file_hash(&path).is_err());
        fs::rename(&backup, &path).unwrap();
        assert_eq!(file_hash(&path).unwrap(), before);
    }
    #[test]
    fn mutation_during_hash_is_detected_before_caching() {
        use std::cell::Cell;
        let fixture = fixture();
        let path = fixture.0.root.join("changing.jsonl");
        fs::write(&path, b"before").unwrap();
        let reads = Cell::new(0);
        let actual = file_hash_with(&path, |file| {
            let hash = hash_reader(file)?;
            reads.set(reads.get() + 1);
            if reads.get() == 1 {
                fs::write(&path, b"after!").unwrap();
            }
            Ok(hash)
        })
        .unwrap();
        assert_eq!(reads.get(), 2);
        assert_eq!(actual, format!("{:x}", Sha256::digest(b"after!")));
        assert_eq!(
            file_hash_with(&path, |_| panic!("不应缓存变化前的摘要")).unwrap(),
            actual
        );
    }
    #[test]
    fn digest_cache_is_bounded_and_retains_recently_used_entries() {
        let fixture = fixture();
        let fingerprint =
            FileFingerprint::of(&fs::metadata(fixture.0.root.join("data.db")).unwrap()).unwrap();
        let mut cache = HashCache::default();
        for index in 0..HASH_CACHE_CAPACITY {
            cache.insert(
                Path::new(&format!("{index}")),
                fingerprint.clone(),
                index.to_string(),
            );
        }
        cache.get(Path::new("0"), &fingerprint).unwrap();
        cache.insert(Path::new("extra"), fingerprint.clone(), "extra".into());
        assert_eq!(cache.entries.len(), HASH_CACHE_CAPACITY);
        assert_eq!(
            cache.get(Path::new("0"), &fingerprint).as_deref(),
            Some("0")
        );
        assert!(cache.get(Path::new("1"), &fingerprint).is_none());
    }
}
