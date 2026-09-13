use std::future::Future;

use crate::network_policy::{run_with_policy, NetworkPolicy};

#[derive(Debug, Clone)]
pub(crate) struct AppError {
    pub(crate) code: String,
    pub(crate) message: String,
}

impl AppError {
    pub(crate) fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

fn extract_http_status(message: &str) -> Option<u16> {
    for token in message.split(|ch: char| !ch.is_ascii_digit()) {
        if token.len() != 3 {
            continue;
        }
        if let Ok(status) = token.parse::<u16>() {
            if (100..=599).contains(&status) {
                return Some(status);
            }
        }
    }
    None
}

fn should_retry_http_status(status: u16) -> bool {
    status == 408 || status == 429 || (500..=599).contains(&status)
}

fn is_retryable_sync_error(error: &AppError) -> bool {
    if matches!(
        error.code.as_str(),
        "REMOTE_FILE_NOT_FOUND"
            | "SYNC_CONFIG_MISSING"
            | "SETTING_INVALID"
            | "DB_OPEN_FAILED"
            | "REMOTE_VERSION_PARSE_FAILED"
    ) {
        return false;
    }
    if let Some(status) = extract_http_status(&error.message) {
        return should_retry_http_status(status);
    }
    true
}

fn summarize_sync_error(error: &AppError) -> String {
    format!("{}:{}", error.code, error.message)
}

pub(crate) async fn run_sync_policy<T, F, Fut>(
    provider: &'static str,
    op: &'static str,
    timeout_code: &'static str,
    timeout_message: &'static str,
    operation: F,
) -> Result<T, AppError>
where
    F: FnMut(u32) -> Fut,
    Fut: Future<Output = Result<T, AppError>>,
{
    run_sync_policy_with(
        provider,
        op,
        timeout_code,
        timeout_message,
        NetworkPolicy::standard(),
        operation,
    )
    .await
}

pub(crate) async fn run_sync_policy_with<T, F, Fut>(
    provider: &'static str,
    op: &'static str,
    timeout_code: &'static str,
    timeout_message: &'static str,
    policy: NetworkPolicy,
    operation: F,
) -> Result<T, AppError>
where
    F: FnMut(u32) -> Fut,
    Fut: Future<Output = Result<T, AppError>>,
{
    run_with_policy(
        provider,
        op,
        policy,
        operation,
        |attempt, timeout_secs| {
            AppError::new(
                timeout_code,
                format!(
                    "{}超时（{} 秒） provider={} op={} attempt={}",
                    timeout_message, timeout_secs, provider, op, attempt
                ),
            )
        },
        is_retryable_sync_error,
        summarize_sync_error,
    )
    .await
}
