import type Database from "better-sqlite3";
import * as Y from "yjs";
import {
  collectWhiteboardRelations,
  whiteboardRelationKey,
  type WhiteboardModel,
  type WhiteboardEntityRelation,
} from "@tau/collaboration";
import { ContentIdentityTable } from "../tables/content-identity";
import type { WhiteboardDocumentIdentity } from "@/types/whiteboard-document";
import type { JournalDocument } from "./journal";
import { stateHash } from "./journal";

export interface StoredWhiteboardDocument extends WhiteboardDocumentIdentity {
  revision: number;
  hash: string;
  creationHash: string;
  state: Uint8Array;
  boardId: number | null;
}
interface StoredRow {
  document_id: string;
  source_id: string;
  baseline_id: string;
  epoch: number;
  revision: number;
  revision_hash: string;
  creation_hash: string;
  state: Buffer;
  board_id: number | null;
  board_created_at: number | null;
}
const parse = (databaseName: string, row: StoredRow): StoredWhiteboardDocument => ({
  databaseName,
  documentId: row.document_id,
  sourceId: row.source_id,
  baselineId: row.baseline_id,
  epoch: row.epoch,
  revision: row.revision,
  hash: row.revision_hash,
  creationHash: row.creation_hash,
  state: new Uint8Array(row.state),
  boardId: row.board_id,
});

