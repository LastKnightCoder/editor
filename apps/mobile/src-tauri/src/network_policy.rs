use std::future::Future;
use std::time::Duration;

#[derive(Debug, Clone, Copy)]
pub struct NetworkPolicy {
    pub timeout_secs: u64,
    pub retry_count: u32,
    pub retry_delay_ms: u64,
    pub retry_backoff_multiplier: u64,
}

impl NetworkPolicy {
    pub const fn new(
        timeout_secs: u64,
        retry_count: u32,
        retry_delay_ms: u64,
        retry_backoff_multiplier: u64,
    ) -> Self {
        Self {
            timeout_secs,
            retry_count,
            retry_delay_ms,
            retry_backoff_multiplier,
        }
    }

    pub const fn standard() -> Self {
        Self::new(12, 2, 1_000, 2)
    }
}

fn backoff_delay_ms(policy: NetworkPolicy, attempt: u32) -> u64 {
    let mut factor = 1_u64;
    let multiplier = policy.retry_backoff_multiplier.max(1);
    for _ in 1..attempt {
        factor = factor.saturating_mul(multiplier);
    }
    policy.retry_delay_ms.saturating_mul(factor)
}

pub async fn run_with_policy<T, E, F, Fut, TimeoutError, Retryable, Summarize>(
    provider: &str,
    op: &str,
    policy: NetworkPolicy,
    mut operation: F,
    timeout_error: TimeoutError,
    is_retryable: Retryable,
    summarize_error: Summarize,
) -> Result<T, E>
where
    F: FnMut(u32) -> Fut,
    Fut: Future<Output = Result<T, E>>,
    TimeoutError: Fn(u32, u64) -> E,
    Retryable: Fn(&E) -> bool,
    Summarize: Fn(&E) -> String,
{
    let max_attempts = policy.retry_count.saturating_add(1);

    for attempt in 1..=max_attempts {
        let result = tokio::time::timeout(
            Duration::from_secs(policy.timeout_secs),
            operation(attempt),
        )
        .await;

        match result {
            Ok(Ok(value)) => return Ok(value),
            Ok(Err(error)) => {
                let retryable = is_retryable(&error);
                let will_retry = retryable && attempt < max_attempts;
                println!(
                    "[network-policy] provider={} op={} attempt={}/{} timeout={}s retryable={} will_retry={} err={}",
                    provider,
                    op,
                    attempt,
                    max_attempts,
                    policy.timeout_secs,
                    retryable,
                    will_retry,
                    summarize_error(&error)
                );
                if will_retry {
                    tokio::time::sleep(Duration::from_millis(backoff_delay_ms(policy, attempt))).await;
                    continue;
                }
                return Err(error);
            }
            Err(_) => {
                let error = timeout_error(attempt, policy.timeout_secs);
                let will_retry = attempt < max_attempts;
                println!(
                    "[network-policy] provider={} op={} attempt={}/{} timeout={}s retryable=true will_retry={} err={}",
                    provider,
                    op,
                    attempt,
                    max_attempts,
                    policy.timeout_secs,
                    will_retry,
                    summarize_error(&error)
                );
                if will_retry {
                    tokio::time::sleep(Duration::from_millis(backoff_delay_ms(policy, attempt))).await;
                    continue;
                }
                return Err(error);
            }
        }
    }

    let error = timeout_error(max_attempts, policy.timeout_secs);
    println!(
        "[network-policy] provider={} op={} attempt={}/{} timeout={}s retryable=true will_retry=false err={}",
        provider,
        op,
        max_attempts,
        max_attempts,
        policy.timeout_secs,
        summarize_error(&error)
    );
    Err(error)
}
