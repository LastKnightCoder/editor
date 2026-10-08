import type { AggregateOp, FooterSpec } from "@tau/shared/database-types";
import { aggregate, aggregatesFor, type AggregateValue } from "./aggregate";
import { evaluateExpr } from "./evaluate";
import type { FormulaContext, FormulaResult, Scalar, ValueType } from "./types";
import { validateFormula } from "./validate";

/** 表尾结果：单列汇总沿用列格式；组合表达式给出标量 */
export type FooterValue = AggregateValue | { kind: "expr"; value: Scalar; valueType: ValueType };

const isEmptyRaw = (raw: unknown) =>
  raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);

/** 一列的汇总；输入行应为投影后（筛选后）的行 */
export function aggregateColumn(
  columnId: string,
  op: AggregateOp,
  rows: readonly Record<string, unknown>[],
  ctx: FormulaContext
): FormulaResult<AggregateValue> {
  const ref = ctx.resolveColumn(columnId);
  if (ref === undefined)
    return { ok: false, error: { code: "missing-column", message: "引用的列已被删除" } };
  if (!aggregatesFor(ref?.valueType ?? null).includes(op))
    return { ok: false, error: { code: "type", message: "这一列不是数字，只能计数" } };
  // 未声明值类型的列只能计数：以原始值是否为空判断
  const values = rows.map(row =>
    ref ? ref.read(row) : isEmptyRaw(row[columnId]) ? null : JSON.stringify(row[columnId])
  );
  return aggregate(op, values);
}

/** 计算一列表尾格的值 */
export function evaluateFooter(
  columnId: string,
  spec: FooterSpec,
  rows: readonly Record<string, unknown>[],
  ctx: FormulaContext
): FormulaResult<FooterValue> {
  if (spec.kind === "aggregate") return aggregateColumn(columnId, spec.op, rows, ctx);
  const footerCtx: FormulaContext = {
    ...ctx,
    aggregate: (id, op) => {
      const result = aggregateColumn(id, op, rows, ctx);
      return result.ok ? { ok: true, value: result.value.value } : result;
    },
  };
  const valid = validateFormula(spec.expr, footerCtx, "footer");
  if (!valid.ok) return valid;
  const result = evaluateExpr(spec.expr, {}, footerCtx);
  return result.ok
    ? { ok: true, value: { kind: "expr", value: result.value, valueType: valid.value } }
    : result;
}
