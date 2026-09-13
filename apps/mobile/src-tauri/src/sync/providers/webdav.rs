use std::collections::{HashSet, VecDeque};

use reqwest::Method;

use super::ResourceRemoteFileInfo;
use crate::sync::common::{
    file_name_from_path, normalize_remote_path, preview_text, strip_base_prefix, RESOURCE_PREFIX,
};
use crate::sync::context::WebDavConfig;
use crate::network_policy::NetworkPolicy;
use crate::sync::error::{run_sync_policy, run_sync_policy_with, AppError};

fn webdav_remote_path(path_prefix: &str, object_name: &str) -> String {
    let prefix = path_prefix.trim().trim_end_matches('/');
    let object = object_name.trim_start_matches('/');
    let mut merged = if prefix.is_empty() {
        format!("/{object}")
    } else {
        format!("{prefix}/{object}")
    };
    if !merged.starts_with('/') {
        merged.insert(0, '/');
    }
    merged
}

fn webdav_url(config: &WebDavConfig, object_name: &str) -> String {
    let path = webdav_remote_path(&config.path_prefix, object_name);
    webdav_url_from_remote_path(config, &path)
}

fn webdav_url_from_remote_path(config: &WebDavConfig, remote_path: &str) -> String {
    let base = config.url.trim_end_matches('/');
    let mut normalized = remote_path.trim().to_string();
    if !normalized.starts_with('/') {
        normalized.insert(0, '/');
    }
    format!("{base}{normalized}")
}

async fn ensure_webdav_directories(
    config: &WebDavConfig,
    object_name: &str,
) -> Result<(), AppError> {
    let remote_path = webdav_remote_path(&config.path_prefix, object_name);
    let parts: Vec<&str> = remote_path
        .trim_start_matches('/')
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();

    if parts.len() <= 1 {
        return Ok(());
    }

    let client = reqwest::Client::new();
    let mkcol = reqwest::Method::from_bytes(b"MKCOL").map_err(|e| {
        AppError::new(
            "SYNC_UPLOAD_FAILED",
            format!("WebDAV MKCOL 方法创建失败: {e}"),
        )
    })?;
    let mut current = String::new();

    for part in parts.iter().take(parts.len() - 1) {
        current.push('/');
        current.push_str(part);
        let url = webdav_url_from_remote_path(config, &current);
        let response = run_sync_policy(
            "webdav",
            "mkcol_directory",
            "SYNC_UPLOAD_FAILED",
            "WebDAV 创建目录",
            |_| async {
                client
                    .request(mkcol.clone(), &url)
                    .basic_auth(&config.username, Some(&config.password))
                    .send()
                    .await
                    .map_err(|e| {
                        AppError::new("SYNC_UPLOAD_FAILED", format!("WebDAV 创建目录失败: {e}"))
                    })
            },
        )
        .await?;

        let status = response.status().as_u16();
        if !(response.status().is_success() || matches!(status, 301 | 302 | 405 | 409)) {
            return Err(AppError::new(
                "SYNC_UPLOAD_FAILED",
                format!("WebDAV 创建目录返回异常状态: {}", response.status()),
            ));
        }
    }

    Ok(())
}

pub(crate) async fn webdav_exists(
    config: &WebDavConfig,
    object_name: &str,
) -> Result<bool, AppError> {
    let url = webdav_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy(
        "webdav",
        "head_object",
        "SYNC_DOWNLOAD_FAILED",
        "WebDAV 检查文件",
        |_| async {
            let resp = client
                .head(&url)
                .basic_auth(&config.username, Some(&config.password))
                .send()
                .await
                .map_err(|err| {
                    AppError::new(
                        "SYNC_DOWNLOAD_FAILED",
                        format!("WebDAV 检查文件失败: {err}"),
                    )
                })?;
            match resp.status().as_u16() {
                200..=299 => Ok(true),
                404 => Ok(false),
                _ => Err(AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!(
                        "WebDAV 检查文件返回异常状态: HTTP {}",
                        resp.status().as_u16()
                    ),
                )),
            }
        },
    )
    .await
}

