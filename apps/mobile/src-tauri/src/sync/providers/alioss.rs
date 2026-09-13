use std::time::SystemTime;

use base64::Engine;
use hmac::{Hmac, Mac};
use percent_encoding::utf8_percent_encode;
use sha1::Sha1;

use super::ResourceRemoteFileInfo;
use crate::sync::common::{
    file_name_from_path, normalize_remote_path, preview_text, strip_base_prefix, RESOURCE_PREFIX,
};
use crate::sync::context::AliOssConfig;
use crate::network_policy::NetworkPolicy;
use crate::sync::error::{run_sync_policy, run_sync_policy_with, AppError};

fn oss_object_path(path_prefix: &str, object_name: &str) -> String {
    let base = path_prefix.trim().trim_matches('/');
    let object = object_name.trim().trim_start_matches('/');
    if base.is_empty() {
        object.to_string()
    } else {
        format!("{base}/{object}")
    }
}

fn encode_oss_path(path: &str) -> String {
    utf8_percent_encode(path, percent_encoding::NON_ALPHANUMERIC)
        .to_string()
        .replace("%2F", "/")
}

fn oss_signature(
    method: &str,
    content_type: &str,
    date: &str,
    canonical_resource: &str,
    access_key_secret: &str,
) -> Result<String, AppError> {
    let string_to_sign = format!("{method}\n\n{content_type}\n{date}\n{canonical_resource}");
    let mut mac = Hmac::<Sha1>::new_from_slice(access_key_secret.as_bytes())
        .map_err(|_| AppError::new("SYNC_CONFIG_MISSING", "AliOSS 密钥初始化失败"))?;
    mac.update(string_to_sign.as_bytes());
    let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    Ok(signature)
}

fn build_oss_url(config: &AliOssConfig, object_path: &str) -> String {
    let encoded = encode_oss_path(object_path);
    format!(
        "https://{}.{}.aliyuncs.com/{}",
        config.bucket, config.region, encoded
    )
}

pub(crate) async fn alioss_exists(
    config: &AliOssConfig,
    object_name: &str,
) -> Result<bool, AppError> {
    let object_path = oss_object_path(&config.path_prefix, object_name);
    let canonical_resource = format!("/{}/{}", config.bucket, object_path);
    let date = httpdate::fmt_http_date(SystemTime::now());
    let signature = oss_signature(
        "HEAD",
        "",
        &date,
        &canonical_resource,
        &config.access_key_secret,
    )?;
    let authorization = format!("OSS {}:{}", config.access_key_id, signature);
    let url = build_oss_url(config, &object_path);
    let client = reqwest::Client::new();
    run_sync_policy(
        "alioss",
        "head_object",
        "SYNC_DOWNLOAD_FAILED",
        "AliOSS HEAD",
        |_| async {
            let resp = client
                .head(&url)
                .header("Date", date.clone())
                .header("Authorization", authorization.clone())
                .send()
                .await
                .map_err(|e| {
                    AppError::new("SYNC_DOWNLOAD_FAILED", format!("AliOSS HEAD 失败: {e}"))
                })?;
            match resp.status().as_u16() {
                200 => Ok(true),
                404 => Ok(false),
                _ => Err(AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("AliOSS HEAD 返回异常状态: HTTP {}", resp.status().as_u16()),
                )),
            }
        },
    )
    .await
}

pub(crate) async fn alioss_download(
    config: &AliOssConfig,
    object_name: &str,
) -> Result<Vec<u8>, AppError> {
    let object_path = oss_object_path(&config.path_prefix, object_name);
    let canonical_resource = format!("/{}/{}", config.bucket, object_path);
    let date = httpdate::fmt_http_date(SystemTime::now());
    let signature = oss_signature(
        "GET",
        "",
        &date,
        &canonical_resource,
        &config.access_key_secret,
    )?;
    let authorization = format!("OSS {}:{}", config.access_key_id, signature);
    let url = build_oss_url(config, &object_path);

    let client = reqwest::Client::new();
    run_sync_policy_with(
        "alioss",
        "download_object",
        "SYNC_DOWNLOAD_FAILED",
        "AliOSS 下载",
        NetworkPolicy::for_payload(None),
        |_| async {
            let resp = client
                .get(&url)
                .header("Date", date.clone())
                .header("Authorization", authorization.clone())
                .send()
                .await
                .map_err(|e| {
                    AppError::new("SYNC_DOWNLOAD_FAILED", format!("AliOSS 下载失败: {e}"))
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
                    format!("AliOSS 下载返回异常状态: HTTP {}", resp.status().as_u16()),
                ));
            }
            let bytes = resp.bytes().await.map_err(|e| {
                AppError::new("SYNC_DOWNLOAD_FAILED", format!("AliOSS 读取响应失败: {e}"))
            })?;
            Ok(bytes.to_vec())
        },
    )
    .await
}

