import { dirname } from "node:path";
import { ContentRecoveryStore } from "./content-recovery";
import type Database from "better-sqlite3";
import { collectContentRefs } from "@tau/database/model";
import type { ContentEntityKind, ContentEntityReference } from "@tau/db-schema/content-identities";
import { ContentIdentityTable } from "../tables/content-identity";
import { dataFieldModels } from "../tables/field-models";
import type { ContentLocalState } from "./content-local-state";

type Kind = ContentEntityKind | "content";
export interface RetainedContentEntity {
  kind: Kind;
  id: number;
}
const entityKey = (kind: Kind, id: number) => `${kind}:${id}`;
const changes = (db: Database.Database) =>
  `${(db.prepare("SELECT total_changes() AS value").get() as { value: number }).value}:${db.pragma("data_version", { simple: true })}`;

/** 回收核查主库关系和本机持有的依赖闭包，不把本机持有累加进同步引用数。 */
export class ContentRetention {
  private readonly cache = new WeakMap<
    Database.Database,
    { key: string; retained: Set<string>; uncertain: boolean }
  >();
  constructor(private readonly state: ContentLocalState) {}

  has(db: Database.Database, workspaceId: string, kind: Kind, id: number): boolean {
    const key = JSON.stringify([workspaceId, changes(db), changes(this.state.db)]);
    let saved = this.cache.get(db);
    if (!saved || saved.key !== key) {
      const retained = new Set<string>();
      let uncertain = false;
      try {
        this.collect(db, workspaceId, retained);
      } catch {
        uncertain = true;
      }
      saved = { key, retained, uncertain };
      this.cache.set(db, saved);
    }
    return saved.uncertain || saved.retained.has(entityKey(kind, id));
  }

  dependencies(
    db: Database.Database,
    workspaceId: string,
    extra: readonly RetainedContentEntity[] = [],
    documentId?: string
  ): RetainedContentEntity[] {
    const retained = new Set<string>();
    this.collect(db, workspaceId, retained, false, extra, documentId);
    return [...retained].map(key => {
      const [kind, id] = key.split(":");
      return { kind: kind as Kind, id: Number(id) };
    });
  }

