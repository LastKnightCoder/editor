import { describe, expect, it } from "vitest";
import PluginManager from "../../../PluginManager";
import { builtInPlugins } from "../../../plugins";
import { createDatabaseStore } from "../../../DatabaseStore";
import type { CellPlugin, ColumnDef, RowData, TableViewConfig } from "../../../types";
import {
  aggregate,
  aggregatesFor,
  createFormulaContext,
  evaluateExpr,
  evaluateFooter,
  validateExpr,
  type Expr,
} from "..";

const columns: ColumnDef[] = [
  { id: "title", title: "任务", type: "text", isPrimary: true },
  {
    id: "status",
    title: "状态",
    type: "select",
    config: { options: [{ id: "s1", name: "进行中", color: "blue" }] },
  },
  { id: "price", title: "单价", type: "number", config: { precision: 1, suffix: "元" } },
  { id: "qty", title: "数量", type: "number" },
  { id: "done", title: "完成", type: "checkbox" },
  { id: "due", title: "截止", type: "date" },
  { id: "progress", title: "进度", type: "progress" },
  { id: "rating", title: "评分", type: "star" },
  { id: "files", title: "附件", type: "attachment" },
];

const rows: RowData[] = [
  {
    id: "r1",
    title: "设计",
    status: "s1",
    price: 220,
    qty: 3,
    done: true,
    due: { start: 1000, end: 1000 },
    progress: { current: 1, target: 4 },
    rating: 4,
    files: [{ id: "f" }],
  },
  {
    id: "r2",
    title: "实现",
    status: null,
    price: 80,
    qty: 5,
    done: false,
    progress: { current: 3, target: 4 },
    rating: 0,
  },
  { id: "r3", title: "", price: null, qty: 1, files: [] },
];

function setup() {
  const plugins = new PluginManager();
  plugins.registerPlugins(builtInPlugins as CellPlugin<unknown>[]);
  plugins.registerPlugin({ type: "attachment", name: "附件", Renderer: () => null });
  return { plugins, ctx: createFormulaContext(columns, plugins) };
}

const col = (columnId: string): Expr => ({ kind: "column", columnId });
const lit = (value: number | string | boolean | null): Expr => ({ kind: "literal", value });

describe("插件标量", () => {
  it("按插件声明转换值，未声明值类型的列不可参与运算", () => {
    const { ctx } = setup();
    const read = (columnId: string, row = rows[0]) => ctx.resolveColumn(columnId)?.read(row);
    expect(read("status")).toBe("进行中");
    expect(read("status", rows[1])).toBeNull();
    expect(read("due")).toBe(1000);
    expect(read("progress")).toBe(0.25);
    expect(read("rating")).toBe(4);
    expect(read("rating", rows[1])).toBeNull();
    expect(read("title", rows[2])).toBeNull();
    expect(ctx.resolveColumn("files")).toBeNull();
    expect(ctx.resolveColumn("ghost")).toBeUndefined();
  });
});

describe("校验", () => {
  const { ctx } = setup();
  const codeOf = (input: unknown) => {
    const result = validateExpr(input, ctx);
    return result.ok ? null : result.error.code;
  };

  it("推导结果类型", () => {
    const priority: Expr = {
      kind: "if",
      test: {
        kind: "compare",
        op: ">",
        left: { kind: "binary", op: "*", left: col("price"), right: col("qty") },
        right: lit(500),
      },
      then: lit("高"),
      else: lit("低"),
    };
    expect(validateExpr(priority, ctx)).toEqual({ ok: true, value: "text" });
    expect(validateExpr({ kind: "concat", parts: [col("title"), col("qty")] }, ctx)).toEqual({
      ok: true,
      value: "text",
    });
    expect(
      validateExpr({ kind: "if", test: col("done"), then: lit(null), else: lit(1) }, ctx)
    ).toEqual({
      ok: true,
      value: "number",
    });
  });

  it("拒绝类型不匹配并给出人话原因", () => {
    const result = validateExpr(
      { kind: "binary", op: "*", left: col("title"), right: col("qty") },
      ctx
    );
    expect(result).toEqual({ ok: false, error: { code: "type", message: "「乘」两边都要是数字" } });
    expect(codeOf({ kind: "compare", op: ">", left: col("qty"), right: col("title") })).toBe(
      "type"
    );
    expect(codeOf({ kind: "compare", op: ">", left: col("done"), right: lit(true) })).toBe("type");
    expect(codeOf({ kind: "if", test: col("qty"), then: lit(1), else: lit(2) })).toBe("type");
    expect(codeOf({ kind: "if", test: col("done"), then: lit(1), else: lit("a") })).toBe("type");
    expect(codeOf({ kind: "binary", op: "+", left: col("files"), right: lit(1) })).toBe("type");
  });

  it("拒绝缺列、结构非法与过深嵌套", () => {
    expect(codeOf(col("ghost"))).toBe("missing-column");
    expect(codeOf({ kind: "eval", code: "1" })).toBe("bad-ref");
    expect(codeOf({ kind: "binary", op: "**", left: lit(1), right: lit(2) })).toBe("bad-ref");
    expect(codeOf({ kind: "logic", op: "and", operands: [col("done")] })).toBe("bad-ref");
    expect(codeOf({ kind: "literal", value: Infinity })).toBe("bad-ref");
    expect(codeOf(null)).toBe("bad-ref");
    let deep: Expr = lit(1);
    for (let i = 0; i < 17; i++) deep = { kind: "binary", op: "+", left: deep, right: lit(1) };
    expect(codeOf(deep)).toBe("depth");
  });
});

