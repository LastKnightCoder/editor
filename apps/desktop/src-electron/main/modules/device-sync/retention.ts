import type Database from "better-sqlite3";
import * as Y from "yjs";
import {
  isContentEntityReference,
  type ContentEntityKind,
} from "@tau/db-schema/content-identities";
import { ContentIdentityTable } from "../tables/content-identity";
import { readDeviceSyncState, deviceGeneration } from "./database-store";
import { validDocumentRecord } from "./record-integrity";
import { quoteSyncIdentifier as quote } from "@tau/collaboration/src/device-sync/sql";

const cache = new WeakMap<
  Database.Database,
  { key: string; holds: Set<string>; uncertain?: boolean }
>();
/** 冷检查点里的删除节点仍可被离线设备恢复，不能只按当前 JSON 判断引用已释放。 */
export function hasDeviceEntityHold(
  db: Database.Database,
  kind: ContentEntityKind | "content",
  id: number
): boolean {
  try {
    const state = readDeviceSyncState(db);
    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND (name='_tau_device_documents' OR name GLOB '_tau_device_quarantine_*_documents')"
        )
        .all() as { name: string }[]
    ).map(row => row.name);
    if (!state?.enabled)
      return tables.some(name => Boolean(db.prepare(`SELECT 1 FROM ${quote(name)} LIMIT 1`).get()));
    if (kind === "content")
      return tables.some(name =>
        Boolean(db.prepare(`SELECT 1 FROM ${quote(name)} WHERE content_id=?`).get(id))
      );
    const seq =
        (
          db.prepare("SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'").get() as
            | { seq: number }
            | undefined
        )?.seq ?? 0,
      key = `${deviceGeneration(db)}:${state.epoch}:${state.head}:${seq}`;
    let entry = cache.get(db);
    if (entry?.key !== key) {
      const holds = new Set<string>(),
        seen = new Set<string>();
      const visit = (value: unknown): void => {
        if (isContentEntityReference(value)) {
          const key = JSON.stringify(value);
          if (!seen.has(key)) {
            seen.add(key);
            const local = ContentIdentityTable.resolve(db, value);
            if (local !== null) holds.add(`${value.kind}:${local}`);
          }
        }
        if (Array.isArray(value)) value.forEach(visit);
        else if (
          value &&
          typeof value === "object" &&
          (Object.getPrototypeOf(value) === Object.prototype ||
            Object.getPrototypeOf(value) === null)
        )
          Object.values(value).forEach(visit);
      };
      for (const table of tables)
        for (const row of db.prepare(`SELECT * FROM ${quote(table)}`).all() as {
          [key: string]: unknown;
          state: string;
        }[]) {
          if (!validDocumentRecord(row)) {
            cache.set(db, { key, holds, uncertain: true });
            return true;
          }
          const doc = new Y.Doc({ gc: false });
          try {
            Y.applyUpdate(doc, Buffer.from(row.state, "base64"));
            if (doc.store.pendingDs || doc.store.pendingStructs) {
              cache.set(db, { key, holds, uncertain: true });
              return true;
            }
            for (const structs of doc.store.clients.values())
              for (const item of structs)
                if (item instanceof Y.Item) item.content.getContent().forEach(visit);
          } finally {
            doc.destroy();
          }
        }
      entry = { key, holds };
      cache.set(db, entry);
    }
    return entry.uncertain || entry.holds.has(`${kind}:${id}`);
  } catch {
    return true;
  }
}
