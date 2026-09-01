import { describe, expect, it } from "vitest";
import { shouldVacuumDatabase } from "../database-maintenance";

describe("database maintenance", () => {
  it("仅在可回收空间同时达到体积和占比阈值时压缩数据库", () => {
    expect(
      shouldVacuumDatabase({
        pageCount: 120_000,
        freelistCount: 90_000,
        pageSize: 4096,
      }),
    ).toBe(true);
    expect(
      shouldVacuumDatabase({
        pageCount: 120_000,
        freelistCount: 10_000,
        pageSize: 4096,
      }),
    ).toBe(false);
    expect(
      shouldVacuumDatabase({
        pageCount: 1_000_000,
        freelistCount: 20_000,
        pageSize: 4096,
      }),
    ).toBe(false);
  });
});
