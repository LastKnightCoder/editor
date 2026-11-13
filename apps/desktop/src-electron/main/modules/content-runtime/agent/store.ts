import schema from "@tau/db-schema/schema/content-agent.sql?raw";
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CollaborationLocalStore } from "../../collaboration/local-store";

const imported = "legacy-content-agent-imported";
const tables = ["content_suggestions", "content_agent_permissions"] as const;

export function prepareContentAgentStore(appDirectory: string, target: CollaborationLocalStore) {
  target.db.exec(schema);
  if (target.get(imported, false)) return;

  const path = join(appDirectory, "collaboration", "collaboration.db");
  if (!existsSync(path)) {
    target.set(imported, true);
    return;
  }

  const definitions = tables.map(table => ({
    table,
    columns: target.db
      .prepare(`SELECT * FROM ${table}`)
      .columns()
      .map(column => column.name),
  }));
  let records: { table: (typeof tables)[number]; columns: string[]; rows: unknown[][] }[];
  let legacy: Database.Database | undefined;
  try {
    legacy = new Database(path, { readonly: true, fileMustExist: true });
    const source = legacy;
    // 先完整读取旧记录，只有本机事务写成功才记录迁移完成。
    records = source.transaction(() =>
      definitions.flatMap(({ table, columns }) => {
        if (!source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
          return [];
        const rows = source
          .prepare(`SELECT ${columns.join(",")} FROM ${table}`)
          .raw()
          .all() as unknown[][];
        return [{ table, columns, rows }];
      })
    )();
  } catch (failure) {
    console.warn("[local-content] 旧协作库不可读取，暂未迁入 Agent 记录", failure);
    return;
  } finally {
    legacy?.close();
  }
  target.db.transaction(() => {
    for (const { table, columns, rows } of records) {
      if (!rows.length) continue;
      const insert = target.db.prepare(
        `INSERT INTO ${table}(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT DO NOTHING`
      );
      for (const row of rows) insert.run(...row);
    }
    target.set(imported, true);
  })();
}
