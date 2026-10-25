import type Database from "better-sqlite3";
import type { ContentEntityKind } from "@tau/db-schema/content-identities";
type Provider = (
  db: Database.Database,
  kind: ContentEntityKind | "content",
  localId: number
) => boolean;
const providers = new Map<"whiteboard" | "content", Provider>();
export function registerDurableEntityHolds(
  next: Provider,
  scope: "whiteboard" | "content" = "whiteboard"
): () => void {
  providers.set(scope, next);
  return () => {
    if (providers.get(scope) === next) providers.delete(scope);
  };
}
/** 有新格式文档但保全服务未就绪时，不能证明可回收，保守保留。 */
export function hasDurableEntityHold(
  db: Database.Database,
  kind: ContentEntityKind | "content",
  id: number
): boolean {
  for (const [scope, table] of [
    ["whiteboard", "whiteboard_documents"],
    ["content", "content_documents"],
  ] as const) {
    const provider = providers.get(scope);
    if (provider) {
      if (provider(db, kind, id)) return true;
      continue;
    }
    const exists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (exists && db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()) return true;
  }
  return false;
}
