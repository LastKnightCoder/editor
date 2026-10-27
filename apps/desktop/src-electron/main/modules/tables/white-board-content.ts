import {
  createEmptyWhiteboardDocument,
  isEmptyWhiteboardPage,
  hasWhiteboardLibraryBaseline,
} from "../whiteboard-documents/create";
import { assertLegacyWhiteboardPage, isDocumentPage } from "../whiteboard-document-guard";
import { hasDurableEntityHold } from "../durable-entity-holds";
import Database from "better-sqlite3";
import { basename } from "node:path";
import { asynchronousDatabaseCommand } from "../database-command";
import { WhiteBoardContent } from "@/types";
import Operation from "./operation";
import ContentTable from "./content";
import { ContentIdentityTable } from "./content-identity";
import type { ContentEntityTarget } from "@tau/db-schema/content-identities";
// import log from "electron-log";

/** 与 packages/whiteboard 的 WHITEBOARD_DOCUMENT_VERSION 一致，由 __tests__/white-board-content.test.ts 对账 */
export const WHITEBOARD_DOCUMENT_VERSION = 2;

/** 新建白板的第一张空白画板页，与白板页新建时的默认数据一致 */
export const emptyWhiteboardPage = (name: string) => ({
  name,
  data: {
    children: [],
    viewPort: { zoom: 1, minX: 0, minY: 0, width: 0, height: 0 },
    selection: { selectArea: null, selectedElements: [] },
    presentationSequences: [],
    version: WHITEBOARD_DOCUMENT_VERSION,
  },
});

/**
 * 与 packages/whiteboard/src/document-version.ts 的 getDocumentVersion 保持一致
 * （主进程不依赖渲染包，避免拉入 React）；两边常量由 __tests__/white-board-content.test.ts 对账。
 */
function getDocumentVersion(data: unknown): number {
  if (!data || typeof data !== "object") return 1;
  const version = (data as { version?: unknown }).version;
  return typeof version === "number" && Number.isInteger(version) && version > 0 ? version : 1;
}

export default class WhiteboardTable {
  private static collectElementContentIdCounts(children: unknown[]): Map<number, number> {
    const counts = new Map<number, number>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dfs = (nodes: any[]) => {
      if (!nodes || !Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (!node) continue;
        if (typeof node.contentId === "number" && node.contentId > 0) {
          counts.set(node.contentId, (counts.get(node.contentId) || 0) + 1);
        }
        if (Array.isArray(node.children)) {
          dfs(node.children);
        }
      }
    };

    dfs(children as any[]);
    return counts;
  }

  private static acquireAddedContentRefs(
    db: Database.Database,
    prevChildren: unknown[],
    nextChildren: unknown[]
  ) {
    const prevCounts = this.collectElementContentIdCounts(prevChildren);
    const nextCounts = this.collectElementContentIdCounts(nextChildren);

    for (const [contentId, nextCount] of nextCounts.entries()) {
      const prevCount = prevCounts.get(contentId) || 0;
      const addedCount = Math.max(0, nextCount - prevCount);
      for (let index = 0; index < addedCount; index += 1) {
        ContentTable.incrementRefCount(db, contentId);
      }
    }
  }

  private static releaseRemovedContentRefs(
    db: Database.Database,
    prevChildren: unknown[],
    nextChildren: unknown[]
  ) {
    const prevCounts = this.collectElementContentIdCounts(prevChildren);
    const nextCounts = this.collectElementContentIdCounts(nextChildren);

    for (const [contentId, prevCount] of prevCounts.entries()) {
      const nextCount = nextCounts.get(contentId) || 0;
      const removedCount = Math.max(0, prevCount - nextCount);
      for (let index = 0; index < removedCount; index += 1) {
        ContentTable.deleteContent(db, contentId);
      }
    }
  }