/** 主库投影及关系账只在一个同步事务内提交，日志库的完成标记由调用方随后推进。 */
export type WhiteboardRelationCounter = (
  db: Database.Database,
  kind: "whiteboard-content" | "data-table",
  id: number,
  delta: number
) => void;
export class WhiteboardDocumentRepository {
  constructor(
    readonly db: Database.Database,
    readonly databaseName: string,
    private readonly counts?: WhiteboardRelationCounter
  ) {}
  read(documentId: string): StoredWhiteboardDocument | null {
    const row = this.db
      .prepare("SELECT * FROM whiteboard_documents WHERE document_id=?")
      .get(documentId) as StoredRow | undefined;
    if (!row) return null;
    const identity = ContentIdentityTable.library(this.db);
    if (!identity || identity.sourceId !== row.source_id || identity.baselineId !== row.baseline_id)
      throw new Error("白板资料库基线已变化，旧材料须先保全");
    if (row.board_id !== null) {
      const board = this.db
        .prepare("SELECT create_time FROM white_boards WHERE id=?")
        .get(row.board_id) as { create_time: number } | undefined;
      if (board?.create_time !== row.board_created_at) throw new Error("白板拥有者已变化");
    }
    if (stateHash(row.state) !== row.revision_hash) throw new Error("白板检查点摘要损坏");
    return parse(this.databaseName, row);
  }
  byPage(contentId: number): { document: StoredWhiteboardDocument; pageId: string } | null {
    const row = this.db
      .prepare(
        "SELECT p.document_id,p.page_id,p.content_created_at,c.create_time FROM whiteboard_document_pages p JOIN white_board_contents c ON c.id=p.content_id WHERE p.content_id=?"
      )
      .get(contentId) as
      | { document_id: string; page_id: string; content_created_at: number; create_time: number }
      | undefined;
    if (!row) return null;
    if (row.content_created_at !== row.create_time) throw new Error("白板页面身份已变化");
    return { document: this.read(row.document_id)!, pageId: row.page_id };
  }
  /** 按标题检索整块白板（关键词为空时按最近更新），跳过 excluded 中的文档。 */
  shareCandidates(keyword: string, excluded: string[], limit: number) {
    const pattern = `%${keyword.replace(/[\\%_]/g, char => `\\${char}`)}%`;
    return (
      this.db
        .prepare(
          `SELECT b.id AS boardId, coalesce(b.title,'') AS title, d.document_id AS documentId,
            (SELECT p.content_id FROM whiteboard_document_pages p
              WHERE p.document_id=d.document_id AND p.visible=1 ORDER BY p.page_index LIMIT 1) AS contentId,
            (SELECT count(*) FROM whiteboard_document_pages p
              WHERE p.document_id=d.document_id AND p.visible=1) AS pages
          FROM whiteboard_documents d JOIN white_boards b ON b.id=d.board_id
          WHERE coalesce(b.title,'') LIKE ? ESCAPE '\\'
            AND d.document_id NOT IN (SELECT value FROM json_each(?))
          ORDER BY b.update_time DESC LIMIT ?`
        )
        .all(pattern, JSON.stringify(excluded), limit) as {
        boardId: number;
        title: string;
        documentId: string;
        contentId: number | null;
        pages: number;
      }[]
    ).filter((row): row is typeof row & { contentId: number } => row.contentId !== null);
  }
  create(
    documentId: string,
    model: WhiteboardModel,
    owner: "board" | "standalone"
  ): StoredWhiteboardDocument {
    const existing = this.read(documentId);
    const state = Y.encodeStateAsUpdate(model.doc),
      hash = stateHash(state);
    if (existing) {
      if (
        existing.creationHash !== hash ||
        (existing.boardId === null) !== (owner === "standalone")
      )
        throw new Error("创建身份已存在，不能覆盖");
      return existing;
    }
    const library = ContentIdentityTable.library(this.db);
    if (!library) throw new Error("资料库尚未建立来源基线，不能隐式转换旧库");
    const snapshot = model.read();
    if (!snapshot.pages.length) throw new Error("白板至少需要一页");
    return this.db.transaction(() => {
      const now = Date.now();
      let boardId: number | null = null;
      if (owner === "board")
        boardId = Number(
          this.db
            .prepare(
              "INSERT INTO white_boards(create_time,update_time,tags,title,description,snapshot,white_board_content_ids) VALUES(?,?,'[]',?,'','','[]')"
            )
            .run(now, now, snapshot.title).lastInsertRowid
        );
      this.db
        .prepare("INSERT INTO whiteboard_documents VALUES(?,?,?,?,?,?,0,?,?,?,?,?,?,?)")
        .run(
          documentId,
          library.sourceId,
          library.baselineId,
          0,
          boardId,
          boardId === null ? null : now,
          hash,
          hash,
          Buffer.from(state),
          JSON.stringify(model.contracts.toJSON()),
          JSON.stringify(snapshot),
          now,
          now
        );
      const identity = {
        databaseName: this.databaseName,
        documentId,
        sourceId: library.sourceId,
        baselineId: library.baselineId,
        epoch: 0,
      };
      this.writeProjection(identity, model, 0, hash);
      return this.read(documentId)!;
    })();
  }
  project(value: JournalDocument, model: WhiteboardModel): void {
    this.db.transaction(() => {
      const current = this.read(value.documentId);
      if (
        !current ||
        current.sourceId !== value.sourceId ||
        current.baselineId !== value.baselineId ||
        current.epoch !== value.epoch
      )
        throw new Error("白板文档身份或代次已变化");
      if (current.revision === value.revision && current.hash === value.hash) return;
      if (current.revision !== value.projectedRevision || current.hash !== value.projectedHash)
        throw new Error("主库投影与本机日志分叉，不能用旧会话覆盖");
      this.writeProjection(value, model, value.revision, value.hash);
    })();
  }
  installBaseline(
    model: WhiteboardModel,
    expected: { documentId: string; hash: string; epoch: number } | null,
    target: {
      documentId: string;
      epoch: number;
      boardId: number | null;
      boardTitle?: string;
      pages: {
        pageId: string;
        contentId: number;
        createdAt: number;
        data: string;
        title?: string;
      }[];
    },
    legacyReferences: readonly { kind: "whiteboard-content" | "data-table"; id: number }[] = []
  ): StoredWhiteboardDocument {
    return this.db.transaction(() => {
      const library = ContentIdentityTable.library(this.db);
      if (!library) throw new Error("请先采用已确认的同源资料库基线");
      const state = Y.encodeStateAsUpdate(model.doc),
        hash = stateHash(state);
      const current = this.read(target.documentId);
      if (current?.epoch === target.epoch && current.hash === hash) return current;
      if (expected) {
        if (
          !current ||
          current.documentId !== expected.documentId ||
          current.hash !== expected.hash ||
          current.epoch !== expected.epoch
        )
          throw new Error("待安装白板已变化，原材料已保留");
        this.db
          .prepare("UPDATE whiteboard_documents SET epoch=? WHERE document_id=?")
          .run(target.epoch, target.documentId);
      } else {
        if (current) throw new Error("转换目标已存在");
        const owner = ContentIdentityTable.reference(
          this.db,
          target.boardId === null ? "whiteboard-content" : "whiteboard",
          target.boardId ?? target.pages[0]?.contentId
        );
        if (owner.entityId !== target.documentId) throw new Error("旧白板拥有者稳定身份已变化");
        if (target.boardId !== null) {
          const directory = this.db
            .prepare("SELECT white_board_content_ids,title FROM white_boards WHERE id=?")
            .get(target.boardId) as { white_board_content_ids: string; title: string };
          if (target.boardTitle !== undefined && (directory.title ?? "") !== target.boardTitle)
            throw new Error("旧白板标题已变化，不能覆盖新的名称");
          if (
            JSON.stringify(JSON.parse(directory.white_board_content_ids)) !==
            JSON.stringify(target.pages.map(page => page.contentId))
          )
            throw new Error("旧白板页面目录已变化");
        }
        for (const page of target.pages) {
          if (
            ContentIdentityTable.reference(this.db, "whiteboard-content", page.contentId)
              .entityId !== page.pageId
          )
            throw new Error("旧页面稳定身份已变化");
          const row = this.db
            .prepare("SELECT create_time,data,name FROM white_board_contents WHERE id=?")
            .get(page.contentId) as { create_time: number; data: string; name: string } | undefined;
          if (
            !row ||
            row.create_time !== page.createdAt ||
            row.data !== page.data ||
            (page.title !== undefined && (row.name ?? "") !== page.title) ||
            this.byPage(page.contentId)
          )
            throw new Error("原页面快照或归属已变化");
        }
        const board =
          target.boardId === null
            ? null
            : (this.db
                .prepare("SELECT create_time FROM white_boards WHERE id=?")
                .get(target.boardId) as { create_time: number } | undefined);
        if (target.boardId !== null && !board) throw new Error("白板拥有者已删除");
        const now = Date.now();
        this.db
          .prepare("INSERT INTO whiteboard_documents VALUES(?,?,?,?,?,?,0,?,?,?,?,?,?,?)")
          .run(
            target.documentId,
            library.sourceId,
            library.baselineId,
            target.epoch,
            target.boardId,
            board?.create_time ?? null,
            hash,
            hash,
            Buffer.from(state),
            JSON.stringify(model.contracts.toJSON()),
            JSON.stringify(model.read()),
            now,
            now
          );
        for (const page of target.pages)
          this.db
            .prepare("INSERT INTO whiteboard_document_pages VALUES(?,?,?,?,1,0)")
            .run(target.documentId, page.pageId, page.contentId, page.createdAt);
      }
      this.writeProjection(
        {
          databaseName: this.databaseName,
          documentId: target.documentId,
          sourceId: library.sourceId,
          baselineId: library.baselineId,
          epoch: target.epoch,
        },
        model,
        0,
        hash,
        expected ? [] : legacyReferences
      );
      // 未进入新投影的旧页仍保有原内容，但不再是可写页面。
      const pages = new Set(model.read().pages.map(page => page.id));
      for (const row of this.db
        .prepare("SELECT page_id FROM whiteboard_document_pages WHERE document_id=?")
        .all(target.documentId) as { page_id: string }[]) {
        if (!pages.has(row.page_id))
          this.db
            .prepare(
              "UPDATE whiteboard_document_pages SET visible=0,page_index=-1 WHERE document_id=? AND page_id=?"
            )
            .run(target.documentId, row.page_id);
      }
      return this.read(target.documentId)!;
    })();
  }
  private writeProjection(
    identity: WhiteboardDocumentIdentity,
    model: WhiteboardModel,
    revision: number,
    hash: string,
    legacyReferences: readonly { kind: "whiteboard-content" | "data-table"; id: number }[] = []
  ): void {
    const db = this.db,
      snapshot = model.read(),
      state = Y.encodeStateAsUpdate(model.doc);
    if (stateHash(state) !== hash) throw new Error("白板候选修订不匹配");
    const document = this.read(identity.documentId)!;
    const prior = db
      .prepare("SELECT * FROM whiteboard_entity_relations WHERE document_id=?")
      .all(identity.documentId) as {
      root_id: string;
      node_id: string;
      slot: string;
      source_id: string;
      entity_kind: WhiteboardEntityRelation["target"]["kind"];
      entity_id: string;
    }[];
    const previous = prior.map(row => ({
      rootId: row.root_id,
      nodeId: row.node_id,
      slot: row.slot,
      target: { sourceId: row.source_id, kind: row.entity_kind, entityId: row.entity_id },
    }));
    const next = collectWhiteboardRelations(model),
      oldKeys = new Set(previous.map(whiteboardRelationKey)),
      newKeys = new Set(next.map(whiteboardRelationKey));
    for (const ref of previous) if (!newKeys.has(whiteboardRelationKey(ref))) this.adjust(ref, -1);
    const inherited = new Map<string, number>();
    for (const ref of legacyReferences) {
      const key = `${ref.kind}:${ref.id}`;
      inherited.set(key, (inherited.get(key) ?? 0) + 1);
    }
    for (const ref of next) {
      if (oldKeys.has(whiteboardRelationKey(ref))) continue;
      const key = `${ref.target.kind}:${ContentIdentityTable.resolve(db, ref.target)}`;
      const count = inherited.get(key) ?? 0;
      if (count > 0) inherited.set(key, count - 1);
      else this.adjust(ref, 1);
    }
    db.prepare("DELETE FROM whiteboard_entity_relations WHERE document_id=?").run(
      identity.documentId
    );
    const relation = db.prepare("INSERT INTO whiteboard_entity_relations VALUES(?,?,?,?,?,?,?)");
    for (const ref of next)
      relation.run(
        identity.documentId,
        ref.rootId,
        ref.nodeId,
        ref.slot,
        ref.target.sourceId,
        ref.target.kind,
        ref.target.entityId
      );
    const canvasNodes = (
      nodes: readonly import("@tau/collaboration").WhiteboardElementSnapshot[]
    ): unknown[] =>
      nodes.map(node => ({ ...node, ...node.geometry, children: canvasNodes(node.children) }));
    const visible = new Map(snapshot.pages.map((page, index) => [page.id, { page, index }]));
    const pageIds: number[] = [];
    for (const [pageId, record] of model.pages) {
      const selected = visible.get(pageId),
        now = Date.now();
      const projection = {
        version: 3,
        documentKind: "whiteboard",
        documentId: identity.documentId,
        pageId,
        epoch: identity.epoch,
        revision,
        children: canvasNodes(selected?.page.children ?? []),
        recovery: canvasNodes(selected?.page.recovery ?? []),
        sketch: selected?.page.sketch,
        presentationSequences: snapshot.presentations ?? [],
      };
      let mapping = db
        .prepare(
          "SELECT content_id,content_created_at FROM whiteboard_document_pages WHERE document_id=? AND page_id=?"
        )
        .get(identity.documentId, pageId) as
        | { content_id: number; content_created_at: number }
        | undefined;
      if (!mapping) {
        const id = Number(
          db
            .prepare(
              "INSERT INTO white_board_contents(create_time,update_time,name,data,ref_count,img_url) VALUES(?,?,?,?,1,'')"
            )
            .run(now, now, String(record.get("title")), JSON.stringify(projection)).lastInsertRowid
        );
        mapping = { content_id: id, content_created_at: now };
        db.prepare("INSERT INTO whiteboard_document_pages VALUES(?,?,?,?,?,?)").run(
          identity.documentId,
          pageId,
          id,
          now,
          selected ? 1 : 0,
          selected?.index ?? -1
        );
        ContentIdentityTable.bind(db, "whiteboard-content", id, now);
      } else {
        const row = db
          .prepare("SELECT create_time FROM white_board_contents WHERE id=?")
          .get(mapping.content_id) as { create_time: number } | undefined;
        if (row?.create_time !== mapping.content_created_at)
          throw new Error("白板页面被删除或重建");
        db.prepare("UPDATE white_board_contents SET name=?,data=?,update_time=? WHERE id=?").run(
          String(record.get("title")),
          JSON.stringify(projection),
          now,
          mapping.content_id
        );
        db.prepare(
          "UPDATE whiteboard_document_pages SET visible=?,page_index=? WHERE document_id=? AND page_id=?"
        ).run(selected ? 1 : 0, selected?.index ?? -1, identity.documentId, pageId);
      }
      if (selected) pageIds[selected.index] = mapping.content_id;
    }
    db.prepare(
      "UPDATE whiteboard_documents SET revision=?,revision_hash=?,state=?,contracts=?,snapshot=?,update_time=? WHERE document_id=?"
    ).run(
      revision,
      hash,
      Buffer.from(state),
      JSON.stringify(model.contracts.toJSON()),
      JSON.stringify(snapshot),
      Date.now(),
      identity.documentId
    );
    if (document.boardId !== null)
      db.prepare(
        "UPDATE white_boards SET title=?,white_board_content_ids=?,active_white_board_content_id=CASE WHEN active_white_board_content_id IN (SELECT content_id FROM whiteboard_document_pages WHERE document_id=? AND visible=1) THEN active_white_board_content_id ELSE ? END,update_time=? WHERE id=?"
      ).run(
        snapshot.title,
        JSON.stringify(pageIds),
        identity.documentId,
        pageIds[0] ?? null,
        Date.now(),
        document.boardId
      );
  }
  private adjust(relation: WhiteboardEntityRelation, delta: number): void {
    const localId = ContentIdentityTable.resolve(this.db, relation.target);
    if (
      localId === null ||
      (relation.target.kind !== "data-table" && relation.target.kind !== "whiteboard-content")
    )
      return;
    if (!this.counts) throw new Error("白板实体计数服务未就绪");
    this.counts(this.db, relation.target.kind, localId, delta);
  }
  retire(documentId: string): void {
    const current = this.read(documentId);
    if (!current || current.boardId !== null) throw new Error("白板仍有拥有者，不能回收");
    const relations = this.db
      .prepare(
        "SELECT source_id,entity_kind,entity_id FROM whiteboard_entity_relations WHERE document_id=?"
      )
      .all(documentId) as {
      source_id: string;
      entity_kind: WhiteboardEntityRelation["target"]["kind"];
      entity_id: string;
    }[];
    for (const row of relations)
      this.adjust(
        {
          rootId: "",
          nodeId: "",
          slot: "entity",
          target: { sourceId: row.source_id, kind: row.entity_kind, entityId: row.entity_id },
        },
        -1
      );
    this.db.prepare("DELETE FROM whiteboard_entity_relations WHERE document_id=?").run(documentId);
    this.db.prepare("DELETE FROM whiteboard_document_pages WHERE document_id=?").run(documentId);
    this.db.prepare("DELETE FROM whiteboard_documents WHERE document_id=?").run(documentId);
  }
}
