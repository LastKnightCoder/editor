import type Database from "better-sqlite3";
import type {
  ContentEntityReference,
  ContentEntityRelation,
} from "@tau/db-schema/content-identities";
import { ContentIdentityTable } from "./content-identity";
import DataTableTable from "./data-table";
import WhiteBoardContentTable from "./white-board-content";

/** 同一实体的关系先合并净变化，避免移动节点时短暂归零和重复释放依赖正文。 */
export function applyContentEntityRelations(
  db: Database.Database,
  removed: readonly ContentEntityRelation[],
  added: readonly ContentEntityRelation[]
): void {
  db.transaction(() => {
    const changes = new Map<string, { reference: ContentEntityReference; delta: number }>();
    for (const [relations, delta] of [
      [removed, -1],
      [added, 1],
    ] as const) {
      for (const { target } of relations) {
        const key = JSON.stringify([target.sourceId, target.kind, target.entityId]);
        const entry = changes.get(key) ?? { reference: target, delta: 0 };
        entry.delta += delta;
        changes.set(key, entry);
      }
    }
    for (const { reference, delta } of changes.values()) {
      if (!delta || (reference.kind !== "data-table" && reference.kind !== "whiteboard-content"))
        continue;
      const id = ContentIdentityTable.resolve(db, reference);
      if (id === null) continue;
      const table = reference.kind === "data-table" ? "data_tables" : "white_board_contents";
      const count = (
        db.prepare(`SELECT coalesce(ref_count,0) AS count FROM ${table} WHERE id=?`).get(id) as {
          count: number;
        }
      ).count;
      if (
        !Number.isSafeInteger(count) ||
        count < 0 ||
        count + delta < 0 ||
        !Number.isSafeInteger(count + delta)
      )
        throw new Error("主库实体引用数不一致，须先核对关系账");
      if (delta > 0) {
        if (reference.kind === "data-table") DataTableTable.incrementRefCount(db, id);
        else WhiteBoardContentTable.incrementRefCount(db, id);
        if (delta > 1)
          db.prepare(`UPDATE ${table} SET ref_count=ref_count+? WHERE id=?`).run(delta - 1, id);
      } else {
        if (delta < -1)
          db.prepare(`UPDATE ${table} SET ref_count=ref_count+? WHERE id=?`).run(delta + 1, id);
        if (reference.kind === "data-table") DataTableTable.remove(db, id);
        else WhiteBoardContentTable.deleteWhiteboard(db, id);
      }
    }
  })();
}
