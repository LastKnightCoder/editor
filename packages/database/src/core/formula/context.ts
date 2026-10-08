import type PluginManager from "../../PluginManager";
import type { CellValue, ColumnDef } from "../../types";
import type { ColumnRef, FormulaContext, Scalar, ValueType } from "./types";

/** 未提供 toScalar 时按值类型直接取值；形态不符一律视为空 */
export function defaultScalar(value: CellValue, valueType: ValueType): Scalar {
  switch (valueType) {
    case "number":
    case "date":
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    case "text":
      return typeof value === "string" && value !== "" ? value : null;
    case "boolean":
      return typeof value === "boolean" ? value : null;
  }
}

/** 由列定义与插件元数据建立求值上下文；引擎只经此读取字段，不认识具体插件 */
export function createFormulaContext(
  columns: readonly ColumnDef[],
  plugins: PluginManager
): FormulaContext {
  const refs = new Map<string, ColumnRef | null>();
  for (const column of columns) {
    const plugin = plugins.getPlugin(column.type);
    const declared = plugins.hasPlugin(column.type) ? plugin?.valueType : undefined;
    const valueType = typeof declared === "function" ? declared(column) : declared;
    if (!plugin || !valueType) {
      refs.set(column.id, null);
      continue;
    }
    refs.set(column.id, {
      id: column.id,
      title: column.title,
      valueType,
      read: row => {
        const loaded = plugins.transformAfterLoad(column.type, row[column.id], column.config);
        return plugin.toScalar ? plugin.toScalar(loaded, column) : defaultScalar(loaded, valueType);
      },
    });
  }
  return { resolveColumn: columnId => refs.get(columnId) };
}
