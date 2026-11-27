use chrono::{Datelike, Duration, NaiveDate, TimeZone, Timelike};
use chrono_tz::Tz;
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(transparent)]
pub struct CalendarTimeZone(pub Tz);

impl CalendarTimeZone {
    pub fn day(self, timestamp: i64) -> i64 {
        let date = self
            .0
            .timestamp_millis_opt(timestamp)
            .single()
            .expect("有效日期时间戳")
            .date_naive();
        i64::from(date.num_days_from_ce() - 719_163)
    }

    pub fn day_start(self, day: i64) -> i64 {
        let date = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap() + Duration::days(day);
        let midnight = date.and_hms_opt(0, 0, 0).unwrap();
        // 少数时区在零点跳时：选择该日首个有效时刻；重叠时选择较早者。
        for minute in 0..=1440 {
            if let Some(local) = self
                .0
                .from_local_datetime(&(midnight + Duration::minutes(minute)))
                .earliest()
            {
                return local.timestamp_millis();
            }
        }
        unreachable!("IANA 时区日界应在 24 小时内恢复")
    }

    pub fn start_of_day(self, timestamp: i64) -> i64 {
        self.day_start(self.day(timestamp))
    }

    pub fn event_instant(
        self,
        day: i64,
        minute: i64,
        previous: Option<i64>,
    ) -> Result<i64, String> {
        if !(0..1440).contains(&minute) {
            return Err("日程分钟数无效".into());
        }
        if let Some(time) =
            previous.filter(|time| self.start_of_day(*time) == day && self.minute(*time) == minute)
        {
            return Ok(time);
        }
        let date = self
            .0
            .timestamp_millis_opt(day)
            .single()
            .ok_or("日程日期无效")?
            .date_naive();
        let local = date
            .and_hms_opt((minute / 60) as u32, (minute % 60) as u32, 0)
            .ok_or("日程时间无效")?;
        self.0
            .from_local_datetime(&local)
            .earliest()
            .map(|value| value.timestamp_millis())
            .ok_or_else(|| "该时刻在设备时区不存在，请重新选择时间".into())
    }

    pub fn minute(self, timestamp: i64) -> i64 {
        let local = self
            .0
            .timestamp_millis_opt(timestamp)
            .single()
            .expect("有效日期时间戳");
        i64::from(local.hour() * 60 + local.minute())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_date_resolves_its_own_offset_and_dst_day_length() {
        let tz = CalendarTimeZone(chrono_tz::America::New_York);
        let winter =
            tz.0.with_ymd_and_hms(2026, 1, 15, 0, 0, 0)
                .unwrap()
                .timestamp_millis();
        assert_eq!(tz.start_of_day(winter), winter);
        for (month, day, hours) in [(3, 8, 23), (11, 1, 25)] {
            let start =
                tz.0.with_ymd_and_hms(2026, month, day, 0, 0, 0)
                    .unwrap()
                    .timestamp_millis();
            assert_eq!(tz.day_start(tz.day(start) + 1) - start, hours * 3_600_000);
            let noon =
                tz.0.with_ymd_and_hms(2026, month, day, 12, 0, 0)
                    .unwrap()
                    .timestamp_millis();
            assert_eq!(tz.minute(noon), 720);
        }
    }
}
