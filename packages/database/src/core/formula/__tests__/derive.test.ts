import { describe, expect, it } from "vitest";
import PluginManager from "../../../PluginManager";
import { builtInPlugins } from "../../../plugins";
import FormulaPlugin from "../../../plugins/FormulaPlugin";
import { createDatabaseStore } from "../../../DatabaseStore";
import { emptyQuery, projectDatabase } from "../../projection";
import { checkFormula } from "../../../components/FormulaBuilder/check";
import type { CellPlugin, ColumnDef, RowData, TableViewConfig } from "../../../types";
import {
  createFormulaContext,
  evaluateFooter,
  getRowDeriver,
  orderFormulaColumns,
  validateExpr,
  type Expr,
} from "..";

const col = (columnId: string): Expr => ({ kind: "column", columnId });
const lit = (value: number | string | boolean | null): Expr => ({ kind: "literal", value });
const subtotalExpr: Expr = { kind: "binary", op: "*", left: col("price"), right: col("qty") };
const priorityExpr: Expr = {
  kind: "if",
  test: { kind: "compare", op: ">", left: col("subtotal"), right: lit(500) },
  then: lit("高"),
  else: lit("低"),
};

// 故意把依赖方排在被依赖方之前，验证按依赖顺序求值
const columns: ColumnDef[] = [
  { id: "title", title: "任务", type: "text", isPrimary: true },
  {
    id: "priority",
    title: "优先级",
    type: "formula",
    config: { expr: priorityExpr, output: "text" },
  },
  { id: "price", title: "单价", type: "number" },
  { id: "qty", title: "数量", type: "number" },
  {
    id: "subtotal",
    title: "小计",
    type: "formula",
    config: { expr: subtotalExpr, output: "number" },
  },
];

const rows: RowData[] = [
  { id: "r1", title: "设计", price: 220, qty: 3 },
  { id: "r2", title: "实现", price: 80, qty: 5 },
  { id: "r3", title: "补文档", price: null, qty: 2 },
];

const config: TableViewConfig = {
  columnOrder: columns.map(column => column.id),
  rowOrder: rows.map(row => row.id),
  sorts: [],
  filters: null,
};

function plugins() {
  const manager = new PluginManager();
  manager.registerPlugins(builtInPlugins as CellPlugin<unknown>[]);
  return manager;
}

describe("公式派生", () => {
  it("按依赖顺序求值，结果只在派生行里", () => {
    const manager = plugins();
    const derive = getRowDeriver(columns, manager);
    const derived = derive?.(rows[0]);
    expect(derived?.subtotal).toEqual({ value: 660 });
    expect(derived?.priority).toEqual({ value: "高" });
    expect(derive?.(rows[1]).priority).toEqual({ value: "低" });
    expect(derive?.(rows[2]).subtotal).toEqual({ value: null });
    expect(rows[0]).not.toHaveProperty("subtotal");
    // 同一源行复用派生结果
    expect(derive?.(rows[0])).toBe(derived);
    expect(getRowDeriver(columns, manager)).toBe(derive);
  });

  it("互相引用与非法配置只让该列显示原因", () => {
    const cyclic: ColumnDef[] = [
      { id: "a", title: "A", type: "formula", config: { expr: col("b"), output: "number" } },
      { id: "b", title: "B", type: "formula", config: { expr: col("a"), output: "number" } },
      { id: "n", title: "N", type: "number" },
      { id: "bad", title: "坏", type: "formula", config: { expr: { kind: "eval" } } },
      { id: "ok", title: "好", type: "formula", config: { expr: col("n"), output: "number" } },
    ];
    expect([...orderFormulaColumns(cyclic).cyclic].sort()).toEqual(["a", "b"]);
    const derived = getRowDeriver(cyclic, plugins())?.({ id: "x", n: 1 });
    expect(derived?.a).toEqual({ value: null, error: "公式之间互相引用了" });
    expect(derived?.bad).toEqual({ value: null, error: "还有没填完的地方" });
    expect(derived?.ok).toEqual({ value: 1 });
  });

  it("投影可按公式结果筛选、排序", () => {
    const manager = plugins();
    const sorted = projectDatabase(
      rows,
      columns,
      { ...config, sorts: [{ id: "s", fieldId: "subtotal", direction: "desc", priority: 0 }] },
      emptyQuery,
      manager
    );
    expect(sorted.rowIds).toEqual(["r1", "r2", "r3"]);
    const asc = projectDatabase(
      rows,
      columns,
      { ...config, sorts: [{ id: "s", fieldId: "subtotal", direction: "asc", priority: 0 }] },
      emptyQuery,
      manager
    );
    // 空值无论方向都排在最后
    expect(asc.rowIds).toEqual(["r2", "r1", "r3"]);
    const filtered = projectDatabase(
      rows,
      columns,
      {
        ...config,
        filters: {
          id: "g",
          type: "group",
          logic: "and",
          children: [
            { id: "c", type: "condition", fieldId: "priority", operator: "等于", value: "低" },
          ],
        },
      },
      emptyQuery,
      manager
    );
    expect(filtered.rowIds).toEqual(["r2", "r3"]);
  });

  it("新增或改成公式列时存储行不留该列的值", () => {
    const store = createDatabaseStore(
      columns.filter(column => column.type !== "formula"),
      rows,
      config,
      [],
      undefined,
      plugins()
    );
    store.getState().addColumn({
      id: "f",
      title: "F",
      type: "formula",
      config: { expr: col("qty"), output: "number" },
    });
    expect(store.getState().rows[0]).not.toHaveProperty("f");
    expect(store.getState().projection.rows[0].f).toEqual({ value: 3 });
    store
      .getState()
      .editColumn("price", { type: "formula", config: { expr: lit(1), output: "number" } });
    expect(store.getState().rows[0]).not.toHaveProperty("price");
  });
});

