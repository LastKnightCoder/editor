/**
 * 数据表视图专属配置收进通用 viewOptions（D-137）：
 * `galleryConfig/calendarConfig/kanbanConfig` → `viewOptions.gallery/calendar/kanban`。
 * 开库时按实际数据判定（旧端写回会再转换），不改 update_time，单事务，失败抛错不放行（D-091 口径）。
 * 全部设备升级后随下一次清洁版删除。
 */

import type Database from "better-sqlite3";

/** 旧顶层键 → 视图 type 子键 */
const LEGACY_VIEW_CONFIG_KEYS: Record<string, string> = {
  galleryConfig: "gallery",
  calendarConfig: "calendar",
  kanbanConfig: "kanban",
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * 原地改写一条视图 config：只移动非空对象的旧键；viewOptions 已有同名子键时以已有为准、丢弃旧键；
 * 空对象/非对象旧键删除不迁移。返回是否有改动（无旧键时不变，保证幂等）。
 */
export function moveLegacyViewConfigKeys(config: Record<string, unknown>): boolean {
  let changed = false;
  let viewOptions: Record<string, unknown> | undefined;
  for (const [legacyKey, typeKey] of Object.entries(LEGACY_VIEW_CONFIG_KEYS)) {
    const legacyValue = config[legacyKey];
    if (legacyValue === undefined) continue;
    delete config[legacyKey];
    changed = true;
    if (!isPlainObject(legacyValue) || Object.keys(legacyValue).length === 0) continue;
    viewOptions ??= isPlainObject(config.viewOptions) ? { ...config.viewOptions } : {};
    if (viewOptions[typeKey] === undefined) viewOptions[typeKey] = legacyValue;
  }
  if (viewOptions) config.viewOptions = viewOptions;
  return changed;
}

export function upgradeDataTableViewOptions(db: Database.Database): number {
  const rows = db
    .prepare(
      `SELECT id, config FROM data_table_views
       WHERE config LIKE '%galleryConfig%' OR config LIKE '%calendarConfig%' OR config LIKE '%kanbanConfig%'`
    )
    .all() as Array<{ id: number; config: string | null }>;
  if (rows.length === 0) return 0;

  const update = db.prepare(`UPDATE data_table_views SET config = ? WHERE id = ?`);
  let upgraded = 0;
  db.transaction(() => {
    for (const row of rows) {
      let config: Record<string, unknown> | null;
      try {
        config = row.config ? JSON.parse(row.config) : null;
      } catch {
        // 已损坏的视图配置不归本次升级处理，保持原样
        continue;
      }
      if (!isPlainObject(config)) continue;
      if (!moveLegacyViewConfigKeys(config)) continue;
      update.run(JSON.stringify(config), row.id);
      upgraded++;
    }
  })();
  return upgraded;
}
