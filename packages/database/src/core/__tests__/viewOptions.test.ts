import { describe, expect, it } from "vitest";
import { cloneViewOptions, getViewOptions, setViewOptions } from "../viewOptions";
import type { TableViewConfig } from "../../types";

const config = (viewOptions?: Record<string, unknown>): TableViewConfig => ({
  columnOrder: [],
  rowOrder: [],
  sorts: [],
  viewOptions,
});

describe("viewOptions 读写辅助", () => {
  it("getViewOptions 按视图类型读取子对象", () => {
    const source = config({ kanban: { groupColumnId: "status" } });
    expect(getViewOptions<{ groupColumnId: string }>(source, "kanban")).toEqual({
      groupColumnId: "status",
    });
  });

  it("子键缺失或不是普通对象时返回 undefined", () => {
    const source = config({ kanban: null, calendar: "bad", gallery: [] });
    expect(getViewOptions(source, "kanban")).toBeUndefined();
    expect(getViewOptions(source, "calendar")).toBeUndefined();
    expect(getViewOptions(source, "gallery")).toBeUndefined();
    expect(getViewOptions(source, "table")).toBeUndefined();
    expect(getViewOptions(undefined, "kanban")).toBeUndefined();
  });

  it("setViewOptions 写入子键并保留其它子键，返回新对象", () => {
    const source = config({ gallery: { coverType: "detail" } });
    const next = setViewOptions(source, "kanban", { groupColumnId: "status" });
    expect(next).not.toBe(source);
    expect(next.viewOptions).toEqual({
      gallery: { coverType: "detail" },
      kanban: { groupColumnId: "status" },
    });
    expect(source.viewOptions).toEqual({ gallery: { coverType: "detail" } });
  });

  it("setViewOptions 传 undefined 移除子键，最后一个子键移除后不落空对象", () => {
    const source = config({
      kanban: { groupColumnId: "status" },
      gallery: { coverType: "detail" },
    });
    const removed = setViewOptions(source, "kanban", undefined);
    expect(removed.viewOptions).toEqual({ gallery: { coverType: "detail" } });
    const emptied = setViewOptions(removed, "gallery", undefined);
    expect(emptied.viewOptions).toBeUndefined();
    expect(setViewOptions(config(), "kanban", undefined).viewOptions).toBeUndefined();
  });

  it("cloneViewOptions 浅拷贝各子对象并过滤非对象值", () => {
    const gallery = { coverType: "detail" as const };
    const cloned = cloneViewOptions({ gallery, kanban: null, calendar: "bad" });
    expect(cloned).toEqual({ gallery });
    expect(cloned!.gallery).not.toBe(gallery);
    expect(cloneViewOptions(undefined)).toBeUndefined();
    expect(cloneViewOptions({})).toBeUndefined();
  });
});
