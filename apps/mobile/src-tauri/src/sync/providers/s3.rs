use std::time::Duration;

use aws_sdk_s3::config::{Credentials as S3Credentials, Region as S3Region};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client as S3Client;

use super::ResourceRemoteFileInfo;
use crate::sync::common::{
    file_name_from_path, join_path, normalize_remote_path, strip_base_prefix, RESOURCE_PREFIX,
    S3_OPERATION_TIMEOUT_SECS,
};
use crate::sync::context::S3Config;
use crate::sync::error::AppError;

fn build_s3_client(config: &S3Config) -> S3Client {
    let credentials = S3Credentials::new(
        config.access_key_id.clone(),
        config.secret_access_key.clone(),
        None,
        None,
        "tau-mobile-sync",
    );
    let mut builder = aws_sdk_s3::config::Builder::new()
        .behavior_version_latest()
        .region(S3Region::new(config.region.clone()))
        .credentials_provider(credentials);
    #[cfg(target_os = "android")]
    {
        builder.set_http_client(Some(build_android_s3_http_client()));
    }
    if !config.endpoint.is_empty() {
        builder = builder.endpoint_url(config.endpoint.clone());
    }
    if config.url_style == "path" {
        builder = builder.force_path_style(true);
    }
    S3Client::from_conf(builder.build())
}

#[cfg(target_os = "android")]
fn build_android_s3_http_client() -> aws_sdk_s3::config::SharedHttpClient {
    use aws_smithy_http_client::hyper_014::HyperClientBuilder;
    use hyper_rustls::HttpsConnectorBuilder;

    let https_connector = HttpsConnectorBuilder::new()
        .with_webpki_roots()
        .https_or_http()
        .enable_http1()
        .enable_http2()
        .build();

    HyperClientBuilder::new().build(https_connector)
}

fn build_s3_object_url(config: &S3Config, object_name: &str) -> String {
    let key = join_path(&config.path_prefix, object_name);
    if config.url_style == "virtualHosted" {
        if !config.endpoint.is_empty() {
            if let Ok(url) = url::Url::parse(&config.endpoint) {
                let host = if let Some(port) = url.port() {
                    format!("{}:{}", url.host_str().unwrap_or_default(), port)
                } else {
                    url.host_str().unwrap_or_default().to_string()
                };
                return format!(
                    "{}://{}.{}{}",
                    url.scheme(),
                    config.bucket,
                    host,
                    format!("/{key}")
                );
            }
            let endpoint_host = config
                .endpoint
                .trim()
                .trim_end_matches('/')
                .trim_start_matches("https://")
                .trim_start_matches("http://");
            let protocol = if config.endpoint.starts_with("http://") {
                "http"
            } else {
                "https"
            };
            return format!(
                "{protocol}://{}.{}{}",
                config.bucket,
                endpoint_host,
                format!("/{key}")
            );
        }
        return format!(
            "https://{}.s3.{}.amazonaws.com/{}",
            config.bucket, config.region, key
        );
    }

    let endpoint = if config.endpoint.is_empty() {
        format!("https://s3.{}.amazonaws.com", config.region)
    } else {
        config.endpoint.trim_end_matches('/').to_string()
    };
    format!("{endpoint}/{}/{}", config.bucket, key)
}

async fn s3_exists_via_http(config: &S3Config, object_name: &str) -> Result<bool, AppError> {
    let url = build_s3_object_url(config, object_name);
    let response = tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        reqwest::Client::new().head(&url).send(),
    )
    .await
    .map_err(|_| {
        AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("S3 HTTP 回退检查超时（{} 秒）", S3_OPERATION_TIMEOUT_SECS),
        )
    })?
    .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("S3 HTTP 回退检查失败: {e}")))?;

    match response.status().as_u16() {
        200..=399 => Ok(true),
        404 => Ok(false),
        status => Err(AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("S3 HTTP 回退检查返回异常状态: {status}"),
        )),
    }
}

