// 番茄钟 ⇄ 日历桥（对齐桌面 modules/pomodoro.ts 的 createCalendarEventForSession /
// splitCrossDaySession / 会话删除清理）。被 pomodoro_active / pomodoro_history 在事务内调用，
// 不暴露 Tauri command。两端一致性关键：纯移动端完成的会话必须落日历事件，
// 否则整库同步到桌面后统计口径永久分叉（迁移方案 §5.4）。

use rusqlite::{params, OptionalExtension, Transaction};

use crate::database::calendar_time::CalendarTimeZone;
use crate::database::common::{now_millis, write_operation};
use crate::database::todo_calendar_sync::ensure_todo_calendars;

const POMODORO_CALENDAR_TITLE: &str = "番茄钟";
const POMODORO_CALENDAR_COLOR: &str = "red";
const DAY_END_MINUTE: i64 = 24 * 60 - 1;

struct CalendarEventSegment {
    start_date: i64,
    /// 对齐桌面 splitCrossDaySession：跨天段是单日事件，endDate = 当天；同日段为 None
    end_date: Option<i64>,
    start_time: i64,
    end_time: i64,
}

// 对齐桌面 splitCrossDaySession：按本地日界切段。
// 同一天 → 单段 [startMin, endMin]；跨天 → 首段到 23:59、中间整天、尾段从 00:00。
fn split_cross_day_session(
    start_time: i64,
    end_time: i64,
    time_zone: CalendarTimeZone,
) -> Vec<CalendarEventSegment> {
    let start_day = time_zone.day(start_time);
    let end_day = time_zone.day(end_time);
    let day_start = |day: i64| time_zone.day_start(day);
    let minute_of = |ts: i64, _day: i64| time_zone.minute(ts);

    if start_day == end_day {
        return vec![CalendarEventSegment {
            start_date: day_start(start_day),
            end_date: None,
            start_time: minute_of(start_time, start_day),
            end_time: minute_of(end_time, start_day),
        }];
    }

    let mut segments = vec![CalendarEventSegment {
        start_date: day_start(start_day),
        end_date: Some(day_start(start_day)),
        start_time: minute_of(start_time, start_day),
        end_time: DAY_END_MINUTE,
    }];
    let mut cursor = start_day + 1;
    while cursor < end_day {
        segments.push(CalendarEventSegment {
            start_date: day_start(cursor),
            end_date: Some(day_start(cursor)),
            start_time: 0,
            end_time: DAY_END_MINUTE,
        });
        cursor += 1;
    }
    segments.push(CalendarEventSegment {
        start_date: day_start(end_day),
        end_date: Some(day_start(end_day)),
        start_time: 0,
        end_time: minute_of(end_time, end_day),
    });
    segments
}

