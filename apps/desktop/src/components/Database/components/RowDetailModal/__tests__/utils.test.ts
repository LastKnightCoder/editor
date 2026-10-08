import { describe, expect, it } from "vitest";
import PluginManager from "../../../PluginManager";
import { builtInPlugins } from "../../../plugins";
import type { ColumnDef } from "../../../types";
import {
  collectFoldedColumnIds,
  coverImagesOf,
  isEmptyCellValue,
  neighborRowIds,
  orderVisibleColumns,
} from "../utils";

const pluginManager = new PluginManager();
pluginManager.registerPlugins(builtInPlugins as never);

const column = (id: string, type: string, extra: Partial<ColumnDef> = {}): ColumnDef => ({
  id,
  title: id,
  type,
  width: 120,
  ...extra,
});

describe("RowDetailModal utils", () => {
  it("isEmptyCellValue：0 与 false 是有效值", () => {
    expect(isEmptyCellValue(null)).toBe(true);
    expect(isEmptyCellValue(undefined)).toBe(true);
    expect(isEmptyCellValue("")).toBe(true);
    expect(isEmptyCellValue([])).toBe(true);
    expect(isEmptyCellValue(0)).toBe(false);
    expect(isEmptyCellValue(false)).toBe(false);
  });

  it("collectFoldedColumnIds 只折叠有 Editor 的空字段", () => {
    const columns = [
      column("text", "text"),
      column("star", "star"),
      column("check", "checkbox"),
      column("filled", "text"),
    ];
    const folded = collectFoldedColumnIds(
      { id: "r", text: "", star: null, check: null, filled: "有值" },
      columns,
      pluginManager
    );
    expect([...folded]).toEqual(["text"]);
  });

  it("orderVisibleColumns 按列序排列、隐藏列剔除、未登记列排末尾", () => {
    const columns = [
      column("a", "text"),
      column("b", "text", { hidden: true }),
      column("c", "text"),
      column("d", "text"),
    ];
    expect(orderVisibleColumns(columns, ["c", "b", "a"]).map(c => c.id)).toEqual(["c", "a", "d"]);
  });

  it("neighborRowIds：首尾没有相邻行，不在投影中时没有位置", () => {
    expect(neighborRowIds(["a", "b", "c"], "a")).toEqual({ index: 0, prev: null, next: "b" });
    expect(neighborRowIds(["a", "b", "c"], "c")).toEqual({ index: 2, prev: "b", next: null });
    expect(neighborRowIds(["a", "b"], "x")).toEqual({ index: -1, prev: null, next: null });
  });

  it("coverImagesOf 取第一个有图的图片列", () => {
    const columns = [column("empty", "image"), column("cover", "image"), column("more", "image")];
    const images = coverImagesOf(
      { id: "r", empty: [], cover: [{ id: "1", url: "a.png" }], more: [{ id: "2", url: "b.png" }] },
      columns
    );
    expect(images.map(image => image.url)).toEqual(["a.png"]);
    expect(coverImagesOf({ id: "r" }, columns)).toEqual([]);
  });
});
