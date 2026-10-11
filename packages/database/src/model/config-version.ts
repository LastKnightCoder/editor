import type { ColumnDef } from "../types";
import type { DatabaseFieldModel } from "./field-model";

/**
 * 列配置升级（D-137）：列的 configVersion 低于 model 当前版本时逐级调用
 * migrateConfig（fromVersion → fromVersion+1），返回带新 config 与新 configVersion
 * 的列对象。版本相等、model 未声明版本或列版本更高（来自更新版本的数据，不降级）
 * 时原样返回（引用相等）。升级结果不立即触发保存，随用户下次修改一并落库。
 */
export function upgradeColumnConfig<T extends ColumnDef>(
  column: T,
  model: DatabaseFieldModel | undefined
): T {
  const current = model?.configVersion ?? 1;
  const from = column.configVersion ?? 1;
  if (!model || from >= current) return column;
  let config = column.config;
  for (let version = from; version < current; version++) {
    config = model.migrateConfig?.(config, version);
  }
  return { ...column, config, configVersion: current };
}

/** 对一组列按各自字段的 model 升级配置；无任何列变化时返回原数组（引用相等） */
export function upgradeColumns(
  columns: ColumnDef[],
  models: readonly DatabaseFieldModel[]
): ColumnDef[] {
  const byType = new Map(models.map(model => [model.type, model] as const));
  let changed = false;
  const next = columns.map(column => {
    const upgraded = upgradeColumnConfig(column, byType.get(column.type));
    if (upgraded !== column) changed = true;
    return upgraded;
  });
  return changed ? next : columns;
}
