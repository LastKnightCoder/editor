use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs::{File, OpenOptions},
    io::{BufReader, Read, Seek, SeekFrom, Write},
    path::PathBuf,
};

pub const CHUNK_BYTES: usize = 256 * 1024;
pub const CONCURRENCY: usize = 2;
fn err(error: impl std::fmt::Display) -> String {
    format!("DEVICE_SYNC_TRANSFER: {error}")
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Descriptor {
    pub id: String,
    pub size: u64,
    pub sha256: String,
}
impl Descriptor {
    pub fn validate(&self) -> Result<(), String> {
        if self.id.is_empty()
            || self.size == 0
            || self.size > 9_007_199_254_740_991
            || self.sha256.len() != 64
            || !self.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(err("文件清单无效"));
        }
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
pub struct Chunk {
    pub offset: u64,
    pub bytes: String,
    pub sha256: String,
}
pub struct TransferFile {
    path: PathBuf,
    pub descriptor: Descriptor,
    received: BTreeSet<u64>,
}
impl Drop for TransferFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}
impl TransferFile {
    pub fn begin(descriptor: Descriptor) -> Result<Self, String> {
        descriptor.validate()?;
        let path =
            std::env::temp_dir().join(format!("tau-device-transfer-{}.bin", uuid::Uuid::new_v4()));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        options.open(&path).map_err(err)?;
        Ok(Self {
            path,
            descriptor,
            received: BTreeSet::new(),
        })
    }
    pub fn publish(bytes: &[u8]) -> Result<Self, String> {
        let result = Self::begin(Descriptor {
            id: uuid::Uuid::new_v4().to_string(),
            size: bytes.len() as u64,
            sha256: format!("{:x}", Sha256::digest(bytes)),
        })?;
        std::fs::write(&result.path, bytes).map_err(err)?;
        Ok(result)
    }
    pub fn read(&self, offset: u64) -> Result<Chunk, String> {
        let count = self.chunk_size(offset)?;
        let mut file = File::open(&self.path).map_err(err)?;
        let mut bytes = vec![0; count];
        file.seek(SeekFrom::Start(offset))
            .and_then(|_| file.read_exact(&mut bytes))
            .map_err(err)?;
        Ok(Chunk {
            offset,
            sha256: format!("{:x}", Sha256::digest(&bytes)),
            bytes: STANDARD.encode(bytes),
        })
    }
    fn chunk_size(&self, offset: u64) -> Result<usize, String> {
        if offset >= self.descriptor.size || offset % CHUNK_BYTES as u64 != 0 {
            return Err(err("文件分块偏移无效"));
        }
        Ok((self.descriptor.size - offset).min(CHUNK_BYTES as u64) as usize)
    }
    pub fn write(&mut self, chunk: Chunk) -> Result<(), String> {
        let count = self.chunk_size(chunk.offset)?;
        if chunk.bytes.len() > CHUNK_BYTES.div_ceil(3) * 4 {
            return Err(err("文件分块过大"));
        }
        let bytes = STANDARD.decode(&chunk.bytes).map_err(err)?;
        if bytes.len() != count || format!("{:x}", Sha256::digest(&bytes)) != chunk.sha256 {
            return Err(err("文件分块校验失败"));
        }
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&self.path)
            .map_err(err)?;
        file.seek(SeekFrom::Start(chunk.offset)).map_err(err)?;
        if self.received.contains(&chunk.offset) {
            let mut original = vec![0; count];
            file.read_exact(&mut original).map_err(err)?;
            if original != bytes {
                return Err(err("重复文件分块不一致"));
            }
        } else {
            file.write_all(&bytes).map_err(err)?;
            self.received.insert(chunk.offset);
        }
        Ok(())
    }
    pub fn consume(self) -> Result<Value, String> {
        if self.received.len() as u64 != self.descriptor.size.div_ceil(CHUNK_BYTES as u64) {
            return Err(err("文件分块尚未收齐"));
        }
        let file = File::open(&self.path).map_err(err)?;
        if file.metadata().map_err(err)?.len() != self.descriptor.size {
            return Err(err("文件长度不匹配"));
        }
        file.sync_all().map_err(err)?;
        let mut reader = BufReader::new(file);
        let mut hash = Sha256::new();
        let mut buffer = vec![0; CHUNK_BYTES];
        loop {
            let count = reader.read(&mut buffer).map_err(err)?;
            if count == 0 {
                break;
            }
            hash.update(&buffer[..count]);
        }
        if format!("{:x}", hash.finalize()) != self.descriptor.sha256 {
            return Err(err("完整文件校验失败"));
        }
        reader.seek(SeekFrom::Start(0)).map_err(err)?;
        serde_json::from_reader(reader).map_err(err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn out_of_order_and_duplicates() {
        let value = serde_json::json!({"text":"资料🚀".repeat(CHUNK_BYTES)});
        let source = TransferFile::publish(&serde_json::to_vec(&value).unwrap()).unwrap();
        let mut receiver = TransferFile::begin(source.descriptor.clone()).unwrap();
        let offsets = (0..source.descriptor.size)
            .step_by(CHUNK_BYTES)
            .collect::<Vec<_>>();
        for offset in offsets.into_iter().rev() {
            receiver.write(source.read(offset).unwrap()).unwrap();
            receiver.write(source.read(offset).unwrap()).unwrap();
        }
        let path = receiver.path.clone();
        assert_eq!(receiver.consume().unwrap(), value);
        assert!(!path.exists());
    }
    #[test]
    fn missing_corrupt_and_hash_mismatch() {
        let source = TransferFile::publish(
            &serde_json::to_vec(&serde_json::json!({"x":"a".repeat(CHUNK_BYTES)})).unwrap(),
        )
        .unwrap();
        let receiver = TransferFile::begin(source.descriptor.clone()).unwrap();
        let path = receiver.path.clone();
        assert!(receiver
            .consume()
            .unwrap_err()
            .contains("DEVICE_SYNC_TRANSFER"));
        assert!(!path.exists());
        let mut receiver = TransferFile::begin(source.descriptor.clone()).unwrap();
        let mut chunk = source.read(0).unwrap();
        chunk.sha256 = "0".repeat(64);
        assert!(receiver.write(chunk).is_err());
        let mut wrong = source.descriptor.clone();
        wrong.sha256 = "0".repeat(64);
        let mut receiver = TransferFile::begin(wrong).unwrap();
        for offset in (0..source.descriptor.size).step_by(CHUNK_BYTES) {
            receiver.write(source.read(offset).unwrap()).unwrap();
        }
        assert!(receiver
            .consume()
            .unwrap_err()
            .contains("DEVICE_SYNC_TRANSFER"));
    }
}
