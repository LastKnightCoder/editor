// 闪卡数据库命令 facade。具体实现按职责拆分到各子模块，保持导出路径与 command 名称不变。

#[path = "flashcard_cards.rs"]
mod flashcard_cards;
#[path = "flashcard_common.rs"]
mod flashcard_common;
#[path = "flashcard_decks.rs"]
mod flashcard_decks;
#[path = "flashcard_review.rs"]
mod flashcard_review;
#[path = "flashcard_schedule.rs"]
mod flashcard_schedule;
#[path = "flashcard_types.rs"]
mod flashcard_types;

pub use flashcard_cards::*;
pub use flashcard_decks::*;
pub use flashcard_review::*;