// 系统分组下的「番茄钟」日历：不存在则创建（含系统分组 ensure，方案 §5.4；
// 桌面只报错不创建，移动端补 ensure 以保证首次使用即可落事件）。
fn ensure_pomodoro_calendar(tx: &Transaction<'_>) -> Result<i64, String> {
    // 复用 todo 侧 ensure：保证「系统日历」分组存在（单测覆盖的共享路径）
    ensure_todo_calendars(tx)?;
    let now = now_millis();
    let existing: Option<i64> = tx
        .query_row(
            "SELECT c.id FROM calendar c \
             JOIN calendar_group g ON g.id = c.group_id \
             WHERE c.title = ?1 AND g.is_system = 1 ORDER BY c.id ASC LIMIT 1",
            params![POMODORO_CALENDAR_TITLE],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("POMODORO_CALENDAR_FAILED: Failed to query pomodoro calendar: {e}"))?;
    if let Some(id) = existing {
        return Ok(id);
    }
    // 系统分组：todo 侧 ensure 已保证存在；取 is_system=1 的第一个
    let system_group_id: i64 = tx
        .query_row(
            "SELECT id FROM calendar_group WHERE is_system = 1 ORDER BY id ASC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("POMODORO_CALENDAR_FAILED: Failed to query system group: {e}"))?
        .ok_or_else(|| "POMODORO_CALENDAR_FAILED: System calendar group missing".to_string())?;
    tx.execute(
        "
        INSERT INTO calendar
        (create_time, update_time, title, color, description_content_id, archived, pinned, visible, order_index, group_id)
        VALUES (?1, ?1, ?2, ?3, 0, 0, 0, 1, 0, ?4)
        ",
        params![now, POMODORO_CALENDAR_TITLE, POMODORO_CALENDAR_COLOR, system_group_id],
    )
    .map_err(|e| format!("POMODORO_CALENDAR_FAILED: Failed to create pomodoro calendar: {e}"))?;
    Ok(tx.last_insert_rowid())
}

// 会话完成 → 写事件 + mapping。session_id 由调用方在会话 INSERT 后传入。
// 事件颜色/数值/详情均空（对齐桌面 createEvent 参数），标题「🍅 预设名」。
pub fn create_calendar_events_for_session(
    tx: &Transaction<'_>,
    session_id: i64,
    preset_name: &str,
    session_start: i64,
    session_end: i64,
    time_zone: CalendarTimeZone,
) -> Result<(), String> {
    let calendar_id = ensure_pomodoro_calendar(tx)?;
    let now = now_millis();
    let title = format!("🍅 {preset_name}");
    for segment in split_cross_day_session(session_start, session_end, time_zone) {
        tx.execute(
            "
            INSERT INTO calendar_event
            (create_time, update_time, calendar_id, title, detail_content_id, start_date, end_date, start_time, end_time, color, all_day, value)
            VALUES (?1, ?1, ?2, ?3, 0, ?4, ?5, ?6, ?7, NULL, 0, NULL)
            ",
            params![
                now,
                calendar_id,
                title,
                segment.start_date,
                segment.end_date,
                segment.start_time,
                segment.end_time,
            ],
        )
        .map_err(|e| format!("POMODORO_CALENDAR_FAILED: Failed to create session event: {e}"))?;
        let event_id = tx.last_insert_rowid();
        write_operation(tx, "calendar_event", "insert", event_id, now)?;
        // 映射失败必须向上返回，由会话事务回滚事件写入。
        tx.execute(
            "
            INSERT INTO pomodoro_calendar_mapping (pomodoro_session_id, calendar_event_id, create_time)
            VALUES (?1, ?2, ?3)
            ",
            params![session_id, event_id, now],
        ).map_err(|e| format!("POMODORO_CALENDAR_FAILED: Failed to create session mapping: {e}"))?;
    }
    Ok(())
}

// 会话删除时清理事件和映射，任何一步失败均由调用方事务回滚。
pub fn delete_calendar_events_for_session(
    tx: &Transaction<'_>,
    session_id: i64,
) -> Result<(), String> {
    let mut stmt = tx
        .prepare("SELECT id, calendar_event_id FROM pomodoro_calendar_mapping WHERE pomodoro_session_id = ?1")
        .map_err(|e| format!("POMODORO_CALENDAR_FAILED: Failed to query session mappings: {e}"))?;
    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("POMODORO_CALENDAR_FAILED: Failed to query session mappings: {e}"))?;
    let mut mapping_ids = Vec::new();
    let mut event_ids = Vec::new();
    for row in rows {
        let (mapping_id, event_id) =
            row.map_err(|e| format!("POMODORO_CALENDAR_FAILED: Failed to parse mapping row: {e}"))?;
        mapping_ids.push(mapping_id);
        event_ids.push(event_id);
    }
    drop(stmt);
    for mapping_id in mapping_ids {
        tx.execute(
            "DELETE FROM pomodoro_calendar_mapping WHERE id = ?1",
            params![mapping_id],
        )
        .map_err(|e| format!("POMODORO_CALENDAR_FAILED: Failed to delete mapping: {e}"))?;
    }
    let now = now_millis();
    for event_id in event_ids {
        // 番茄钟事件 detail_content_id 恒为 0，无内容清理；
        // 系统日历事件不受用户写保护约束（这是系统自身的清理路径）
        write_operation(tx, "calendar_event", "delete", event_id, now)?;
        tx.execute(
            "DELETE FROM calendar_event WHERE id = ?1",
            params![event_id],
        )
        .map_err(|e| format!("POMODORO_CALENDAR_FAILED: Failed to delete event: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    const TZ_UTC8: CalendarTimeZone = CalendarTimeZone(chrono_tz::Asia::Shanghai);

    fn database() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "
            CREATE TABLE calendar_group (
                id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_system INTEGER,
                order_index INTEGER, create_time INTEGER, update_time INTEGER,
                parent_group_id INTEGER
            );
            CREATE TABLE calendar (
                id INTEGER PRIMARY KEY, title TEXT, color TEXT,
                description_content_id INTEGER, archived INTEGER, pinned INTEGER,
                visible INTEGER, order_index INTEGER, group_id INTEGER,
                create_time INTEGER, update_time INTEGER
            );
            CREATE TABLE calendar_event (
                id INTEGER PRIMARY KEY, create_time INTEGER, update_time INTEGER,
                calendar_id INTEGER NOT NULL, title TEXT NOT NULL,
                detail_content_id INTEGER DEFAULT 0, start_date INTEGER NOT NULL,
                end_date INTEGER, start_time INTEGER, end_time INTEGER,
                color TEXT, all_day INTEGER DEFAULT 0, value REAL DEFAULT NULL
            );
            CREATE TABLE pomodoro_calendar_mapping (
                id INTEGER PRIMARY KEY, pomodoro_session_id INTEGER NOT NULL,
                calendar_event_id INTEGER NOT NULL, create_time INTEGER NOT NULL,
                UNIQUE(pomodoro_session_id, calendar_event_id)
            );
            CREATE TABLE operation (
                id INTEGER PRIMARY KEY, operation_time INTEGER, operation_id INTEGER,
                operation_content_type TEXT, operation_action TEXT
            );
            ",
            )
            .unwrap();
        connection
    }

    type SegmentRow = (i64, Option<i64>, i64, i64, i64);

    fn insert_session_event(
        mut connection: Connection,
        start: i64,
        end: i64,
        preset: &str,
        tz: CalendarTimeZone,
    ) -> (Connection, Vec<SegmentRow>) {
        let tx = connection.transaction().unwrap();
        create_calendar_events_for_session(&tx, 100, preset, start, end, tz).unwrap();
        let rows: Vec<SegmentRow> = {
            let mut stmt = tx
                .prepare("SELECT start_date, end_date, start_time, end_time, id FROM calendar_event ORDER BY start_date, start_time")
                .unwrap();
            stmt.query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
        };
        tx.commit().unwrap();
        (connection, rows)
    }

    #[test]
    fn session_on_same_day_creates_single_segment() {
        let connection = database();
        // 本地 2025-09-15 14:00–15:30（UTC 06:00–07:30）
        let start = 1757916000_000; // 2025-09-15T06:00:00Z
        let end = 1757921400_000;
        let (_connection, segments) =
            insert_session_event(connection, start, end, "深度工作", TZ_UTC8);
        assert_eq!(segments.len(), 1);
        let (start_date, end_date, start_time, end_time, _) = segments[0];
        assert_eq!(start_date, 1757865600_000); // 本地 9/15 0 点（= UTC 9/14 16:00）
        assert_eq!(end_date, None);
        assert_eq!(start_time, 14 * 60);
        assert_eq!(end_time, 15 * 60 + 30);
    }

    #[test]
    fn session_across_days_is_split_into_segments() {
        let connection = database();
        // 本地 9/15 23:00 → 9/16 01:00（UTC 15:00 → 17:00）
        let start = 1757948400_000; // 2025-09-15T15:00:00Z
        let end = 1757955600_000; // 2025-09-15T17:00:00Z
        let (connection, segments) =
            insert_session_event(connection, start, end, "熬夜赶工", TZ_UTC8);
        assert_eq!(segments.len(), 2);
        let day15 = TZ_UTC8.day(start);
        let day16 = TZ_UTC8.day(end);
        assert_eq!(day16, day15 + 1);
        let (s1, ed1, st1, et1, _) = segments[0];
        let (s2, ed2, st2, et2, _) = segments[1];
        // 对齐桌面：跨天段是单日事件，endDate = 当天
        assert_eq!(
            (s1, ed1, st1, et1),
            (
                TZ_UTC8.day_start(day15),
                Some(TZ_UTC8.day_start(day15)),
                23 * 60,
                DAY_END_MINUTE
            )
        );
        assert_eq!(
            (s2, ed2, st2, et2),
            (
                TZ_UTC8.day_start(day16),
                Some(TZ_UTC8.day_start(day16)),
                0,
                60
            )
        );
        // 每段都有 mapping，且标题带预设名
        let mapping_count: i64 = {
            connection
                .query_row("SELECT COUNT(*) FROM pomodoro_calendar_mapping", [], |r| {
                    r.get(0)
                })
                .unwrap()
        };
        assert_eq!(mapping_count, 2);
        let title: String = {
            connection
                .query_row("SELECT title FROM calendar_event LIMIT 1", [], |r| r.get(0))
                .unwrap()
        };
        assert_eq!(title, "🍅 熬夜赶工");
    }

    #[test]
    fn user_calendar_with_same_title_is_not_reused() {
        let mut connection = database();
        // 预置一个不在系统分组下的用户日历，标题也叫「番茄钟」
        {
            let tx = connection.transaction().unwrap();
            ensure_todo_calendars(&tx).unwrap(); // 先建出系统分组
            tx.execute(
                "INSERT INTO calendar (create_time, update_time, title, color, description_content_id, archived, pinned, visible, order_index, group_id)
                 VALUES (0, 0, '番茄钟', 'blue', 0, 0, 0, 1, 0, NULL)",
                [],
            )
            .unwrap();
            tx.commit().unwrap();
        }
        let user_calendar_id: i64 = connection
            .query_row("SELECT id FROM calendar WHERE group_id IS NULL", [], |r| {
                r.get(0)
            })
            .unwrap();
        let start = 1757916000_000;
        let end = 1757921400_000;
        let (connection, _) = insert_session_event(connection, start, end, "深度工作", TZ_UTC8);
        let event_calendar_id: i64 = connection
            .query_row("SELECT calendar_id FROM calendar_event LIMIT 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_ne!(event_calendar_id, user_calendar_id);
        // 事件落在系统分组下的番茄钟日历
        let group_is_system: i64 = connection
            .query_row(
                "SELECT g.is_system FROM calendar c JOIN calendar_group g ON g.id = c.group_id WHERE c.id = ?1",
                [event_calendar_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(group_is_system, 1);
    }

    #[test]
    fn delete_session_removes_events_and_mappings() {
        let connection = database();
        let start = 1757916000_000;
        let end = 1757921400_000;
        let (mut connection, _) = insert_session_event(connection, start, end, "深度工作", TZ_UTC8);
        let tx = connection.transaction().unwrap();
        delete_calendar_events_for_session(&tx, 100).unwrap();
        let (events, mappings): (i64, i64) = tx
            .query_row(
                "SELECT (SELECT COUNT(*) FROM calendar_event), (SELECT COUNT(*) FROM pomodoro_calendar_mapping)",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        tx.commit().unwrap();
        assert_eq!((events, mappings), (0, 0));
    }

    #[test]
    fn pomodoro_calendar_is_created_under_system_group() {
        let connection = database();
        let start = 1757916000_000;
        let end = 1757921400_000;
        let (connection, _) = insert_session_event(connection, start, end, "深度工作", TZ_UTC8);
        // ensure_todo_calendars 建「系统日历」组，「番茄钟」日历挂在其下
        let (title, group_is_system): (String, i64) = connection
            .query_row(
                "SELECT c.title, g.is_system FROM calendar c JOIN calendar_group g ON g.id = c.group_id \
                 WHERE c.title = '番茄钟'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((title.as_str(), group_is_system), ("番茄钟", 1));
    }
}
