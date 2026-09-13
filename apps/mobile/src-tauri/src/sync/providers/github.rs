use std::collections::VecDeque;

use base64::Engine;
use serde_json::{json, Value};

use super::ResourceRemoteFileInfo;
use crate::sync::common::{
    encode_path_keep_slashes, file_name_from_path, join_path, normalize_remote_path,
    strip_base_prefix, RESOURCE_PREFIX,
};
use crate::sync::context::GithubConfig;
use crate::network_policy::NetworkPolicy;
use crate::sync::error::{run_sync_policy, run_sync_policy_with, AppError};

fn github_api_url(config: &GithubConfig, object_name: &str) -> String {
    let content_path = join_path(&config.path_prefix, object_name);
    let encoded_path = encode_path_keep_slashes(&content_path);
    format!(
        "https://api.github.com/repos/{}/{}/contents/{}",
        config.owner, config.repo, encoded_path
    )
}

fn parse_github_content(content: &str) -> Result<Vec<u8>, AppError> {
    let cleaned = content.replace('\n', "");
    base64::engine::general_purpose::STANDARD
        .decode(cleaned.as_bytes())
        .map(|bytes| bytes.to_vec())
        .map_err(|e| {
            AppError::new(
                "SYNC_DOWNLOAD_FAILED",
                format!("Github 内容 Base64 解码失败: {e}"),
            )
        })
}

pub(crate) async fn github_exists(
    config: &GithubConfig,
    object_name: &str,
) -> Result<bool, AppError> {
    let url = github_api_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy(
        "github",
        "exists_object",
        "SYNC_DOWNLOAD_FAILED",
        "Github 检查",
        |_| async {
            let response = client
                .get(&url)
                .header("Authorization", format!("token {}", config.token))
                .header("User-Agent", "tau-mobile")
                .header("Accept", "application/vnd.github+json")
                .query(&[("ref", config.branch.as_str())])
                .send()
                .await
                .map_err(|e| {
                    AppError::new("SYNC_DOWNLOAD_FAILED", format!("Github 检查失败: {e}"))
                })?;

            match response.status().as_u16() {
                200 => Ok(true),
                404 => Ok(false),
                _ => Err(AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!(
                        "Github 检查返回异常状态: HTTP {}",
                        response.status().as_u16()
                    ),
                )),
            }
        },
    )
    .await
}

pub(crate) async fn github_download(
    config: &GithubConfig,
    object_name: &str,
) -> Result<Vec<u8>, AppError> {
    let url = github_api_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy_with(
        "github",
        "download_object",
        "SYNC_DOWNLOAD_FAILED",
        "Github 下载",
        NetworkPolicy::for_payload(None),
        |_| async {
            let response = client
                .get(&url)
                .header("Authorization", format!("token {}", config.token))
                .header("User-Agent", "tau-mobile")
                .header("Accept", "application/vnd.github+json")
                .query(&[("ref", config.branch.as_str())])
                .send()
                .await
                .map_err(|e| {
                    AppError::new("SYNC_DOWNLOAD_FAILED", format!("Github 下载失败: {e}"))
                })?;

            if response.status().as_u16() == 404 {
                return Err(AppError::new(
                    "REMOTE_FILE_NOT_FOUND",
                    format!("远端文件不存在: {object_name}"),
                ));
            }
            if !response.status().is_success() {
                return Err(AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!(
                        "Github 下载返回异常状态: HTTP {}",
                        response.status().as_u16()
                    ),
                ));
            }

            let text = response.text().await.map_err(|e| {
                AppError::new("SYNC_DOWNLOAD_FAILED", format!("Github 响应读取失败: {e}"))
            })?;
            let parsed = serde_json::from_str::<Value>(&text).map_err(|e| {
                AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("Github 响应 JSON 解析失败: {e}"),
                )
            })?;
            let content = parsed
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AppError::new("SYNC_DOWNLOAD_FAILED", "Github 响应缺少 content 字段")
                })?;
            parse_github_content(content)
        },
    )
    .await
}

async fn github_get_sha(
    config: &GithubConfig,
    object_name: &str,
) -> Result<Option<String>, AppError> {
    let url = github_api_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy(
        "github",
        "get_sha",
        "SYNC_UPLOAD_FAILED",
        "Github 查询 SHA",
        |_| async {
            let response = client
                .get(&url)
                .header("Authorization", format!("token {}", config.token))
                .header("User-Agent", "tau-mobile")
                .header("Accept", "application/vnd.github+json")
                .query(&[("ref", config.branch.as_str())])
                .send()
                .await
                .map_err(|e| {
                    AppError::new("SYNC_UPLOAD_FAILED", format!("Github 查询 SHA 失败: {e}"))
                })?;

            if response.status().as_u16() == 404 {
                return Ok(None);
            }
            if !response.status().is_success() {
                return Err(AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!(
                        "Github 查询 SHA 返回异常状态: HTTP {}",
                        response.status().as_u16()
                    ),
                ));
            }
            let text = response.text().await.map_err(|e| {
                AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("Github SHA 响应读取失败: {e}"),
                )
            })?;
            let parsed = serde_json::from_str::<Value>(&text).map_err(|e| {
                AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("Github SHA 响应解析失败: {e}"),
                )
            })?;
            Ok(parsed
                .get("sha")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string()))
        },
    )
    .await
}