pub(crate) async fn alioss_upload(
    config: &AliOssConfig,
    object_name: &str,
    content: &[u8],
) -> Result<(), AppError> {
    let object_path = oss_object_path(&config.path_prefix, object_name);
    let canonical_resource = format!("/{}/{}", config.bucket, object_path);
    let date = httpdate::fmt_http_date(SystemTime::now());
    let content_type = "application/octet-stream";
    let signature = oss_signature(
        "PUT",
        content_type,
        &date,
        &canonical_resource,
        &config.access_key_secret,
    )?;
    let authorization = format!("OSS {}:{}", config.access_key_id, signature);
    let url = build_oss_url(config, &object_path);

    let client = reqwest::Client::new();
    run_sync_policy_with(
        "alioss",
        "upload_object",
        "SYNC_UPLOAD_FAILED",
        "AliOSS 上传",
        NetworkPolicy::for_payload(Some(content.len())),
        |_| async {
            let resp = client
                .put(&url)
                .header("Date", date.clone())
                .header("Authorization", authorization.clone())
                .header("Content-Type", content_type)
                .body(content.to_vec())
                .send()
                .await
                .map_err(|e| {
                    AppError::new("SYNC_UPLOAD_FAILED", format!("AliOSS 上传失败: {e}"))
                })?;

            if !resp.status().is_success() {
                return Err(AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("AliOSS 上传返回异常状态: HTTP {}", resp.status().as_u16()),
                ));
            }
            Ok(())
        },
    )
    .await
}

fn extract_xml_tag_values(xml: &str, tag_name: &str) -> Vec<String> {
    let mut values = Vec::new();
    let open = format!("<{tag_name}>");
    let close = format!("</{tag_name}>");
    let mut cursor = 0;
    while let Some(start_pos) = xml[cursor..].find(&open) {
        let start_index = cursor + start_pos + open.len();
        if let Some(end_pos) = xml[start_index..].find(&close) {
            let end_index = start_index + end_pos;
            values.push(xml[start_index..end_index].trim().to_string());
            cursor = end_index + close.len();
        } else {
            break;
        }
    }
    values
}

fn extract_xml_tag_value(xml: &str, tag_name: &str) -> Option<String> {
    extract_xml_tag_values(xml, tag_name).into_iter().next()
}

pub(crate) async fn list_resources_from_alioss(
    config: &AliOssConfig,
    prefix: &str,
) -> Result<Vec<ResourceRemoteFileInfo>, AppError> {
    let mut files = Vec::new();
    let mut marker = String::new();
    let full_prefix = oss_object_path(&config.path_prefix, prefix);
    let endpoint = format!("https://{}.{}.aliyuncs.com/", config.bucket, config.region);
    let client = reqwest::Client::new();

    loop {
        let xml = run_sync_policy(
            "alioss",
            "list_resources",
            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
            "AliOSS 列表请求",
            |_| async {
                let date = httpdate::fmt_http_date(SystemTime::now());
                let canonical_resource = format!("/{}/", config.bucket);
                let signature = oss_signature(
                    "GET",
                    "",
                    &date,
                    &canonical_resource,
                    &config.access_key_secret,
                )?;
                let authorization = format!("OSS {}:{}", config.access_key_id, signature);
                let mut request = client
                    .get(&endpoint)
                    .header("Date", date)
                    .header("Authorization", authorization)
                    .query(&[
                        ("max-keys", "1000"),
                        ("prefix", full_prefix.as_str()),
                        ("encoding-type", "url"),
                    ]);
                if !marker.is_empty() {
                    request = request.query(&[("marker", marker.as_str())]);
                }
                let response = request.send().await.map_err(|e| {
                    AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("AliOSS 列表请求失败: {e}"),
                    )
                })?;
                let status = response.status();
                let xml = response.text().await.map_err(|e| {
                    AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("AliOSS 列表响应读取失败: {e}"),
                    )
                })?;
                if !status.is_success() {
                    println!(
                        "[resource-sync] AliOSS 列表失败 status={} prefix={} marker={} body={}",
                        status,
                        full_prefix,
                        marker,
                        preview_text(&xml, 240)
                    );
                    return Err(AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("AliOSS 列表返回异常状态: HTTP {}", status.as_u16()),
                    ));
                }
                Ok(xml)
            },
        )
        .await?;

        let keys = extract_xml_tag_values(&xml, "Key");
        let sizes = extract_xml_tag_values(&xml, "Size");
        for (idx, key) in keys.iter().enumerate() {
            let decoded_key = percent_encoding::percent_decode_str(key)
                .decode_utf8_lossy()
                .to_string();
            if decoded_key.ends_with('/') {
                continue;
            }
            let relative_path = strip_base_prefix(&decoded_key, &config.path_prefix);
            let normalized = normalize_remote_path(&relative_path);
            if !normalized.starts_with(&format!("{}/", RESOURCE_PREFIX)) {
                continue;
            }
            let name = file_name_from_path(&normalized);
            if name.is_empty() {
                continue;
            }
            let size = sizes
                .get(idx)
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0);
            files.push(ResourceRemoteFileInfo {
                name,
                path: normalized,
                size,
            });
        }

        let is_truncated = extract_xml_tag_value(&xml, "IsTruncated")
            .map(|v| v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if !is_truncated {
            break;
        }
        marker = extract_xml_tag_value(&xml, "NextMarker").unwrap_or_default();
        if marker.is_empty() {
            break;
        }
    }

    Ok(files)
}
