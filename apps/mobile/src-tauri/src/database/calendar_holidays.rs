use std::{collections::HashMap, sync::OnceLock, time::Duration};

use chrono::{Datelike, Duration as DateDuration, NaiveDate};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use super::{calendar_time::CalendarTimeZone, common::now_millis};

pub type HolidayDays = HashMap<i64, bool>;
const CACHE_MS: i64 = 30 * 86_400_000;
const RETRY_MS: i64 = 300_000;

#[derive(Clone, Serialize, Deserialize)]
struct YearCache {
    fetched_at: i64,
    days: HashMap<String, bool>,
}

#[derive(Deserialize)]
struct HolidayResponse {
    code: i32,
    holiday: HashMap<String, HolidayInfo>,
}

#[derive(Deserialize)]
struct HolidayInfo {
    date: String,
    holiday: bool,
}

fn parse_response(response: HolidayResponse) -> Result<HashMap<String, bool>, String> {
    if response.code != 0 {
        return Err("节假日服务返回失败状态".into());
    }
    let mut days = HashMap::new();
    for info in response.holiday.into_values() {
        NaiveDate::parse_from_str(&info.date, "%Y-%m-%d").map_err(|e| e.to_string())?;
        days.insert(info.date, info.holiday);
    }
    Ok(days)
}

// 网络请求和缓存读取在数据库事务外执行；失败使用旧缓存，无缓存时按周末降级。
pub async fn load_holidays(
    app: &tauri::AppHandle,
    start: i64,
    end: i64,
    zone: CalendarTimeZone,
) -> Result<HolidayDays, String> {
    static CACHE: OnceLock<tokio::sync::Mutex<HashMap<i32, (YearCache, i64)>>> = OnceLock::new();
    let mut cache = CACHE.get_or_init(Default::default).lock().await;
    let epoch = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap();
    // 顺延最长 365 天，查询窗口之前的候选也可能顺延进当前范围。
    let first = epoch + DateDuration::days(zone.day(start) - 365);
    let last = epoch + DateDuration::days(zone.day(end));
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("calendar-holidays");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
        .map_err(|e| e.to_string())?;
    let mut result = HolidayDays::new();
    for year in first.year()..=last.year() {
        let file = dir.join(format!("{year}.json"));
        if !cache.contains_key(&year) {
            if let Ok(text) = std::fs::read_to_string(&file) {
                if let Ok(saved) = serde_json::from_str::<YearCache>(&text) {
                    cache.insert(year, (saved, 0));
                }
            }
        }
        let now = now_millis();
        let fresh = cache
            .get(&year)
            .is_some_and(|(saved, retry_at)| now - saved.fetched_at < CACHE_MS || now < *retry_at);
        if !fresh {
            let fetched = async {
                let response = client
                    .get(format!("https://timor.tech/api/holiday/year/{year}"))
                    .send()
                    .await
                    .map_err(|e| e.to_string())?
                    .error_for_status()
                    .map_err(|e| e.to_string())?
                    .json::<HolidayResponse>()
                    .await
                    .map_err(|e| e.to_string())?;
                parse_response(response)
            }
            .await;
            match fetched {
                Ok(days) => {
                    let saved = YearCache {
                        fetched_at: now,
                        days,
                    };
                    if let Err(error) = std::fs::create_dir_all(&dir)
                        .and_then(|_| std::fs::write(&file, serde_json::to_vec(&saved)?))
                    {
                        crate::logger::warn(format!("CALENDAR_HOLIDAY_CACHE_FAILED: {error}"));
                    }
                    cache.insert(year, (saved, 0));
                }
                Err(error) => {
                    crate::logger::warn(format!(
                        "CALENDAR_HOLIDAY_UNAVAILABLE: {year}: {error}; 使用缓存或周末规则"
                    ));
                    let entry = cache.entry(year).or_insert((
                        YearCache {
                            fetched_at: 0,
                            days: HashMap::new(),
                        },
                        0,
                    ));
                    entry.1 = now + RETRY_MS;
                }
            }
        }
        if let Some((saved, _)) = cache.get(&year) {
            for (date, holiday) in &saved.days {
                if let Ok(date) = NaiveDate::parse_from_str(date, "%Y-%m-%d") {
                    result.insert(i64::from(date.num_days_from_ce() - 719_163), *holiday);
                }
            }
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_boolean_and_month_day_key_use_full_date() {
        let response = serde_json::from_str(r#"{"code":0,"holiday":{"10-01":{"date":"2026-10-01","holiday":true},"10-10":{"date":"2026-10-10","holiday":false}}}"#).unwrap();
        let days = parse_response(response).unwrap();
        assert_eq!(days.get("2026-10-01"), Some(&true));
        assert_eq!(days.get("2026-10-10"), Some(&false));
    }
}
