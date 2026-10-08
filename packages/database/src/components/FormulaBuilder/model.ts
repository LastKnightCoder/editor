/**
 * 构造器的表单模型：用户看到的三种表单（计算 / 按条件显示 / 拼接文字）与内部表达式树之间的双向转换。
 * 表单只是表达式树的一种受限视图；打开已有公式时还原，保存时转回，引擎与存储不感知表单。
 */

import type { AggregateOp } from "@tau/shared/database-types";
import type { BinaryOp, Expr, FormulaScope, ValueType } from "../../core/formula";
import type { Draft } from "./check";

/** 值框的类型决定输入方式与可选的列 */
export type SlotKind = "number" | "text" | "date" | "option";

export type ValueNode =
  | { kind: "column"; columnId: string; agg?: AggregateOp }
  | { kind: "number"; value: string }
  | { kind: "text"; value: string }
  | { kind: "date"; value: string }
  | { kind: "option"; value: string | null }
  | CalcNode
  | IfNode;

export interface Term {
  /** 第一项没有运算符 */
  op?: BinaryOp;
  value: ValueNode;
}

/** 一排四则项，按先乘除后加减求值；某一项本身是计算即相当于括号 */
export interface CalcNode {
  kind: "calc";
  terms: Term[];
}

export type CompareKey =
  | "gt"
  | "lt"
  | "ge"
  | "le"
  | "eq"
  | "ne"
  | "has"
  | "before"
  | "after"
  | "empty"
  | "filled"
  | "true"
  | "false";

export interface Condition {
  left: { kind: "column"; columnId: string } | CalcNode;
  cmp: CompareKey;
  value: ValueNode;
}

export interface Case {
  join: "and" | "or";
  conds: Condition[];
  result: ValueNode;
}

/** 从上往下匹配，第一个满足的情况生效 */
export interface IfNode {
  kind: "if";
  cases: Case[];
  otherwise: ValueNode;
  /** 结果值框的类型：放在计算里时为 number */
  slot: SlotKind;
}

export interface ConcatNode {
  kind: "concat";
  parts: ValueNode[];
}

/** null：还没选要算什么；unsupported：已有公式超出表单能表达的形状 */
export type FormulaForm = null | CalcNode | IfNode | ConcatNode | { kind: "unsupported" };

/** 根表单之下最多再套几层 */
export const MAX_NEST = 2;

/** 左侧值的比较方式，按列的值类型分；select 单独给出选项选择 */
export type CompareFamily = ValueType | "select";

export const COMPARES: Record<CompareFamily, [CompareKey, string][]> = {
  number: [
    ["gt", "大于"],
    ["lt", "小于"],
    ["eq", "等于"],
    ["ne", "不等于"],
    ["ge", "大于等于"],
    ["le", "小于等于"],
    ["empty", "为空"],
    ["filled", "不为空"],
  ],
  text: [
    ["eq", "是"],
    ["ne", "不是"],
    ["has", "包含"],
    ["empty", "为空"],
    ["filled", "不为空"],
  ],
  select: [
    ["eq", "是"],
    ["ne", "不是"],
    ["empty", "为空"],
    ["filled", "不为空"],
  ],
  boolean: [
    ["true", "已勾选"],
    ["false", "未勾选"],
  ],
  date: [
    ["before", "早于"],
    ["after", "晚于"],
    ["eq", "是"],
    ["empty", "为空"],
    ["filled", "不为空"],
  ],
};

export const NO_VALUE = new Set<CompareKey>(["empty", "filled", "true", "false"]);

export const slotForFamily = (family: CompareFamily): SlotKind =>
  family === "number"
    ? "number"
    : family === "date"
      ? "date"
      : family === "select"
        ? "option"
        : "text";

export const emptyValue = (slot: SlotKind): ValueNode =>
  slot === "option" ? { kind: "option", value: null } : { kind: slot, value: "" };

/* ───────── 日期：表单里是 YYYY-MM-DD，表达式里是本地零点的毫秒 ───────── */

export function dateToMs(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(+match[1], +match[2] - 1, +match[3]).getTime();
}

