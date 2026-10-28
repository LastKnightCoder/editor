use super::calendar_time::CalendarTimeZone;
use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Timelike};
use serde_json::{json, Value};

pub(super) fn day(value: &str) -> Result<i64, String> {
    let parsed = NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| "日期须为 YYYY-MM-DD")?;
    if parsed.format("%Y-%m-%d").to_string() != value || !(1..=9999).contains(&parsed.year()) {
        return Err("日期无效".into());
    }
    Ok(i64::from(parsed.num_days_from_ce() - 719_163))
}
pub(super) fn day_text(value: i64) -> String {
    (NaiveDate::from_ymd_opt(1970, 1, 1).unwrap() + Duration::days(value))
        .format("%Y-%m-%d")
        .to_string()
}
pub(super) fn timestamp(value: &str, zone: CalendarTimeZone) -> Result<i64, String> {
    if value.len() == 10 {
        return Ok(zone.day_start(day(value)?));
    }
    let parsed = DateTime::parse_from_rfc3339(value).map_err(|_| "时间须带明确时区")?;
    if !(1..=9999).contains(&parsed.year()) {
        return Err("时间超出支持范围".into());
    }
    Ok(parsed.timestamp_millis())
}
pub(super) fn iso(time: i64) -> Result<String, String> {
    chrono::Utc
        .timestamp_millis_opt(time)
        .single()
        .map(|date| date.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
        .ok_or_else(|| "时间无效".into())
}
pub(super) fn deadline(value: &Value, zone: CalendarTimeZone) -> Result<Option<i64>, String> {
    if value.is_null() {
        return Ok(None);
    }
    let value = value.as_str().ok_or("截止时间无效")?;
    Ok(Some(if value.len() == 10 {
        zone.day_start(day(value)? + 1) - 1
    } else {
        timestamp(value, zone)?
    }))
}
pub(super) fn window(
    query: &Value,
    zone: CalendarTimeZone,
    required: bool,
) -> Result<Option<(i64, i64)>, String> {
    match (query["start"].as_str(), query["end"].as_str()) {
        (None, None) if !required => Ok(None),
        (Some(start), Some(end)) => {
            let from = timestamp(start, zone)?;
            let to = timestamp(end, zone)?;
            if to < from || zone.day(to) - zone.day(from) > 366 {
                return Err("查询窗口须在 0–366 天内".into());
            }
            Ok(Some((
                from,
                if end.len() == 10 {
                    zone.day_start(day(end)? + 1)
                } else {
                    to
                },
            )))
        }
        _ => Err("查询时间窗口须同时提供 start/end".into()),
    }
}
pub(super) fn schedule(input: &Value, zone: CalendarTimeZone) -> Result<Value, String> {
    let start = input["start"].as_str().ok_or("缺少开始时间")?;
    let end = input["end"].as_str().ok_or("缺少结束时间")?;
    let all = input["allDay"].as_bool().ok_or("全天状态无效")?;
    if all != (start.len() == 10) || all != (end.len() == 10) {
        return Err("全天安排须使用日期，定时安排须使用带时区的时间".into());
    }
    let from = timestamp(start, zone)?;
    let to = timestamp(end, zone)?;
    if to <= from {
        return Err("结束时间必须晚于开始时间，全天结束日期不含当天".into());
    }
    if !all {
        for instant in [from, to] {
            let local = zone
                .0
                .timestamp_millis_opt(instant)
                .single()
                .ok_or("时间无效")?;
            if local.second() != 0 || local.nanosecond() != 0 {
                return Err("日程精确到分钟".into());
            }
            if zone
                .0
                .from_local_datetime(&local.naive_local())
                .earliest()
                .map(|date| date.timestamp_millis())
                != Some(instant)
            {
                return Err("夏令时重复时刻不能无歧义保存".into());
            }
        }
    }
    Ok(
        json!({"start_date":zone.start_of_day(from),"end_date":zone.start_of_day(if all{to-1}else{to}),"start_time":if all{None}else{Some(zone.minute(from))},"end_time":if all{None}else{Some(zone.minute(to))},"all_day":if all{1}else{0}}),
    )
}
pub(super) fn event_times(row: &Value, zone: CalendarTimeZone) -> Result<(String, String), String> {
    let from = row["start_date"].as_i64().ok_or("日程开始日期无效")?;
    let to = row["end_date"].as_i64().unwrap_or(from);
    if row["all_day"] == 1 {
        return Ok((day_text(zone.day(from)), day_text(zone.day(to) + 1)));
    }
    let instant = |date: i64, minutes: i64| -> Result<String, String> {
        if !(0..1440).contains(&minutes) {
            return Err("日程分钟数无效".into());
        }
        let date = zone
            .0
            .timestamp_millis_opt(date)
            .single()
            .ok_or("日程时间无效")?
            .date_naive();
        let local = date
            .and_hms_opt((minutes / 60) as u32, (minutes % 60) as u32, 0)
            .ok_or("日程时间无效")?;
        iso(zone
            .0
            .from_local_datetime(&local)
            .earliest()
            .ok_or("日程处于无效夏令时时刻")?
            .timestamp_millis())
    };
    Ok((
        instant(from, row["start_time"].as_i64().unwrap_or(0))?,
        instant(to, row["end_time"].as_i64().unwrap_or(0))?,
    ))
}
