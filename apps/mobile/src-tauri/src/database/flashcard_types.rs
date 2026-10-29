use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── 领域类型（serde camelCase，与前端 types.ts / 桌面端 types/flashcard.ts 一致）──
// prompt/detail/data 均为 Slate JSON，Rust 侧只透传不解析（判分在前端 reviewFlow.ts）。

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardDeckStats {
    pub total_cards: i64,
    pub due_cards: i64,
    pub new_cards: i64,
    pub learning_cards: i64,
    pub last_review_time: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardDeck {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub cover_color: String,
    pub emoji: String,
    pub sort_order: i64,
    pub meta: Option<Value>,
    pub create_time: i64,
    pub update_time: i64,
    pub stats: Option<FlashcardDeckStats>,
}

/// 参考资料行带的 contents 快照（LEFT JOIN，原内容被删则为 None）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardReferenceContent {
    pub id: i64,
    pub content: Value,
    pub create_time: i64,
    pub update_time: i64,
    pub count: i64,
    pub ref_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardReference {
    pub id: i64,
    pub card_id: i64,
    pub content_id: i64,
    pub ref_type: String, // content | custom
    pub title: String,
    pub create_time: i64,
    pub update_time: i64,
    pub content: Option<FlashcardReferenceContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Flashcard {
    pub id: i64,
    pub deck_id: i64,
    #[serde(rename = "type")]
    pub card_type: String, // single-choice | multiple-choice | cloze | qa | boolean
    pub prompt: Value,
    pub detail: Value,
    pub data: Value,
    pub tags: Vec<String>,
    pub difficulty: String, // foundation | standard | advanced
    pub due_time: i64,
    pub last_review_time: Option<i64>,
    pub review_count: i64,
    /// FSRS 记忆状态（稳定性/难度），None = 新卡未学
    pub memory_stability: Option<f64>,
    pub memory_difficulty: Option<f64>,
    pub status: String, // new | learning | review | suspended
    pub reference_summary: Option<String>,
    pub references: Vec<FlashcardReference>,
    pub create_time: i64,
    pub update_time: i64,
}

// ── payload ──

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFlashcardDeckPayload {
    pub name: String,
    pub description: Option<String>,
    pub cover_color: Option<String>,
    pub emoji: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFlashcardDeckPayload {
    pub id: i64,
    pub name: Option<String>,
    pub description: Option<String>,
    pub cover_color: Option<String>,
    pub emoji: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFlashcardDeckPayload {
    pub id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListFlashcardsPayload {
    pub deck_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetFlashcardPayload {
    pub id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardReferenceInput {
    pub ref_type: String,
    pub content_id: Option<i64>,
    pub content_created_at: Option<i64>,
    pub custom_content: Option<Value>,
    pub contracts: Option<Value>,
    pub count: Option<i64>,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFlashcardPayload {
    pub deck_id: i64,
    #[serde(rename = "type")]
    pub card_type: String,
    pub prompt: Value,
    pub detail: Option<Value>,
    pub data: Option<Value>,
    pub tags: Option<Vec<String>>,
    pub difficulty: Option<String>,
    pub references: Option<Vec<FlashcardReferenceInput>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFlashcardPayload {
    pub id: i64,
    pub deck_id: Option<i64>,
    #[serde(rename = "type")]
    pub card_type: Option<String>,
    pub prompt: Option<Value>,
    pub detail: Option<Value>,
    pub data: Option<Value>,
    pub tags: Option<Vec<String>>,
    pub difficulty: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFlashcardPayload {
    pub id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardReviewQueuePayload {
    pub deck_id: Option<i64>,
    pub limit: Option<i64>,
}

/// 单日复习统计（day_start 由前端按本地时区计算，避免 UTC 切日偏移）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardReviewDayStats {
    pub day_start: i64,
    pub count: i64,
    pub easy: i64,
    pub normal: i64,
    pub struggle: i64,
    pub hard: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardReviewStatsPayload {
    pub day_starts: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitFlashcardReviewPayload {
    pub card_id: i64,
    pub deck_id: i64,
    pub rating: String, // easy | normal | struggle | hard
    pub notes: Option<String>,
}
