import { describe, expect, it } from "vitest";
import { formatTodoGroupProgress } from "../GroupItem";

describe("formatTodoGroupProgress", () => {
  it("显示已完成数量和总数量", () => {
    expect(
      formatTodoGroupProgress({ total: 5, uncompleted: 2, overdue: 0 }),
    ).toBe("3/5");
  });

  it("缺少统计信息时显示 0/0", () => {
    expect(formatTodoGroupProgress(undefined)).toBe("0/0");
  });

  it("统计异常时不显示负数", () => {
    expect(
      formatTodoGroupProgress({ total: 2, uncompleted: 5, overdue: 0 }),
    ).toBe("0/2");
  });
});
