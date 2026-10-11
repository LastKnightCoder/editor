import { describe, expect, it } from "vitest";
import { builtInFieldModels, tableToMarkdown } from "../model";
import type { ColumnDef, RowData } from "../types";
import type { FormulaExpr } from "@tau/shared/database-types";

const models = builtInFieldModels;
const column = (
  overrides: Partial<ColumnDef> & Pick<ColumnDef, "id" | "title" | "type">
): ColumnDef => ({
  ...overrides,
});

describe("tableToMarkdown", () => {
  it("按字段 model 的 toText 输出 Markdown 表格，表头用列标题", () => {
    const result = tableToMarkdown({
      columns: [
        column({ id: "name", title: "名称", type: "text" }),
        column({ id: "price", title: "价格", type: "number" }),
        column({ id: "done", title: "完成", type: "checkbox" }),
      ],
      rows: [
        { id: "r1", name: "键盘", price: 199, done: true },
        { id: "r2", name: "鼠标", price: 89.5, done: false },
      ],
      models,
    });
    expect(result.truncated).toBe(false);
    expect(result.totalRows).toBe(2);
    expect(result.markdown).toBe(
      [
        "| 名称 | 价格 | 完成 |",
        "| --- | --- | --- |",
        "| 键盘 | 199 | 是 |",
        "| 鼠标 | 89.50 | 否 |",
      ].join("\n")
    );
  });

  it("无 model 的列类型：表头标注类型，单元格输出原值 JSON 截断文本", () => {
    const result = tableToMarkdown({
      columns: [
        column({ id: "name", title: "名称", type: "text" }),
        column({ id: "custom", title: "自定义", type: "custom-x" }),
      ],
      rows: [{ id: "r1", name: "甲", custom: { a: 1, b: [2, 3] } } as RowData],
      models,
    });
    expect(result.markdown).toContain("| 自定义 (custom-x) |");
    expect(result.markdown).toContain(`| 甲 | {"a":1,"b":[2,3]} |`);
  });

  it("转义竖线与换行：单元格内不破坏表格结构", () => {
    const result = tableToMarkdown({
      columns: [column({ id: "name", title: "A|B", type: "text" })],
      rows: [{ id: "r1", name: "左|右\n第二行" }],
      models,
    });
    expect(result.markdown).toContain("| A\\|B |");
    expect(result.markdown).toContain("| 左\\|右<br>第二行 |");
  });

  it("单元格超过 maxCellLength 截断加「…」（默认 200）", () => {
    const long = "长".repeat(10);
    const result = tableToMarkdown({
      columns: [column({ id: "name", title: "名称", type: "text" })],
      rows: [{ id: "r1", name: long }],
      models,
      maxCellLength: 5,
    });
    expect(result.markdown).toContain("| 长长长长长… |");

    const byDefault = tableToMarkdown({
      columns: [column({ id: "name", title: "名称", type: "text" })],
      rows: [{ id: "r1", name: "x".repeat(201) }],
      models,
    });
    expect(byDefault.markdown).toContain(`| ${"x".repeat(200)}… |`);
  });

  it("行数超过 maxRows（默认 100）截断并返回 truncated 与 totalRows", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: `r${i}`, name: `行${i}` }));
    const result = tableToMarkdown({
      columns: [column({ id: "name", title: "名称", type: "text" })],
      rows,
      models,
      maxRows: 2,
    });
    expect(result.truncated).toBe(true);
    expect(result.totalRows).toBe(3);
    expect(result.markdown.split("\n")).toHaveLength(4);

    const byDefault = tableToMarkdown({
      columns: [column({ id: "name", title: "名称", type: "text" })],
      rows: Array.from({ length: 101 }, (_, i) => ({ id: `r${i}`, name: `${i}` })),
      models,
    });
    expect(byDefault.truncated).toBe(true);
    expect(byDefault.totalRows).toBe(101);
  });

  it("columnOrder 重排显示列、hidden 列跳过、未列入的列按原序追加", () => {
    const result = tableToMarkdown({
      columns: [
        column({ id: "a", title: "A", type: "text" }),
        column({ id: "b", title: "B", type: "text", hidden: true }),
        column({ id: "c", title: "C", type: "text" }),
      ],
      rows: [{ id: "r1", a: "甲", b: "隐藏", c: "丙" }],
      models,
      columnOrder: ["c", "a"],
    });
    expect(result.markdown).toBe(["| C | A |", "| --- | --- |", "| 丙 | 甲 |"].join("\n"));

    const appended = tableToMarkdown({
      columns: [
        column({ id: "a", title: "A", type: "text" }),
        column({ id: "new", title: "新列", type: "text" }),
      ],
      rows: [{ id: "r1", a: "甲", new: "乙" }],
      models,
      columnOrder: ["a"],
    });
    expect(appended.markdown).toContain("| A | 新列 |");
  });

  it("rowOrder 决定行顺序，未列入的行按原序追加", () => {
    const result = tableToMarkdown({
      columns: [column({ id: "name", title: "名称", type: "text" })],
      rows: [
        { id: "r1", name: "一" },
        { id: "r2", name: "二" },
        { id: "r3", name: "三" },
      ],
      models,
      rowOrder: ["r3", "r1"],
    });
    expect(result.markdown).toContain("| 三 |");
    expect(result.markdown).toContain("| 一 |");
    expect(result.markdown).toContain("| 二 |");
    expect(result.markdown.split("\n")[2]).toBe("| 三 |");
    expect(result.markdown.split("\n")[4]).toBe("| 二 |");
  });

  it("公式列先按 model 派生再取文本；算不出来输出空串", () => {
    const expr: FormulaExpr = {
      kind: "binary",
      op: "+",
      left: { kind: "column", columnId: "price" },
      right: { kind: "literal", value: 1 },
    };
    const result = tableToMarkdown({
      columns: [
        column({ id: "name", title: "名称", type: "text" }),
        column({ id: "price", title: "价格", type: "number" }),
        column({ id: "next", title: "加一", type: "formula", config: { expr, output: "number" } }),
      ],
      rows: [
        { id: "r1", name: "键盘", price: 199 },
        { id: "r2", name: "鼠标", price: null },
      ],
      models,
    });
    expect(result.markdown).toContain("| 键盘 | 199 | 200 |");
    expect(result.markdown).toContain("| 鼠标 |  |  |");
  });

  it("引用无 valueType 列的公式按空值求值，行上未声明为列的字段不参与输出", () => {
    const expr: FormulaExpr = { kind: "column", columnId: "custom" };
    const result = tableToMarkdown({
      columns: [
        column({ id: "name", title: "名称", type: "text" }),
        column({ id: "echo", title: "回显", type: "formula", config: { expr, output: "number" } }),
      ],
      rows: [{ id: "r1", name: "甲", custom: 5, extra: 9 } as RowData],
      models,
    });
    expect(result.markdown).toContain("| 甲 |  |");
  });

  it("columns 或 rows 非数组时返回空 Markdown；models 支持传 Map 形态", () => {
    const byMap = tableToMarkdown({
      columns: [column({ id: "name", title: "名称", type: "text" })],
      rows: [{ id: "r1", name: "甲" }],
      models: new Map(models.map(model => [model.type, model])),
    });
    expect(byMap.markdown).toContain("| 甲 |");
    expect(tableToMarkdown({ columns: null, rows: [], models }).markdown).toBe("");
    expect(tableToMarkdown({ columns: [], rows: null, models }).totalRows).toBe(0);
  });
});
