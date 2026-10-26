import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  isContentEntityReference,
  type ContentEntityKind,
  type ContentEntityReference,
  type ContentEntityTarget,
} from "@tau/db-schema/content-identities";

export interface LibraryIdentity {
  sourceId: string;
  baselineId: string;
  confirmedSnapshot: string | null;
}

const tables: Record<ContentEntityKind, string> = {
  "whiteboard-content": "white_board_contents",
  "data-table": "data_tables",
  "project-item": "project_item",
  card: "cards",
  article: "articles",
  "diary-moment": "diary_segments",
  whiteboard: "white_boards",
  content: "contents",
  "video-note": "video_notes",
};

export class ContentIdentityTable {
  static requireTarget(
    db: Database.Database,
    kind: ContentEntityKind,
    target: ContentEntityTarget
  ): number {
    if (typeof target === "number") {
      if (!Number.isSafeInteger(target) || target <= 0) throw new Error("实体 ID 无效");
      return target;
    }
    if (!isContentEntityReference(target) || target.kind !== kind)
      throw new Error("实体引用类型不匹配");
    const id = this.resolve(db, target);
    if (id === null) throw new Error("引用不属于当前资料库，或实体已删除；请定位原来源");
    return id;
  }

  static reference(
    db: Database.Database,
    kind: ContentEntityKind,
    id: number
  ): ContentEntityReference {
    if (!Object.hasOwn(tables, kind) || !Number.isSafeInteger(id)) throw new Error("实体身份无效");
    const row = db.prepare(`SELECT create_time FROM ${tables[kind]} WHERE id=?`).get(id) as
      | { create_time: number }
      | undefined;
    if (!row) throw new Error("实体不存在");
    return this.bind(db, kind, id, row.create_time);
  }

  static library(db: Database.Database): LibraryIdentity | null {
    const row = db
      .prepare("SELECT source_id,baseline_id,confirmed_snapshot FROM library_identity WHERE id=1")
      .get() as
      | { source_id: string; baseline_id: string; confirmed_snapshot: string | null }
      | undefined;
    return row
      ? {
          sourceId: row.source_id,
          baselineId: row.baseline_id,
          confirmedSnapshot: row.confirmed_snapshot,
        }
      : null;
  }

  /** 只由选定完整库的转换流程调用；普通解析与开库不建立来源身份。 */
  static establishBaseline(db: Database.Database): LibraryIdentity {
    return db.transaction(() => {
      const existing = this.library(db);
      if (existing) return existing;
      const identity = {
        sourceId: randomUUID(),
        baselineId: randomUUID(),
        confirmedSnapshot: null,
      };
      db.prepare(
        "INSERT INTO library_identity(id,source_id,baseline_id,confirmed_snapshot,create_time) VALUES (1,?,?,NULL,?)"
      ).run(identity.sourceId, identity.baselineId, Date.now());
      for (const kind of Object.keys(tables) as ContentEntityKind[]) {
        const rows = db.prepare(`SELECT id,create_time FROM ${tables[kind]}`).all() as {
          id: number;
          create_time: number;
        }[];
        for (const row of rows) this.bind(db, kind, row.id, row.create_time);
      }
      return identity;
    })();
  }

  static bind(
    db: Database.Database,
    kind: ContentEntityKind,
    localId: number,
    createdAt: number
  ): ContentEntityReference {
    const library = this.library(db);
    if (!library) throw new Error("资料库尚未建立来源身份");
    if (
      !Object.hasOwn(tables, kind) ||
      !Number.isSafeInteger(localId) ||
      !Number.isSafeInteger(createdAt)
    )
      throw new Error("实体身份参数无效");
    const actual = db.prepare(`SELECT create_time FROM ${tables[kind]} WHERE id=?`).get(localId) as
      | { create_time: number }
      | undefined;
    if (!actual || actual.create_time !== createdAt) throw new Error("实体已删除或身份已变化");
    return db.transaction(() => {
      const existing = db
        .prepare(
          "SELECT entity_id,created_at FROM entity_identities WHERE entity_kind=? AND local_id=? AND retired_at IS NULL"
        )
        .get(kind, localId) as { entity_id: string; created_at: number } | undefined;
      if (existing?.created_at === createdAt)
        return { sourceId: library.sourceId, kind, entityId: existing.entity_id };
      if (existing) this.retire(db, kind, localId);
      const entityId = randomUUID();
      db.prepare(
        "INSERT INTO entity_identities(entity_kind,entity_id,local_id,created_at) VALUES (?,?,?,?)"
      ).run(kind, entityId, localId, createdAt);
      return { sourceId: library.sourceId, kind, entityId };
    })();
  }

  static retire(db: Database.Database, kind: ContentEntityKind, localId: number): void {
    db.prepare(
      "UPDATE entity_identities SET retired_at=? WHERE entity_kind=? AND local_id=? AND retired_at IS NULL"
    ).run(Date.now(), kind, localId);
  }

  static resolve(db: Database.Database, reference: ContentEntityReference): number | null {
    if (!isContentEntityReference(reference) || reference.sourceId !== this.library(db)?.sourceId)
      return null;
    const mapping = db
      .prepare(
        "SELECT local_id,created_at FROM entity_identities WHERE entity_kind=? AND entity_id=? AND retired_at IS NULL"
      )
      .get(reference.kind, reference.entityId) as
      | { local_id: number; created_at: number }
      | undefined;
    if (!mapping) return null;
    const actual = db
      .prepare(`SELECT create_time FROM ${tables[reference.kind]} WHERE id=?`)
      .get(mapping.local_id) as { create_time: number } | undefined;
    return actual?.create_time === mapping.created_at ? mapping.local_id : null;
  }
}
