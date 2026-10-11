import type { Scalar, ValueType } from "../core/formula/types";
import type { CellValue, ColumnDef } from "../types";

/** 字段的纯数据部分：零 React / DOM 依赖，主进程与 MCP 可直接使用（D-130） */
export interface DatabaseFieldModel<TConfig = unknown> {
  type: string;
  /** 单元格值转纯文本（用于 Markdown/AI/搜索）；空值返回 "" */
  toText(value: CellValue, column: ColumnDef<TConfig>): string;
  /** 单元格引用的正文 id（每次出现计一次）；不引用资源的字段不声明 */
  contentRefs?(value: CellValue, column: ColumnDef<TConfig>): number[];
  valueType?: ValueType | ((column: ColumnDef<TConfig>) => ValueType | undefined);
  toScalar?(value: CellValue, column: ColumnDef<TConfig>): Scalar;
}

export function defineFieldModel<T>(model: DatabaseFieldModel<T>): DatabaseFieldModel<T> {
  return Object.freeze(model);
}