describe("公式插件", () => {
  const column = columns[4];
  const filters = (output: string) =>
    (FormulaPlugin.filters as (c: ColumnDef) => { operator: string }[])({
      ...column,
      config: { expr: lit(1), output },
    }).map(rule => rule.operator);

  it("筛选项随结果类型变化，值永不落库", () => {
    expect(filters("number")).toContain("大于");
    expect(filters("text")).toContain("包含");
    expect(filters("boolean")).toEqual(["是", "否"]);
    expect(FormulaPlugin.beforeSave?.({ value: 1 }, column.config as never)).toBeUndefined();
    expect(
      plugins()
        .getFilterDefinitions(column)
        .map(rule => rule.operator)
    ).toContain("大于");
  });
});

describe("作用域与表尾组合", () => {
  const manager = plugins();
  const ctx = createFormulaContext(columns, manager);
  const derivedRows = rows.map(row => getRowDeriver(columns, manager)?.(row) ?? row);

  it("单行公式不能用汇总，表尾公式不能直接引用列", () => {
    expect(validateExpr({ kind: "aggregate", op: "sum", columnId: "qty" }, ctx)).toMatchObject({
      ok: false,
      error: { message: "汇总只能用在表尾" },
    });
    expect(validateExpr(col("qty"), ctx, "footer")).toMatchObject({ ok: false });
  });

  it("以各列汇总为叶子求值", () => {
    const expr: Expr = {
      kind: "binary",
      op: "/",
      left: { kind: "aggregate", op: "sum", columnId: "subtotal" },
      right: { kind: "aggregate", op: "countAll", columnId: "title" },
    };
    expect(evaluateFooter("subtotal", { kind: "expr", expr }, derivedRows, ctx)).toEqual({
      ok: true,
      value: { kind: "expr", value: 1060 / 3, valueType: "number" },
    });
    const text: Expr = {
      kind: "if",
      test: {
        kind: "compare",
        op: ">",
        left: { kind: "aggregate", op: "sum", columnId: "qty" },
        right: lit(5),
      },
      then: lit("超量"),
      else: lit("正常"),
    };
    expect(evaluateFooter("qty", { kind: "expr", expr: text }, derivedRows, ctx)).toEqual({
      ok: true,
      value: { kind: "expr", value: "超量", valueType: "text" },
    });
  });
});

describe("保存前检查", () => {
  const manager = plugins();

  it("空位、成环与结果类型", () => {
    expect(checkFormula({ kind: "hole" }, "row", columns, rows, manager)).toEqual({
      ok: false,
      message: "先选择要计算的内容",
    });
    expect(
      checkFormula(
        { kind: "binary", op: "+", left: col("qty"), right: { kind: "hole" } } as never,
        "row",
        columns,
        rows,
        manager
      )
    ).toEqual({ ok: false, message: "还有没填完的地方" });
    expect(checkFormula(col("priority"), "row", columns, rows, manager, "subtotal")).toEqual({
      ok: false,
      message: "公式之间互相引用了",
    });
    expect(checkFormula(lit(null), "row", columns, rows, manager)).toEqual({
      ok: false,
      message: "结果不能总是空",
    });
    expect(checkFormula(priorityExpr, "row", columns, rows, manager, "priority")).toMatchObject({
      ok: true,
      output: "text",
    });
  });
});

describe("枚举型结果", () => {
  it("每个结果都是固定文字时视为枚举，按情况顺序着色并排序", async () => {
    const { formulaEnumOf } = await import("..");
    const { formulaTagColor } = await import("..");
    expect(formulaEnumOf(priorityExpr)).toEqual(["高", "低"]);
    expect(formulaEnumOf({ ...priorityExpr, else: col("title") })).toBeNull();
    expect(formulaEnumOf(subtotalExpr)).toBeNull();
    const priority = columns[1];
    expect(formulaTagColor(priority, "高")).toBe("blue");
    expect(formulaTagColor(priority, "低")).toBe("orange");
    expect(formulaTagColor(priority, "高 ")).toBe("blue");
    const { enumTagColor } = await import("..");
    const words = ["甲", "乙", "丙", "丁", "戊", "己"];
    expect(new Set(words.map(word => enumTagColor(words, word))).size).toBe(6);
    expect(formulaTagColor(priority, "其他")).toBeNull();

    const sorted = projectDatabase(
      rows,
      columns,
      { ...config, sorts: [{ id: "s", fieldId: "priority", direction: "asc", priority: 0 }] },
      emptyQuery,
      plugins()
    );
    // 高 排在 低 前（情况顺序），而不是按拼音
    expect(sorted.rowIds[0]).toBe("r1");
  });
});
