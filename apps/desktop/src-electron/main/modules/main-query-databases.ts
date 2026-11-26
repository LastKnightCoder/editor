import type Database from "better-sqlite3";
import {
  migrateQueryDefinition,
  migrateQueryView,
  migrateQueryViewType,
  type LegacyQueryColumn,
} from "@tau/db-schema/src/query-database-migration";

export function needsQueryDatabaseUpgrade(db: Database.Database): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='data_table_sources'").get()
  );
}

/** 旧来源表只作升级输入；全部转换与表结构标记在调用方的开库事务提交。 */
export function upgradeQueryDatabases(db: Database.Database): void {
  if (!needsQueryDatabaseUpgrade(db)) return;
  const records = db
    .prepare(`SELECT s.*,t.columns,t.rows,t.ref_count FROM data_table_sources s
    JOIN data_tables t ON t.id=s.table_id`)
    .all() as {
    table_id: number;
    kind: string;
    scope: string;
    fields: string[] | string;
    columns: string;
    rows: string;
    ref_count: number;
  }[];
  const now = Date.now();
  for (const record of records) {
    const columns = JSON.parse(record.columns) as LegacyQueryColumn[];
    const { definition, columnMap } = migrateQueryDefinition({
      kind: record.kind,
      scope: JSON.parse(record.scope),
      fields: typeof record.fields === "string" ? JSON.parse(record.fields) : record.fields,
      columns,
    });
    const inserted = db
      .prepare(
        "INSERT OR IGNORE INTO data_table_queries(table_id,definition,revision,update_time) VALUES(?,?,1,?)"
      )
      .run(record.table_id, JSON.stringify(definition), now).changes;
    if (inserted) {
      const views = db
        .prepare("SELECT id,type,config FROM data_table_views WHERE table_id=?")
        .all(record.table_id) as { id: number; type: string; config: string }[];
      for (const view of views) {
        const config = migrateQueryView(JSON.parse(view.config), columnMap, columns);
        db.prepare("UPDATE data_table_views SET config=?,update_time=? WHERE id=?").run(
          JSON.stringify(config),
          now,
          view.id
        );
        db.prepare("UPDATE data_table_views SET type=? WHERE id=?").run(
          migrateQueryViewType(view.type, config),
          view.id
        );
      }
    }
    if (record.ref_count > 0) {
      const counts = new Map<number, number>();
      const retain = (id: unknown) => {
        if (typeof id === "number" && Number.isSafeInteger(id) && id > 0)
          counts.set(id, (counts.get(id) ?? 0) + 1);
      };
      for (const row of JSON.parse(record.rows) as Record<string, unknown>[]) {
        retain(row.detailContentId);
        for (const column of columns) {
          if (column.type !== "rich-text") continue;
          const values = row[column.id];
          if (Array.isArray(values))
            for (const value of values)
              if (value && typeof value === "object") retain(value.contentId);
        }
      }
      for (const [id, count] of counts) {
        db.prepare("UPDATE contents SET ref_count=MAX(0,ref_count-?) WHERE id=?").run(count, id);
        db.prepare(
          "INSERT OR IGNORE INTO content_pending_releases(content_id,released_at) SELECT id,? FROM content_snapshots WHERE id=? AND ref_count<=0"
        ).run(now, id);
      }
    }
    db.prepare("UPDATE data_tables SET columns='[]',rows='[]',update_time=? WHERE id=?").run(
      now,
      record.table_id
    );
  }
  db.exec("DROP TABLE data_table_sources");
}
