import type { AggregateOp } from "@tau/shared/database-types";
import type { FormulaResult, Scalar, ValueType } from "./types";

export const AGGREGATE_LABELS: Record<AggregateOp, string> = {
  sum: "求和",
  avg: "平均",
  median: "中位数",
  min: "最小值",
  max: "最大值",
  countAll: "计数",
  countNonEmpty: "非空",
  countEmpty: "空值",
  unique: "去重",
};

const COUNT_OPS: AggregateOp[] = ["countAll", "countNonEmpty", "countEmpty", "unique"];
const NUMERIC_OPS: AggregateOp[] = ["sum", "avg", "median", "min", "max"];

/** 该值类型可选的汇总方式；文本 / 未声明类型只能计数（不隐式转数字） */
export function aggregatesFor(valueType: ValueType | null): AggregateOp[] {
  return valueType === "number" ? [...NUMERIC_OPS, ...COUNT_OPS] : COUNT_OPS;
}

/** 汇总结果：counts 恒为整数计数；numeric 需按列格式化 */
export type AggregateValue =
  { kind: "count"; value: number } | { kind: "numeric"; value: number | null };

const isEmpty = (value: Scalar) => value === null || value === "";

export function aggregate(
  op: AggregateOp,
  values: readonly Scalar[]
): FormulaResult<AggregateValue> {
  const filled = values.filter(value => !isEmpty(value));
  switch (op) {
    case "countAll":
      return { ok: true, value: { kind: "count", value: values.length } };
    case "countNonEmpty":
      return { ok: true, value: { kind: "count", value: filled.length } };
    case "countEmpty":
      return { ok: true, value: { kind: "count", value: values.length - filled.length } };
    case "unique":
      return { ok: true, value: { kind: "count", value: new Set(filled.map(String)).size } };
  }
  const numbers = filled.filter((value): value is number => typeof value === "number");
  if (numbers.length !== filled.length)
    return { ok: false, error: { code: "type", message: "这一列不是数字，只能计数" } };
  if (numbers.length === 0) return { ok: true, value: { kind: "numeric", value: null } };
  const sum = numbers.reduce((total, value) => total + value, 0);
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const value =
    op === "sum"
      ? sum
      : op === "avg"
        ? sum / numbers.length
        : op === "min"
          ? sorted[0]
          : op === "max"
            ? sorted[sorted.length - 1]
            : sorted.length % 2
              ? sorted[middle]
              : (sorted[middle - 1] + sorted[middle]) / 2;
  return { ok: true, value: { kind: "numeric", value } };
}
