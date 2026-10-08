import { describe, expect, it, vi } from "vitest";

vi.mock("../components/Renderer", () => ({ default: () => null }));

import plugin from "../index";
import type { CardLinksCellValue } from "../types";
import type { RowData } from "@tau/database";

const cell = (items: unknown[]) => ({ self: { kind: "card", id: 1 }, selfContentId: 1, items });

describe("CardLinksPlugin（连接列插件协议）", () => {
  it("filters 的 operator 沿用旧值「有链接/无链接」：已保存的视图偏好不因文案改名失效", () => {
    expect(plugin.filters?.map(filter => filter.operator)).toEqual(["有链接", "无链接"]);
    expect(plugin.filters?.map(filter => filter.label)).toEqual(["有连接", "无连接"]);
  });

  it("getGroupKey 按条目数分组，容忍旧值/空值", () => {
    const row = (value: unknown) => ({ links: value }) as unknown as RowData;
    const column = { id: "links" } as never;
    expect(plugin.getGroupKey?.(row(cell([])), column)).toBe("无连接");
    expect(plugin.getGroupKey?.(row(cell([{}, {}, {}])), column)).toBe("3 连接");
    // 旧值结构（number[]）与空值不抛错、归入无连接
    expect(plugin.getGroupKey?.(row([2, 3]), column)).toBe("无连接");
    expect(plugin.getGroupKey?.(row(null), column)).toBe("无连接");
  });

  it("sort 按条目数降序/升序，非新结构的值视为 0", () => {
    const rich = cell([{}, {}]) as never;
    const empty = cell([]) as never;
    const legacy = [2, 3] as never;
    const sortParams = (a: never, b: never, direction: "asc" | "desc") =>
      ({ a, b, direction, column: null, columnConfig: undefined, rowA: null, rowB: null }) as never;
    expect(plugin.sort?.(sortParams(rich, empty, "asc"))).toBeGreaterThan(0);
    expect(plugin.sort?.(sortParams(rich, empty, "desc"))).toBeLessThan(0);
    expect(plugin.sort?.(sortParams(legacy, empty, "asc"))).toBe(0);
  });

  it("filters 按条目数判断有/无连接", () => {
    const row = (value: unknown) => ({ links: value }) as unknown as RowData;
    const column = { id: "links" } as never;
    const [has, none] = plugin.filters!;
    expect(has.filter(null, row(cell([{}])), column)).toBe(true);
    expect(has.filter(null, row(cell([])), column)).toBe(false);
    expect(none.filter(null, row(cell([])), column)).toBe(true);
    expect(none.filter(null, row([1] as unknown as CardLinksCellValue), column)).toBe(true);
  });
});
