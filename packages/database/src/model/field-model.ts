import type { Scalar, ValueType } from "../core/formula/types";
import type { CellValue, ColumnDef } from "../types";

/** 字段的纯数据部分：零 React / DOM 依赖，主进程与 MCP 可直接使用（D-137） */
export interface DatabaseFieldModel<TConfig = unknown> {
  type: string;
  /** 单元格值转纯文本（用于 Markdown/AI/搜索）；空值返回 "" */
  toText(value: CellValue, column: ColumnDef<TConfig>): string;
  /** 单元格引用的正文 id（每次出现计一次）；不引用资源的字段不声明 */
  contentRefs?(value: CellValue, column: ColumnDef<TConfig>): number[];
  valueType?: ValueType | ((column: ColumnDef<TConfig>) => ValueType | undefined);
  toScalar?(value: CellValue, column: ColumnDef<TConfig>): Scalar;
  /** 当前配置版本；未声明视为 1。列定义的 configVersion 缺省视为 1 */
  configVersion?: number;
  /** 把 fromVersion 版本的配置升级一级（到 fromVersion+1）；逐级调用直到当前版本 */
  migrateConfig?(config: unknown, fromVersion: number): unknown;
}

export function defineFieldModel<T>(model: DatabaseFieldModel<T>): DatabaseFieldModel<T> {
  if ((model.configVersion ?? 1) > 1 && typeof model.migrateConfig !== "function") {
    throw new Error(
      `字段 ${model.type} 声明了 configVersion=${model.configVersion} 却没有 migrateConfig，缺少逐级迁移函数`
    );
  }
  return Object.freeze(model);
}
