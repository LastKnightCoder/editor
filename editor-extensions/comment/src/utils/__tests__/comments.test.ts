import { describe, expect, it } from "vitest";
import { formatCommentTime, getTotalCommentCount, isCommentEdited } from "../comments.ts";

const at = (text: string) => new Date(text).getTime();

describe("comment utils", () => {
  const now = at("2026-09-30T15:00:00");

  it("今天 / 昨天只写时刻，本年省略年份，往年写日期", () => {
    expect(formatCommentTime(at("2026-09-30T09:05:00"), now)).toBe("今天 09:05");
    expect(formatCommentTime(at("2026-09-29T21:17:00"), now)).toBe("昨天 21:17");
    expect(formatCommentTime(at("2026-03-02T08:00:00"), now)).toBe("3月2日 08:00");
    expect(formatCommentTime(at("2025-12-31T08:00:00"), now)).toBe("2025年12月31日");
  });

  it("更新晚于创建一分钟以上才算已编辑", () => {
    const base = { id: "a", content: "x", replies: [] };
    expect(isCommentEdited({ ...base, createTime: 0, updateTime: 5_000 })).toBe(false);
    expect(isCommentEdited({ ...base, createTime: 0, updateTime: 120_000 })).toBe(true);
  });

  it("条数含嵌套回复", () => {
    const reply = { id: "b", content: "y", createTime: 0, updateTime: 0, replies: [] };
    expect(
      getTotalCommentCount([
        { id: "a", content: "x", createTime: 0, updateTime: 0, replies: [reply] },
      ])
    ).toBe(2);
  });
});
