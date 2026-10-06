// 日历数据库命令 facade。具体实现按职责拆分到各子模块，保持导出路径与 command 名称不变。

#[path = "calendar_calendars.rs"]
mod calendar_calendars;
#[path = "calendar_events.rs"]
mod calendar_events;
#[path = "calendar_pomodoro.rs"]
mod calendar_pomodoro;
#[path = "calendar_types.rs"]
mod calendar_types;

pub use calendar_calendars::*;
pub use calendar_events::*;

// 番茄钟桥不暴露 command，仅供 pomodoro 域在事务内调用
pub(crate) use calendar_pomodoro::{
    create_calendar_events_for_session, delete_calendar_events_for_session,
};
