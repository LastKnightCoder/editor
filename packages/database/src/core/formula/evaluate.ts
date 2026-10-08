import type { Expr, FormulaContext, FormulaResult, Scalar } from "./types";

const ok = (value: Scalar): FormulaResult => ({ ok: true, value });
const finite = (value: number): Scalar => (Number.isFinite(value) ? value : null);

/**
 * 对单行求值。调用前须经 validateExpr；这里仍对运行期数据保持防御：
 * 空值参与四则得空、比较时空值只与空值相等、拼接时空值为空串、除 0 报错。
 */
export function evaluateExpr(
  expr: Expr,
  row: Record<string, unknown>,
  ctx: FormulaContext
): FormulaResult {
  const visit = (node: Expr): FormulaResult => {
    switch (node.kind) {
      case "literal":
        return ok(node.value);
      case "column": {
        const ref = ctx.resolveColumn(node.columnId);
        if (ref === undefined)
          return { ok: false, error: { code: "missing-column", message: "引用的列已被删除" } };
        if (ref === null)
          return { ok: false, error: { code: "type", message: "这一列不能参与计算" } };
        return ok(ref.read(row));
      }
      case "binary": {
        const left = visit(node.left);
        if (!left.ok) return left;
        const right = visit(node.right);
        if (!right.ok) return right;
        const a = left.value;
        const b = right.value;
        if (typeof a !== "number" || typeof b !== "number") return ok(null);
        switch (node.op) {
          case "+":
            return ok(finite(a + b));
          case "-":
            return ok(finite(a - b));
          case "*":
            return ok(finite(a * b));
          case "/":
            if (b === 0) return { ok: false, error: { code: "div0", message: "除数为 0" } };
            return ok(finite(a / b));
        }
        return ok(null);
      }
      case "compare": {
        const left = visit(node.left);
        if (!left.ok) return left;
        const right = visit(node.right);
        if (!right.ok) return right;
        const a = left.value;
        const b = right.value;
        if (node.op === "==") return ok(a === b);
        if (node.op === "!=") return ok(a !== b);
        if (a === null || b === null) return ok(false);
        if (node.op === "contains") return ok(String(a).includes(String(b)));
        switch (node.op) {
          case ">":
            return ok(a > b);
          case ">=":
            return ok(a >= b);
          case "<":
            return ok(a < b);
          case "<=":
            return ok(a <= b);
        }
        return ok(false);
      }
      case "logic": {
        for (const operand of node.operands) {
          const result = visit(operand);
          if (!result.ok) return result;
          const truthy = result.value === true;
          if (node.op === "and" && !truthy) return ok(false);
          if (node.op === "or" && truthy) return ok(true);
        }
        return ok(node.op === "and");
      }
      case "not": {
        const result = visit(node.operand);
        if (!result.ok) return result;
        return ok(result.value !== true);
      }
      case "empty": {
        const result = visit(node.operand);
        if (!result.ok) return result;
        return ok(result.value === null || result.value === "");
      }
      case "if": {
        const test = visit(node.test);
        if (!test.ok) return test;
        return visit(test.value === true ? node.then : node.else);
      }
      case "concat": {
        let text = "";
        for (const part of node.parts) {
          const result = visit(part);
          if (!result.ok) return result;
          if (result.value !== null) text += String(result.value);
        }
        return ok(text);
      }
    }
  };
  return visit(expr);
}
