use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, WebviewWindow};

use crate::plugins::AiSkillPackage;

const TEXT_LIMIT: u64 = 256 * 1024;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSource {
    plugin_id: String,
    plugin_name: String,
    version: String,
    revision: String,
    kind: &'static str,
    entries: Vec<SkillEntry>,
}
#[derive(Serialize)]
pub struct SkillEntry {
    id: String,
    path: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillReadChunk {
    data: String,
    next_offset: usize,
    eof: bool,
}
fn invalid(message: &str) -> String {
    format!("AI_SKILL_INVALID:{message}")
}
fn skill_ids(manifest: &Value) -> Result<Vec<String>, String> {
    crate::plugins::declared_skill_ids(manifest).map_err(|_| invalid("包的技能目录声明无效"))
}
fn resource_path(package: &AiSkillPackage, path: &str) -> Result<PathBuf, String> {
    if path.is_empty()
        || path.starts_with('/')
        || path.contains(['\\', ':', '%'])
        || path.chars().any(char::is_control)
        || !path.ends_with(".md")
    {
        return Err(invalid("技能只允许原始相对 Markdown 路径"));
    }
    let parts = path.split('/').collect::<Vec<_>>();
    if parts.len() < 3
        || parts[0] != "skills"
        || parts
            .iter()
            .any(|part| part.is_empty() || matches!(*part, "." | ".." | "scripts"))
        || !skill_ids(&package.manifest)?
            .iter()
            .any(|id| id == parts[1])
    {
        return Err(invalid("资料不属于声明的技能目录"));
    }
    let mut current = package.directory.clone();
    let root = fs::canonicalize(&current).map_err(|_| invalid("技能目录不可用"))?;
    for (index, part) in parts.iter().enumerate() {
        current.push(part);
        let metadata = fs::symlink_metadata(&current).map_err(|_| invalid("技能资料不存在"))?;
        if metadata.file_type().is_symlink()
            || if index + 1 == parts.len() {
                !metadata.is_file()
            } else {
                !metadata.is_dir()
            }
        {
            return Err(invalid("技能资料不允许符号链接或不匹配的文件类型"));
        }
    }
    if !fs::canonicalize(&current)
        .map_err(|_| invalid("技能资料不可用"))?
        .starts_with(root)
    {
        return Err(invalid("技能资料越过安装目录"));
    }
    Ok(current)
}
fn read_resource(package: &AiSkillPackage, path: &str) -> Result<String, String> {
    let expected = package.manifest["integrity"]
        .get(path)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("技能资料未声明完整性摘要"))?;
    if expected.len() != 64
        || !expected
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    {
        return Err(invalid("技能资料摘要无效"));
    }
    let target = resource_path(package, path)?;
    let file = fs::File::open(&target).map_err(|_| invalid("技能资料无法读取"))?;
    if file.metadata().map_err(|_| invalid("技能资料无效"))?.len() > TEXT_LIMIT {
        return Err(invalid("技能资料超过 256 KiB"));
    }
    let mut bytes = Vec::new();
    file.take(TEXT_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| invalid("技能资料读取失败"))?;
    if bytes.len() as u64 > TEXT_LIMIT {
        return Err(invalid("技能资料超过 256 KiB"));
    }
    if format!("{:x}", Sha256::digest(&bytes)) != expected {
        return Err(invalid("技能资料完整性校验失败"));
    }
    let text = String::from_utf8(bytes).map_err(|_| invalid("技能资料不是 UTF-8 文本"))?;
    if text.contains('\0') {
        return Err(invalid("技能资料包含二进制内容"));
    }
    Ok(text)
}
fn describe(package: &AiSkillPackage) -> Result<SkillSource, String> {
    let mut entries = Vec::new();
    for id in skill_ids(&package.manifest)? {
        let path = format!("skills/{id}/SKILL.md");
        read_resource(package, &path)?;
        entries.push(SkillEntry { id, path });
    }
    Ok(SkillSource {
        plugin_id: package.manifest["id"]
            .as_str()
            .ok_or_else(|| invalid("插件身份缺失"))?
            .into(),
        plugin_name: package.manifest["name"].as_str().unwrap_or_default().into(),
        version: package.manifest["version"]
            .as_str()
            .ok_or_else(|| invalid("插件版本缺失"))?
            .into(),
        revision: package.revision.clone(),
        kind: package.kind,
        entries,
    })
}
fn read_slice(
    package: &AiSkillPackage,
    revision: &str,
    path: &str,
    offset: usize,
) -> Result<SkillReadChunk, String> {
    if package.revision != revision {
        return Err("AI_SKILL_UNAVAILABLE:技能安装版本已变化".into());
    }
    let text = read_resource(package, path)?;
    let bytes = text.as_bytes();
    if offset > bytes.len() {
        return Err(invalid("技能资料读取位置无效"));
    }
    let end = (offset + 64 * 1024).min(bytes.len());
    Ok(SkillReadChunk {
        data: crate::plugin_files::encode_chunk(&bytes[offset..end]),
        next_offset: end,
        eof: end == bytes.len(),
    })
}