  private static releaseAllContentRefs(db: Database.Database, children: unknown[]) {
    const counts = this.collectElementContentIdCounts(children);
    for (const [contentId, count] of counts.entries()) {
      for (let index = 0; index < count; index += 1) {
        ContentTable.deleteContent(db, contentId);
      }
    }
  }
  /**
   * 回收超过宽限期且引用仍为 0 的白板页，释放页内嵌入正文的引用，返回删除的页数。
   * 引用归零却没有登记的页（登记机制出现前遗留的）先补登记，同样等满宽限期再删。
   */
  static collectPendingReleases(
    db: Database.Database,
    options: { now: number; graceMs: number }
  ): number {
    db.prepare(
      `INSERT OR IGNORE INTO white_board_content_pending_releases (content_id, released_at)
       SELECT id, ? FROM white_board_contents WHERE IFNULL(ref_count, 0) <= 0`
    ).run(options.now);
    const due = db
      .prepare(
        `SELECT p.content_id AS id, IFNULL(c.ref_count, 0) AS ref_count, c.data
         FROM white_board_content_pending_releases p
         LEFT JOIN white_board_contents c ON c.id = p.content_id
         WHERE p.released_at <= ?`
      )
      .all(options.now - options.graceMs) as Array<{
      id: number;
      ref_count: number;
      data: string | null;
    }>;
    let purged = 0;
    for (const page of due) {
      if (isDocumentPage(db, page.id) || hasDurableEntityHold(db, "whiteboard-content", page.id))
        continue;
      purged += db.transaction(() => {
        db.prepare("DELETE FROM white_board_content_pending_releases WHERE content_id = ?").run(
          page.id
        );
        if (page.ref_count > 0 || page.data === null) return 0;
        try {
          const data = JSON.parse(page.data) as { children?: unknown[] };
          if (Array.isArray(data?.children)) this.releaseAllContentRefs(db, data.children);
        } catch {
          // 页数据损坏时无法确认嵌入的正文，仍删除这一页
        }
        db.prepare("DELETE FROM white_board_contents WHERE id = ?").run(page.id);
        ContentIdentityTable.retire(db, "whiteboard-content", page.id);
        Operation.insertOperation(db, "whiteboard-content", "delete", page.id, Date.now());
        return 1;
      })();
    }
    return purged;
  }

  static getListenEvents() {
    return {
      "white-board-content:create": this.createWhiteboardContent.bind(this),
      "white-board-content:create-pending": this.createPending.bind(this),
      "white-board-content:reference": this.reference.bind(this),
      "white-board-content:get-by-id": asynchronousDatabaseCommand(
        this.readWhiteboardContent.bind(this)
      ),
      "white-board-content:update": this.updateWhiteboard.bind(this),
      "white-board-content:delete": this.deleteWhiteboard.bind(this),
      "white-board-content:increment-ref-count": this.incrementRefCount.bind(this),
    };
  }

  static parseWhiteboard(whiteboard: unknown): WhiteBoardContent {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wb = whiteboard as any;
    return {
      id: wb.id,
      name: wb.name,
      imgUrl: wb.img_url || "",
      data: JSON.parse(wb.data),
      createTime: wb.create_time,
      updateTime: wb.update_time,
    };
  }

  static createWhiteboardContent(
    db: Database.Database,
    whiteboard: Omit<WhiteBoardContent, "id" | "createTime" | "updateTime" | "refCount">
  ): WhiteBoardContent {
    return this.insert(db, whiteboard, 1);
  }

  static reference(db: Database.Database, id: number) {
    return ContentIdentityTable.reference(db, "whiteboard-content", id);
  }

  static createPending(
    db: Database.Database,
    value: Omit<WhiteBoardContent, "id" | "createTime" | "updateTime" | "refCount">
  ) {
    if (!ContentIdentityTable.library(db)) throw new Error("资料库尚未完成身份基线升级");
    return db.transaction(() => {
      const content = this.insert(db, value, 0);
      return { content, reference: this.reference(db, content.id) };
    })();
  }

