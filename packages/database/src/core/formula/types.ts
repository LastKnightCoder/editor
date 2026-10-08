/**
 * 汇总与公式的内部表达式结构。只在存储与校验层使用，不向用户展示。
 * 持久化形态定义在 @tau/shared/database-types，这里给引擎内的短名。
 */

import type {
  AggregateOp,
  FormulaBinaryOp,
  FormulaCompareOp,
  FormulaExpr,
  FormulaValueType,
} from "@tau/shared/database-types";

export type ValueType = FormulaValueType;
export type BinaryOp = FormulaBinaryOp;
export type CompareOp = FormulaCompareOp;
export type Expr = FormulaExpr;

/** 参与运算的标量；date 为毫秒时间戳，null 表示空 */
export type Scalar = number | string | boolean | null;

/** row：单行公式，可引用列；footer：表尾组合，只能引用各列汇总 */
export type FormulaScope = "row" | "footer";

/** 内部错误码：只用于映射提示文案与测试断言 */
export type FormulaErrorCode = "type" | "div0" | "missing-column" | "depth" | "bad-ref" | "cycle";

export interface FormulaError {
  code: FormulaErrorCode;
  /** 面向用户的一句话原因 */
  message: string;
}

export type FormulaResult<T = Scalar> = { ok: true; value: T } | { ok: false; error: FormulaError };

/** 表达式里一列的只读视图：类型 + 从行里取标量 */
export interface ColumnRef {
  id: string;
  title: string;
  valueType: ValueType;
  read: (row: Record<string, unknown>) => Scalar;
}

export interface FormulaContext {
  /** 列不存在返回 undefined；存在但不可参与运算（未声明 valueType）返回 null */
  resolveColumn: (columnId: string) => ColumnRef | null | undefined;
  /** 表尾作用域下求某列的汇总值 */
  aggregate?: (columnId: string, op: AggregateOp) => FormulaResult<number | null>;
}

export const MAX_DEPTH = 16;