#[tauri::command]
pub fn plugin_ai_skill_sources(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_ids: Vec<String>,
) -> Result<Vec<SkillSource>, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::plugin_transport::with_database(&token, &database, || {
        let mut sources = Vec::new();
        let mut seen = HashSet::new();
        for id in plugin_ids {
            if !seen.insert(id.clone()) {
                continue;
            }
            if let Some(source) = crate::plugins::with_ai_skill_package(&app, &id, describe)? {
                sources.push(source);
            }
        }
        if serde_json::to_vec(&sources)
            .map_err(|_| invalid("技能目录编码失败"))?
            .len()
            > 128 * 1024
        {
            return Err(invalid("技能目录超过当前宿主传输预算"));
        }
        Ok(sources)
    })
}
#[tauri::command]
pub fn plugin_ai_skill_read(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
    revision: String,
    path: String,
    offset: usize,
) -> Result<SkillReadChunk, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::plugin_transport::with_database(&token, &database, || {
        crate::plugins::with_ai_skill_package(&app, &plugin_id, |package| {
            read_slice(package, &revision, &path, offset)
        })?
        .ok_or_else(|| "AI_SKILL_UNAVAILABLE:技能包已停用或不可用".into())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    fn fixture_package(root: &Path, files: &[(&str, &[u8])]) -> AiSkillPackage {
        let mut integrity = serde_json::Map::new();
        for (name, bytes) in files {
            let path = root.join(name);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, bytes).unwrap();
            integrity.insert(
                name.to_string(),
                Value::String(format!("{:x}", Sha256::digest(bytes))),
            );
        }
        AiSkillPackage {
            directory: root.into(),
            manifest: serde_json::json!({"id":"example.skill","name":"技能示例","version":"1.0.0","skills":["summary"],"integrity":integrity}),
            revision: "installed-1".into(),
            kind: "plugin",
        }
    }
    #[test]
    fn declared_markdown_only_and_integrity_size_text_boundaries() {
        let root = std::env::temp_dir().join(format!("plugin-ai-skills-{}", uuid::Uuid::new_v4()));
        let package = fixture_package(
            &root,
            &[
                (
                    "skills/summary/SKILL.md",
                    b"---\nname: summary\ndescription: summary\n---\nRead notes",
                ),
                ("skills/summary/references/guide.md", "中文资料".as_bytes()),
                ("skills/summary/scripts/no.md", b"script"),
            ],
        );
        assert_eq!(describe(&package).unwrap().entries.len(), 1);
        assert_eq!(
            read_resource(&package, "skills/summary/references/guide.md").unwrap(),
            "中文资料"
        );
        for path in [
            "skills/summary/../../secret.md",
            "skills/summary/scripts/no.md",
            "skills/other/SKILL.md",
            "skills/summary/%2e%2e/secret.md",
            "/skills/summary/SKILL.md",
            "skills/summary/missing.md",
        ] {
            assert!(read_resource(&package, path).is_err());
        }
        fs::write(root.join("skills/summary/SKILL.md"), b"changed").unwrap();
        assert!(read_resource(&package, "skills/summary/SKILL.md")
            .unwrap_err()
            .contains("完整性"));
        fs::remove_dir_all(root).unwrap();
        let root = std::env::temp_dir().join(format!("plugin-ai-skills-{}", uuid::Uuid::new_v4()));
        let package = fixture_package(&root, &[("skills/summary/SKILL.md", &[0xff])]);
        assert!(read_resource(&package, "skills/summary/SKILL.md")
            .unwrap_err()
            .contains("UTF-8"));
        fs::remove_dir_all(root).unwrap();
        let root = std::env::temp_dir().join(format!("plugin-ai-skills-{}", uuid::Uuid::new_v4()));
        let package = fixture_package(
            &root,
            &[(
                "skills/summary/SKILL.md",
                &vec![b'x'; TEXT_LIMIT as usize + 1],
            )],
        );
        assert!(read_resource(&package, "skills/summary/SKILL.md")
            .unwrap_err()
            .contains("256 KiB"));
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_file_and_parent_directory() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().join(format!("plugin-ai-symlink-{}", uuid::Uuid::new_v4()));
        let package = fixture_package(
            &root,
            &[
                ("skills/summary/SKILL.md", b"instructions"),
                ("skills/summary/references/info.md", b"reference"),
            ],
        );
        fs::rename(root.join("skills/summary/references"), root.join("outside")).unwrap();
        symlink(root.join("outside"), root.join("skills/summary/references")).unwrap();
        assert!(read_resource(&package, "skills/summary/references/info.md").is_err());
        fs::remove_file(root.join("skills/summary/SKILL.md")).unwrap();
        symlink(
            root.join("outside/info.md"),
            root.join("skills/summary/SKILL.md"),
        )
        .unwrap();
        assert!(read_resource(&package, "skills/summary/SKILL.md").is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn bounded_chunks_keep_utf8_and_stale_generation_fails_before_read() {
        let root = std::env::temp_dir().join(format!("plugin-ai-chunks-{}", uuid::Uuid::new_v4()));
        let text = "中文".repeat(20000);
        let package = fixture_package(&root, &[("skills/summary/SKILL.md", text.as_bytes())]);
        assert!(read_slice(&package, "stale", "skills/summary/SKILL.md", 0).is_err());
        let mut offset = 0;
        let mut bytes = Vec::new();
        loop {
            let chunk =
                read_slice(&package, "installed-1", "skills/summary/SKILL.md", offset).unwrap();
            assert!(chunk.data.len() < 100000);
            bytes.extend(crate::plugin_files::decode_chunk(&chunk.data).unwrap());
            offset = chunk.next_offset;
            if chunk.eof {
                break;
            }
        }
        assert_eq!(String::from_utf8(bytes).unwrap(), text);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn standalone_source_reports_kind_and_never_exposes_bundled_scripts() {
        let root =
            std::env::temp_dir().join(format!("independent-ai-skills-{}", uuid::Uuid::new_v4()));
        let mut package = fixture_package(
            &root,
            &[
                ("skills/summary/SKILL.md", b"Standalone instructions"),
                (
                    "skills/summary/scripts/helper.py",
                    b"raise RuntimeError('must not run')",
                ),
                ("skills/summary/references/guide.md", b"reference"),
            ],
        );
        package.kind = "skills";
        package.manifest["formatVersion"] = serde_json::json!(1);
        package.manifest["apiVersion"] = serde_json::json!(1);
        package.manifest["platform"] = serde_json::json!("portable");
        package.manifest["targets"] = serde_json::json!({"android":{"minAppVersion":"0.2.13"}});
        assert_eq!(describe(&package).unwrap().kind, "skills");
        assert_eq!(
            read_resource(&package, "skills/summary/SKILL.md").unwrap(),
            "Standalone instructions"
        );
        assert!(read_resource(&package, "skills/summary/scripts/helper.py").is_err());
        assert_eq!(
            fs::read(root.join("skills/summary/scripts/helper.py")).unwrap(),
            b"raise RuntimeError('must not run')"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