  private static insert(
    db: Database.Database,
    whiteboard: Omit<WhiteBoardContent, "id" | "createTime" | "updateTime" | "refCount">,
    initialRefCount: number
  ): WhiteBoardContent {
    if (hasWhiteboardLibraryBaseline(db) && isEmptyWhiteboardPage(whiteboard))
      return db.transaction(() => {
        const created = createEmptyWhiteboardDocument(
          db,
          whiteboard.name,
          [whiteboard],
          "standalone"
        );
        const id = created.contentIds[0];
        db.prepare("UPDATE white_board_contents SET img_url=?,ref_count=? WHERE id=?").run(
          whiteboard.imgUrl ?? "",
          initialRefCount,
          id
        );
        Operation.insertOperation(db, "whiteboard-content", "insert", id, Date.now());
        if (!initialRefCount)
          db.prepare(
            "INSERT INTO white_board_content_pending_releases(content_id,released_at) VALUES (?,?)"
          ).run(id, Date.now());
        return this.getWhiteboardContent(db, id);
      })();
    if (initialRefCount !== 0 && initialRefCount !== 1) throw new Error("初始引用数无效");
    const stmt = db.prepare(`
      INSERT INTO white_board_contents
      (data, name, img_url, create_time, update_time, ref_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      JSON.stringify(whiteboard.data),
      whiteboard.name,
      whiteboard.imgUrl || "",
      now,
      now,
      initialRefCount
    );

    Operation.insertOperation(db, "whiteboard-content", "insert", res.lastInsertRowid, now);
    if (!initialRefCount)
      db.prepare(
        "INSERT INTO white_board_content_pending_releases(content_id,released_at) VALUES (?,?)"
      ).run(res.lastInsertRowid, now);

    return this.getWhiteboardContent(db, Number(res.lastInsertRowid));
  }

  /** 重新引用一页（嵌入、撤销删除、恢复白板）时撤销待回收登记 */
  static incrementRefCount(db: Database.Database, id: number): number {
    const stmt = db.prepare(`
      UPDATE white_board_contents SET ref_count = ref_count + 1 WHERE id = ?
    `);
    db.prepare("DELETE FROM white_board_content_pending_releases WHERE content_id = ?").run(id);
    return stmt.run(id).changes;
  }

  static updateWhiteboard(
    db: Database.Database,
    request: Omit<WhiteBoardContent, "id" | "createTime" | "updateTime" | "refCount"> & {
      id: ContentEntityTarget;
    }
  ): WhiteBoardContent {
    return db.transaction(() => {
      const whiteboard = {
        ...request,
        id: ContentIdentityTable.requireTarget(db, "whiteboard-content", request.id),
      };
      assertLegacyWhiteboardPage(db, whiteboard.id);
      const currentWhiteboard = this.getWhiteboardContent(db, whiteboard.id);
      // 库中文档版本更高时拒绝写入，防止旧版本应用覆盖新版本文档
      if (getDocumentVersion(currentWhiteboard?.data) > getDocumentVersion(whiteboard.data)) {
        throw new Error(
          `白板页 ${whiteboard.id} 由更新版本的应用创建（文档版本 ${getDocumentVersion(
            currentWhiteboard.data
          )} > ${getDocumentVersion(whiteboard.data)}），当前版本不能覆盖`
        );
      }
      this.acquireAddedContentRefs(
        db,
        currentWhiteboard?.data?.children || [],
        whiteboard.data?.children || []
      );
      this.releaseRemovedContentRefs(
        db,
        currentWhiteboard?.data?.children || [],
        whiteboard.data?.children || []
      );

      const stmt = db.prepare(`
      UPDATE white_board_contents SET
        data = ?,
        name = ?,
        img_url = ?,
        update_time = ?
      WHERE id = ?
    `);
      const now = Date.now();
      stmt.run(
        JSON.stringify(whiteboard.data),
        whiteboard.name,
        whiteboard.imgUrl || "",
        now,
        whiteboard.id
      );

      Operation.insertOperation(db, "whiteboard-content", "update", whiteboard.id, now);

      return this.getWhiteboardContent(db, whiteboard.id);
    })();
  }

  /**
   * 释放一页的引用。归零时不立即删除：白板页可能作为编辑器里的块，删除后还能撤销，
   * 插件删除的白板也要能在宽限期内恢复；只登记释放时间，由开库维护按宽限期回收。
   */
  static deleteWhiteboard(db: Database.Database, id: number): number {
    db.prepare("UPDATE white_board_contents SET ref_count = ref_count - 1 WHERE id = ?").run(id);
    const row = db.prepare("SELECT ref_count FROM white_board_contents WHERE id = ?").get(id) as
      | { ref_count: number | null }
      | undefined;
    if (row && (row.ref_count ?? 0) <= 0)
      db.prepare(
        "INSERT OR IGNORE INTO white_board_content_pending_releases (content_id, released_at) VALUES (?, ?)"
      ).run(id, Date.now());
    return 0;
  }

  /** 渲染端读取页：旧 JSON 页或损坏的文档检查点先自愈，再返回当前页投影 */
  static async readWhiteboardContent(
    db: Database.Database,
    target: ContentEntityTarget
  ): Promise<WhiteBoardContent> {
    const id = ContentIdentityTable.requireTarget(db, "whiteboard-content", target);
    const { default: documents } = await import("../whiteboard-documents");
    await documents
      .healPage(basename(db.name, ".db"), id)
      .catch(error =>
        console.warn(`[whiteboard-repair] 白板页 ${id} 自愈失败，按原数据返回`, error)
      );
    return this.getWhiteboardContent(db, id);
  }

  static getWhiteboardContent(
    db: Database.Database,
    target: ContentEntityTarget
  ): WhiteBoardContent {
    const id = ContentIdentityTable.requireTarget(db, "whiteboard-content", target);
    const stmt = db.prepare("SELECT * FROM white_board_contents WHERE id = ?");
    const whiteboard = stmt.get(id);
    return this.parseWhiteboard(whiteboard);
  }

  static getAllWhiteboardContents(db: Database.Database): WhiteBoardContent[] {
    const stmt = db.prepare("SELECT * FROM white_board_contents");
    const whiteboards = stmt.all();
    return whiteboards.map(wb => this.parseWhiteboard(wb));
  }

  static getWhiteboardByIds(db: Database.Database, ids: number[]): WhiteBoardContent[] {
    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(`SELECT * FROM white_board_contents WHERE id IN (${placeholders})`);
    const whiteboards = stmt.all(...ids);
    return whiteboards.map(wb => this.parseWhiteboard(wb));
  }
}