describe("单行求值", () => {
  const { ctx } = setup();
  const run = (expr: Expr, row = rows[0]) => evaluateExpr(expr, row, ctx);

  it("四则、比较、逻辑、IF、拼接", () => {
    const subtotal: Expr = { kind: "binary", op: "*", left: col("price"), right: col("qty") };
    expect(run(subtotal)).toEqual({ ok: true, value: 660 });
    const priority: Expr = {
      kind: "if",
      test: { kind: "compare", op: ">", left: subtotal, right: lit(500) },
      then: lit("高"),
      else: lit("低"),
    };
    expect(run(priority).ok && run(priority)).toEqual({ ok: true, value: "高" });
    expect(run(priority, rows[1])).toEqual({ ok: true, value: "低" });
    expect(
      run({
        kind: "logic",
        op: "and",
        operands: [
          col("done"),
          { kind: "compare", op: "contains", left: col("title"), right: lit("设") },
        ],
      })
    ).toEqual({ ok: true, value: true });
    expect(run({ kind: "not", operand: col("done") })).toEqual({ ok: true, value: false });
    expect(run({ kind: "concat", parts: [col("title"), lit(" · "), col("status")] })).toEqual({
      ok: true,
      value: "设计 · 进行中",
    });
  });

  it("空值语义", () => {
    const row = rows[2];
    expect(run({ kind: "binary", op: "+", left: col("price"), right: lit(1) }, row)).toEqual({
      ok: true,
      value: null,
    });
    expect(run({ kind: "compare", op: ">", left: col("price"), right: lit(0) }, row)).toEqual({
      ok: true,
      value: false,
    });
    expect(run({ kind: "compare", op: "==", left: col("price"), right: lit(null) }, row)).toEqual({
      ok: true,
      value: true,
    });
    expect(run({ kind: "empty", operand: col("title") }, row)).toEqual({ ok: true, value: true });
    expect(run({ kind: "concat", parts: [col("status"), lit("x")] }, row)).toEqual({
      ok: true,
      value: "x",
    });
  });

  it("除 0 与缺列只让这一格出错", () => {
    expect(run({ kind: "binary", op: "/", left: col("qty"), right: lit(0) })).toEqual({
      ok: false,
      error: { code: "div0", message: "除数为 0" },
    });
    expect(run(col("ghost"))).toMatchObject({ ok: false, error: { code: "missing-column" } });
  });
});

describe("汇总", () => {
  const { ctx } = setup();
  const footer = (columnId: string, op: Parameters<typeof aggregate>[0]) =>
    evaluateFooter(columnId, { kind: "aggregate", op }, rows, ctx);

  it("数值汇总忽略空值", () => {
    expect(footer("price", "sum")).toEqual({ ok: true, value: { kind: "numeric", value: 300 } });
    expect(footer("price", "avg")).toEqual({ ok: true, value: { kind: "numeric", value: 150 } });
    expect(footer("qty", "median")).toEqual({ ok: true, value: { kind: "numeric", value: 3 } });
    expect(aggregate("median", [4, 1, 3, 2])).toEqual({
      ok: true,
      value: { kind: "numeric", value: 2.5 },
    });
    expect(footer("rating", "avg")).toEqual({ ok: true, value: { kind: "numeric", value: 4 } });
    // 进度插件把缺省值归一为 0%，与单元格显示一致
    expect(footer("progress", "avg")).toEqual({
      ok: true,
      value: { kind: "numeric", value: 1 / 3 },
    });
    expect(aggregate("max", [null, ""])).toEqual({
      ok: true,
      value: { kind: "numeric", value: null },
    });
  });

  it("计数类适用于所有列，含未声明值类型的列", () => {
    expect(footer("title", "countAll")).toEqual({ ok: true, value: { kind: "count", value: 3 } });
    expect(footer("title", "countEmpty")).toEqual({ ok: true, value: { kind: "count", value: 1 } });
    expect(footer("status", "unique")).toEqual({ ok: true, value: { kind: "count", value: 1 } });
    expect(footer("files", "countNonEmpty")).toEqual({
      ok: true,
      value: { kind: "count", value: 1 },
    });
  });

  it("文本不隐式转数字", () => {
    expect(aggregatesFor("text")).not.toContain("sum");
    expect(aggregatesFor("number")).toContain("sum");
    expect(footer("title", "sum")).toMatchObject({ ok: false, error: { code: "type" } });
    expect(footer("ghost", "countAll")).toMatchObject({
      ok: false,
      error: { code: "missing-column" },
    });
  });
});

describe("store 表尾配置", () => {
  const config: TableViewConfig = {
    columnOrder: columns.map(column => column.id),
    rowOrder: rows.map(row => row.id),
    sorts: [],
    filters: null,
    footer: { qty: { kind: "aggregate", op: "sum" } },
  };

  it("设置、取消与删列清理都记为视图变更", () => {
    const { plugins } = setup();
    const store = createDatabaseStore(columns, rows, config, [], undefined, plugins);
    expect(store.getState().viewConfig.footer).toEqual({ qty: { kind: "aggregate", op: "sum" } });

    store.getState().setFooter("price", { kind: "aggregate", op: "avg" });
    expect(store.getState().lastChange).toMatchObject({ viewChanged: true, dataChanged: false });
    expect(store.getState().viewConfig.footer?.price).toEqual({ kind: "aggregate", op: "avg" });

    store.getState().setFooter("qty", null);
    store.getState().deleteColumn("price");
    expect(store.getState().viewConfig.footer).toBeUndefined();

    store
      .getState()
      .setViewConfig({ ...config, footer: { done: { kind: "aggregate", op: "countAll" } } });
    expect(store.getState().viewConfig.footer).toEqual({
      done: { kind: "aggregate", op: "countAll" },
    });
  });
});
