import { describe, expect, it } from "vitest";
import PluginManager from "../../../PluginManager";
import { builtInPlugins } from "../../../plugins";
import type { CellPlugin, ColumnDef } from "../../../types";
import type { Expr } from "../../../core/formula";
import { createFormContext } from "../check";
import { dateToMs, exprToForm, formToExpr, hasHole, type FormulaForm } from "../model";

const columns: ColumnDef[] = [
  { id: "title", title: "任务", type: "text", isPrimary: true },
  {
    id: "status",
    title: "状态",
    type: "select",
    config: { options: [{ id: "s1", name: "已完成", color: "gray" }] },
  },
  { id: "cost", title: "成本", type: "number" },
  { id: "qty", title: "数量", type: "number" },
  { id: "done", title: "完成", type: "checkbox" },
  { id: "due", title: "截止", type: "date" },
];
const plugins = new PluginManager();
plugins.registerPlugins(builtInPlugins as CellPlugin<unknown>[]);
const rowCtx = createFormContext(columns, plugins, "row");

const col = (columnId: string): Expr => ({ kind: "column", columnId });
const lit = (value: number | string | boolean | null): Expr => ({ kind: "literal", value });
const bin = (op: "+" | "-" | "*" | "/", left: Expr, right: Expr): Expr => ({
  kind: "binary",
  op,
  left,
  right,
});

const roundTrip = (expr: Expr, output?: "number" | "text") => {
  const form = exprToForm(expr, output, rowCtx);
  expect(form?.kind).not.toBe("unsupported");
  expect(formToExpr(form, "row")).toEqual(expr);
  return form;
};

describe("计算：先乘除后加减", () => {
  it("同级展平，括号成为嵌套项", () => {
    const flat = roundTrip(bin("+", col("cost"), bin("*", col("qty"), lit(2))));
    expect(flat).toMatchObject({ kind: "calc", terms: [{}, { op: "+" }, { op: "*" }] });
    const paren = roundTrip(bin("*", bin("+", col("cost"), lit(50)), col("qty")));
    expect(paren).toMatchObject({
      kind: "calc",
      terms: [{ value: { kind: "calc" } }, { op: "*" }],
    });
    roundTrip(bin("-", col("cost"), bin("-", col("qty"), lit(1))));
    roundTrip(col("cost"));
  });

  it("未填的数字是空位", () => {
    const form: FormulaForm = {
      kind: "calc",
      terms: [
        { value: { kind: "column", columnId: "cost" } },
        { op: "*", value: { kind: "number", value: "" } },
      ],
    };
    expect(hasHole(formToExpr(form, "row"))).toBe(true);
  });
});

describe("按条件显示", () => {
  it("else 链展开成多种情况，条件组合与各类比较可还原", () => {
    const expr: Expr = {
      kind: "if",
      test: {
        kind: "logic",
        op: "or",
        operands: [
          { kind: "compare", op: ">", left: bin("*", col("cost"), col("qty")), right: lit(500) },
          { kind: "compare", op: "==", left: col("status"), right: lit("已完成") },
        ],
      },
      then: lit("大单"),
      else: {
        kind: "if",
        test: { kind: "compare", op: "==", left: col("done"), right: lit(true) },
        then: lit("已结"),
        else: {
          kind: "if",
          test: { kind: "compare", op: "<", left: col("due"), right: lit(dateToMs("2026-10-10")) },
          then: lit("逾期"),
          else: lit(null),
        },
      },
    };
    const form = roundTrip(expr, "text");
    expect(form).toMatchObject({
      kind: "if",
      cases: [
        {
          join: "or",
          conds: [
            { cmp: "gt", left: { kind: "calc" } },
            { cmp: "eq", value: { kind: "option", value: "已完成" } },
          ],
        },
        { conds: [{ cmp: "true" }] },
        { conds: [{ cmp: "before", value: { kind: "date", value: "2026-10-10" } }] },
      ],
      otherwise: { kind: "text", value: "" },
    });
  });

  it("为空 / 不为空 / 未勾选", () => {
    const expr: Expr = {
      kind: "if",
      test: { kind: "not", operand: { kind: "empty", operand: col("title") } },
      then: lit(1),
      else: {
        kind: "if",
        test: { kind: "compare", op: "!=", left: col("done"), right: lit(true) },
        then: lit(2),
        else: lit(3),
      },
    };
    expect(roundTrip(expr, "number")).toMatchObject({ slot: "number" });
  });
});

describe("降级", () => {
  it("超出表单形状或嵌套过深时标为 unsupported", () => {
    expect(exprToForm({ kind: "not", operand: col("done") }, "boolean", rowCtx)).toEqual({
      kind: "unsupported",
    });
    let deep: Expr = col("cost");
    for (let i = 0; i < 4; i++) deep = bin("*", col("qty"), bin("+", deep, lit(1)));
    expect(exprToForm(deep, "number", rowCtx)).toEqual({ kind: "unsupported" });
  });

  it("表尾：汇总叶子可还原，直接引用列不行", () => {
    const footerCtx = createFormContext(columns, plugins, "footer");
    const expr = bin(
      "/",
      { kind: "aggregate", op: "sum", columnId: "cost" },
      { kind: "aggregate", op: "countAll", columnId: "title" }
    );
    const form = exprToForm(expr, undefined, footerCtx);
    expect(formToExpr(form, "footer")).toEqual(expr);
    expect(exprToForm(col("cost"), undefined, footerCtx)).toEqual({ kind: "unsupported" });
  });
});
