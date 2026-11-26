import { expect, it } from "vitest";
import { relativeAge } from "../formatAgo";

it.each([
  [59_999, { unit: "now" }],
  [60_000, { unit: "minute", value: 1 }],
  [3_599_999, { unit: "minute", value: 59 }],
  [3_600_000, { unit: "hour", value: 1 }],
  [86_399_999, { unit: "hour", value: 23 }],
  [86_400_000, { unit: "day", value: 1 }],
  [30 * 86_400_000 - 1, { unit: "day", value: 29 }],
  [30 * 86_400_000, { unit: "month", value: 1 }],
  [365 * 86_400_000 - 1, { unit: "month", value: 12 }],
  [365 * 86_400_000, { unit: "year", value: 1 }],
] as const)("经过 %i 毫秒后按原取整边界归类", (elapsed, expected) => {
  expect(relativeAge(2_000_000_000_000 - elapsed, 2_000_000_000_000)).toEqual(expected);
});

it("未来时间继续归入最近状态", () => {
  expect(relativeAge(60_000, 0)).toEqual({ unit: "now" });
});