pub(crate) async fn webdav_download(
    config: &WebDavConfig,
    object_name: &str,
) -> Result<Vec<u8>, AppError> {
    let url = webdav_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy_with(
        "webdav",
        "download_object",
        "SYNC_DOWNLOAD_FAILED",
        "WebDAV 下载",
        NetworkPolicy::for_payload(None),
        |_| async {
            let resp = client
                .get(&url)
                .basic_auth(&config.username, Some(&config.password))
                .send()
                .await
                .map_err(|e| {
                    AppError::new("SYNC_DOWNLOAD_FAILED", format!("WebDAV 下载失败: {e}"))
                })?;
            if resp.status().as_u16() == 404 {
                return Err(AppError::new(
                    "REMOTE_FILE_NOT_FOUND",
                    format!("远端文件不存在: {object_name}"),
                ));
            }
            if !resp.status().is_success() {
                return Err(AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("WebDAV 下载返回异常状态: HTTP {}", resp.status().as_u16()),
                ));
            }
            let bytes = resp.bytes().await.map_err(|e| {
                AppError::new("SYNC_DOWNLOAD_FAILED", format!("读取 WebDAV 响应失败: {e}"))
            })?;
            Ok(bytes.to_vec())
        },
    )
    .await
}

pub(crate) async fn webdav_upload(
    config: &WebDavConfig,
    object_name: &str,
    content: &[u8],
) -> Result<(), AppError> {
    ensure_webdav_directories(config, object_name).await?;
    let url = webdav_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy_with(
        "webdav",
        "upload_object",
        "SYNC_UPLOAD_FAILED",
        "WebDAV 上传",
        NetworkPolicy::for_payload(Some(content.len())),
        |_| async {
            let resp = client
                .put(&url)
                .basic_auth(&config.username, Some(&config.password))
                .body(content.to_vec())
                .send()
                .await
                .map_err(|e| {
                    AppError::new("SYNC_UPLOAD_FAILED", format!("WebDAV 上传失败: {e}"))
                })?;
            if !resp.status().is_success() {
                return Err(AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("WebDAV 上传返回异常状态: HTTP {}", resp.status().as_u16()),
                ));
            }
            Ok(())
        },
    )
    .await
}

#[derive(Debug, Clone)]
struct WebDavPropfindEntry {
    href: String,
    size: u64,
    is_collection: bool,
}

fn parse_webdav_propfind_entries(content: &str) -> Result<Vec<WebDavPropfindEntry>, AppError> {
    let doc = roxmltree::Document::parse(content).map_err(|e| {
        AppError::new(
            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
            format!("WebDAV XML 解析失败: {e}"),
        )
    })?;
    let mut entries = Vec::new();

    for response in doc
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name().eq_ignore_ascii_case("response"))
    {
        let href = response
            .descendants()
            .find(|node| node.is_element() && node.tag_name().name().eq_ignore_ascii_case("href"))
            .and_then(|node| node.text())
            .map(|text| text.trim().to_string())
            .unwrap_or_default();
        if href.is_empty() {
            continue;
        }
        let is_collection = response.descendants().any(|node| {
            node.is_element() && node.tag_name().name().eq_ignore_ascii_case("collection")
        });
        let size = response
            .descendants()
            .find(|node| {
                node.is_element()
                    && node
                        .tag_name()
                        .name()
                        .eq_ignore_ascii_case("getcontentlength")
            })
            .and_then(|node| node.text())
            .and_then(|text| text.trim().parse::<u64>().ok())
            .unwrap_or(0);
        entries.push(WebDavPropfindEntry {
            href,
            size,
            is_collection,
        });
    }

    Ok(entries)
}

fn webdav_href_path(href: &str) -> String {
    let raw = if let Ok(parsed_url) = url::Url::parse(href) {
        parsed_url.path().to_string()
    } else {
        href.to_string()
    };
    percent_encoding::percent_decode_str(&raw)
        .decode_utf8_lossy()
        .to_string()
}

fn extract_resource_relative_path(
    decoded_path: &str,
    base_url_path: &str,
    path_prefix: &str,
) -> Option<String> {
    let relative_without_base_url = strip_base_prefix(decoded_path, base_url_path);
    let relative_without_prefix = strip_base_prefix(&relative_without_base_url, path_prefix);
    let normalized = normalize_remote_path(&relative_without_prefix);
    if normalized.is_empty() {
        return None;
    }
    if normalized == RESOURCE_PREFIX || normalized.starts_with(&format!("{RESOURCE_PREFIX}/")) {
        return Some(normalized);
    }

    let parts: Vec<&str> = normalized
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    if let Some(index) = parts.iter().position(|part| *part == RESOURCE_PREFIX) {
        let tail = parts[index..].join("/");
        if !tail.is_empty() {
            return Some(tail);
        }
    }
    None
}