async fn s3_download_via_http(config: &S3Config, object_name: &str) -> Result<Vec<u8>, AppError> {
    let url = build_s3_object_url(config, object_name);
    let response = tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        reqwest::Client::new().get(&url).send(),
    )
    .await
    .map_err(|_| {
        AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("S3 HTTP 回退下载超时（{} 秒）", S3_OPERATION_TIMEOUT_SECS),
        )
    })?
    .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("S3 HTTP 回退下载失败: {e}")))?;

    if response.status().as_u16() == 404 {
        return Err(AppError::new(
            "REMOTE_FILE_NOT_FOUND",
            format!("远端文件不存在: {object_name}"),
        ));
    }
    if !response.status().is_success() {
        return Err(AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("S3 HTTP 回退下载返回异常状态: {}", response.status()),
        ));
    }

    let bytes = tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        response.bytes(),
    )
    .await
    .map_err(|_| {
        AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!(
                "S3 HTTP 回退响应读取超时（{} 秒）",
                S3_OPERATION_TIMEOUT_SECS
            ),
        )
    })?
    .map_err(|e| {
        AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("S3 HTTP 回退响应读取失败: {e}"),
        )
    })?;

    Ok(bytes.to_vec())
}

fn is_not_found_error(err: &impl std::fmt::Display) -> bool {
    let message = err.to_string().to_ascii_lowercase();
    message.contains("notfound") || message.contains("not found") || message.contains("404")
}

pub(crate) async fn s3_exists(config: &S3Config, object_name: &str) -> Result<bool, AppError> {
    let key = join_path(&config.path_prefix, object_name);
    let client = build_s3_client(config);
    let sdk_result = tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        client
            .head_object()
            .bucket(config.bucket.clone())
            .key(key)
            .send(),
    )
    .await;

    match sdk_result {
        Ok(Ok(_)) => Ok(true),
        Ok(Err(err)) => {
            if is_not_found_error(&err) {
                return Ok(false);
            }
            println!(
                "[sync][s3] HeadObject 失败，尝试 HTTP 回退检查。bucket={} region={} endpoint={} urlStyle={} err={}",
                config.bucket, config.region, config.endpoint, config.url_style, err
            );
            s3_exists_via_http(config, object_name)
                .await
                .map_err(|fallback_err| {
                    AppError::new(
                        "SYNC_DOWNLOAD_FAILED",
                        format!(
                            "S3 检查文件失败: {err}；HTTP 回退失败: {}",
                            fallback_err.message
                        ),
                    )
                })
        }
        Err(_) => {
            println!(
                "[sync][s3] HeadObject 超时，尝试 HTTP 回退检查。bucket={} region={} endpoint={} urlStyle={}",
                config.bucket, config.region, config.endpoint, config.url_style
            );
            s3_exists_via_http(config, object_name)
                .await
                .map_err(|fallback_err| {
                    AppError::new(
                        "SYNC_DOWNLOAD_FAILED",
                        format!(
                            "S3 检查文件超时（{} 秒）；HTTP 回退失败: {}",
                            S3_OPERATION_TIMEOUT_SECS, fallback_err.message
                        ),
                    )
                })
        }
    }
}

