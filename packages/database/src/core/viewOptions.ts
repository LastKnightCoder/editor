import type { TableViewConfig } from "../types";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** 读取某视图类型的专属配置；子键缺失或不是普通对象时视为未配置 */
export function getViewOptions<T>(
  config: Pick<TableViewConfig, "viewOptions"> | undefined,
  type: string
): T | undefined {
  const options = config?.viewOptions?.[type];
  return isPlainObject(options) ? (options as T) : undefined;
}

/** 返回写入了指定视图类型配置的新 config；options 为 undefined 时移除该子键 */
export function setViewOptions(
  config: TableViewConfig,
  type: string,
  options: unknown
): TableViewConfig {
  const previous = config.viewOptions ?? {};
  if (options === undefined) {
    if (!(type in previous)) return config;
    const rest = { ...previous };
    delete rest[type];
    return { ...config, viewOptions: Object.keys(rest).length ? rest : undefined };
  }
  return { ...config, viewOptions: { ...previous, [type]: options } };
}

/** 浅拷贝各子对象（只保留普通对象值），供 store 初始化与整体替换时断开引用 */
export function cloneViewOptions(
  record: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!isPlainObject(record)) return undefined;
  const entries: Array<[string, Record<string, unknown>]> = [];
  for (const [key, value] of Object.entries(record)) {
    if (isPlainObject(value)) entries.push([key, { ...value }]);
  }
  return entries.length ? Object.fromEntries(entries) : undefined;
}
