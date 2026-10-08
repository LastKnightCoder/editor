/**
 * 汇总与公式的内部表达式结构。只在存储与校验层使用，不向用户展示。
 */

export type ValueType = "number" | "text" | "boolean" | "date";

/** 参与运算的标量；date 为毫秒时间戳，null 表示空 */
export type Scalar = number | string | boolean | null;

export type BinaryOp = "+" | "-" | "*" | "/";
export type CompareOp = ">" | ">=" | "<" | "<=" | "==" | "!=" | "contains";

export type Expr =
  | { kind: "literal"; value: number | string | boolean | null }
  | { kind: "column"; columnId: string }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "compare"; op: CompareOp; left: Expr; right: Expr }
  | { kind: "logic"; op: "and" | "or"; operands: Expr[] }
  | { kind: "not"; operand: Expr }
  | { kind: "if"; test: Expr; then: Expr; else: Expr }
  | { kind: "concat"; parts: Expr[] }
  | { kind: "empty"; operand: Expr };

/** 内部错误码：只用于映射提示文案与测试断言 */
export type FormulaErrorCode = "type" | "div0" | "missing-column" | "depth" | "bad-ref";

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
}

export const MAX_DEPTH = 16;
