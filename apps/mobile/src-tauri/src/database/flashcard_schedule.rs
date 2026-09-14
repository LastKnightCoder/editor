// 闪卡复习调度算法（间隔阶梯 + ease 因子）。
// 金标准为桌面端 apps/desktop/src-electron/main/modules/tables/flashcard.ts 的
// REVIEW_INTERVALS / RATING_DELTA / EASE_DELTA / calculateSchedule——两端算法
// 必须逐字段一致，同一张卡在两端复习的调度结果才会收敛。修改任何常量前先同步桌面端。

pub(crate) const REVIEW_INTERVALS_MS: [i64; 10] = [
    5 * 60 * 1000,        // 5 分钟
    30 * 60 * 1000,       // 30 分钟
    12 * 60 * 60 * 1000,  // 12 小时
    24 * 60 * 60 * 1000,  // 1 天
    2 * 24 * 60 * 60 * 1000,  // 2 天
    4 * 24 * 60 * 60 * 1000,  // 4 天
    7 * 24 * 60 * 60 * 1000,  // 1 周
    15 * 24 * 60 * 60 * 1000, // 15 天
    30 * 24 * 60 * 60 * 1000, // 1 个月
    60 * 24 * 60 * 60 * 1000, // 2 个月
];

const EASE_MIN: f64 = 1.3;
const EASE_MAX: f64 = 3.5;

/// 评分对 review_level 的增量：easy=+2, normal=+1, struggle=-1, hard=-2
fn rating_delta(rating: &str) -> Option<i32> {
    match rating {
        "easy" => Some(2),
        "normal" => Some(1),
        "struggle" => Some(-1),
        "hard" => Some(-2),
        _ => None,
    }
}

/// 评分对 ease_factor 的增量：easy=+0.15, normal=0, struggle=-0.1, hard=-0.25
fn ease_delta(rating: &str) -> f64 {
    match rating {
        "easy" => 0.15,
        "struggle" => -0.1,
        "hard" => -0.25,
        _ => 0.0,
    }
}

pub(crate) struct NextSchedule {
    pub level: i64,
    pub ease: f64,
    pub due_ms: i64,
    pub interval_ms: i64,
    pub status: String,
}

/// 由当前调度状态推下一次复习安排。返回 None 表示 rating 不合法。
pub(crate) fn calculate_schedule(
    review_level: i64,
    ease_factor: f64,
    review_count: i64,
    rating: &str,
    now_ms: i64,
) -> Option<NextSchedule> {
    let delta = rating_delta(rating)?;
    let max_level = REVIEW_INTERVALS_MS.len() as i64 - 1;
    let level = (review_level + delta as i64).clamp(0, max_level);
    let ease = (ease_factor + ease_delta(rating)).clamp(EASE_MIN, EASE_MAX);
    let interval_ms = (REVIEW_INTERVALS_MS[level as usize] as f64 * (0.8 + ease * 0.2)).round() as i64;
    // 桌面端语义：复习满 3 次且非 hard 即进入巩固期，否则保持学习中
    let next_review_count = review_count + 1;
    let status = if next_review_count >= 3 && rating != "hard" {
        "review"
    } else {
        "learning"
    };
    Some(NextSchedule {
        level,
        ease,
        due_ms: now_ms + interval_ms,
        interval_ms,
        status: status.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_700_000_000_000;

    #[test]
    fn easy_from_defaults() {
        // 桌面对照：level 0+2=2（12h 档），ease 2.5+0.15=2.65 → 12h × 1.33 = 57_456_000ms
        let s = calculate_schedule(0, 2.5, 0, "easy", NOW).unwrap();
        assert_eq!(s.level, 2);
        assert!((s.ease - 2.65).abs() < 1e-9);
        assert_eq!(s.due_ms, NOW + s.interval_ms);
        assert_eq!(s.interval_ms, ((12 * 3_600_000) as f64 * 1.33).round() as i64);
        assert_eq!(s.status, "learning"); // review_count 1 < 3
    }

    #[test]
    fn normal_progresses_one_level() {
        let s = calculate_schedule(3, 2.5, 2, "normal", NOW).unwrap();
        assert_eq!(s.level, 4);
        assert_eq!(s.ease, 2.5);
        assert_eq!(s.status, "review"); // review_count 3 >= 3
    }

    #[test]
    fn hard_drops_two_levels_and_stays_learning() {
        let s = calculate_schedule(5, 2.5, 5, "hard", NOW).unwrap();
        assert_eq!(s.level, 3);
        assert!((s.ease - 2.25).abs() < 1e-9);
        assert_eq!(s.status, "learning"); // hard 永不进 review（对齐桌面）
    }

    #[test]
    fn level_clamps_at_bounds() {
        assert_eq!(calculate_schedule(9, 2.5, 0, "easy", NOW).unwrap().level, 9);
        assert_eq!(calculate_schedule(1, 2.5, 0, "hard", NOW).unwrap().level, 0);
        assert_eq!(calculate_schedule(0, 2.5, 0, "struggle", NOW).unwrap().level, 0);
    }

    #[test]
    fn ease_clamps_at_bounds() {
        assert_eq!(calculate_schedule(0, 3.45, 0, "easy", NOW).unwrap().ease, EASE_MAX);
        assert_eq!(calculate_schedule(0, 1.4, 0, "hard", NOW).unwrap().ease, EASE_MIN);
    }

    #[test]
    fn unknown_rating_rejected() {
        assert!(calculate_schedule(0, 2.5, 0, "good", NOW).is_none());
    }
}
