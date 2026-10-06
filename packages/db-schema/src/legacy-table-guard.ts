import legacyTables from "./legacy-tables.json";

/**
 * 已随历史迁移物理删除的表。库里出现任何一张，说明它从未被最后升级版本成功打开过——
 * 与 scripts/db/check-schema-parity.mjs 共用同一份 JSON，防止 schema 回潮与运行时口径漂移。
 */
export const LEGACY_TABLES: readonly string[] = legacyTables;

interface SqliteLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- better-sqlite3 Statement 泛型按绑定参数元组收窄，any 参数才能双向兼容
  prepare(sql: string): { all(...params: any[]): unknown[] };
}

export function findLegacyTables(db: SqliteLike): string[] {
  const placeholders = LEGACY_TABLES.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
    .all(...LEGACY_TABLES) as Array<{ name: string }>;
  return rows.map(row => row.name);
}

/**
 * 数据基线门禁：开库、备份恢复与同步下载写入前调用，拒绝未完成历史升级的旧库。
 */
export function assertNoLegacyTables(db: SqliteLike): void {
  const found = findLegacyTables(db);
  if (found.length > 0) {
    throw new Error(
      `DB_LEGACY_SCHEMA: 数据库尚未完成历史数据升级（残留旧表：${found.join("、")}）。请先用最后升级版本打开该库完成升级，再更新到当前版本。`
    );
  }
}