pub(crate) async fn s3_download(config: &S3Config, object_name: &str) -> Result<Vec<u8>, AppError> {
    let key = join_path(&config.path_prefix, object_name);
    let client = build_s3_client(config);
    let output = match tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        client
            .get_object()
            .bucket(config.bucket.clone())
            .key(key)
            .send(),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            if is_not_found_error(&e) {
                return Err(AppError::new(
                    "REMOTE_FILE_NOT_FOUND",
                    format!("远端文件不存在: {object_name}"),
                ));
            }
            println!(
                "[sync][s3] GetObject 失败，尝试 HTTP 回退下载。bucket={} region={} endpoint={} urlStyle={} err={}",
                config.bucket, config.region, config.endpoint, config.url_style, e
            );
            return s3_download_via_http(config, object_name)
                .await
                .map_err(|fallback_err| {
                    AppError::new(
                        "SYNC_DOWNLOAD_FAILED",
                        format!("S3 下载失败: {e}；HTTP 回退失败: {}", fallback_err.message),
                    )
                });
        }
        Err(_) => {
            println!(
                "[sync][s3] GetObject 超时，尝试 HTTP 回退下载。bucket={} region={} endpoint={} urlStyle={}",
                config.bucket, config.region, config.endpoint, config.url_style
            );
            return s3_download_via_http(config, object_name)
                .await
                .map_err(|fallback_err| {
                    AppError::new(
                        "SYNC_DOWNLOAD_FAILED",
                        format!(
                            "S3 下载请求超时（{} 秒）；HTTP 回退失败: {}",
                            S3_OPERATION_TIMEOUT_SECS, fallback_err.message
                        ),
                    )
                });
        }
    };

    let collected = tokio::time::timeout(Duration::from_secs(S3_OPERATION_TIMEOUT_SECS), output.body.collect())
        .await
        .map_err(|_| {
            AppError::new(
                "SYNC_DOWNLOAD_FAILED",
                format!("S3 响应读取超时（{} 秒）", S3_OPERATION_TIMEOUT_SECS),
            )
        })?
        .map_err(|e| {
            println!(
                "[sync][s3] S3 SDK 响应读取失败，尝试 HTTP 回退下载。bucket={} region={} endpoint={} urlStyle={} err={}",
                config.bucket, config.region, config.endpoint, config.url_style, e
            );
            AppError::new("SYNC_DOWNLOAD_FAILED", format!("S3 响应读取失败: {e}"))
        });
    let collected = match collected {
        Ok(data) => data,
        Err(err) => {
            return s3_download_via_http(config, object_name)
                .await
                .map_err(|fallback_err| {
                    AppError::new(
                        "SYNC_DOWNLOAD_FAILED",
                        format!("{}；HTTP 回退失败: {}", err.message, fallback_err.message),
                    )
                });
        }
    };
    Ok(collected.into_bytes().to_vec())
}

pub(crate) async fn s3_upload(
    config: &S3Config,
    object_name: &str,
    content: &[u8],
) -> Result<(), AppError> {
    let key = join_path(&config.path_prefix, object_name);
    let client = build_s3_client(config);
    tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        client
            .put_object()
            .bucket(config.bucket.clone())
            .key(key)
            .body(ByteStream::from(content.to_vec()))
            .send(),
    )
    .await
    .map_err(|_| {
        AppError::new(
            "SYNC_UPLOAD_FAILED",
            format!(
                "S3 上传超时（{} 秒），请检查 Endpoint、网络或 URL 风格",
                S3_OPERATION_TIMEOUT_SECS
            ),
        )
    })?
    .map_err(|e| AppError::new("SYNC_UPLOAD_FAILED", format!("S3 上传失败: {e}")))?;
    Ok(())
}

pub(crate) async fn list_resources_from_s3(
    config: &S3Config,
    prefix: &str,
) -> Result<Vec<ResourceRemoteFileInfo>, AppError> {
    let key_prefix = join_path(&config.path_prefix, prefix);
    let client = build_s3_client(config);
    let mut files = Vec::new();
    let mut continuation: Option<String> = None;

    loop {
        let mut request = client
            .list_objects_v2()
            .bucket(config.bucket.clone())
            .prefix(key_prefix.clone());
        if let Some(token) = continuation.clone() {
            request = request.continuation_token(token);
        }
        let output = tokio::time::timeout(
            Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
            request.send(),
        )
        .await
        .map_err(|_| {
            AppError::new(
                "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                format!("S3 列表请求超时（{} 秒）", S3_OPERATION_TIMEOUT_SECS),
            )
        })?
        .map_err(|e| {
            AppError::new(
                "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                format!("S3 列表请求失败: {e}"),
            )
        })?;

        if let Some(contents) = output.contents {
            for item in contents {
                let key = item.key.unwrap_or_default();
                if key.ends_with('/') || key.is_empty() {
                    continue;
                }
                let relative_path = strip_base_prefix(&key, &config.path_prefix);
                let normalized = normalize_remote_path(&relative_path);
                if !normalized.starts_with(&format!("{}/", RESOURCE_PREFIX)) {
                    continue;
                }
                let name = file_name_from_path(&normalized);
                if name.is_empty() {
                    continue;
                }
                files.push(ResourceRemoteFileInfo {
                    name,
                    path: normalized,
                    size: item.size.unwrap_or_default().max(0) as u64,
                });
            }
        }

        let truncated = output.is_truncated.unwrap_or(false);
        if !truncated {
            break;
        }
        continuation = output.next_continuation_token;
        if continuation.is_none() {
            break;
        }
    }

    Ok(files)
}
