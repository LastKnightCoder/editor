use crate::plugin_files::TemporaryFile;
use crate::plugin_provider::PluginProvider;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::OnceLock;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Protocol {
    pub format: String,
    pub version: u64,
    pub chunk_bytes: usize,
    pub manifest_bytes: usize,
    pub namespace: String,
}
pub(crate) fn protocol() -> &'static Protocol {
    static VALUE: OnceLock<Protocol> = OnceLock::new();
    VALUE.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../../packages/db-schema/storage-protocol.json"
        ))
        .expect("共享分块协议有效")
    })
}
pub(crate) fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(crate) fn resource_prefix() -> String {
    format!("{}/resources/", protocol().namespace)
}
pub(crate) fn resource_object(name: &str) -> String {
    {
        let digest = hash(name.as_bytes());
        format!(
            "{}{}/{}.json",
            resource_prefix(),
            &digest[..2],
            &digest[2..]
        )
    }
}
/// 数据库在云端的固定位置，与 TS 的 databaseSyncObjects 一致；上传即按名覆盖。
fn database_root(name: &str) -> String {
    format!(
        "{}/databases/{}",
        protocol().namespace,
        hash(name.as_bytes())
    )
}
pub(crate) fn database_version_object(name: &str) -> String {
    format!("{}/version.json", database_root(name))
}
pub(crate) fn database_file_object(name: &str) -> String {
    format!("{}/data.db", database_root(name))
}
pub(crate) fn database_sessions_object(name: &str) -> String {
    format!("{}/sessions.json", database_root(name))
}
pub(crate) fn database_session_object(name: &str, file: &str) -> Result<String, String> {
    crate::ai::store::safe_file(file)?;
    Ok(format!("{}/sessions/{file}", database_root(name)))
}
fn chunk_object(hash: &str) -> String {
    format!(
        "{}/chunks/{}/{}.bin",
        protocol().namespace,
        &hash[..2],
        &hash[2..]
    )
}
pub(crate) fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && !matches!(name, "." | "..")
        && !name
            .chars()
            .any(|c| c == '/' || c == '\\' || c.is_control())
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Chunk {
    size: u64,
    sha256: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Manifest {
    format: String,
    version: u64,
    pub name: String,
    pub size: u64,
    root_hash: String,
    chunks: Vec<Chunk>,
}
impl Manifest {
    fn root_payload(&self) -> Vec<u8> {
        let mut text = format!(
            "{}:{}\n{}\n{}\n",
            protocol().format,
            protocol().version,
            self.name,
            self.size
        );
        for chunk in &self.chunks {
            text.push_str(&format!("{}:{}\n", chunk.size, chunk.sha256));
        }
        text.into_bytes()
    }
    pub(crate) fn parse(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() > protocol().manifest_bytes {
            return Err("同步文件清单过大".into());
        }
        let value: Self =
            serde_json::from_slice(bytes).map_err(|e| format!("同步清单解析失败: {e}"))?;
        if value.format != protocol().format
            || value.version != protocol().version
            || !valid_name(&value.name)
            || value.size > 9_007_199_254_740_991
        {
            return Err("同步文件清单格式无效".into());
        }
        let mut total = 0u64;
        for (index, chunk) in value.chunks.iter().enumerate() {
            if chunk.size == 0
                || chunk.size > protocol().chunk_bytes as u64
                || (index + 1 < value.chunks.len() && chunk.size != protocol().chunk_bytes as u64)
                || chunk.sha256.len() != 64
                || !chunk
                    .sha256
                    .bytes()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
            {
                return Err("同步分块描述无效".into());
            }
            total = total.checked_add(chunk.size).ok_or("同步文件长度无效")?;
        }
        if total != value.size || hash(&value.root_payload()) != value.root_hash {
            return Err("同步清单长度或校验值不匹配".into());
        }
        Ok(value)
    }
}
trait ObjectStore {
    async fn exists(&self, _object: &str) -> Result<bool, String> {
        Ok(false)
    }
    async fn put(&self, object: &str, bytes: &[u8]) -> Result<(), String>;
    async fn get(&self, object: &str, limit: u64) -> Result<Vec<u8>, String>;
}
impl ObjectStore for PluginProvider {
    async fn exists(&self, object: &str) -> Result<bool, String> {
        self.call("fileExists", Some(object), None)
            .await?
            .as_bool()
            .ok_or_else(|| "同步对象存在状态无效".into())
    }
    async fn put(&self, object: &str, bytes: &[u8]) -> Result<(), String> {
        if self.call("uploadFile", Some(object), Some(bytes)).await? != true {
            return Err("同步对象上传失败".into());
        }
        Ok(())
    }
    async fn get(&self, object: &str, limit: u64) -> Result<Vec<u8>, String> {
        self.download_object(object, limit).await
    }
}
async fn upload_chunks(
    store: &impl ObjectStore,
    object: &str,
    name: &str,
    file: &mut File,
    check: impl Fn() -> Result<(), String>,
) -> Result<Manifest, String> {
    if !valid_name(name) {
        return Err("同步文件名无效".into());
    }
    let before = file.metadata().map_err(|e| e.to_string())?;
    let mut manifest = Manifest {
        format: protocol().format.clone(),
        version: protocol().version,
        name: name.into(),
        size: before.len(),
        root_hash: String::new(),
        chunks: vec![],
    };
    let mut remaining = before.len();
    while remaining > 0 {
        check()?;
        let length = remaining.min(protocol().chunk_bytes as u64) as usize;
        let mut bytes = vec![0; length];
        file.read_exact(&mut bytes).map_err(|e| e.to_string())?;
        let sha256 = hash(&bytes);
        let key = chunk_object(&sha256);
        let reusable = if store.exists(&key).await? {
            let existing = store.get(&key, protocol().chunk_bytes as u64).await?;
            existing.len() == length && hash(&existing) == sha256
        } else {
            false
        };
        if !reusable {
            store.put(&key, &bytes).await?;
        }
        manifest.chunks.push(Chunk {
            size: length as u64,
            sha256,
        });
        remaining -= length as u64;
        if manifest.chunks.len() * 100 > protocol().manifest_bytes {
            return Err("同步文件清单过大".into());
        }
    }
    let after = file.metadata().map_err(|e| e.to_string())?;
    if after.len() != before.len() || after.modified().ok() != before.modified().ok() {
        return Err("同步期间本地文件已变化".into());
    }
    manifest.root_hash = hash(&manifest.root_payload());
    let bytes = serde_json::to_vec(&manifest).map_err(|e| e.to_string())?;
    if bytes.len() > protocol().manifest_bytes {
        return Err("同步文件清单过大".into());
    }
    check()?;
    store.put(object, &bytes).await?;
    Ok(manifest)
}
async fn download_chunks(
    store: &impl ObjectStore,
    object: &str,
    file: &mut File,
    check: impl Fn() -> Result<(), String>,
) -> Result<Manifest, String> {
    check()?;
    let manifest = Manifest::parse(&store.get(object, protocol().manifest_bytes as u64).await?)?;
    for chunk in &manifest.chunks {
        check()?;
        let bytes = store
            .get(&chunk_object(&chunk.sha256), protocol().chunk_bytes as u64)
            .await?;
        if bytes.len() as u64 != chunk.size || hash(&bytes) != chunk.sha256 {
            return Err("同步分块内容校验失败".into());
        }
        file.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    check()?;
    file.sync_all().map_err(|e| e.to_string())?;
    Ok(manifest)
}
fn resource_check() -> Result<(), String> {
    if crate::sync::should_cancel_resource_sync() {
        Err("资源同步已取消".into())
    } else {
        Ok(())
    }
}
impl PluginProvider {
    pub(crate) async fn upload_chunked(
        &self,
        object: &str,
        name: &str,
        path: &Path,
    ) -> Result<(), String> {
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        upload_chunks(self, object, name, &mut file, || Ok(()))
            .await
            .map(|_| ())
    }
    pub(crate) async fn upload_chunked_named(
        &self,
        object: &str,
        name: &str,
        path: &Path,
    ) -> Result<(), String> {
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        upload_chunks(self, object, name, &mut file, resource_check)
            .await
            .map(|_| ())
    }
    pub(crate) async fn chunk_manifest(&self, object: &str) -> Result<Manifest, String> {
        Manifest::parse(&self.download_bytes(object).await?)
    }
    pub(crate) async fn download_chunked(&self, object: &str) -> Result<TemporaryFile, String> {
        self.download_checked(object, None, || Ok(())).await
    }
    pub(crate) async fn download_resource_chunked(
        &self,
        object: &str,
        name: &str,
    ) -> Result<TemporaryFile, String> {
        self.download_checked(object, Some(name), resource_check)
            .await
    }
    async fn download_checked(
        &self,
        object: &str,
        expected_name: Option<&str>,
        check: impl Fn() -> Result<(), String>,
    ) -> Result<TemporaryFile, String> {
        let temp = self.new_temporary()?;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .open(&temp.path)
            .map_err(|e| e.to_string())?;
        let manifest = download_chunks(self, object, &mut file, check).await?;
        if expected_name.is_some_and(|name| manifest.name != name) {
            return Err("资源文件身份不匹配".into());
        }
        Ok(temp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    struct DiskStore {
        root: std::path::PathBuf,
        max: Cell<usize>,
        fail: Cell<bool>,
    }
    impl ObjectStore for DiskStore {
        async fn put(&self, object: &str, bytes: &[u8]) -> Result<(), String> {
            self.max.set(self.max.get().max(bytes.len()));
            if self.fail.get() {
                return Err("断网".into());
            }
            let path = self.root.join(object);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, bytes).map_err(|e| e.to_string())
        }
        async fn get(&self, object: &str, limit: u64) -> Result<Vec<u8>, String> {
            let path = self.root.join(object);
            if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > limit {
                return Err("对象过大".into());
            }
            let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
            self.max.set(self.max.get().max(bytes.len()));
            Ok(bytes)
        }
    }
    #[test]
    fn shares_manifest_fixture_and_object_names_with_typescript() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../packages/db-schema/fixtures/chunked-storage-v1.json"
        ))
        .unwrap();
        let bytes = serde_json::to_vec(&fixture["manifest"]).unwrap();
        let manifest = Manifest::parse(&bytes).unwrap();
        assert_eq!(resource_object(&manifest.name), fixture["resourceObject"]);
        assert_eq!(
            database_version_object(fixture["databaseName"].as_str().unwrap()),
            fixture["versionObject"]
        );
        let mut corrupt = fixture["manifest"].clone();
        corrupt["size"] = serde_json::json!(5);
        assert!(Manifest::parse(&serde_json::to_vec(&corrupt).unwrap()).is_err());
        corrupt["size"] = serde_json::json!(4);
        corrupt["name"] = serde_json::json!("../escape");
        assert!(Manifest::parse(&serde_json::to_vec(&corrupt).unwrap()).is_err());
    }
    #[tokio::test]
    async fn cross_runtime_reads_typescript_and_exports_rust_chunks() {
        let Ok(directory) = std::env::var("TAU_CHUNK_INTEROP_DIR") else {
            return;
        };
        let root = std::path::PathBuf::from(directory);
        let store = DiskStore {
            root: root.clone(),
            max: Cell::new(0),
            fail: Cell::new(false),
        };
        let mut result = File::create(root.join("typescript-received.bin")).unwrap();
        let manifest = download_chunks(&store, "typescript.json", &mut result, || Ok(()))
            .await
            .unwrap();
        assert_eq!(manifest.size, protocol().chunk_bytes as u64 + 3);
        assert_eq!(manifest.chunks.len(), 2);
        let source = root.join("rust.bin");
        std::fs::write(&source, b"Rust to TypeScript").unwrap();
        upload_chunks(
            &store,
            "rust.json",
            "rust.bin",
            &mut File::open(source).unwrap(),
            || Ok(()),
        )
        .await
        .unwrap();
        assert!(store.max.get() <= protocol().chunk_bytes);
    }

    #[tokio::test]
    async fn large_file_roundtrip_is_bounded_and_failure_does_not_publish_manifest() {
        let root =
            std::env::temp_dir().join(format!("tau-chunk-roundtrip-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("source.bin");
        let mut input = File::create(&source).unwrap();
        let length = 129 * 1024 * 1024 + 23;
        let block = vec![19; protocol().chunk_bytes];
        for offset in (0..length).step_by(block.len()) {
            input
                .write_all(&block[..(length - offset).min(block.len())])
                .unwrap();
        }
        drop(block);
        drop(input);
        let store = DiskStore {
            root: root.join("remote"),
            max: Cell::new(0),
            fail: Cell::new(false),
        };
        let object = database_file_object("roundtrip.db");
        let mut input = File::open(&source).unwrap();
        let manifest = upload_chunks(&store, &object, "source.bin", &mut input, || Ok(()))
            .await
            .unwrap();
        assert_eq!(manifest.size, length as u64);
        assert_eq!(manifest.chunks.len(), 17);
        let mut output = File::create(root.join("result.bin")).unwrap();
        download_chunks(&store, &object, &mut output, || Ok(()))
            .await
            .unwrap();
        assert_eq!(output.metadata().unwrap().len(), length as u64);
        assert!(store.max.get() <= protocol().chunk_bytes);
        let failed = database_file_object("failed.db");
        store.fail.set(true);
        let mut input = File::open(&source).unwrap();
        assert!(
            upload_chunks(&store, &failed, "source.bin", &mut input, || Ok(()))
                .await
                .is_err()
        );
        assert!(!store.root.join(&failed).exists());
        store.fail.set(false);
        std::fs::write(
            store.root.join(chunk_object(&manifest.chunks[0].sha256)),
            [0],
        )
        .unwrap();
        let mut output = File::create(root.join("bad.bin")).unwrap();
        assert!(download_chunks(&store, &object, &mut output, || Ok(()))
            .await
            .is_err());
        let mut input = File::open(&source).unwrap();
        assert!(
            upload_chunks(&store, &failed, "source.bin", &mut input, || Err(
                "已取消".into()
            ))
            .await
            .is_err()
        );
        assert!(!store.root.join(&failed).exists());
        drop(input);
        drop(output);
        std::fs::remove_dir_all(root).unwrap();
    }
}
