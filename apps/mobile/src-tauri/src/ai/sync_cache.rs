use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::store::{safe_file, session_dir, FileFingerprint};

#[derive(Serialize, Deserialize)]
struct Cache {
    version: u64,
    files: BTreeMap<String, FileFingerprint>,
}

pub(crate) struct UploadPlan {
    cache_path: PathBuf,
    directory: PathBuf,
    files: BTreeMap<String, FileFingerprint>,
    pub pending: Vec<String>,
}

fn fingerprint(path: &Path) -> Result<FileFingerprint, String> {
    let metadata = path.symlink_metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("AI_SESSION_INVALID:同步记录不允许符号链接或目录".into());
    }
    FileFingerprint::of(&metadata)
}

impl UploadPlan {
    pub fn prepare(
        root: &Path,
        database: &str,
        target: &str,
        remote_version: u64,
        files: &[String],
    ) -> Result<Self, String> {
        let directory = session_dir(root, database)?;
        let key = crate::chunked_sync::hash(
            &serde_json::to_vec(&(database, target)).map_err(|error| error.to_string())?,
        );
        let cache_path = root
            .join("sync-status")
            .join(format!("database-sessions-{key}.json"));
        let cached = fs::read(&cache_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Cache>(&bytes).ok())
            .filter(|cache| remote_version > 0 && cache.version == remote_version);
        let mut fingerprints = BTreeMap::new();
        let mut pending = Vec::new();
        for name in files {
            safe_file(name)?;
            let value = fingerprint(&directory.join(name))?;
            if cached.as_ref().and_then(|cache| cache.files.get(name)) != Some(&value) {
                pending.push(name.clone());
            }
            fingerprints.insert(name.clone(), value);
        }
        Ok(Self {
            cache_path,
            directory,
            files: fingerprints,
            pending,
        })
    }

    pub fn invalidate(&self) -> Result<(), String> {
        match fs::remove_file(&self.cache_path) {
            Ok(()) => super::store::sync_directory(
                self.cache_path.parent().ok_or("会话同步缓存路径无效")?,
            ),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("清理会话同步缓存失败: {error}")),
        }
    }

    pub fn verify(&self) -> Result<(), String> {
        for (name, before) in &self.files {
            if &fingerprint(&self.directory.join(name))? != before {
                return Err("AI_SESSION_CHANGED:同步期间本地会话已变化".into());
            }
        }
        Ok(())
    }

    pub fn commit(&self, version: u64) -> Result<(), String> {
        self.verify()?;
        let cache = Cache {
            version,
            files: self.files.clone(),
        };
        let directory = self.cache_path.parent().ok_or("会话同步缓存路径无效")?;
        let temporary = crate::plugin_files::TemporaryFile::new_in(directory)?;
        fs::write(
            &temporary.path,
            serde_json::to_vec(&cache).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        fs::File::open(&temporary.path)
            .and_then(|file| file.sync_all())
            .map_err(|error| error.to_string())?;
        fs::rename(&temporary.path, &self.cache_path).map_err(|error| error.to_string())?;
        super::store::sync_directory(directory)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(PathBuf);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn fixture() -> Fixture {
        let root = std::env::temp_dir().join(format!("tau-sync-cache-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(session_dir(&root, "data.db").unwrap()).unwrap();
        Fixture(root)
    }

    #[test]
    fn unchanged_files_skip_only_for_the_confirmed_target_and_remote_version() {
        let fixture = fixture();
        let files = vec!["one.jsonl".into(), "two.jsonl".into()];
        let directory = session_dir(&fixture.0, "data.db").unwrap();
        fs::write(directory.join("one.jsonl"), b"one").unwrap();
        fs::write(directory.join("two.jsonl"), b"two").unwrap();
        let plan = UploadPlan::prepare(&fixture.0, "data.db", "target-a", 8, &files).unwrap();
        assert_eq!(plan.pending, files);
        plan.commit(9).unwrap();
        assert!(
            UploadPlan::prepare(&fixture.0, "data.db", "target-a", 9, &files)
                .unwrap()
                .pending
                .is_empty()
        );
        assert_eq!(
            UploadPlan::prepare(&fixture.0, "data.db", "target-a", 10, &files)
                .unwrap()
                .pending,
            files
        );
        assert_eq!(
            UploadPlan::prepare(&fixture.0, "data.db", "target-b", 9, &files)
                .unwrap()
                .pending,
            files
        );

        let path = directory.join("one.jsonl");
        let modified = fs::metadata(&path).unwrap().modified().unwrap();
        fs::write(&path, b"new").unwrap();
        #[cfg(unix)]
        fs::File::open(&path)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
        assert!(plan.verify().is_err());
        let changed = UploadPlan::prepare(&fixture.0, "data.db", "target-a", 9, &files).unwrap();
        assert_eq!(changed.pending, vec!["one.jsonl"]);
        changed.invalidate().unwrap();
        assert_eq!(
            UploadPlan::prepare(&fixture.0, "data.db", "target-a", 9, &files)
                .unwrap()
                .pending,
            files
        );
    }

    #[test]
    fn corrupt_cache_new_deleted_and_missing_files_do_not_create_false_hits() {
        let fixture = fixture();
        let directory = session_dir(&fixture.0, "data.db").unwrap();
        fs::write(directory.join("one.jsonl"), b"one").unwrap();
        let files = vec!["one.jsonl".into()];
        let plan = UploadPlan::prepare(&fixture.0, "data.db", "target", 8, &files).unwrap();
        plan.commit(9).unwrap();
        fs::write(directory.join("new.jsonl"), b"new").unwrap();
        let mut expanded = files.clone();
        expanded.push("new.jsonl".into());
        assert_eq!(
            UploadPlan::prepare(&fixture.0, "data.db", "target", 9, &expanded)
                .unwrap()
                .pending,
            vec!["new.jsonl"]
        );
        fs::write(&plan.cache_path, b"broken").unwrap();
        assert_eq!(
            UploadPlan::prepare(&fixture.0, "data.db", "target", 9, &files)
                .unwrap()
                .pending,
            files
        );
        plan.commit(9).unwrap();
        let empty = UploadPlan::prepare(&fixture.0, "data.db", "target", 9, &[]).unwrap();
        empty.commit(10).unwrap();
        let cache: Cache = serde_json::from_slice(&fs::read(&plan.cache_path).unwrap()).unwrap();
        assert!(cache.files.is_empty());
        fs::remove_file(directory.join("one.jsonl")).unwrap();
        assert!(UploadPlan::prepare(&fixture.0, "data.db", "target", 10, &files).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn replacing_a_file_or_using_a_symlink_cannot_reuse_its_cache_entry() {
        let fixture = fixture();
        let directory = session_dir(&fixture.0, "data.db").unwrap();
        let local = directory.join("one.jsonl");
        fs::write(&local, b"one").unwrap();
        let files = vec!["one.jsonl".into()];
        let plan = UploadPlan::prepare(&fixture.0, "data.db", "target", 8, &files).unwrap();
        plan.commit(9).unwrap();
        let incoming = directory.join("incoming");
        fs::copy(&local, &incoming).unwrap();
        fs::rename(&incoming, &local).unwrap();
        assert_eq!(
            UploadPlan::prepare(&fixture.0, "data.db", "target", 9, &files)
                .unwrap()
                .pending,
            files
        );
        fs::remove_file(&local).unwrap();
        fs::write(&incoming, b"one").unwrap();
        std::os::unix::fs::symlink(&incoming, &local).unwrap();
        assert!(UploadPlan::prepare(&fixture.0, "data.db", "target", 9, &files).is_err());
    }
}