export function msToDate(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* ───────── 表单 → 表达式（未填完处为 hole） ───────── */

const HOLE = { kind: "hole" } as const;
const lit = (value: number | string | boolean | null): Expr => ({ kind: "literal", value });

function valueToExpr(node: ValueNode, scope: FormulaScope): Draft {
  switch (node.kind) {
    case "column":
      return scope === "footer"
        ? { kind: "aggregate", op: node.agg ?? "countAll", columnId: node.columnId }
        : { kind: "column", columnId: node.columnId };
    case "number": {
      const text = node.value.trim();
      const value = Number(text);
      return text === "" || !Number.isFinite(value) ? HOLE : lit(value);
    }
    case "text":
      return lit(node.value === "" ? null : node.value);
    case "date": {
      const ms = dateToMs(node.value);
      return ms === null ? HOLE : lit(ms);
    }
    case "option":
      return node.value === null ? HOLE : lit(node.value);
    case "calc":
      return calcToExpr(node, scope);
    case "if":
      return ifToExpr(node, scope);
  }
}

/** 先乘除后加减，左结合 */
function calcToExpr(node: CalcNode, scope: FormulaScope): Draft {
  const sums: { op: BinaryOp; expr: Draft }[] = [];
  node.terms.forEach((term, index) => {
    const expr = valueToExpr(term.value, scope);
    const op = index === 0 ? "+" : (term.op ?? "+");
    const last = sums[sums.length - 1];
    if (last && (op === "*" || op === "/"))
      last.expr = { kind: "binary", op, left: last.expr, right: expr } as never;
    else sums.push({ op, expr });
  });
  if (!sums.length) return HOLE;
  return sums
    .slice(1)
    .reduce<Draft>(
      (left, { op, expr }) => ({ kind: "binary", op, left, right: expr }) as never,
      sums[0].expr
    );
}

const COMPARE_OPS: Partial<Record<CompareKey, Extract<Expr, { kind: "compare" }>["op"]>> = {
  gt: ">",
  lt: "<",
  ge: ">=",
  le: "<=",
  eq: "==",
  ne: "!=",
  has: "contains",
  before: "<",
  after: ">",
};

function conditionToExpr(cond: Condition, scope: FormulaScope): Draft {
  const left =
    cond.left.kind === "calc" ? calcToExpr(cond.left, scope) : valueToExpr(cond.left, scope);
  switch (cond.cmp) {
    case "empty":
      return { kind: "empty", operand: left } as never;
    case "filled":
      return { kind: "not", operand: { kind: "empty", operand: left } } as never;
    case "true":
      return { kind: "compare", op: "==", left, right: lit(true) } as never;
    case "false":
      return { kind: "compare", op: "!=", left, right: lit(true) } as never;
  }
  return {
    kind: "compare",
    op: COMPARE_OPS[cond.cmp],
    left,
    right: valueToExpr(cond.value, scope),
  } as never;
}

function ifToExpr(node: IfNode, scope: FormulaScope): Draft {
  return node.cases.reduceRight<Draft>(
    (otherwise, item) => {
      const tests = item.conds.map(cond => conditionToExpr(cond, scope));
      const test =
        tests.length === 1
          ? tests[0]
          : ({ kind: "logic", op: item.join, operands: tests } as never);
      return { kind: "if", test, then: valueToExpr(item.result, scope), else: otherwise } as never;
    },
    valueToExpr(node.otherwise, scope)
  );
}

export function formToExpr(form: FormulaForm, scope: FormulaScope): Draft {
  if (!form || form.kind === "unsupported") return HOLE;
  if (form.kind === "concat")
    return { kind: "concat", parts: form.parts.map(part => valueToExpr(part, scope)) } as never;
  return valueToExpr(form, scope);
}

/** 表达式里是否还有没填完的空位 */
export function hasHole(draft: unknown): boolean {
  if (!draft || typeof draft !== "object") return false;
  if ((draft as { kind?: string }).kind === "hole") return true;
  return Object.values(draft).some(value =>
    Array.isArray(value) ? value.some(hasHole) : hasHole(value)
  );
}

/* ───────── 表达式 → 表单（超出形状时抛出，由调用方降级为 unsupported） ───────── */

class Unsupported extends Error {}
const unsupported = (): never => {
  throw new Unsupported();
};

export interface FormContext {
  scope: FormulaScope;
  /** 列的比较类别；列不存在返回 undefined */
  familyOf: (columnId: string) => CompareFamily | undefined;
}

/** 加减层：同级展平，右侧若又是加减则成为括号项 */
function sumTerms(expr: Expr, ctx: FormContext, depth: number): Term[] {
  if (expr.kind === "binary" && (expr.op === "+" || expr.op === "-")) {
    const [first, ...rest] = productTerms(expr.right, ctx, depth);
    return [...sumTerms(expr.left, ctx, depth), { ...first, op: expr.op }, ...rest];
  }
  return productTerms(expr, ctx, depth);
}

/** 乘除层：左侧可继续展平；右侧若是任何运算则成为括号项 */
function productTerms(expr: Expr, ctx: FormContext, depth: number): Term[] {
  if (expr.kind === "binary" && (expr.op === "*" || expr.op === "/"))
    return [
      ...productTerms(expr.left, ctx, depth),
      { op: expr.op, value: valueFrom(expr.right, "number", ctx, depth) },
    ];
  return [{ value: valueFrom(expr, "number", ctx, depth) }];
}

function calcFrom(expr: Expr, ctx: FormContext, depth: number): CalcNode {
  if (depth > MAX_NEST) unsupported();
  return { kind: "calc", terms: sumTerms(expr, ctx, depth) };
}

function valueFrom(expr: Expr, slot: SlotKind, ctx: FormContext, depth: number): ValueNode {
  switch (expr.kind) {
    case "column":
      if (ctx.scope === "footer") unsupported();
      return { kind: "column", columnId: expr.columnId };
    case "aggregate":
      if (ctx.scope !== "footer") unsupported();
      return { kind: "column", columnId: expr.columnId, agg: expr.op };
    case "literal": {
      const { value } = expr;
      if (slot === "date")
        return typeof value === "number" ? { kind: "date", value: msToDate(value) } : unsupported();
      if (slot === "option")
        return typeof value === "string" ? { kind: "option", value } : unsupported();
      if (typeof value === "number") return { kind: "number", value: String(value) };
      if (typeof value === "string") return { kind: "text", value };
      if (value === null && slot === "text") return { kind: "text", value: "" };
      return unsupported();
    }
    case "binary":
      return calcFrom(expr, ctx, depth + 1);
    case "if":
      return ifFrom(expr, slot, ctx, depth + 1);
    default:
      return unsupported();
  }
}

const REVERSE: Record<string, Partial<Record<CompareFamily | "any", CompareKey>>> = {
  ">": { number: "gt", date: "after" },
  "<": { number: "lt", date: "before" },
  ">=": { number: "ge" },
  "<=": { number: "le" },
  "==": { any: "eq" },
  "!=": { any: "ne" },
  contains: { text: "has", select: "has" },
};

function conditionFrom(expr: Expr, ctx: FormContext, depth: number): Condition {
  const leftOf = (left: Expr): { node: Condition["left"]; family: CompareFamily } => {
    if (left.kind === "column") {
      const family = ctx.familyOf(left.columnId) ?? unsupported();
      return { node: { kind: "column", columnId: left.columnId }, family };
    }
    if (left.kind === "binary") return { node: calcFrom(left, ctx, depth + 1), family: "number" };
    return unsupported();
  };
  if (expr.kind === "empty") {
    const { node } = leftOf(expr.operand);
    return { left: node, cmp: "empty", value: emptyValue("text") };
  }
  if (expr.kind === "not" && expr.operand.kind === "empty") {
    const { node } = leftOf(expr.operand.operand);
    return { left: node, cmp: "filled", value: emptyValue("text") };
  }
  if (expr.kind !== "compare") return unsupported();
  const { node, family } = leftOf(expr.left);
  if (family === "boolean") {
    if (expr.right.kind !== "literal" || expr.right.value !== true) unsupported();
    if (expr.op !== "==" && expr.op !== "!=") unsupported();
    return { left: node, cmp: expr.op === "==" ? "true" : "false", value: emptyValue("text") };
  }
  const cmp = REVERSE[expr.op]?.[family] ?? REVERSE[expr.op]?.any ?? unsupported();
  if (!COMPARES[family].some(([key]) => key === cmp)) unsupported();
  return { left: node, cmp, value: valueFrom(expr.right, slotForFamily(family), ctx, depth) };
}

function ifFrom(expr: Expr, slot: SlotKind, ctx: FormContext, depth: number): IfNode {
  if (depth > MAX_NEST) unsupported();
  const cases: Case[] = [];
  let node: Expr = expr;
  while (node.kind === "if") {
    const test = node.test;
    const conds =
      test.kind === "logic"
        ? test.operands.map(operand => conditionFrom(operand, ctx, depth))
        : [conditionFrom(test, ctx, depth)];
    cases.push({
      join: test.kind === "logic" ? test.op : "and",
      conds,
      result: valueFrom(node.then, slot, ctx, depth),
    });
    node = node.else;
  }
  return { kind: "if", cases, otherwise: valueFrom(node, slot, ctx, depth), slot };
}

/** 还原已有公式；超出表单形状时返回 unsupported，由界面提示重新设置 */
export function exprToForm(
  expr: Expr,
  output: ValueType | undefined,
  ctx: FormContext
): FormulaForm {
  try {
    if (expr.kind === "if") return ifFrom(expr, output === "number" ? "number" : "text", ctx, 0);
    if (expr.kind === "concat")
      return { kind: "concat", parts: expr.parts.map(part => valueFrom(part, "text", ctx, 0)) };
    return calcFrom(expr, ctx, 0);
  } catch (error) {
    if (error instanceof Unsupported) return { kind: "unsupported" };
    throw error;
  }
}

/* ───────── 新建三种表单的初始值 ───────── */

export function newForm(
  mode: "calc" | "if" | "concat",
  scope: FormulaScope,
  firstColumn?: { id: string; family: CompareFamily }
): Exclude<FormulaForm, null | { kind: "unsupported" }> {
  if (mode === "calc")
    return {
      kind: "calc",
      terms: [
        {
          value: firstColumn
            ? {
                kind: "column",
                columnId: firstColumn.id,
                ...(scope === "footer" ? { agg: "sum" as const } : {}),
              }
            : emptyValue("number"),
        },
        { op: "+", value: emptyValue("number") },
      ],
    };
  if (mode === "concat") return { kind: "concat", parts: [emptyValue("text"), emptyValue("text")] };
  const family = firstColumn?.family ?? "text";
  return {
    kind: "if",
    slot: "text",
    cases: [
      {
        join: "and",
        conds: [
          {
            left: { kind: "column", columnId: firstColumn?.id ?? "" },
            cmp: COMPARES[family][0][0],
            value: emptyValue(slotForFamily(family)),
          },
        ],
        result: emptyValue("text"),
      },
    ],
    otherwise: emptyValue("text"),
  };
}
