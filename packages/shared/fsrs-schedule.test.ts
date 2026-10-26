/**
 * FSRS 调度封装对拍测试：与移动端 Rust 权威实现（fsrs crate）逐值一致。
 * fixture 由 apps/mobile/src-tauri/src/database/flashcard_schedule.rs 的
 * generate_fixture 生成（cargo test generate_fixture -- --nocapture），
 * Rust 侧 verify_fixture 与本文件读同一份 fixture——两端输出漂移即测试失败。
 */

import { describe, expect, it } from "vitest";
import fixture from "./fsrs-schedule.fixture.json";
import {
  FSRS_DESIRED_RETENTION,
  fsrsGradeOf,
  fsrsSchedule,
  type FsrsMemoryState,
} from "./fsrs-schedule";

// ts-fsrs 以 f64 计算、fsrs-rs 为 f32，对拍容差统一取 1e-3 相对误差
function expectClose(actual: number, expected: number) {
  const tolerance = Math.max(Math.abs(expected) * 1e-3, 1e-6);
  expect(Math.abs(actual - expected), `actual=${actual} expected=${expected}`).toBeLessThanOrEqual(
    tolerance
  );
}

describe("fsrsSchedule 跨端对拍", () => {
  for (const fixtureCase of fixture.cases) {
    const name = fixtureCase.name as string;
    it(`${name}：调度输出与 fsrs-rs next_states 一致`, () => {
      const memory: FsrsMemoryState | null =
        fixtureCase.memoryStability == null
          ? null
          : {
              stability: fixtureCase.memoryStability as number,
              difficulty: fixtureCase.memoryDifficulty as number,
            };
      const result = fsrsSchedule(
        memory,
        fixtureCase.elapsedDays as number,
        fsrsGradeOf(fixtureCase.rating as "hard" | "struggle" | "normal" | "easy")
      );
      expectClose(result.stability, fixtureCase.stability as number);
      expectClose(result.difficulty, fixtureCase.difficulty as number);
      expectClose(result.intervalDays, fixtureCase.intervalDays as number);
    });
  }

  it("0.9 期望保留率下间隔等于稳定性（fsrs-rs interval 公式退化形式）", () => {
    expect(FSRS_DESIRED_RETENTION).toBe(0.9);
    const result = fsrsSchedule(null, 0, 3);
    expect(Math.abs(result.intervalDays - result.stability)).toBeLessThan(1e-6);
  });

  it("elapsed=0 已学卡走短期分支：好评分至少不降低稳定性", () => {
    const good = fsrsSchedule({ stability: 5, difficulty: 5 }, 0, 3);
    expect(good.stability).toBeGreaterThanOrEqual(5);
  });

  it("评分档映射：忘记=1 模糊=2 记得=3 轻松=4", () => {
    expect(fsrsGradeOf("hard")).toBe(1);
    expect(fsrsGradeOf("struggle")).toBe(2);
    expect(fsrsGradeOf("normal")).toBe(3);
    expect(fsrsGradeOf("easy")).toBe(4);
  });
});
