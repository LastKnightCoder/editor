use serde::{Deserialize, Serialize};

// ── 数据类型（serde camelCase，与前端 types.ts / 桌面端 pomodoro.ts 一致） ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroPreset {
    pub id: i64,
    pub name: String,
    pub mode: String, // countdown | countup
    pub duration_min: i64,
    pub sort_order: i64,
    pub archived: bool,
    pub create_time: i64,
    pub update_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroPauseSpan {
    pub start: i64,
    pub end: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroSession {
    pub id: i64,
    pub preset_id: i64,
    pub start_time: i64,
    pub end_time: Option<i64>,
    pub expected_ms: Option<i64>,
    pub focus_ms: i64,
    pub pause_total_ms: i64,
    pub pause_count: i64,
    pub pauses: Vec<PomodoroPauseSpan>,
    pub status: String, // running | paused（内存态）completed | stopped（落库态）
    pub create_time: i64,
    pub update_time: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroSummary {
    pub count: i64,
    pub focus_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroDailySummary {
    pub day_start: i64,
    pub count: i64,
    pub focus_ms: i64,
}

// ── payload ──

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePomodoroPresetPayload {
    pub name: String,
    pub mode: String,
    pub duration_min: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePomodoroPresetPayload {
    pub id: i64,
    pub name: Option<String>,
    pub mode: Option<String>,
    pub duration_min: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivePomodoroPresetPayload {
    pub id: i64,
    pub archived: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderPomodoroPresetsPayload {
    pub ordered_ids: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPomodoroSessionPayload {
    pub preset_id: i64,
    pub expected_ms: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopPomodoroSessionPayload {
    pub as_complete: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPomodoroSessionsPayload {
    pub preset_id: Option<i64>,
    pub start: Option<i64>,
    pub end: Option<i64>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePomodoroSessionPayload {
    pub session_id: i64,
    pub focus_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePomodoroPresetPayload {
    pub id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePomodoroSessionPayload {
    pub session_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePomodoroSessionsPayload {
    pub session_ids: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroDailySummaryPayload {
    pub day_starts: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroRangePayload {
    pub start: i64,
    pub end: i64,
}

pub(crate) struct ActivePomodoro {
    pub(crate) db_name: String,
    pub(crate) session: PomodoroSession,
}
