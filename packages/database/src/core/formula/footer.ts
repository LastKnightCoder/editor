import type { FooterSpec } from "@tau/shared/database-types";
import type { AggregateRegistry } from "./aggregateRegistry";
import { evaluateExpr } from "./evaluate";
import type { FormulaContext, FormulaResult, Scalar, ValueType } from "./types";
import { validateFormula } from "./validate";

/**
 * 表尾结果：计数与数值的 null 都显示「—」（扩展的计数算子也可能给 null）；
 * 组合表达式给出标量；算子未登记（扩展被移除）显示为空。
 */
export type FooterValue =
  | { kind: "count"; value: number | null }
  | { kind: "numeric"; value: number | null }
  | { kind: "expr"; value: Scalar; valueType: ValueType }
  | { kind: "unregistered" };

const isEmptyRaw = (raw: unknown) =>
  raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);

/** 一列的汇总；输入行应为投影后（筛选后）的行；算子经登记表求值（内置与扩展同路径） */
export function aggregateColumn(
  columnId: string,
  op: string,
  rows: readonly Record<string, unknown>[],
  ctx: FormulaContext,
  registry: AggregateRegistry
): FormulaResult<FooterValue> {
  const ref = ctx.resolveColumn(columnId);
  if (ref === undefined)
    return { ok: false, error: { code: "missing-column", message: "引用的列已被删除" } };
  const definition = registry.get(op);
  if (!definition) return { ok: true, value: { kind: "unregistered" } };
  const valueType = ref?.valueType ?? null;
  if (definition.valueTypes && (valueType === null || !definition.valueTypes.includes(valueType)))
    return { ok: false, error: { code: "type", message: "这一列不是数字，只能计数" } };
  // 未声明值类型的列只能计数：以原始值是否为空判断
  const values = rows.map(row =>
    ref ? ref.read(row) : isEmptyRaw(row[columnId]) ? null : JSON.stringify(row[columnId])
  );
  const value = definition.compute(values);
  return {
    ok: true,
    value:
      definition.resultKind === "count" ? { kind: "count", value } : { kind: "numeric", value },
  };
}

/** 计算一列表尾格的值 */
export function evaluateFooter(
  columnId: string,
  spec: FooterSpec,
  rows: readonly Record<string, unknown>[],
  ctx: FormulaContext,
  registry: AggregateRegistry
): FormulaResult<FooterValue> {
  if (spec.kind === "aggregate") return aggregateColumn(columnId, spec.op, rows, ctx, registry);
  const footerCtx: FormulaContext = {
    ...ctx,
    aggregate: (id, op) => {
      const result = aggregateColumn(id, op, rows, ctx, registry);
      if (!result.ok) return result;
      // 公式叶子只认内置算子（校验已拒绝扩展算子），未登记分支不可达
      if (result.value.kind === "count" || result.value.kind === "numeric")
        return { ok: true, value: result.value.value };
      return { ok: false, error: { code: "type", message: "这一列不是数字，只能计数" } };
    },
  };
  const valid = validateFormula(spec.expr, footerCtx, "footer");
  if (!valid.ok) return valid;
  const result = evaluateExpr(spec.expr, {}, footerCtx);
  return result.ok
    ? { ok: true, value: { kind: "expr", value: result.value, valueType: valid.value } }
    : result;
}
