import { aggregatesFor } from "./aggregate";
import {
  MAX_DEPTH,
  type Expr,
  type FormulaContext,
  type FormulaError,
  type FormulaResult,
  type FormulaScope,
  type ValueType,
} from "./types";

/** null 表示类型未定（字面量 null），可与任何类型配对 */
type InferredType = ValueType | null;

const BINARY_OPS = new Set(["+", "-", "*", "/"]);
const COMPARE_OPS = new Set([">", ">=", "<", "<=", "==", "!=", "contains"]);
const ORDER_OPS = new Set([">", ">=", "<", "<="]);
const TYPE_NAMES: Record<ValueType, string> = {
  number: "数字",
  text: "文本",
  boolean: "是 / 否",
  date: "日期",
};
const OP_NAMES: Record<string, string> = {
  "+": "加",
  "-": "减",
  "*": "乘",
  "/": "除",
};
const INCOMPLETE = "还有没填完的地方";

const fail = (code: FormulaError["code"], message: string) =>
  ({ ok: false, error: { code, message } }) as const;
const pass = (value: InferredType) => ({ ok: true, value }) as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compatible = (a: InferredType, b: InferredType) => a === null || b === null || a === b;

/**
 * 校验任意输入是否为合法表达式并推导结果类型。
 * 入参为 unknown：AI 产出与旧版本数据都必须经此才能求值。
 */
export function validateExpr(
  input: unknown,
  ctx: FormulaContext,
  scope: FormulaScope = "row"
): FormulaResult<InferredType> {
  const visit = (node: unknown, depth: number): FormulaResult<InferredType> => {
    if (depth > MAX_DEPTH) return fail("depth", `嵌套太深（最多 ${MAX_DEPTH} 层）`);
    if (!isRecord(node)) return fail("bad-ref", INCOMPLETE);

    switch (node.kind) {
      case "literal": {
        const { value } = node;
        if (value === null) return pass(null);
        if (typeof value === "number")
          return Number.isFinite(value) ? pass("number") : fail("bad-ref", "数值无效");
        if (typeof value === "string") return pass("text");
        if (typeof value === "boolean") return pass("boolean");
        return fail("bad-ref", INCOMPLETE);
      }
      case "column": {
        if (typeof node.columnId !== "string") return fail("bad-ref", INCOMPLETE);
        if (scope !== "row") return fail("bad-ref", "表尾公式只能引用各列的汇总");
        const ref = ctx.resolveColumn(node.columnId);
        if (ref === undefined) return fail("missing-column", "引用的列已被删除");
        if (ref === null) return fail("type", "这一列不能参与计算");
        return pass(ref.valueType);
      }
      case "aggregate": {
        if (typeof node.columnId !== "string" || typeof node.op !== "string")
          return fail("bad-ref", INCOMPLETE);
        if (scope !== "footer") return fail("bad-ref", "汇总只能用在表尾");
        const ref = ctx.resolveColumn(node.columnId);
        if (ref === undefined) return fail("missing-column", "引用的列已被删除");
        if (!(aggregatesFor(ref?.valueType ?? null) as string[]).includes(node.op))
          return fail("type", "这一列不是数字，只能计数");
        return pass("number");
      }
      case "binary": {
        if (typeof node.op !== "string" || !BINARY_OPS.has(node.op))
          return fail("bad-ref", INCOMPLETE);
        const sides = visitPair(node.left, node.right, depth);
        if (!sides.ok) return sides;
        const [left, right] = sides.value;
        if (!compatible(left, "number") || !compatible(right, "number"))
          return fail("type", `「${OP_NAMES[node.op]}」两边都要是数字`);
        return pass("number");
      }
      case "compare": {
        if (typeof node.op !== "string" || !COMPARE_OPS.has(node.op))
          return fail("bad-ref", INCOMPLETE);
        const sides = visitPair(node.left, node.right, depth);
        if (!sides.ok) return sides;
        const [left, right] = sides.value;
        if (node.op === "contains") {
          if (!compatible(left, "text") || !compatible(right, "text"))
            return fail("type", "「包含」两边都要是文本");
        } else if (left !== null && right !== null && left !== right) {
          return fail("type", `${TYPE_NAMES[left]}不能和${TYPE_NAMES[right]}比较`);
        } else if (ORDER_OPS.has(node.op) && (left === "boolean" || right === "boolean")) {
          return fail("type", "是 / 否不能比较大小");
        }
        return pass("boolean");
      }
      case "logic": {
        if ((node.op !== "and" && node.op !== "or") || !Array.isArray(node.operands))
          return fail("bad-ref", INCOMPLETE);
        if (node.operands.length < 2) return fail("bad-ref", "「并且 / 或者」至少需要两个条件");
        for (const operand of node.operands) {
          const result = visit(operand, depth + 1);
          if (!result.ok) return result;
          if (!compatible(result.value, "boolean")) return fail("type", "条件要是一个判断");
        }
        return pass("boolean");
      }
      case "not":
      case "empty": {
        const result = visit(node.operand, depth + 1);
        if (!result.ok) return result;
        if (node.kind === "not" && !compatible(result.value, "boolean"))
          return fail("type", "「不是」后面要是一个判断");
        return pass("boolean");
      }
      case "if": {
        const test = visit(node.test, depth + 1);
        if (!test.ok) return test;
        if (!compatible(test.value, "boolean")) return fail("type", "条件要是一个判断");
        const branches = visitPair(node.then, node.else, depth);
        if (!branches.ok) return branches;
        const [then, otherwise] = branches.value;
        if (!compatible(then, otherwise)) return fail("type", "「是」和「否」两个结果的类型要一致");
        return pass(then ?? otherwise);
      }
      case "concat": {
        if (!Array.isArray(node.parts) || node.parts.length === 0)
          return fail("bad-ref", INCOMPLETE);
        for (const part of node.parts) {
          const result = visit(part, depth + 1);
          if (!result.ok) return result;
        }
        return pass("text");
      }
      default:
        return fail("bad-ref", INCOMPLETE);
    }
  };

  const visitPair = (
    a: unknown,
    b: unknown,
    depth: number
  ): FormulaResult<[InferredType, InferredType]> => {
    const left = visit(a, depth + 1);
    if (!left.ok) return left;
    const right = visit(b, depth + 1);
    if (!right.ok) return right;
    return { ok: true, value: [left.value, right.value] };
  };

  return visit(input, 0);
}

/** 校验并要求结果类型确定（整棵树只有空值时无法决定结果怎么显示） */
export function validateFormula(
  input: unknown,
  ctx: FormulaContext,
  scope: FormulaScope = "row"
): FormulaResult<ValueType> {
  const result = validateExpr(input, ctx, scope);
  if (!result.ok) return result;
  if (result.value === null) return fail("type", "结果不能总是空");
  return { ok: true, value: result.value };
}

/** 表达式直接引用的列 */
export function referencedColumns(expr: Expr): string[] {
  const ids = new Set<string>();
  const visit = (node: Expr) => {
    switch (node.kind) {
      case "column":
      case "aggregate":
        ids.add(node.columnId);
        return;
      case "binary":
      case "compare":
        visit(node.left);
        visit(node.right);
        return;
      case "logic":
        node.operands.forEach(visit);
        return;
      case "concat":
        node.parts.forEach(visit);
        return;
      case "not":
      case "empty":
        visit(node.operand);
        return;
      case "if":
        visit(node.test);
        visit(node.then);
        visit(node.else);
        return;
    }
  };
  visit(expr);
  return [...ids];
}
