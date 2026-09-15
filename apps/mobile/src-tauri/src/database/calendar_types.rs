use serde::{Deserialize, Serialize};
use serde_json::Value;

// 日历域出参 DTO：字段名与桌面端 types/calendar.ts 对齐（serde camelCase）。
// detailContent 透传 Slate JSON（Rust 不解析结构，闪卡同款约定）；
// calendarTitle / calendarColor / isInSystemEvent 为查询时 JOIN 出的派生字段，
// 供列表与详情页直接渲染，不落库。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarGroupDto {
    pub id: i64,
    pub name: String,
    pub is_system: bool,
    pub parent_group_id: Option<i64>,
    pub order_index: i64,
    pub create_time: i64,
    pub update_time: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDto {
    pub id: i64,
    pub title: String,
    pub color: String,
    pub description_content_id: i64,
    pub archived: bool,
    pub pinned: bool,
    pub visible: bool,
    pub order_index: i64,
    pub group_id: Option<i64>,
    pub create_time: i64,
    pub update_time: i64,
    /// 派生字段：自身或父分组 is_system（两层语义，对齐桌面 calendar.ts）
    pub is_in_system_group: bool,
    /// 派生字段：日历下事件数（管理页与删除确认展示）
    pub event_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEventDto {
    pub id: i64,
    pub calendar_id: i64,
    pub title: String,
    pub detail_content_id: i64,
    pub start_date: i64,
    pub end_date: Option<i64>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    /// 覆盖日历色，None = 继承日历颜色
    pub color: Option<String>,
    pub all_day: bool,
    pub value: Option<f64>,
    /// 仅 get_by_id 预加载；范围查询不返回（列表不渲染富文本）
    pub detail_content: Option<Value>,
    pub calendar_title: Option<String>,
    pub calendar_color: Option<String>,
    pub is_in_system_event: bool,
}

// ── payload ──

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCalendarPayload {
    pub title: String,
    pub color: Option<String>,
    pub visible: Option<bool>,
    pub order_index: Option<i64>,
    pub group_id: Option<i64>,
    pub archived: Option<bool>,
    pub pinned: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCalendarPayload {
    pub id: i64,
    pub title: Option<String>,
    pub color: Option<String>,
    pub archived: Option<bool>,
    pub pinned: Option<bool>,
    pub visible: Option<bool>,
    pub order_index: Option<i64>,
    pub group_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarByIdPayload {
    pub id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCalendarEventPayload {
    pub calendar_id: i64,
    pub title: String,
    pub detail_content_id: Option<i64>,
    pub detail_content: Option<Value>,
    pub detail_content_count: Option<i64>,
    pub start_date: i64,
    pub end_date: Option<i64>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub color: Option<String>,
    pub all_day: bool,
    pub value: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCalendarEventPayload {
    pub id: i64,
    pub calendar_id: i64,
    pub title: String,
    pub detail_content_id: Option<i64>,
    pub detail_content: Option<Value>,
    pub detail_content_count: Option<i64>,
    pub start_date: i64,
    pub end_date: Option<i64>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub color: Option<String>,
    pub all_day: bool,
    pub value: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEventDateRangePayload {
    pub start_date: i64,
    pub end_date: i64,
    /// None 表示全部；空数组表示不选任何日历。
    pub calendar_ids: Option<Vec<i64>>,
    /// IANA 时区身份，按事件目标日期计算本地日界。
    pub time_zone: crate::database::calendar_time::CalendarTimeZone,
}