pub(crate) async fn list_resources_from_webdav(
    config: &WebDavConfig,
    prefix: &str,
) -> Result<Vec<ResourceRemoteFileInfo>, AppError> {
    let root_object = normalize_remote_path(prefix);
    if root_object.is_empty() {
        return Ok(Vec::new());
    }
    let method = Method::from_bytes(b"PROPFIND").map_err(|e| {
        AppError::new(
            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
            format!("WebDAV 方法初始化失败: {e}"),
        )
    })?;
    let body = r#"<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype />
    <d:getcontentlength />
  </d:prop>
</d:propfind>"#;
    let client = reqwest::Client::new();
    let base_url_path = url::Url::parse(&config.url)
        .ok()
        .map(|parsed| normalize_remote_path(parsed.path()))
        .unwrap_or_default();
    let mut queue = VecDeque::new();
    let mut visited_dirs: HashSet<String> = HashSet::new();
    queue.push_back(root_object.clone());
    let mut files = Vec::new();

    while let Some(current_object) = queue.pop_front() {
        if !visited_dirs.insert(current_object.clone()) {
            continue;
        }
        let current_remote = webdav_remote_path(&config.path_prefix, &current_object);
        let current_remote = if current_remote.ends_with('/') {
            current_remote
        } else {
            format!("{current_remote}/")
        };
        let url = webdav_url_from_remote_path(config, &current_remote);
        let xml = run_sync_policy(
            "webdav",
            "list_resources",
            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
            "WebDAV 列表请求",
            |_| async {
                let response = client
                    .request(method.clone(), url.clone())
                    .basic_auth(&config.username, Some(&config.password))
                    .header("Depth", "1")
                    .header("Content-Type", "application/xml")
                    .body(body.to_string())
                    .send()
                    .await
                    .map_err(|e| {
                        AppError::new(
                            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                            format!("WebDAV 列表请求失败: {e}"),
                        )
                    })?;
                let status = response.status();
                let xml = response.text().await.map_err(|e| {
                    AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("WebDAV 列表响应读取失败: {e}"),
                    )
                })?;
                if status.as_u16() == 404 {
                    return Ok(None);
                }
                if !status.is_success() {
                    println!(
                        "[resource-sync] WebDAV 列表失败 status={} path={} body={}",
                        status,
                        current_remote,
                        preview_text(&xml, 240)
                    );
                    return Err(AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("WebDAV 列表返回异常状态: HTTP {}", status.as_u16()),
                    ));
                }
                Ok(Some(xml))
            },
        )
        .await?;
        let xml = match xml {
            Some(value) => value,
            None => continue,
        };

        let entries = parse_webdav_propfind_entries(&xml)?;
        for entry in entries {
            let decoded = webdav_href_path(&entry.href);
            let normalized =
                match extract_resource_relative_path(&decoded, &base_url_path, &config.path_prefix)
                {
                    Some(value) => value,
                    None => continue,
                };
            if normalized == current_object {
                continue;
            }
            if normalized == RESOURCE_PREFIX {
                continue;
            }
            if !normalized.starts_with(&format!("{RESOURCE_PREFIX}/")) {
                continue;
            }
            if entry.is_collection {
                queue.push_back(normalized);
                continue;
            }
            let name = file_name_from_path(&normalized);
            if name.is_empty() {
                continue;
            }
            files.push(ResourceRemoteFileInfo {
                name,
                path: normalized,
                size: entry.size,
            });
        }
    }
    println!(
        "[resource-sync] WebDAV 列表完成 root={} dirs={} files={}",
        root_object,
        visited_dirs.len(),
        files.len()
    );
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::extract_resource_relative_path;

    #[test]
    fn extract_resource_relative_path_handles_prefixes() {
        let path = "/dav/base/sync/resources/a.png";
        let value = extract_resource_relative_path(path, "/dav/base", "sync")
            .expect("should extract resource path");
        assert_eq!(value, "resources/a.png");
    }

    #[test]
    fn extract_resource_relative_path_returns_none_when_not_resource() {
        let path = "/dav/base/sync/other/a.png";
        let value = extract_resource_relative_path(path, "/dav/base", "sync");
        assert!(value.is_none());
    }
}
