import { expect, it } from "vitest";
import { assignMonthViewLevels, type MonthEventSpan } from "../eventLayoutAlgorithm";

it("月布局保留字符串行 id 与日程数字 id，不将多个 UUID 合并为零", () => {
  const entries = ["row-a", "row-b"].map(id => ({
    event: { id, startDate: 0, endDate: 0 },
    spans: [
      {
        eventId: id,
        row: 0,
        startCol: 0,
        endCol: 0,
        width: 1,
        spanType: "single",
      } satisfies MonthEventSpan<string>,
    ],
  }));
  expect(
    assignMonthViewLevels(entries, 2)
      .get(0)
      ?.map(item => item.eventId)
  ).toEqual(["row-a", "row-b"]);
  const numeric = [
    {
      event: { id: 17, startDate: 0, endDate: 0 },
      spans: [{ ...entries[0].spans[0], eventId: 17 }],
    },
  ];
  expect(assignMonthViewLevels(numeric, 2).get(0)?.[0].eventId).toBe(17);
});