  private collect(
    db: Database.Database,
    workspaceId: string,
    retained: Set<string>,
    includeMain = true,
    extra: readonly RetainedContentEntity[] = [],
    documentId?: string
  ) {
    const recovery = new ContentRecoveryStore(dirname(this.state.db.name), this.state);
    const unresolved =
      documentId === undefined &&
      (
        this.state.db
          .prepare(
            "SELECT id,manifest_hash AS manifestHash,manifest_path AS manifestPath FROM recoveries WHERE workspace_id=? OR workspace_id IS NULL"
          )
          .all(workspaceId) as import("./content-local-state").LocalRecoveryReceipt[]
      ).some(receipt => recovery.manifest(receipt).provenance.unresolvedLegacySource === true);
    const uncertain =
      documentId === undefined &&
      (unresolved ||
        this.state.hasDocumentDrafts(workspaceId) ||
        (workspaceId !== "application" && this.state.hasDocumentDrafts("application")));
    if (uncertain && includeMain) throw new Error("未确认文档副本尚待核对引用");
    const pending: { kind: Kind; id: number }[] = [];
    const add = (kind: Kind, id: unknown) => {
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return;
      const key = entityKey(kind, id);
      if (retained.has(key)) return;
      if (retained.size >= 500_000) throw new Error("持有关系超过预算");
      retained.add(key);
      pending.push({ kind, id });
    };
    const reference = (ref: ContentEntityReference) => {
      const id = ContentIdentityTable.resolve(db, ref);
      if (id !== null) add(ref.kind, id);
    };
    for (const item of extra) add(item.kind, item.id);
    if (uncertain) {
      for (const [kind, table] of [
        ["content", "contents"],
        ["whiteboard-content", "white_board_contents"],
        ["data-table", "data_tables"],
        ["project-item", "project_item"],
      ] as const)
        for (const row of db.prepare(`SELECT id FROM ${table}`).all() as { id: number }[])
          add(kind, row.id);
    }
    const holder = documentId === undefined ? undefined : `document:${documentId}`;
    for (const root of this.state.holders(workspaceId, holder)) reference(root);
    if (workspaceId !== "application")
      for (const root of this.state.holders("application", holder)) reference(root);
    const hasTable = (name: string) =>
      Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
    const bodyRelations = hasTable("content_entity_relations"),
      boardRelations = hasTable("whiteboard_entity_relations");
    if (bodyRelations && includeMain) {
      for (const root of db
        .prepare(
          "SELECT DISTINCT source_id AS sourceId,entity_kind AS kind,entity_id AS entityId FROM content_entity_relations"
        )
        .all() as ContentEntityReference[])
        reference(root);
    }
    let visited = 0;
    const legacy = (value: unknown, board: boolean, depth = 0): void => {
      if (++visited > 500_000 || depth > 64) throw new Error("持有正文超过预算");
      if (Array.isArray(value)) {
        value.forEach(node => legacy(node, board, depth + 1));
        return;
      }
      if (!value || typeof value !== "object") return;
      const node = value as Record<string, unknown>;
      if (board) add("content", node.contentId);
      else if (node.type === "database") add("data-table", node.tableId);
      else if (node.type === "whiteboard") add("whiteboard-content", node.whiteBoardContentId);
      else if (node.type === "project-card-list") add("project-item", node.projectItemId);
      if (Array.isArray(node.children)) legacy(node.children, board, depth + 1);
      if (
        !board &&
        node.type === "list-item" &&
        node.isFold === true &&
        Array.isArray(node.allContent)
      )
        legacy(node.allContent.slice(1), false, depth + 1);
    };
    while (pending.length) {
      const { kind, id } = pending.pop()!;
      if (kind === "data-table") {
        const row = db.prepare("SELECT columns,rows FROM data_tables WHERE id=?").get(id) as
          | { columns: string; rows: string }
          | undefined;
        if (!row) continue;
        const rows = JSON.parse(row.rows),
          columns = JSON.parse(row.columns);
        for (const contentId of collectContentRefs(columns, rows, dataFieldModels).keys())
          add("content", contentId);
        for (const row of rows) add("content", row?.detailContentId);
      } else if (kind === "card" || kind === "article" || kind === "diary-moment") {
        const table =
          kind === "card" ? "cards" : kind === "article" ? "articles" : "diary_segments";
        const row = db.prepare(`SELECT content_id FROM ${table} WHERE id=?`).get(id) as
          | { content_id: number }
          | undefined;
        if (row) add("content", row.content_id);
      } else if (kind === "video-note") {
        for (const row of db
          .prepare("SELECT content_id FROM video_note_item WHERE video_note_id=?")
          .all(id) as { content_id: number }[])
          add("content", row.content_id);
      } else if (kind === "whiteboard") {
        const row = db
          .prepare("SELECT white_board_content_ids FROM white_boards WHERE id=?")
          .get(id) as { white_board_content_ids: string } | undefined;
        for (const id of JSON.parse(row?.white_board_content_ids ?? "[]"))
          add("whiteboard-content", id);
      } else if (kind === "project-item") {
        const row = db
          .prepare(
            "SELECT content_id,white_board_content_id,ref_type,ref_id,children FROM project_item WHERE id=?"
          )
          .get(id) as
          | {
              content_id: number;
              white_board_content_id: number;
              ref_type: string;
              ref_id: number;
              children: string;
            }
          | undefined;
        if (!row) continue;
        add("content", row.content_id);
        add("whiteboard-content", row.white_board_content_id);
        if (row.ref_type === "data-table") add("data-table", row.ref_id);
        for (const child of JSON.parse(row.children || "[]")) add("project-item", child);
      } else if (kind === "whiteboard-content") {
        const row = db.prepare("SELECT data FROM white_board_contents WHERE id=?").get(id) as
          | { data: string }
          | undefined;
        if (row) legacy(JSON.parse(row.data), true);
        if (boardRelations) {
          const relations = db
            .prepare(
              `SELECT r.source_id AS sourceId,r.entity_kind AS kind,r.entity_id AS entityId
            FROM whiteboard_entity_relations r JOIN whiteboard_document_pages p ON p.document_id=r.document_id WHERE p.content_id=?`
            )
            .all(id) as ContentEntityReference[];
          relations.forEach(reference);
        }
      } else {
        const document = bodyRelations
          ? (db.prepare("SELECT document_id FROM content_documents WHERE content_id=?").get(id) as
              | { document_id: string }
              | undefined)
          : undefined;
        if (document) {
          const relations = db
            .prepare(
              "SELECT source_id AS sourceId,entity_kind AS kind,entity_id AS entityId FROM content_entity_relations WHERE document_id=?"
            )
            .all(document.document_id) as ContentEntityReference[];
          relations.forEach(reference);
        } else {
          const row = db.prepare("SELECT content FROM contents WHERE id=?").get(id) as
            | { content: string }
            | undefined;
          if (row) legacy(JSON.parse(row.content), false);
        }
      }
    }
  }
}
