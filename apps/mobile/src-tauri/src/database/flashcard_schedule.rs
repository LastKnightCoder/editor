// 闪卡复习调度算法（FSRS-6，fsrs crate——Anki 同款实现，权威）。
// 桌面端经 @tau/shared/fsrs-schedule（ts-fsrs 公式层）逐值对齐，两端输出由
// packages/shared/fsrs-schedule.fixture.json 对拍钉住——同一张卡在两端复习的
// 调度结果才会收敛。修改 FSRS_WEIGHTS / DESIRED_RETENTION 前先跨端同步。

use fsrs::{FSRS, MemoryState};

/// 与 fsrs-rs DEFAULT_PARAMETERS（FSRS-6，21 参数）逐值一致，锁定跨端基线
pub(crate) const FSRS_WEIGHTS: [f32; 21] = [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
    0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

pub(crate) const DESIRED_RETENTION: f32 = 0.9;

const DAY_MS: i64 = 24 * 60 * 60 * 1000;

pub(crate) struct NextSchedule {
    pub stability: f64,
    pub difficulty: f64,
    pub due_ms: i64,
    pub interval_ms: i64,
    pub status: &'static str,
}

/// 评分四档 → FSRS 评分（1=Again 忘记 / 2=Hard 模糊 / 3=Good 记得 / 4=Easy 轻松）
fn rating_grade(rating: &str) -> Option<u32> {
    match rating {
        "hard" => Some(1),
        "struggle" => Some(2),
        "normal" => Some(3),
        "easy" => Some(4),
        _ => None,
    }
}

/// 自上次复习经过的整天数（不足一天按 0，走 FSRS 短期分支）；饱和截断防极端脏数据回绕
pub(crate) fn elapsed_days(last_review_ms: Option<i64>, now_ms: i64) -> u32 {
    match last_review_ms {
        Some(t) => (((now_ms - t).max(0) / DAY_MS).min(u32::MAX as i64)) as u32,
        None => 0,
    }
}

/// 由当前记忆状态推下一次复习安排。memory 为 None 表示新卡首评；
/// 返回 None 表示 rating 不合法。
pub(crate) fn calculate_schedule(
    memory_stability: Option<f64>,
    memory_difficulty: Option<f64>,
    last_review_ms: Option<i64>,
    rating: &str,
    now_ms: i64,
) -> Option<NextSchedule> {
    let grade = rating_grade(rating)?;
    let current = match (memory_stability, memory_difficulty) {
        // schema 中两列同写同清，只有 stability 单独出现视为脏数据，按新卡重学
        (Some(s), Some(d)) => Some(MemoryState {
            stability: s as f32,
            difficulty: d as f32,
        }),
        _ => None,
    };
    let fsrs = FSRS::new(&FSRS_WEIGHTS).ok()?;
    let states = fsrs
        .next_states(current, DESIRED_RETENTION, elapsed_days(last_review_ms, now_ms))
        .ok()?;
    let item = match grade {
        1 => &states.again,
        2 => &states.hard,
        3 => &states.good,
        _ => &states.easy,
    };
    // 间隔 ≥1 天为巩固，否则学习中（fsrs-rs 的 interval 为天、可为小数，不取整）；
    // 毫秒换算用 f64，与桌面 ts-fsrs 口径一致避免两端毫秒偏差
    let interval_ms = (item.interval as f64 * DAY_MS as f64).round() as i64;
    let status = if item.interval >= 1.0 { "review" } else { "learning" };
    Some(NextSchedule {
        stability: item.memory.stability as f64,
        difficulty: item.memory.difficulty as f64,
        due_ms: now_ms + interval_ms,
        interval_ms,
        status,
    })
}

/// SM-2 旧数据 → FSRS 记忆状态迁移（fsrs-rs memory_state_from_sm2，sm2_retention=0.9）
pub(crate) fn memory_from_sm2(ease_factor: f64, interval_ms: i64) -> Option<(f64, f64)> {
    let fsrs = FSRS::new(&FSRS_WEIGHTS).ok()?;
    let state = fsrs
        .memory_state_from_sm2(ease_factor as f32, interval_ms as f32 / DAY_MS as f32, 0.9)
        .ok()?;
    Some((state.stability as f64, state.difficulty as f64))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const NOW: i64 = 1_700_000_000_000;

    #[test]
    fn new_card_first_rating_initializes_memory() {
        // FSRS-6 默认参数：Good → S=w[2]=2.3065、D=w[4]-e^(2·w[5])+1≈2.118，间隔≈稳定性
        let s = calculate_schedule(None, None, None, "normal", NOW).unwrap();
        assert!((s.stability - 2.3065).abs() < 1e-4);
        assert!((s.difficulty - 2.1181).abs() < 1e-3);
        assert_eq!(s.due_ms, NOW + s.interval_ms);
        assert_eq!(s.status, "review");
    }

    #[test]
    fn unknown_rating_rejected() {
        assert!(calculate_schedule(None, None, None, "good", NOW).is_none());
    }

    #[test]
    fn dirty_memory_row_treated_as_new() {
        let s = calculate_schedule(Some(5.0), None, Some(NOW - DAY_MS), "easy", NOW).unwrap();
        let fresh = calculate_schedule(None, None, None, "easy", NOW).unwrap();
        assert_eq!(s.stability, fresh.stability);
    }

    #[test]
    fn sm2_migration_matches_formula() {
        let (s, d) = memory_from_sm2(2.5, 7 * DAY_MS).unwrap();
        // sm2_retention=0.9 时稳定性即旧间隔天数
        assert!((s - 7.0).abs() < 1e-4);
        assert!(d > 1.0 && d < 10.0);
    }

    /// 生成跨端对拍 fixture：cargo test generate_fixture -- --nocapture，
    /// 输出粘回 packages/shared/fsrs-schedule.fixture.json（桌面 vitest 读同一份对拍）。
    /// 用例变更后两端同时重新对拍（verify_fixture / fsrs-schedule.test.ts 守护一致）。
    #[test]
    fn generate_fixture() {
        let mut cases = vec![];
        let memory_sets: [(Option<f64>, Option<f64>, Option<i64>); 4] = [
            (None, None, None),
            (Some(5.0), Some(5.0), Some(NOW - 3 * DAY_MS)),
            (Some(30.0), Some(8.0), Some(NOW - 20 * DAY_MS)),
            // elapsed=0：已学卡当天再评，走 FSRS 短期分支（delta_t==0 覆盖长时公式，两端关键分叉点）
            (Some(5.0), Some(5.0), Some(NOW - DAY_MS / 2)),
        ];
        for (idx, (s, d, last)) in memory_sets.iter().enumerate() {
            for rating in ["hard", "struggle", "normal", "easy"] {
                let sched = calculate_schedule(*s, *d, *last, rating, NOW).unwrap();
                cases.push(json!({
                    "name": format!("case-{idx}-{rating}"),
                    "memoryStability": s,
                    "memoryDifficulty": d,
                    "elapsedDays": elapsed_days(*last, NOW),
                    "rating": rating,
                    "stability": sched.stability,
                    "difficulty": sched.difficulty,
                    "intervalDays": sched.interval_ms as f64 / DAY_MS as f64,
                }));
            }
        }
        for (ease, interval_days) in [(2.5, 7.0), (1.3, 1.0), (3.5, 60.0)] {
            let (s, d) = memory_from_sm2(ease, (interval_days * DAY_MS as f64) as i64).unwrap();
            cases.push(json!({
                "name": format!("sm2-{ease}-{interval_days}"),
                "sm2Ease": ease,
                "sm2IntervalDays": interval_days,
                "stability": s,
                "difficulty": d,
            }));
        }
        println!("===FSRS-FIXTURE===");
        println!("{}", serde_json::to_string_pretty(&json!({ "cases": cases })).unwrap());
    }

    /// 对拍 fixture：权威输出（fsrs crate，本文件）与已提交的跨端 fixture 必须逐值一致，
    /// 升级 fsrs crate 或调整参数导致漂移时在此暴露。容差按 f32→f64 序列化往返取 1e-3 相对误差。
    #[test]
    fn verify_fixture() {
        let raw = include_str!("../../../../../packages/shared/fsrs-schedule.fixture.json");
        let fixture: serde_json::Value = serde_json::from_str(raw).expect("fixture json");
        let cases = fixture["cases"].as_array().expect("fixture cases");
        assert!(cases.len() >= 15, "fixture 用例数异常: {}", cases.len());
        for case in cases {
            let name = case["name"].as_str().unwrap();
            if let (Some(ease), Some(interval_days)) =
                (case["sm2Ease"].as_f64(), case["sm2IntervalDays"].as_f64())
            {
                let (s, d) = memory_from_sm2(ease, (interval_days * DAY_MS as f64) as i64)
                    .unwrap_or_else(|| panic!("{name}: sm2 迁移失败"));
                assert_eq_rel(name, "stability", s, case["stability"].as_f64().unwrap());
                assert_eq_rel(name, "difficulty", d, case["difficulty"].as_f64().unwrap());
                continue;
            }
            let (s, d, elapsed, rating) = (
                case["memoryStability"].as_f64(),
                case["memoryDifficulty"].as_f64(),
                case["elapsedDays"].as_u64().unwrap() as u32,
                case["rating"].as_str().unwrap(),
            );
            let sched = calculate_schedule(s, d, Some(NOW - elapsed as i64 * DAY_MS), rating, NOW)
                .unwrap_or_else(|| panic!("{name}: 调度失败"));
            assert_eq_rel(name, "stability", sched.stability, case["stability"].as_f64().unwrap());
            assert_eq_rel(
                name,
                "difficulty",
                sched.difficulty,
                case["difficulty"].as_f64().unwrap(),
            );
            assert_eq_rel(
                name,
                "intervalDays",
                sched.interval_ms as f64 / DAY_MS as f64,
                case["intervalDays"].as_f64().unwrap(),
            );
        }
    }

    fn assert_eq_rel(name: &str, field: &str, actual: f64, expected: f64) {
        let tolerance = (expected.abs() * 1e-3).max(1e-6);
        assert!(
            (actual - expected).abs() <= tolerance,
            "{name}.{field}: actual={actual}, expected={expected}"
        );
    }
}