pub(crate) async fn github_upload(
    config: &GithubConfig,
    object_name: &str,
    content: &[u8],
) -> Result<(), AppError> {
    let url = github_api_url(config, object_name);
    let sha = github_get_sha(config, object_name).await?;
    let mut body = json!({
        "message": format!("sync {}", object_name),
        "content": base64::engine::general_purpose::STANDARD.encode(content),
        "branch": config.branch,
        "committer": {
            "name": config.committer_name,
            "email": config.committer_email
        }
    });
    if let Some(value) = sha {
        body["sha"] = Value::String(value);
    }

    let client = reqwest::Client::new();
    run_sync_policy_with(
        "github",
        "upload_object",
        "SYNC_UPLOAD_FAILED",
        "Github 上传",
        NetworkPolicy::for_payload(Some(content.len())),
        |_| async {
            let response = client
                .put(&url)
                .header("Authorization", format!("token {}", config.token))
                .header("User-Agent", "tau-mobile")
                .header("Accept", "application/vnd.github+json")
                .json(&body)
                .send()
                .await
                .map_err(|e| {
                    AppError::new("SYNC_UPLOAD_FAILED", format!("Github 上传失败: {e}"))
                })?;

            let status = response.status();
            if !status.is_success() {
                let raw = response.text().await.unwrap_or_default();
                return Err(AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("Github 上传返回异常状态 {}: {}", status, raw),
                ));
            }
            Ok(())
        },
    )
    .await
}

pub(crate) async fn list_resources_from_github(
    config: &GithubConfig,
    prefix: &str,
) -> Result<Vec<ResourceRemoteFileInfo>, AppError> {
    let mut queue = VecDeque::new();
    let mut files = Vec::new();
    let start_path = join_path(&config.path_prefix, prefix)
        .trim_matches('/')
        .to_string();
    queue.push_back(start_path);

    while let Some(current) = queue.pop_front() {
        let endpoint = if current.is_empty() {
            format!(
                "https://api.github.com/repos/{}/{}/contents",
                config.owner, config.repo
            )
        } else {
            format!(
                "https://api.github.com/repos/{}/{}/contents/{}",
                config.owner,
                config.repo,
                encode_path_keep_slashes(&current)
            )
        };
        let client = reqwest::Client::new();
        let payload = run_sync_policy(
            "github",
            "list_resources",
            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
            "Github 列表请求",
            |_| async {
                let response = client
                    .get(&endpoint)
                    .header("Authorization", format!("token {}", config.token))
                    .header("User-Agent", "tau-mobile")
                    .header("Accept", "application/vnd.github+json")
                    .query(&[("ref", config.branch.as_str())])
                    .send()
                    .await
                    .map_err(|e| {
                        AppError::new(
                            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                            format!("Github 列表请求失败: {e}"),
                        )
                    })?;

                if response.status().as_u16() == 404 {
                    return Ok(None);
                }
                if !response.status().is_success() {
                    return Err(AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!(
                            "Github 列表返回异常状态: HTTP {}",
                            response.status().as_u16()
                        ),
                    ));
                }

                let payload = response.text().await.map_err(|e| {
                    AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("Github 列表响应读取失败: {e}"),
                    )
                })?;
                Ok(Some(payload))
            },
        )
        .await?;

        let payload = match payload {
            Some(value) => value,
            None => continue,
        };
        let parsed = serde_json::from_str::<Value>(&payload).map_err(|e| {
            AppError::new(
                "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                format!("Github 列表响应解析失败: {e}"),
            )
        })?;
        let entries = if let Some(array) = parsed.as_array() {
            array.clone()
        } else {
            vec![parsed]
        };

        for entry in entries {
            let entry_type = entry
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let path = entry
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            if path.is_empty() {
                continue;
            }
            if entry_type == "dir" {
                queue.push_back(path);
                continue;
            }
            if entry_type != "file" {
                continue;
            }
            let relative_path = strip_base_prefix(&path, &config.path_prefix);
            let normalized = normalize_remote_path(&relative_path);
            if !normalized.starts_with(&format!("{}/", RESOURCE_PREFIX)) {
                continue;
            }
            let name = file_name_from_path(&normalized);
            if name.is_empty() {
                continue;
            }
            let size = entry.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            files.push(ResourceRemoteFileInfo {
                name,
                path: normalized,
                size,
            });
        }
    }

    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::parse_github_content;

    #[test]
    fn parse_github_content_success() {
        let encoded = "aGVsbG8=";
        let bytes = parse_github_content(encoded).expect("decode should succeed");
        assert_eq!(bytes, b"hello");
    }

    #[test]
    fn parse_github_content_failed() {
        let encoded = "not-base64-@@@";
        let error = parse_github_content(encoded).expect_err("decode should fail");
        assert_eq!(error.code, "SYNC_DOWNLOAD_FAILED");
    }
}
