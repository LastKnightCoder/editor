import { CollaborationAssetService } from "../collaboration/asset-service";
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CollaborationLocalStore } from "../collaboration/local-store";

const imported = "legacy-whiteboard-state-imported";

/** 白板状态随本机白板初始化。旧协作库只读迁移，原始日志与附件文件保留。 */
export function importWhiteboardState(directory: string, target: CollaborationLocalStore): void {
  if (target.get(imported, false)) return;
  const path = join(directory, "collaboration", "collaboration.db");
  if (!existsSync(path)) {
    target.set(imported, true);
    return;
  }
  let source: Database.Database | undefined;
  try {
    source = new Database(path, { readonly: true, fileMustExist: true });
    const legacy = source;
    const tables = new Set(
      (
        legacy.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
          name: string;
        }[]
      ).map(row => row.name)
    );
    target.db.transaction(() => {
      const copy = (table: string, columns: string, where = "") => {
        if (!tables.has(table)) return;
        const names = columns.split(",");
        const insert = target.db.prepare(
          `INSERT OR IGNORE INTO ${table}(${columns}) VALUES (${names.map(() => "?").join(",")})`
        );
        for (const row of legacy
          .prepare(`SELECT ${columns} FROM ${table} ${where}`)
          .iterate() as Iterable<Record<string, unknown>>)
          insert.run(...names.map(column => row[column]));
      };
      copy(
        "settings",
        "key,value",
        "WHERE key LIKE 'whiteboard-%' OR key LIKE 'owner-images:%' OR key LIKE 'resource-backup:%'"
      );
      copy(
        "migrations",
        "operation_id,workspace_id,document_id,record",
        "WHERE CASE WHEN json_valid(record) THEN json_extract(record,'$.plan.kind')='whiteboard' ELSE 0 END"
      );
      copy("resources", "id,document_id,name,mime,path,uploaded");
      if (tables.has("whiteboard_publications")) {
        target.db.exec(`
          CREATE TABLE IF NOT EXISTS whiteboard_publications (
            operation_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, document_id TEXT NOT NULL,
            completed INTEGER NOT NULL, value TEXT NOT NULL
          )
        `);
        copy("whiteboard_publications", "operation_id,workspace_id,document_id,completed,value");
      }
      target.set(imported, true);
    })();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "SQLITE_NOTADB" && !code?.startsWith("SQLITE_CORRUPT")) throw error;
    console.warn("[whiteboard-documents] 旧协作库不可读取，保留原文件和白板日志");
  } finally {
    source?.close();
  }
}

export function openWhiteboardState(
  directory: string,
  identity: ConstructorParameters<typeof CollaborationAssetService>[2]
) {
  const store = new CollaborationLocalStore(join(directory, "whiteboard-documents"), "state.db");
  try {
    importWhiteboardState(directory, store);
    return { store, assets: new CollaborationAssetService(store, directory, identity) };
  } catch (error) {
    store.db.close();
    throw error;
  }
}
